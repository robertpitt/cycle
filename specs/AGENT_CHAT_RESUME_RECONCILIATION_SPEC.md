# Agent Chat Resume Reconciliation Specification

Status: Draft implementation specification
Version: 0.1.0
Date: 2026-07-02
Target repository: Cycle

## 1. Purpose

This specification defines a provider-neutral restart and reconnect model for Cycle agent chat. The
target outcome is that opening a chat after a renderer reload, API restart, or full desktop app
restart produces a deterministic state: the chat is either reattached to a live provider turn,
materialized from provider history, restored from a Cycle-owned provider replay journal, or moved to
an explicit recoverable terminal state. A chat MUST NOT remain visually active while disconnected
from the underlying provider runtime without an operator-visible reconciliation state.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174.

Implementation-defined means the implementation may choose the internal mechanism, storage engine,
or package location, but it MUST preserve the externally observable contract described in this
specification and MUST document the chosen behavior when it affects operators or tests.

## 3. Source Context

This specification is based on inspection of:

- `specs/AGENT_CHAT_REFACTOR_SPECIFICATION_PLAN.md`
- `specs/AGENT_WORK_ORCHESTRATION_SPEC_V1.1.md`
- `packages/api/src/http/handlers/v1/chat/ws.ts`
- `packages/api/src/CycleApi.ts`
- `packages/api/src/agents/services/AgentActiveTurnDirectory.ts`
- `packages/api/src/http/runtime/CycleApiRuntime.ts`
- `packages/desktop/src/main/DesktopAgentChatStore.ts`
- `packages/desktop/src/main/agents/services/DesktopAgentSessionStore.ts`
- `packages/desktop/src/renderer/components/ChatPanel.tsx`
- `packages/agents/src/types.ts`
- `packages/agents/src/providers/codex/service.ts`
- `packages/agents/src/providers/codex/app-server/runtime.ts`
- `packages/codex-app-server/src/rpc.ts`
- `packages/codex-app-server/src/_generated/v2/ThreadResumeParams.ts`
- `packages/codex-app-server/src/_generated/v2/Thread.ts`
- `packages/codex-app-server/src/_generated/v2/Turn.ts`
- `packages/codex-app-server/src/_generated/v2/ThreadStatus.ts`

Relevant baseline facts:

1. Chat threads, messages, turns, activities, questions, and events are persisted in local SQLite.
2. Active chat turn handles are in-memory maps containing `AbortController` instances and provider
   clients.
3. A desktop app restart recreates `activeAgentTurns` and the chat WebSocket gateway's
   `activeTurnsByThreadId` map empty.
4. Persisted `agent_chat_threads.active_turn_id` can remain set after restart.
5. `thread.subscribe` currently returns a persisted snapshot and does not ask the provider to rejoin
   or reconcile the active turn.
6. `turn.send` rejects when the persisted thread has `activeTurnId`, so a stale active turn can block
   further chat work.
7. The generated Codex app-server protocol states that `thread/resume` by `threadId` rejoins a
   running thread when possible and returns a `Thread`.
8. Generated Codex types also expose `Thread.turns`, `Turn.items`, `Thread.status`,
   `ThreadActiveFlag`, `thread/read`, and `thread/loaded/list`, although Cycle's current wrapper only
   exposes a smaller subset.

## 4. Problem Statement

Cycle currently supports WebSocket reconnection while the API process remains alive, but it does not
support deterministic recovery after the API or desktop process restarts. The stored chat projection
survives restart, but the live provider runtime handle does not. The UI can therefore display an
active chat whose provider stream is gone, and the server can reject new messages because the old
`activeTurnId` still exists in SQLite.

The missing pieces are:

- a provider-neutral resume and reconciliation contract;
- a deterministic source-of-truth policy for provider-native history versus Cycle replay data;
- persisted provider turn identifiers and replay cursors;
- restoration of pending approval and user-input requests;
- a subscription-time reconciliation workflow;
- explicit stale, unsupported, and failed reconciliation states;
- tests that restart the API with persisted active chat state.

## 5. Design Rationale

Applications with long-running local or remote work usually solve restart recovery by separating
durable control state from live process handles. The UI renders a projection. The runtime owns
in-memory handles. On reconnect or restart, the runtime reconciles durable intent with an external
source of truth or a durable event log, then rebuilds the projection before accepting new commands.

Cycle SHOULD follow that pattern:

1. Provider-native history is the preferred source of truth when a provider exposes full thread and
   turn history.
2. Cycle's provider replay journal is the source of truth when the provider does not expose full
   history.
3. In-memory active-turn handles are never source of truth after restart.
4. Reconciliation is explicit, observable, and idempotent.
5. Unknown live provider state fails closed instead of producing duplicate work.

## 6. Goals

The implementation MUST:

1. Make chat restart behavior deterministic across renderer reload, API restart, and full desktop app
   restart.
2. Keep the design provider-neutral, with Codex as the reference provider implementation.
3. Reconcile a persisted active chat when the chat is opened or subscribed, not eagerly for every chat
   at API startup.
4. Treat provider-native full thread history as the preferred source of truth when the provider
   supports it.
5. Require a Cycle-owned provider replay journal for providers that do not expose authoritative
   native history.
6. Restore pending approvals and user-input prompts after restart when the provider can continue the
   turn.
7. Materialize provider history or replayed events into the existing local chat projection.
8. Persist enough provider metadata to rejoin, cancel, and reconcile active turns after restart.
9. Expose reconciliation status to the renderer through the existing chat WebSocket protocol or a
   versioned extension of it.
10. Ensure a chat never remains in a plain "active/running" UI state when Cycle has no live provider
    handle and has not completed reconciliation.
11. Support provider adapters that can rejoin a live turn and provider adapters that can only replay
    or terminate stale turns.
12. Move the Codex app-server protocol/client source into the Codex provider package so provider
    implementation, protocol types, and reconciliation logic are colocated.

## 7. Non-Goals

This specification MUST NOT require:

1. Remote or hosted agent execution.
2. Multi-device synchronization of chat state.
3. GitDB persistence of chat state, provider replay journals, or provider sessions.
4. Preserving active work for a provider that neither supports live rejoin nor has a usable replay
   journal.
5. A general distributed workflow engine for chat.
6. A renderer-owned reconciliation implementation.
7. Blocking API startup while every stored chat is reconciled.
8. Keeping `@cycle/codex-app-server` as a separate public package.

## 8. System Overview

### 7.1 Target Runtime Shape

```text
Renderer ChatPanel
  sends thread.subscribe
        |
        v
API Chat WebSocket Gateway
  validates command and authenticates client
        |
        v
Chat Reconciliation Service
  locks thread, reads persisted state, asks provider adapter
        |
        +--> Provider Native History
        |      Codex thread/resume + thread turns/items
        |
        +--> Cycle Provider Replay Journal
               provider-neutral event cache for providers without native history
        |
        v
Chat Projection Store
  upserts messages, turns, activities, questions, events
        |
        v
thread.snapshot + reconciliation events
```

### 7.2 Responsibility Boundaries

The desktop renderer owns WebSocket connection setup, local optimistic input state, and mapping
protocol state into UI props. It MUST NOT decide whether a provider turn is live, stale, resumable,
or interrupted.

The API chat WebSocket gateway owns command validation, authentication, client subscriptions, and
protocol messages. On `thread.subscribe`, it MUST invoke reconciliation before returning the first
snapshot when the thread has a persisted active turn or an unresolved reconciliation state.

The chat reconciliation service owns provider-neutral recovery decisions, per-thread reconciliation
locking, projection updates, and operator-visible status.

The chat persistence store owns local chat projection records and provider replay records. It MUST
remain local-only.

The provider adapter owns provider-specific resume, history read, live event rejoin, pending
interaction response, and abort behavior. It MUST return normalized reconciliation results rather than
mutating chat projection tables directly.

The provider-native service is the external or child-process system that actually executes the agent.
For Codex, this is the Codex app-server protocol running under the Codex provider adapter.

## 9. Core Domain Model

### 8.1 Chat Thread

A chat thread is Cycle's local UI and persistence entity.

Required identifiers:

- `threadId`: Cycle chat thread id.
- `sessionId`: provider session id used by the `AgentService` boundary. If absent for legacy rows,
  the implementation MUST use `threadId` as the session id during reconciliation.
- `providerId`: agent provider id, for example `codex`.
- `nativeThreadId`: provider-native thread id when the provider exposes one. For Codex this is the
  Codex app-server `Thread.id`.

Required persisted state:

- current projection fields already present in `agent_chat_threads`;
- active Cycle turn id, if any;
- provider-native thread id, either on the thread record or in the provider session binding;
- last successful reconciliation timestamp;
- last reconciliation status;
- last provider replay cursor or equivalent provider checkpoint when available.

### 8.2 Chat Turn

A chat turn is one user request and the provider's response lifecycle.

Required identifiers:

- `turnId`: Cycle turn id.
- `providerTurnId`: provider-native turn id when available. For Codex this is `Turn.id`.
- `threadId`: Cycle chat thread id.
- `sessionId`: provider session id.

Turn status MUST include the existing states plus an interrupted terminal state:

- `queued`
- `running`
- `waiting_for_user`
- `waiting_for_approval`
- `completed`
- `failed`
- `cancelled`
- `interrupted`

`interrupted` means Cycle could not rejoin a previously active provider turn and the provider did not
report a normal completed, failed, or cancelled terminal state. It is distinct from user-requested
cancel.

### 8.3 Provider Replay Journal

The provider replay journal is a local durable event cache used when provider-native history is not
authoritative or not available.

Each replay event MUST include:

- provider id;
- Cycle thread id;
- provider session id;
- Cycle turn id when known;
- provider-native thread id when known;
- provider-native turn id when known;
- stable provider event id or deterministic synthetic event id;
- monotonically increasing local sequence;
- event kind;
- normalized payload;
- raw provider payload when safe to persist;
- redaction metadata;
- creation timestamp.

Replay events MUST be idempotent. Re-inserting the same provider event MUST NOT duplicate a message,
activity, question, or terminal turn update.

### 8.4 Pending Interaction

A pending interaction is an approval or user-input request initiated by the provider.

Pending interactions MUST be persisted with enough information to render and answer after restart:

- request id;
- thread id;
- turn id;
- provider session id;
- provider-native turn id when known;
- interaction kind: `approval` or `user_input`;
- prompt, question list, approval details, default decision, and options where available;
- provider payload required to answer the request;
- status: `pending`, `answered`, `stale`, or `cancelled`;
- created, updated, and answered timestamps.

If a provider can resume a waiting turn but Cycle lacks the request details for a legacy pending
interaction, the implementation MUST surface an explicit degraded state instead of silently showing a
blank prompt.

## 10. Provider Capability Contract

### 9.1 Capability Flags

`AgentService.capabilities()` MUST expose chat resume capability metadata, or an equivalent provider
registry value MUST be available to the chat reconciliation service.

The capability metadata MUST distinguish:

- `nativeThreadHistory`: provider can return authoritative thread history.
- `liveTurnRejoin`: provider can attach to an in-progress turn after Cycle restarts.
- `pendingInteractionRestore`: provider can accept answers for pending approval or user-input request
  ids after rejoin.
- `providerEventCursor`: provider can return or accept a replay cursor.
- `requiresCycleReplayJournal`: Cycle must persist provider events to provide deterministic history.

A provider is restart-compatible only when it supports either `nativeThreadHistory` or
`requiresCycleReplayJournal`.

### 9.2 Reconciliation Operation

The provider-neutral adapter contract MUST include a reconciliation operation equivalent to:

```ts
type AgentChatReconcileInput = {
  providerId: AgentProviderId;
  sessionId: string;
  threadId: string;
  activeTurnId: string | null;
  nativeThreadId?: string;
  providerTurnId?: string;
  lastProviderCursor?: string;
  restorePendingInteractions: true;
};

type AgentChatReconcileResult = {
  status:
    | "live-rejoined"
    | "idle-synced"
    | "terminal-synced"
    | "interrupted"
    | "unsupported"
    | "failed";
  nativeThreadId?: string;
  activeTurn?: {
    cycleTurnId: string;
    providerTurnId?: string;
    status: "running" | "waiting_for_user" | "waiting_for_approval";
  };
  turns: readonly AgentChatProviderTurnSnapshot[];
  events: readonly AgentEvent[];
  pendingInteractions: readonly AgentChatPendingInteractionSnapshot[];
  nextProviderCursor?: string;
  liveEventStream?: AsyncIterable<AgentEvent>;
  error?: AgentError;
  warnings?: readonly string[];
};
```

Exact TypeScript names are implementation-defined. The observable semantics are not.

The operation MUST be idempotent for the same provider state and persisted Cycle state.

### 9.3 Provider History Semantics

When `nativeThreadHistory` is true, provider history is authoritative for provider-native turns and
items. The reconciliation service MUST materialize local chat projection records from provider
history and MUST not trust stale local `streaming` flags or active-turn fields over a more recent
provider terminal status.

When `nativeThreadHistory` is false and `requiresCycleReplayJournal` is true, the Cycle replay
journal is authoritative for provider events already observed by Cycle. If the provider cannot rejoin
the live turn, the active turn MUST become `interrupted` during reconciliation.

When neither source is available, the provider MUST be treated as unsupported for restart-compatible
active turns. The reconciliation service MUST move any persisted active turn to `interrupted` unless
the provider can prove the turn reached a terminal state.

## 11. Reconciliation Workflow

### 10.1 Trigger

The reconciliation workflow MUST run when:

1. A client sends `thread.subscribe` for a thread whose persisted `activeTurnId` is non-null.
2. A client sends `thread.subscribe` for a thread whose last reconciliation status is `failed` or
   `needs_reconciliation`.
3. A user explicitly requests retry reconciliation, if such a command is exposed.

The workflow SHOULD NOT run for every thread at API startup.

### 10.2 Per-Thread Locking

The reconciliation service MUST hold a per-thread lock for the duration of a reconciliation attempt.

Concurrent `thread.subscribe` commands for the same thread MUST share the same in-flight
reconciliation result or wait for it. They MUST NOT start parallel provider resume calls for the same
thread.

### 10.3 Algorithm

Reference algorithm:

```text
reconcileOnSubscribe(threadId):
  thread = chatStore.getThread(threadId)
  if thread is missing:
    return THREAD_NOT_FOUND

  if thread.activeTurnId is null and thread.reconciliationStatus is clean:
    return threadSnapshot(threadId)

  acquire reconciliation lock for threadId
  reload thread

  providerId = thread.agentId or default provider
  sessionId = thread.sessionId or thread.id
  session = agentSessionStore.get(sessionId)
  provider = agentServices.serviceFor(providerId)

  mark thread reconciliationStatus = reconciling
  publish thread.reconciliation.started

  result = provider.reconcileChatThread({
    providerId,
    sessionId,
    threadId,
    activeTurnId: thread.activeTurnId,
    nativeThreadId: session.native.threadId or thread.nativeThreadId,
    providerTurnId: persisted provider turn id,
    lastProviderCursor: persisted cursor,
    restorePendingInteractions: true
  })

  if result.status is live-rejoined:
    materialize result.turns/events/pendingInteractions
    register runtime active turn handle
    attach result.liveEventStream to normal chat event persistence pipeline
    set thread.activeTurnId = result.activeTurn.cycleTurnId
    set thread.status = waiting when activeTurn waiting, otherwise active
    mark reconciliationStatus = rejoined

  if result.status is idle-synced or terminal-synced:
    materialize result.turns/events/pendingInteractions
    clear thread.activeTurnId
    mark active turn terminal according to provider state
    mark reconciliationStatus = synced

  if result.status is interrupted or unsupported:
    materialize available events
    mark active turn interrupted
    clear thread.activeTurnId
    create operator-visible activity explaining why
    mark reconciliationStatus = interrupted

  if result.status is failed:
    keep provider-safe concurrency gate closed for this thread
    mark reconciliationStatus = failed
    publish operator-visible error with retry and mark-interrupted options

  persist provider cursor, native ids, timestamps, warnings
  publish thread.reconciliation.completed or thread.reconciliation.failed
  return threadSnapshot(threadId)
```

### 10.4 Failure Behavior

Provider unavailable, executable missing, protocol decode failure, auth failure, or transient I/O
failure MUST NOT be presented as a normal running turn.

If the provider state is unknown and the provider might still be running externally, the
implementation MUST fail closed: it MUST block new turns in that thread until the user retries
reconciliation, cancels/interrupts the turn, or the provider reports a terminal state.

If the provider is known to be local child-process only and cannot survive app restart, the
implementation MAY mark the active turn `interrupted` automatically when provider reconciliation is
unsupported.

All failure branches MUST create a persisted activity visible in the chat timeline.

## 12. Projection Materialization

### 11.1 Idempotency Keys

Materialization MUST use stable keys:

- user messages: provider item id when present, otherwise Cycle message id;
- assistant messages: provider item id for segmented content, otherwise Cycle turn id plus message
  role;
- activities: provider item id plus activity kind;
- questions and approvals: provider request id;
- terminal turn updates: Cycle turn id plus provider turn id.

Reconciliation MUST be safe to run repeatedly without duplicating timeline entries.

### 11.2 Streaming Flags

A message MUST have `streaming = false` when the provider reports the containing turn as completed,
failed, interrupted, or cancelled.

A message MAY remain `streaming = true` only when:

1. the provider reports an in-progress active turn, and
2. Cycle has registered a live provider event stream for that turn.

### 11.3 Event Sequences

Reconciled provider history MUST be assigned deterministic local event sequence numbers. If a
provider event already exists in `agent_chat_events`, its existing sequence MUST be preserved.

Newly materialized historical events SHOULD be inserted in provider chronological order. If provider
timestamps are missing or equal, the implementation MUST use provider turn order and item order.

## 13. Pending Interaction Restoration

On reconciliation, pending approvals and user-input prompts MUST be restored when all of these are
true:

1. the provider reports the turn is active or waiting;
2. the provider supports `pendingInteractionRestore`;
3. Cycle has enough persisted request data to render the interaction; and
4. the provider can accept a response for the persisted request id.

If the provider reports active flags such as `waitingOnApproval` or `waitingOnUserInput`, Cycle MUST
reopen the matching pending interaction in the chat projection.

If Cycle has a pending interaction but the provider reports the request as already resolved, Cycle
MUST mark the interaction `stale` or `answered` based on provider evidence and MUST reconcile the
turn again before accepting more input.

If the user answers a restored interaction and the provider returns `not_found`, Cycle MUST mark the
interaction stale, publish a visible activity, and trigger a reconciliation retry.

## 14. Codex Reference Implementation

### 13.1 Package Placement

The Codex app-server protocol wrapper SHOULD move from `packages/codex-app-server` into the Codex
provider implementation under `packages/agents/src/providers/codex/app-server`.

After the move:

- Codex protocol types, schema validators, client, errors, generated files, and generation scripts
  SHOULD be internal to `@cycle/agents`.
- `@cycle/codex-app-server` SHOULD be removed from the workspace unless another package still needs a
  public standalone wrapper.
- Public imports from `@cycle/codex-app-server` MUST be replaced with provider-internal imports.
- Boundary tests MUST prevent desktop, API, renderer, or usecase packages from importing Codex
  app-server internals directly.

### 13.2 Codex Native History

Codex reconciliation MUST use `thread/resume` with the stored native Codex thread id whenever
available.

The Codex adapter MUST initialize the app-server client, register notification and request handlers,
then call `thread/resume`.

The Codex adapter SHOULD use the returned `Thread.turns` as the primary history source. If the
returned resume payload does not include enough turn detail, the adapter MAY expand the internal
protocol wrapper to call `thread/read` with `includeTurns: true` or other generated thread-read
operations.

Codex status mapping:

- Codex `TurnStatus = "inProgress"` maps to Cycle `running` unless `Thread.status.activeFlags`
  contains a waiting flag.
- `waitingOnApproval` maps to Cycle `waiting_for_approval` plus pending approval activity.
- `waitingOnUserInput` maps to Cycle `waiting_for_user` plus pending user-input question.
- Codex `completed` maps to Cycle `completed`.
- Codex `failed` maps to Cycle `failed`.
- Codex `interrupted` maps to Cycle `interrupted`.

The adapter MUST persist:

- Codex native thread id;
- Codex native turn id;
- Codex item ids used for message and activity idempotency;
- enough pending server-request payload to restore approvals and user input.

### 13.3 Live Rejoin

If `thread/resume` reports an in-progress Codex turn, the adapter MUST register a live event relay
for subsequent Codex notifications on the resumed app-server client.

The relay MUST feed the same normalized event persistence path used by newly started turns. It MUST
not create a second provider turn or duplicate the user message.

If Codex reports the thread is no longer active, Cycle MUST materialize the terminal provider state
and clear `activeTurnId`.

If Codex cannot find the stored native thread id, Cycle MUST NOT silently start a fresh Codex thread
for the active turn. It MUST mark the turn `interrupted` or `reconciliation_failed` according to the
failure class. Starting a fresh provider thread is allowed only for a subsequent new user turn.

## 15. WebSocket Protocol Changes

The chat WebSocket protocol MUST expose reconciliation state. Exact message names are
implementation-defined, but the protocol MUST support these semantic events:

- reconciliation started for a thread;
- reconciliation completed with status;
- reconciliation failed with retryability and visible error;
- thread snapshot after reconciliation;
- restored pending interaction;
- active turn rejoined;
- stale active turn interrupted.

`thread.subscribe` MUST acknowledge only after the initial reconciliation attempt has either
completed, failed, or joined an existing in-flight attempt.

If reconciliation fails closed, the snapshot MUST include enough status for the UI to disable new
message submission for that thread and show retry/interrupt actions.

## 16. Storage Contract

The implementation MUST add or repurpose local-only storage for:

- provider-native thread id;
- provider-native turn id;
- reconciliation status and timestamp;
- provider replay cursor/checkpoint;
- provider event journal entries;
- pending interaction payloads and status;
- reconciliation warnings and last error.

SQL table names and column names are implementation-defined, but migrations MUST preserve existing
chat rows.

Legacy rows without provider-native ids MUST still open. When a legacy row has `activeTurnId` but no
usable provider ids, reconciliation MUST mark the active turn `interrupted` with a legacy-state
activity unless a provider can infer the native thread from session binding data.

## 17. Runtime Lifecycle

The API runtime MUST own provider service lifecycle.

When the desktop API server stops normally, it SHOULD close provider services before closing stores.
Provider service close MUST attempt graceful interruption or detachment according to provider
capability. It MUST NOT leave Cycle's local database claiming a turn is live unless a provider can be
rejoined later.

Abrupt process death is handled by subscription-time reconciliation, not by shutdown hooks.

The active-turn directory remains in-memory and MUST NOT be serialized. Durable state MUST be stored
as provider ids, replay events, turn records, and reconciliation status.

## 18. Security and Safety

Provider replay journals MAY contain tool outputs, command outputs, file paths, prompts, and partial
assistant content. The implementation MUST apply the same local-only security posture as chat
persistence.

Secrets supplied through environment variables, MCP bearer tokens, provider auth tokens, and approval
credentials MUST NOT be stored in replay journal payloads.

Raw provider payload persistence MUST be redacted or omitted when the payload contains known secret
fields. The normalized event needed for deterministic UI recovery SHOULD still be persisted when it
can be made safe.

Reconciliation MUST preserve the original runtime mode, approval policy, sandbox policy, model, and
MCP configuration for the active turn. It MUST NOT broaden filesystem, network, or command execution
permissions during resume.

## 19. Observability

The implementation MUST emit structured logs for:

- reconciliation start;
- provider selected for reconciliation;
- provider capability decision;
- provider resume/read call success or failure;
- materialized turn count and event count;
- live rejoin success;
- pending interaction restoration;
- stale/interrupted active turn;
- reconciliation failure.

Each log MUST include:

- `threadId`;
- `sessionId`;
- `providerId`;
- `activeTurnId` when present;
- `nativeThreadId` when present;
- reconciliation attempt id;
- status;
- retryable flag for failures.

The chat UI MUST expose reconciliation failure without requiring logs or a debugger.

## 20. Validation Matrix

### 19.1 Unit Tests

Provider-neutral reconciliation tests MUST cover:

1. active persisted turn plus provider live rejoin returns `live-rejoined`;
2. active persisted turn plus provider completed history clears `activeTurnId`;
3. active persisted turn plus provider failed history marks the turn failed;
4. active persisted turn plus provider interrupted history marks the turn interrupted;
5. provider without native history replays Cycle journal without duplicating events;
6. provider without live rejoin marks an active non-terminal turn interrupted;
7. pending approval is restored after reconciliation;
8. pending user-input question is restored after reconciliation;
9. duplicate concurrent `thread.subscribe` commands share one reconciliation attempt;
10. repeated reconciliation is idempotent.

### 19.2 API/WebSocket Tests

WebSocket tests MUST cover:

1. starting API server with a store containing an active turn, then subscribing triggers
   reconciliation before `thread.snapshot`;
2. reconciliation status messages are emitted in order;
3. failed reconciliation disables new `turn.send` for that thread until resolved;
4. stale active turn is not presented as normal running state;
5. restored pending interaction can be answered through the WebSocket after restart.

### 19.3 Codex Integration Tests

Codex adapter tests MUST cover:

1. `thread/resume` is called with stored native Codex thread id;
2. returned `Thread.turns` materialize messages and activities;
3. Codex `inProgress` turn registers a live event relay;
4. Codex terminal turn clears Cycle `activeTurnId`;
5. missing native Codex thread id does not start a fresh thread for the old active turn;
6. Codex waiting flags restore approval or user-input state when payload is persisted;
7. moving Codex app-server code into `@cycle/agents` does not expose provider internals to desktop or
   renderer packages.

### 19.4 Restart Tests

End-to-end restart tests MUST use the same local chat store across two API server instances:

1. server A starts a chat turn and persists active state;
2. server A is closed without completing the turn;
3. server B starts with the same store;
4. client subscribes to the same thread;
5. server B reconciles deterministically according to the fake provider's declared capability and
   state;
6. the resulting snapshot contains no stale plain-running turn.

## 21. Implementation Checklist

An implementation is complete when:

1. Provider capabilities describe chat resume and history behavior.
2. The provider reconciliation operation exists and is used by chat subscription.
3. Chat persistence stores provider-native ids, replay cursors, pending interactions, and
   reconciliation status.
4. `thread.subscribe` runs reconciliation for active or unresolved threads.
5. The UI can show reconciling, rejoined, interrupted, and failed reconciliation states.
6. Pending approvals and user-input prompts survive restart for compliant providers.
7. Codex uses native `thread/resume` and materializes returned thread history.
8. Codex app-server protocol code is colocated under the Codex provider or the old package is
   explicitly retained with documented justification.
9. API shutdown closes provider services or documents why provider detachment is safe.
10. The validation matrix passes.
