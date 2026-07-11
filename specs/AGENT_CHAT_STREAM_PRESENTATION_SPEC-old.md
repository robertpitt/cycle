# Agent Chat Stream and Presentation Specification

Status: Draft implementation specification

Version: 1.0.0-draft

Date: 2026-07-10

Target repository: Cycle

Supersedes for this scope:

- the version 1 chat WebSocket protocol at `/v1/chat/ws`;
- the current provider-item-to-message projection;
- the current desktop `ChatPanel` transport and reducer implementation;
- legacy agent chat and agent runtime data stored in `~/.cycle/agents.sqlite`.

## 1. Purpose

This specification defines the end-to-end contract for presenting interactive and
ticket-implementation agent streams as a polished chat timeline. It covers provider event
normalization, durable timeline materialization, the local WebSocket protocol, renderer state
management, shared UI composition, truncation and privacy rules, destructive cutover, failure
handling, and conformance tests.

The primary outcome is that assistant prose remains readable while commands, file operations,
searches, tools, plans, usage, and interactions appear as typed, compact activities. Raw command
output, provider payloads, and diffs MUST NOT be appended to assistant prose.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174.

Implementation-defined means the implementation may choose an internal mechanism or package-local
helper, but it MUST preserve the externally observable contract in this specification and document
choices that affect operators, persisted data, or tests.

## 3. Source Context and Observed Baseline

This specification is based on inspection of:

- `AGENTS.md`;
- `packages/ui/AGENTS.md`;
- `specs/AGENTS_AND_AGENT_CHAT_REDESIGN_SPEC.md`;
- `packages/agents/src/providers/codex/app-server/runtime.ts`;
- `packages/agents/src/providers/HarnessFromAgentService.ts`;
- `packages/agents/src/AgentSupervisor.ts`;
- `packages/agents/src/AgentExecutionStore.ts`;
- `packages/agents/src/AgentReadStore.ts`;
- `packages/agent-chat/src/AgentChat.ts`;
- `packages/api/src/agents/services/AgentChatTransport.ts`;
- `packages/api/src/http/handlers/v1/chat/ws.ts`;
- `packages/desktop/src/renderer/components/ChatPanel.tsx`;
- `packages/desktop/src/renderer/lib/chatProtocol.ts`;
- `packages/ui/src/molecules/agent-chat/agent-chat.tsx`;
- `packages/ui/src/organisms/agent-chat/agent-chat.tsx`;
- the user-provided screenshot dated 2026-07-10;
- representative runtime data in `~/.cycle/agents.sqlite`.

The inspected database was live and therefore its absolute sizes are informational. The following
structural observations define regression fixtures for this specification:

1. `message.delta` occupied approximately 55 MB across 35,909 events.
2. There were exactly 16,861 `assistant_text` deltas and 16,861 legacy no-kind duplicates carrying
   the same assistant text.
3. There were 2,187 `command_output` deltas containing approximately 2.7 million output
   characters.
4. The screenshot thread contained 2,584 events and approximately 10.2 MB of event JSON for one
   task.
5. That task contained 8 agent-message items, 60 command items, 25 file-change items, and 89
   reasoning items, but only one assistant message was materialized.
6. All 41 persisted `agent_turns` were still `queued` even when their tasks were terminal.
7. Four cancelled tasks retained assistant messages in `streaming` status.
8. There were 1,220 `artifact.recorded` events and zero materialized `agent_artifacts` rows.
9. All 32 assistant messages lacked normalized `agent_message_parts` rows.
10. Chat snapshots hard-coded an empty activity collection.
11. The API projected each assistant delta as both a full `message.created` snapshot and a raw
    `message.delta`.
12. The renderer refreshed the thread list and selected-thread snapshot every four seconds.

## 4. Problem Statement

Cycle currently destroys the semantic boundaries in provider streams before they reach the UI.
Assistant prose, command output, plans, and other non-reasoning deltas can update the same durable
assistant message. Provider item identifiers are not carried through the canonical event boundary,
so separate assistant messages and tool activities cannot be reconstructed reliably.

The chat facade then omits tasks, turns, artifacts, and activities from its public projection. The
API forwards raw generic event payloads while also generating repeated full message snapshots. The
renderer accepts untyped payloads, mutates React state directly for each frame, and periodically
replaces live state with another snapshot. Although the shared UI already contains an activity
strip, the transport never supplies the typed activity records it expects.

The resulting user-visible failures include:

- terminal output rendered as assistant Markdown;
- a single extremely long assistant message for an entire task;
- missing boundaries between commentary and actions;
- clipped or horizontally overflowing output;
- no usable command, file, search, plan, approval, or question timeline;
- stale streaming cursors after cancellation;
- repeated title, origin, and summary text;
- redundant `active` and `running` badges;
- layout churn and scroll instability during streaming;
- excessive SQLite growth, WebSocket traffic, database reads, React updates, and Markdown parsing.

## 5. Fixed Product Decisions

The following decisions are approved and are not open implementation choices:

1. The contract applies to both interactive and ticket-implementation threads.
2. The implementation MUST cut directly to WebSocket protocol version 2.
3. Protocol version 1 and legacy data compatibility MUST NOT be retained.
4. Consecutive non-blocking activities MUST be collapsed into compact groups by default.
5. Private reasoning MUST NOT be shown. Provider-supplied reasoning summaries and plans MAY be
   shown in collapsed form.
6. Diffs MUST NOT be transmitted over the chat WebSocket.
7. Chat MUST obtain only file-operation summaries from provider events. A future non-chat feature
   may derive diffs from the worktree branch.
8. Existing agent runtime/chat history MUST be purged. The implementation MUST start with a fresh
   agents database rather than importing malformed legacy histories.
9. The implementation specification lives at
   `specs/AGENT_CHAT_STREAM_PRESENTATION_SPEC.md`.

## 6. Goals

The implementation MUST:

1. Preserve one durable, user-visible timeline item per logical provider item.
2. Keep user messages, assistant prose, activities, interactions, and state transitions in distinct
   typed channels.
3. Render each provider agent-message item as a separate assistant message.
4. Ensure command, file-change, search, tool, plan, usage, and progress content can never mutate an
   assistant text message.
5. Materialize item state and append its canonical event in one SQLite transaction.
6. Make terminal task, turn, message, activity, interaction, and thread state mutually consistent.
7. Provide authoritative bounded snapshots followed by gap-free live tailing.
8. Use a strict schema-first version 2 WebSocket union shared by the API and desktop renderer.
9. Remove renderer polling and use event-driven state updates.
10. Move transport and state ownership out of the React presentation component.
11. Keep `@cycle/ui` serializable, presentational, accessible, and reusable.
12. Collapse background work without hiding failures, pending approvals, or user-input requests.
13. Bound every public preview, snapshot, page, provider diagnostic, and WebSocket frame.
14. Keep full command output local and reference it through artifact metadata without adding a
    chat output-download protocol in this phase.
15. Exclude raw diffs from public events, snapshots, diagnostics, message parts, and WebSocket
    frames.
16. Preserve stream correctness across reconnect, backend restart, cancellation, failure,
    duplicate provider notifications, and provider items that never complete.

## 7. Non-Goals

This specification does not require:

1. Legacy protocol or database compatibility.
2. Importing or repairing the current agent history.
3. A diff viewer, diff WebSocket endpoint, or diff artifact format.
4. A worktree review or merge UI.
5. Remote chat transport or multi-device synchronization.
6. Replacing the agent scheduler, queue, workflow registry, or provider process model.
7. Displaying private chain-of-thought or raw reasoning text.
8. Streaming complete command logs into the timeline.
9. A general terminal emulator, ANSI terminal implementation, or shell session UI.
10. UI-owned persistence, WebSocket connections, Effect runtimes, or agent lifecycle decisions.
11. A second chat-specific database or chat-owned source of truth.
12. Preserving current public component names when a clean in-repository rename produces a clearer
    contract.

## 8. System Overview and Ownership

### 8.1 Target Flow

```text
Provider notification
  -> provider adapter classification and sanitization
  -> typed AgentHarnessEvent with logical provider item id
  -> canonical AgentRuntimeEvent + materialized record transaction
  -> @cycle/agent-chat deterministic projection
  -> API WebSocket v2 typed event
  -> desktop Effect client and pure reducer
  -> @cycle/ui presentational timeline
```

### 8.2 `@cycle/agents`

`@cycle/agents` owns:

- provider event classification and duplicate suppression;
- logical provider item identifiers;
- canonical event types and typed payload schemas;
- messages, message parts, turns, tasks, interactions, artifacts, and event persistence;
- delta coalescing;
- command-output artifact creation and retention;
- terminal-state reconciliation;
- exclusion of private reasoning and diffs before public persistence;
- restart and provider reattachment behavior.

It MUST NOT emit a generic public event whose interpretation depends on raw provider JSON.

### 8.3 `@cycle/agent-chat`

`@cycle/agent-chat` owns:

- chat request, snapshot, thread-summary, timeline-item, and live-event schemas;
- chat defaults and command mapping onto `AgentRuntime`;
- pure deterministic projection from canonical agent records to chat records;
- chat display-state derivation;
- typed chat errors.

It MUST NOT own SQLite, provider adapters, raw provider switches, fibers, WebSockets, or a second
activity store.

### 8.4 `@cycle/api`

`@cycle/api` owns:

- `/v2/chat/ws`;
- version 2 client and server WebSocket envelope schemas;
- local authentication;
- connection and subscription lifetimes;
- per-connection bounded write queues;
- snapshot-before-tail ordering;
- transport error mapping.

It MUST NOT query a snapshot once per delta, reconstruct agent lifecycle, forward raw provider
payloads, or invent untyped timeline records.

### 8.5 `@cycle/desktop`

The desktop renderer owns:

- one scoped chat WebSocket client;
- reconnect and resubscribe;
- pending command correlation;
- a pure normalized client reducer;
- local composer and interaction draft state;
- mapping typed chat projections to `@cycle/ui` props.

React components MUST NOT own WebSocket parsing, reconnect timers, protocol switches, or canonical
timeline mutation logic.

### 8.6 `@cycle/ui`

`@cycle/ui` owns:

- presentation contracts;
- activity grouping for already ordered typed timeline items;
- message, activity, interaction, header, timeline, composer, and shell rendering;
- expansion state local to presentational components;
- accessibility and Storybook states.

It MUST NOT import API clients, agent runtime services, persistence packages, or desktop bridges.

## 9. Core Domain and Projection Model

### 9.1 Identifiers

The following identifiers MUST remain distinct:

- `threadId`: durable conversation identifier;
- `taskId`: scheduler/workflow unit created for a user request;
- `turnId`: durable user-input/provider-response lifecycle inside the task;
- `messageId`: durable user, assistant, or tool message;
- `interactionId`: durable approval or user-input request;
- `artifactId`: durable command-output artifact metadata;
- `eventId`: canonical event identifier;
- `providerItemId`: provider-native logical item identifier;
- `commandId`: client-generated idempotency and acknowledgement identifier.

The protocol MUST NOT call a `taskId` a `turnId`. A turn command MAY resolve its owning task
internally, but responses and logs MUST retain both identifiers.

For interactive chat, one `turn.send` creates one task and one initial turn. Provider retry attempts
MUST update the same user-visible turn. Provider-native turn identifiers belong to attempt/session
metadata and MUST NOT replace the Cycle `turnId`.

### 9.2 Logical Provider Item

A logical provider item is the smallest user-meaningful unit that has its own lifecycle. Examples
include one assistant commentary message, one command execution, one file-change operation, one MCP
tool call, one search, one plan, or one reasoning summary.

Every provider event that starts, updates, or completes such an item MUST carry:

- provider id;
- provider session id;
- provider-native thread and turn ids when available;
- `providerItemId`;
- Cycle thread, task, turn, run, and attempt ids;
- item kind;
- item phase;
- occurred-at timestamp;
- typed bounded content.

The durable idempotency key for a provider item MUST include provider/session identity and
`providerItemId`. Replaying the same item event MUST update the existing item rather than create a
duplicate.

If a provider cannot supply an item id, its adapter MUST create one deterministic within the
provider session and turn. Random per-notification ids are forbidden.

### 9.3 Durable Message

One provider agent-message item MUST map to one assistant `AgentMessage`. It MUST NOT share a
message with earlier or later provider agent-message items.

A public message projection MUST include:

- `messageId`;
- `threadId`;
- `taskId`;
- `turnId`;
- role: `user`, `assistant`, or `system`;
- phase: `commentary`, `final`, or `unspecified`;
- status: `streaming`, `completed`, `failed`, or `cancelled`;
- ordered typed parts;
- first and last canonical sequence;
- revision;
- created, updated, and completed timestamps.

The `tool` role remains valid in the canonical agent model, but chat MUST project tool-role messages
as activities rather than assistant prose.

### 9.4 Timeline Item Union

`@cycle/agent-chat` MUST define a closed schema union equivalent to:

```ts
type AgentChatTimelineItem =
  | AgentChatMessageItem
  | AgentChatActivityItem
  | AgentChatInteractionItem;
```

Every member MUST include:

- stable `id`;
- `threadId`;
- `taskId`;
- `turnId`;
- `firstSequence`;
- `lastSequence`;
- `revision`;
- `createdAt`;
- `updatedAt`;
- literal `_tag`.

Ordering MUST use `firstSequence`. Timestamps MUST NOT define canonical order.

### 9.5 Message Item

`AgentChatMessageItem` MUST include:

- `_tag: "Message"`;
- role;
- phase;
- text;
- status;
- optional completion timestamp.

It MUST contain assistant or user prose only. It MUST NOT contain command output, file diffs, tool
JSON, private reasoning, plans, or raw provider notifications.

### 9.6 Activity Item

`AgentChatActivityItem` MUST include:

- `_tag: "Activity"`;
- `activityType`;
- status: `pending`, `running`, `completed`, `failed`, or `cancelled`;
- short label;
- optional short detail;
- one member of a closed typed details union;
- optional `artifactId`;
- optional completion timestamp.

Required activity types are:

- `command`;
- `file`;
- `search`;
- `tool`;
- `plan`;
- `reasoning-summary`;
- `usage`;
- `progress`;
- `warning`;
- `error`.

A generic `Record<string, unknown>` payload is not a conforming public activity contract.

The canonical storage representation of an activity MUST be an `AgentMessage` with role `tool`,
keyed by provider item identity and containing typed `tool-call`, `tool-result`, file, artifact,
plan, reasoning-summary, usage, progress, warning, or error parts. The existing
`AgentMessagePart` union MUST be extended where it lacks one of those semantic parts. Chat projects
these tool-role messages into activities; it MUST NOT persist a parallel chat activity entity.

### 9.7 Typed Activity Details

The details union MUST provide at least:

```ts
type CommandDetails = {
  displayCommand: string;
  displayCwd?: string;
  exitCode?: number;
  durationMs?: number;
  outputPreview?: OutputPreview;
};

type FileDetails = {
  files: ReadonlyArray<{
    path: string;
    operation: "create" | "update" | "delete" | "move" | "unknown";
  }>;
  totalFiles: number;
  truncated: boolean;
  diffAvailable: false;
};

type SearchDetails = {
  query?: string;
  scope?: string;
  resultCount?: number;
};

type ToolDetails = {
  name: string;
  namespace?: string;
  inputSummary?: string;
  outputSummary?: string;
};

type PlanDetails = {
  explanation?: string;
  steps: ReadonlyArray<{
    text: string;
    status: "pending" | "running" | "completed";
  }>;
};

type ReasoningSummaryDetails = {
  markdown: string;
};

type UsageDetails = {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
};

type ErrorDetails = {
  code: string;
  message: string;
  retryable: boolean;
};
```

Unknown provider fields MUST be discarded or placed in bounded diagnostic storage. They MUST NOT be
added dynamically to public activity payloads.

### 9.8 Output Preview

`OutputPreview` MUST include:

- UTF-8 byte count of the full output;
- optional head text;
- optional tail text;
- `truncated`;
- `encoding: "utf-8"`.

The combined encoded head and tail MUST NOT exceed 8 KiB. When truncated, the default split SHOULD
retain the first 4 KiB and last 4 KiB so setup context and terminal failures remain visible.

ANSI control sequences MUST be removed from the public preview. The local artifact MAY retain raw
bytes when safe.

### 9.9 Interaction Item

`AgentChatInteractionItem` MUST be a closed union of:

- approval request;
- user-input request.

It MUST include the canonical interaction id, status, prompt, typed fields, safe default when
available, and response summary after resolution. Open interactions MUST render outside collapsed
activity groups.

An approval item MUST include approval kind, redacted details, allowed decisions, and default
decision when present. A user-input item MUST contain a bounded array of typed questions with stable
question id, header, prompt, input type, multi-select flag, and bounded option labels/descriptions.
The public interaction contract MUST NOT expose canonical `fields` as an unvalidated JSON record.

### 9.10 Thread Summary and Display State

The canonical thread lifecycle remains `open` or `archived`. Chat MUST derive one display state:

- `idle`;
- `queued`;
- `running`;
- `waiting`;
- `cancelling`;
- `failed`;
- `archived`.

Derivation MUST follow this precedence:

1. archived thread -> `archived`;
2. active task suspended on an interaction -> `waiting`;
3. active task cancelling -> `cancelling`;
4. active task queued, claimed, preparing, retry-wait, or resuming -> `queued`;
5. active task running or suspending -> `running`;
6. no active task and last task failed -> `failed`;
7. otherwise -> `idle`.

`draft` and `active` MUST NOT be thread display states in protocol version 2.

The header MUST show at most one primary state badge. It MUST NOT show `active` and `running`
simultaneously.

### 9.11 Thread Snapshot

An `AgentChatSnapshot` MUST include:

- thread summary;
- current task and turn summary when present;
- most recent bounded timeline page;
- every open interaction as one timeline item, even when its sequence predates the recent-page
  window;
- `baseSequence`;
- history cursor when older items exist;
- provider/model/reasoning-summary capability settings.

The snapshot MUST NOT embed the canonical event history or raw provider payloads.

The initial page MUST be bounded by both:

- at most 200 logical timeline items;
- at most 512 KiB encoded JSON.

The smaller limit wins. Older items MUST be obtainable through the version 2 history-page command.

### 9.12 Invariants

The following invariants are REQUIRED:

1. A command-output delta never mutates an assistant message.
2. A file-change delta never mutates an assistant message.
3. A plan delta never mutates an assistant message.
4. Private reasoning never enters a public message, activity, snapshot, log, or frame.
5. A provider diff never enters a public message, activity, event, diagnostic payload, snapshot,
   artifact, or frame.
6. One provider agent-message item produces exactly one assistant message.
7. One provider command/tool/file item produces at most one live activity item.
8. Every public message and activity belongs to an actual Cycle turn.
9. A terminal task has no streaming messages or running activities.
10. A completed, failed, or cancelled task has a terminal turn with the same outcome.
11. `artifact.recorded` is committed only with a corresponding `agent_artifacts` row.
12. Every message part is represented in `agent_message_parts`.
13. Message record and message-parts projection updates are atomic.
14. A provider replay cannot duplicate a timeline item.
15. A WebSocket canonical event produces at most one sequenced public server message.
16. Activity groups are a client/UI derivation and are never a second persisted source of truth.

## 10. Provider Normalization

### 10.1 Required Classification

The Codex adapter MUST classify provider events as follows:

| Provider event or item                        | Canonical result                    | Public chat result            |
| --------------------------------------------- | ----------------------------------- | ----------------------------- |
| `item/agentMessage/*`                         | message lifecycle keyed by item id  | separate assistant message    |
| `assistant_text` content delta                | assistant message delta             | `message.text.delta`          |
| legacy `text.delta` when content delta exists | suppressed duplicate                | none                          |
| command item started/completed                | command activity lifecycle          | command activity upsert       |
| `command_output` delta                        | command output keyed by item id     | bounded activity preview only |
| file-change item started/completed            | file activity lifecycle             | paths and operation summary   |
| `file_change_output`                          | file activity progress              | no diff body                  |
| plan delta/update                             | plan activity lifecycle             | collapsed plan activity       |
| reasoning text delta                          | internal or discarded               | none                          |
| reasoning summary                             | reasoning-summary activity          | collapsed summary             |
| MCP/tool/search item                          | typed tool/search activity          | typed activity upsert         |
| user-message provider echo                    | correlation only                    | none                          |
| usage                                         | usage activity                      | compact usage activity        |
| approval request                              | interaction lifecycle               | expanded approval card        |
| user-input request                            | interaction lifecycle               | expanded question card        |
| raw provider warning                          | typed bounded warning or diagnostic | no raw payload                |
| turn terminal                                 | task/turn/item finalization         | state and final item upserts  |

### 10.2 Duplicate Assistant Delta Removal

Codex MUST emit one assistant text stream into the harness boundary. The preferred source is
`content.delta` with `streamKind: "assistant_text"` and `itemId`.

The current behavior that emits both `content.delta` and `text.delta` for the same text MUST be
removed. A compatibility deduplicator MAY exist inside a provider adapter for another provider, but
duplicate events MUST be suppressed before canonical sequence allocation and persistence.

### 10.3 Provider Item Identity

`AgentHarnessEvent.providerItemId` MUST survive supervisor normalization and be represented in the
canonical event payload or envelope through a typed field. The supervisor MUST NOT drop it.

Item-start, delta, progress, and item-complete events MUST resolve the same durable message or
activity through that identifier.

### 10.4 Message Segmentation

An assistant message MUST start when the provider starts an agent-message item or when the first
assistant delta for an unknown item arrives.

It MUST complete when that logical item completes. A later agent-message item MUST create a new
assistant message even when it belongs to the same task and turn.

Provider `commentary` and `final` phases MUST be preserved as message phase. They MAY have distinct
visual treatment but both are assistant prose.

### 10.5 Command Output

Command output MUST be written to a package-owned local artifact using streaming I/O. The runtime
MUST NOT accumulate unbounded output in memory.

The activity projection MAY update byte count and bounded tail preview while a command is running.
It MUST NOT emit one public event per provider output token or chunk.

The full command output artifact:

- MUST be local-only;
- MUST be referenced by `artifactId`;
- MUST be subject to agent artifact retention;
- MUST NOT be sent through the chat WebSocket;
- MUST NOT be automatically opened or executed;
- MUST have sensitive values redacted when the provider or command policy marks them sensitive.

No command-output retrieval operation is required by this specification.

### 10.6 File Changes and Diffs

File activity may expose:

- workspace-relative path;
- operation kind;
- number of affected files;
- status;
- optional short provider summary.

File activity MUST NOT expose:

- diff or patch bodies;
- full file contents;
- absolute paths outside an approved workspace;
- provider-native raw item JSON.

The adapter MUST discard provider diff bodies before canonical public-event encoding. It MAY record
only counts, relative paths, operation kinds, and a digest when required for diagnostics. The future
diff viewer MUST read repository/worktree state through its own contract.

### 10.7 Plans and Reasoning

Raw reasoning text and private chain-of-thought MUST be internal or discarded.

Provider-supplied reasoning summaries MAY be public only when the provider explicitly classifies
them as summaries intended for display. They MUST be capped at 8 KiB per logical summary.

Plan steps MUST be capped at 50 steps and 500 UTF-8 bytes per step. Repeated full plan snapshots
MUST update one plan activity rather than append warnings containing the complete plan.

### 10.8 Delta Coalescing

Assistant text and activity-output deltas MUST be coalesced per logical item. A flush MUST occur at
the first of:

- 50 milliseconds after the first buffered assistant delta;
- 250 milliseconds after the first buffered command-output preview delta;
- 32 KiB accumulated assistant text;
- an item boundary;
- an interaction;
- interruption;
- terminal state;
- scope finalization.

Each flush MUST perform at most one materialized-item update and one canonical event append in one
transaction.

## 11. Durable Storage Contract

### 11.1 Database Ownership

`@cycle/agents` remains the sole owner of `~/.cycle/agents.sqlite` and agent artifact storage.
`@cycle/agent-chat`, `@cycle/api`, `@cycle/desktop`, and `@cycle/ui` MUST NOT open the database.

### 11.2 Required Materialization Changes

The implementation MUST:

1. add queryable provider-item identity, phase, first sequence, last sequence, and revision where
   required for messages and tool-role messages;
2. create one assistant message per agent-message item;
3. materialize command, file, search, plan, reasoning-summary, usage, progress, warning, and error
   items as tool-role messages with typed message parts;
4. populate `agent_message_parts` for user, assistant, system, and tool-role messages;
5. update `agent_turns` through queued, running, suspended, completed, failed, and cancelled states;
6. link assistant and tool-role messages to the actual `turn_id`;
7. insert `agent_artifacts` rows atomically with `artifact.recorded`;
8. finalize all active materialized items when the owning task terminates;
9. bound event payload sizes before encoding and persistence;
10. store raw provider diagnostics only in `agent_provider_diagnostics` with existing retention and
    additional size limits.

The canonical message record remains the source of truth for its parts. The
`agent_message_parts` rows are a rebuildable normalized projection, but they MUST be written in the
same transaction and MUST exactly match the encoded message.

### 11.3 Canonical Event Shape

The generic `eventType: string` plus `Record<string, Json>` public interpretation MUST be replaced
with a closed schema union or an equivalently strict event-type-to-payload schema mapping.

Raw provider notifications MUST NOT appear in the public union. Provider diagnostics MUST be
redacted and capped at 16 KiB encoded JSON per diagnostic.

### 11.4 Terminal Reconciliation

On completion, failure, cancellation, interruption, or unrecoverable provider-stream termination,
the same transaction or ordered terminal workflow MUST:

1. finalize the active turn;
2. finalize the task and run/attempt state;
3. clear `thread.active_task_id`;
4. finalize the current assistant message;
5. finalize every running activity;
6. cancel or fail open interactions as appropriate;
7. append the terminal canonical event;
8. publish one event-hub notice after commit.

Cancellation MUST result in cancelled materialized items, not streaming items.

## 12. WebSocket Protocol Version 2

### 12.1 Endpoint and Cutover

The only chat WebSocket endpoint MUST be:

```text
GET /v2/chat/ws
```

Every message MUST contain `version: 2`.

The implementation MUST delete `/v1/chat/ws`, version 1 schemas, version 1 projection helpers, and
desktop version 1 parsing in the same release. It MUST NOT dual-read, dual-write, translate, or
negotiate with version 1.

### 12.2 Schema Ownership

The API MUST own a leaf schema module exported from an API-owned path equivalent to
`@cycle/api/chat-v2-protocol`. The module MUST be safe to import in the renderer and MUST NOT import
Node-only server runtime code.

The desktop MUST decode with that schema. It MUST NOT maintain an independently written envelope or
accept `payload: unknown`.

### 12.3 Client Message Union

The closed client union MUST include:

- `connection.authenticate`;
- `provider.list`;
- `thread.list`;
- `thread.create`;
- `thread.subscribe`;
- `thread.unsubscribe`;
- `thread.history.get`;
- `thread.settings.update`;
- `thread.archive`;
- `turn.send`;
- `turn.cancel`;
- `interaction.respond`;
- `ping`.

Minimum payloads are:

| Type                      | Payload                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `connection.authenticate` | local static `token`                                                                  |
| `provider.list`           | empty                                                                                 |
| `thread.list`             | optional `includeArchived`                                                            |
| `thread.create`           | optional title, origin, repository, provider, model, and reasoning-summary preference |
| `thread.subscribe`        | `threadId`                                                                            |
| `thread.unsubscribe`      | `threadId`                                                                            |
| `thread.history.get`      | `threadId`, `beforeSequence`, and bounded `limit`                                     |
| `thread.settings.update`  | `threadId` and schema-approved settings patch                                         |
| `thread.archive`          | `threadId`                                                                            |
| `turn.send`               | `threadId` and non-empty user message                                                 |
| `turn.cancel`             | `threadId` and actual Cycle `turnId`                                                  |
| `interaction.respond`     | `threadId`, `interactionId`, and response matching the interaction subtype            |
| `ping`                    | optional client timestamp                                                             |

User message text MUST be non-empty after trimming and MUST not exceed 128 KiB UTF-8. All unions
MUST use strict excess-property rejection. Nullable and omitted values MUST have explicit,
schema-defined meanings.

All mutating commands MUST require `commandId`. `turn.send`, interaction responses, cancellation,
and archive operations MUST use it for idempotency.

Separate `question.respond` and `approval.respond` commands MUST be replaced by the typed
`interaction.respond` union.

`connection.authenticate` MUST validate the same static local token discovered by the desktop API
client. An invalid token MUST produce a bounded rejection and close the connection. Tokens MUST
never be logged.

`turn.send` acceptance MUST return distinct `taskId` and `turnId` values. `turn.cancel` MUST address
the actual Cycle `turnId`; the server may resolve its owning task but MUST report both identifiers in
the result.

### 12.4 Server Message Union

The closed server union MUST include:

- `connection.ready`;
- `command.accepted`;
- `command.rejected`;
- `provider.list.snapshot`;
- `thread.list.snapshot`;
- `thread.summary.upserted`;
- `thread.snapshot`;
- `thread.history.page`;
- `timeline.item.upserted`;
- `message.text.delta`;
- `thread.state.updated`;
- `thread.archived`;
- `stream.resync-required`;
- `pong`.

Minimum payload responsibilities are:

| Type                      | Payload responsibility                                |
| ------------------------- | ----------------------------------------------------- |
| `connection.ready`        | connection id, protocol version, and server time      |
| `command.accepted`        | command id, command type, and typed result            |
| `command.rejected`        | command id, command type, and typed safe error        |
| `provider.list.snapshot`  | typed provider capabilities and selectable models     |
| `thread.list.snapshot`    | complete bounded thread-summary list                  |
| `thread.summary.upserted` | one current thread summary                            |
| `thread.snapshot`         | authoritative `AgentChatSnapshot` and `baseSequence`  |
| `thread.history.page`     | ordered older items, next cursor, and exhaustion flag |
| `timeline.item.upserted`  | one complete bounded timeline item revision           |
| `message.text.delta`      | addressed assistant message delta and revision        |
| `thread.state.updated`    | current thread, task, and turn state summary          |
| `thread.archived`         | thread id and archive timestamp                       |
| `stream.resync-required`  | thread id and bounded reason code                     |
| `pong`                    | server time and optional echoed client timestamp      |

Every thread-scoped live message MUST include:

- `threadId`;
- canonical `eventId`;
- canonical `sequence`;
- occurred-at timestamp;
- typed payload.

The gateway MUST emit at most one sequenced public server message for one canonical event.

### 12.5 Snapshot Then Tail

Subscription MUST follow this algorithm:

1. authenticate and validate the thread id;
2. read canonical high-water sequence `H`;
3. build a bounded snapshot that reflects all committed mutations through `H`;
4. send `thread.snapshot` with `baseSequence = H`;
5. start durable observation after `H`;
6. replay events committed after `H`;
7. continue live tailing.

The event journal MUST close the interval between steps 2 and 5. The gateway MUST NOT start sending
live events before the snapshot write completes.

### 12.6 Sequence Handling

Canonical thread sequence is monotonically increasing but may contain non-public events. Clients
MUST therefore:

- accept increasing public sequences even when numbers are not contiguous;
- ignore a duplicate event id or sequence already applied;
- never apply a sequence lower than the current snapshot base unless processing an explicitly
  requested older history page;
- replace thread state only with a snapshot whose base sequence is not older than the currently
  applied base;
- resubscribe after connection loss or decode/reducer failure.

WebSocket/TCP ordering is relied upon only for one live connection. Reconnect MUST always obtain an
authoritative snapshot.

### 12.7 Message Streaming

`message.text.delta` MUST include:

- message id;
- item revision;
- append-only UTF-8 text;
- resulting byte length.

It MUST NOT include the full message snapshot. Message start and completion MUST use
`timeline.item.upserted` with the bounded full item.

If the client cannot apply a delta because the message or expected revision is missing, it MUST
discard that frame and resubscribe. It MUST NOT guess or append the delta to another message.

### 12.8 Activity Streaming

Activity start, bounded progress, and completion MUST use `timeline.item.upserted` with the same
activity id and increasing revision.

Command output MUST NOT use `message.text.delta`. Diffs MUST NOT appear in any server message.

### 12.9 History Paging

`thread.history.get` MUST accept:

- thread id;
- exclusive `beforeSequence`;
- limit between 1 and 200.

`thread.history.page` MUST return ordered logical items, a next cursor, and an exhaustion flag. A
page MUST remain below 512 KiB. The server MAY reduce the requested limit to satisfy the byte cap.

Historical pages MUST not change the live applied sequence.

### 12.10 Thread Updates

Thread list changes MUST be pushed through `thread.summary.upserted`. The desktop MUST NOT poll the
thread list or selected snapshot on a timer.

Server-owned reconciliation MAY periodically inspect durable state, but it MUST publish typed
changes rather than require renderer polling.

### 12.11 Thread Settings and Authority

`thread.settings.update` MUST persist only schema-approved idle-thread settings such as provider,
model, and whether provider-supplied reasoning summaries are shown. A setting unsupported by the
selected provider MUST be rejected rather than retained optimistically.

Generic chat settings and `turn.send` MUST NOT mutate or escalate `AgentAuthority`. Ticket
implementation authority is workflow-owned. The composer MUST display that authority as read-only.
Creating a normal interactive thread MUST use conversation-read or repository-read authority unless
the user invokes a separately specified implementation workflow.

### 12.12 Frame and Queue Bounds

An individual live event frame MUST remain below 64 KiB encoded JSON. Snapshot and history-page
frames MUST remain below 512 KiB.

Each connection MUST use a bounded write queue. If it cannot retain a correct live stream for a
slow client, the server MUST:

1. stop enqueuing thread events for that connection;
2. send `stream.resync-required` when possible;
3. close the connection if the message cannot be delivered;
4. never delay provider consumption or another subscriber.

## 13. Desktop Client and Reducer

### 13.1 Target Components

The desktop implementation SHOULD be split into focused files equivalent to:

```text
packages/desktop/src/renderer/agent-chat/
  AgentChatClient.ts
  AgentChatClientState.ts
  AgentChatReducer.ts
  AgentChatReact.ts
  internal/
    AgentChatReconnect.ts
    AgentChatSelection.ts
```

Names are implementation-defined, but transport, reducer, React binding, and internal policies MUST
be separately testable.

### 13.2 Effect Runtime

The WebSocket connection MUST be acquired and released through an Effect-scoped service or layer.
Reconnect, command correlation, inbound decoding, and outbound writes MUST use typed Effect
boundaries.

The client SHOULD expose state through `SubscriptionRef`, another Effect-native subscription
primitive, or a small external store adapted to React through `useSyncExternalStore`.

React MUST NOT recreate the socket because a message handler callback identity changed.

### 13.3 Pure Reducer

The reducer MUST be a pure, deterministic function over decoded version 2 messages. It MUST:

- index threads by thread id;
- index timeline items by stable item id;
- keep ordered item ids separately from item records;
- upsert by revision;
- apply assistant deltas only to the addressed message;
- maintain snapshot base and last applied public sequence;
- track open interactions;
- preserve local composer and question drafts outside authoritative server state;
- merge older history without disturbing live order;
- ignore duplicates;
- request resync on impossible transitions.

The reducer MUST NOT parse raw provider payloads or infer command/file activity from arbitrary keys.

### 13.4 Optimistic State

Only composer text, interaction draft answers, expansion state, and pending command indicators MAY
be optimistic.

Messages, activities, task state, turn state, and interaction resolution MUST become authoritative
only from server messages or command results. A failed command MUST surface a user-visible error and
roll back its pending indicator.

### 13.5 Reconnect

Reconnect MUST use capped exponential backoff with jitter. The initial recommended schedule is
250 ms, 500 ms, 1 s, 2 s, and 5 s maximum.

Automatic reconnect MUST stop after 12 consecutive failures and enter the visible `failed` state.
The user MUST be able to restart the sequence through a Retry action. A successful connection resets
the failure count. Mutating commands MUST NOT be retried automatically after an unknown delivery
outcome; idempotent user retry uses the original command id when the client still owns it.

Pending commands MUST have a bounded client timeout, recommended at 30 seconds. Timeout clears the
pending indicator and surfaces an unknown-outcome error; it MUST NOT imply that server-side work was
cancelled.

On reconnect, the client MUST authenticate, request providers and thread summaries, then subscribe
to the selected thread and any explicitly retained background subscriptions. It MUST not poll every
four seconds.

Connection loss MUST NOT cancel an agent task.

## 14. UI Presentation Contract

### 14.1 Component Taxonomy

No new atom is currently required. Existing atoms such as `Badge`, `Button`, `DateTime`,
`IconButton`, `Text`, and `Spinner` SHOULD be reused.

The UI package MUST provide or revise molecules equivalent to:

- `AgentChatMessageRow`;
- `AgentChatActivityGroup`;
- `AgentChatActivityItem`;
- `AgentChatOutputPreview`;
- `AgentChatInteractionCard`;
- `AgentChatTurnStatusIndicator`;
- provider/model/runtime controls.

The UI package MUST provide or revise organisms equivalent to:

- `AgentChatTimeline`;
- `AgentChatConversationHeader`;
- `AgentChatComposer`;
- `AgentChatConversation`;
- `AgentChatShell`.

Large existing `agent-chat.tsx` files SHOULD be split so each file has one primary public component
and internal helpers live under an `internal` directory.

### 14.2 Activity Grouping

The UI MUST group consecutive non-blocking activities between prose or interaction items.

A group boundary occurs at:

- a user, assistant, or system message;
- an open approval;
- an open user-input request;
- a standalone error requiring attention;
- a turn boundary.

Group labels MUST summarize semantic activity, for example:

- `Ran 3 commands`;
- `Edited 5 files`;
- `Searched code twice`;
- `Ran 3 commands and edited 5 files`;
- `Ran 3 commands, 1 failed`.

Groups MUST be collapsed by default. When a running group receives a failure, it MUST expand once to
surface the failure. User collapse/expand actions after that point MUST be respected.

Pending approvals and user-input requests MUST never be hidden inside a collapsed group.

### 14.3 Activity Item Rendering

Collapsed activity rows MUST show:

- semantic icon;
- concise label;
- status;
- optional short detail;
- timestamp only when it improves disambiguation.

Expanded command activity MUST show:

- redacted display command;
- workspace-relative working directory when useful;
- exit code;
- duration;
- capped output preview in a scrollable monospace region;
- truncation and local-artifact indication.

Expanded file activity MUST show path and operation only. It MUST not contain a diff expansion
control.

Expanded plan activity MUST show ordered steps and normalized statuses.

Provider names such as `command_execution` MUST be converted to user-facing labels.

### 14.4 Message Rendering

Each assistant provider item MUST render as a separate row. Assistant prose MUST use the Markdown
renderer. Command output MUST never be given to the Markdown renderer.

Streaming indicators MUST be local to the currently streaming message. A terminal task MUST not
show a streaming badge or cursor.

Long unbroken assistant text and links MUST wrap or scroll within the timeline without expanding the
application width.

### 14.5 Header Deduplication

The conversation header MUST render the title once.

An origin chip SHOULD use a compact identity such as the ticket id. It MUST NOT repeat the full
title. Summary text MUST be omitted when its normalized value equals the title or origin label.

The header MUST show one primary runtime state. Provider, model, authority, and reasoning-summary
settings MAY remain as compact secondary metadata.

### 14.6 Scroll Behavior

The timeline MUST:

- auto-follow while the user is within 80 CSS pixels of the bottom;
- stop auto-follow when the user scrolls away;
- show a new-activity control while not following;
- preserve the visible anchor when older history is prepended;
- preserve the visible anchor when an activity group expands or collapses;
- avoid moving the composer or header during stream updates.

The UI SHOULD render only the loaded logical items. It MUST not render raw canonical events.

### 14.7 Accessibility

Expandable activity groups MUST expose native `<details>/<summary>` behavior or equivalent
`aria-expanded`, keyboard, and focus behavior.

Status MUST not be communicated by color alone. Running indicators need accessible text. Command
output previews need accessible labels. Interaction errors MUST use `role="alert"`.

Focus MUST not be stolen when a background activity starts, updates, completes, or auto-expands
after failure.

### 14.8 Storybook Coverage

Required stories include:

1. empty idle thread;
2. separate user and assistant messages;
3. streaming assistant commentary;
4. collapsed mixed activity group;
5. expanded commands with successful and failed previews;
6. file activity with long paths and no diffs;
7. plan and reasoning-summary activities;
8. pending approval;
9. pending single- and multi-select user input;
10. cancelled turn with no streaming residue;
11. failed group auto-expanded;
12. disconnected and reconnecting states;
13. long title, distinct compact origin, and deduplicated summary;
14. narrow viewport and long unbroken output;
15. history page loading with preserved scroll anchor.

Stories MUST use typed presentation data and MUST not require the API or SQLite.

## 15. Failure and Recovery Model

### 15.1 Provider Item Without Completion

When a turn terminates while an item remains running:

- completion -> complete a valid final item or mark it failed if the provider item is incomplete;
- failure -> mark it failed;
- cancellation -> mark it cancelled;
- restart with recoverable provider history -> reconcile before publishing a snapshot;
- unrecoverable restart -> mark it failed or cancelled with an explicit reconciliation reason.

No terminal snapshot may contain a streaming message or running activity for a terminal task.

### 15.2 Artifact Failure

If command-output artifact creation fails, the runtime MUST:

- continue consuming provider output with a bounded in-memory preview;
- mark the activity with a typed local-artifact warning;
- log artifact id, task id, and error code without output content;
- not fail the agent task solely because an optional output artifact could not be retained.

Provider command failure remains a command failure independently of artifact persistence.

### 15.3 Projection Failure

A materialized projection and canonical event MUST commit atomically. If projection encoding fails,
the event MUST not be published as successfully persisted.

A malformed provider event MUST become a bounded diagnostic and typed warning or be discarded. It
MUST not be forwarded raw.

### 15.4 Client Decode or Reducer Failure

The desktop MUST log a bounded error containing protocol type and identifiers, close the affected
connection, reconnect, and obtain a fresh snapshot. It MUST not continue from possibly corrupt local
state.

### 15.5 Slow Client

A slow client MUST not apply backpressure to the provider stream. The API MUST require resync or
close the connection as defined in Section 12.12.

### 15.6 Command Errors

`command.rejected` MUST include:

- command id;
- stable error code;
- user-safe message;
- retryable flag;
- optional related thread/task/turn/interaction id.

It MUST not include an exception stack, raw provider error, secret, command output, or diff.

## 16. Security, Privacy, and Safety

1. User messages, provider output, command lines, repository paths, and tool input are untrusted.
2. The Markdown renderer MUST preserve its existing safe rendering posture.
3. Private reasoning MUST not be persisted with public visibility.
4. Diffs and patches MUST not be present in chat transport or public chat persistence.
5. Absolute paths sent to the UI MUST be converted to workspace-relative display paths.
6. Paths outside approved workspaces MUST be replaced with a safe basename or redacted label.
7. Command display and previews MUST pass through secret redaction before persistence and transport.
8. Logs and metrics MUST not include message bodies, command output, diffs, prompts, tokens, or raw
   provider payloads.
9. Local command-output artifacts MUST use restrictive file permissions.
10. Artifact ids and paths MUST never be treated as executable instructions.
11. WebSocket authentication remains required even though the endpoint is local.
12. The renderer MUST not gain filesystem access to artifacts through this protocol.

## 17. Configuration

### 17.1 Configuration Surface

This phase MUST NOT add user-facing controls for protocol bounds, persistence paths, coalescing
intervals, or retention. The normative limits in this specification are product defaults.

Server-owned values MUST be represented through `AgentConfig` or another owning Effect `Config`
schema rather than raw environment reads in business logic. At minimum the internal configuration
model MUST cover:

- assistant-delta flush interval and byte limit;
- command-preview flush interval and 8 KiB preview limit;
- live-event, snapshot, history-page, and diagnostic byte limits;
- initial and maximum history-page item limits;
- connection write-queue capacity;
- command-output artifact directory and retention;
- provider retry policy already owned by the agent runtime.

The implementation MAY make these deployment-configurable later, but invalid values MUST fail
configuration decoding rather than silently fall back.

### 17.2 Reload and Precedence

Chat protocol and storage limits are startup configuration and require backend restart. Per-thread
provider, model, and reasoning-summary preferences are durable thread settings and take effect only
through `thread.settings.update`.

The local authentication token remains runtime-generated/discovered configuration and MUST be
handled as a redacted secret. No chat content, command output, or diff may be supplied through
configuration.

## 18. Destructive Cutover and Migration

### 18.1 Fresh Start

The release implementing this specification MUST perform a one-time destructive reset of the
package-owned agents database and agent command-output artifact directory.

The reset MUST remove:

- `agents.sqlite`;
- `agents.sqlite-wal`;
- `agents.sqlite-shm`;
- package-owned agent command-output artifacts associated with the old schema.

It MUST NOT remove or modify:

- `cycle.db`;
- `app-config.json`;
- repository Git data or Cycle Git refs;
- configured repositories;
- implementation worktrees;
- ticket history;
- unrelated logs or user documents.

### 18.2 Reset Ordering

The reset MUST occur before the new `AgentRuntime` layer opens SQLite. The implementation MUST:

1. detect the pre-v2 agent schema marker;
2. close or avoid opening the old database;
3. remove only approved package-owned files;
4. create the new schema;
5. record the new schema version;
6. start scheduler and API layers;
7. allow the renderer to connect.

If reset or schema creation fails, desktop startup MUST surface a typed blocking error. It MUST not
fall back to the old schema, memory, or a partially created database.

The reset MUST be idempotent. If the process exits after deleting only a subset of the old database,
WAL, shared-memory, or artifact files, the next startup MUST safely repeat cleanup before creating
the new schema.

### 18.3 No Compatibility Layer

The implementation MUST NOT:

- import old chat tables or events;
- repair old messages;
- retain version 1 protocol decoders;
- expose both WebSocket versions;
- keep the old `AgentChatTransport` record helpers;
- dual-write old and new message/activity shapes;
- preserve old renderer state types solely for compatibility.

Release notes and an operator-visible log SHOULD state that pre-release agent execution history was
reset. No interactive migration prompt is required.

## 19. Observability and Performance

### 19.1 Structured Logs

Required identifiers where applicable are:

- thread id;
- task id;
- turn id;
- run and attempt id;
- provider item id;
- canonical event id and sequence;
- connection id;
- command id;
- event/activity type;
- encoded byte count;
- truncation flag;
- error code.

Content bodies MUST be excluded.

### 19.2 Metrics

The implementation SHOULD measure:

- provider deltas received by stream kind;
- duplicates suppressed;
- coalesced canonical deltas written;
- canonical event bytes by type;
- command artifact bytes;
- preview bytes and truncation count;
- WebSocket frames and bytes by message type;
- snapshot and history-page bytes;
- write-queue overflow and resync count;
- reconnect count;
- reducer duplicate and impossible-transition count;
- active streaming messages and activities;
- terminal tasks with non-terminal child items, which MUST remain zero.

### 19.3 Performance Requirements

The implementation MUST:

1. avoid one SQLite transaction per provider token;
2. avoid one snapshot query per live delta;
3. avoid full message snapshots in delta frames;
4. avoid renderer polling;
5. process one decoded frame with one reducer transaction;
6. limit assistant visual updates to the coalesced stream rate, normally no more than 20 per second;
7. keep Markdown parsing scoped to the assistant message that changed;
8. page long histories;
9. keep individual event and snapshot sizes within Section 12 limits;
10. ensure storage and transport growth are linear in bounded semantic content rather than
    quadratic in progressive snapshots.

## 20. Reference Algorithms

### 20.1 Normalize Provider Event

```text
normalize(providerEvent):
  identify provider session, native turn, and logical item
  classify item before public encoding

  if private reasoning:
    discard publicly
    optionally write bounded diagnostic
    return

  if event contains diff:
    remove diff and patch fields before any public schema construction

  if duplicate assistant legacy delta:
    increment duplicate metric
    return

  switch classified kind:
    assistant:
      upsert one assistant message keyed by provider item
      append/coalesce text only
    command:
      stream raw output to local artifact
      update bounded command activity preview
    file:
      update relative-path and operation summary only
    plan:
      update one bounded plan activity
    reasoning-summary:
      update one bounded summary activity
    tool/search/usage/progress:
      update matching typed activity
    interaction:
      persist interaction and suspend task/turn as required

  allocate sequence
  atomically write materialized record and canonical event
  publish one event-hub notice after commit
```

### 20.2 Subscribe Snapshot Then Tail

```text
subscribe(threadId):
  require authenticated connection
  H = read thread high-water sequence
  snapshot = build bounded snapshot through H
  send snapshot(baseSequence = H)
  observe durable events after H
  for each public projected event:
    enqueue exactly one typed v2 message
  if queue loses correctness:
    request resync and close if necessary
```

### 20.3 Reduce Live Message

```text
reduce(state, message):
  decode before reducer entry

  if snapshot:
    ignore if older than applied base
    replace authoritative thread projection
    preserve local drafts and expansion preferences

  if historical page:
    prepend unseen items by stable id
    do not change live sequence

  if sequenced live message:
    ignore duplicate event id or already-applied sequence
    reject impossible item revision
    upsert addressed item only
    update thread sequence

  on delta:
    require addressed Message item and expected revision
    append only to that message
    otherwise request resync
```

### 20.4 Group Timeline Activities

```text
group(items):
  groups = []
  pending = []

  flush pending into one ActivityGroup

  for item in canonical order:
    if item is non-blocking Activity:
      append item to pending
    else:
      flush
      append item

  flush
  derive group label from activity types and statuses
  return groups
```

## 21. Validation Matrix

| Area                   | Required validation                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Provider normalization | assistant content and legacy text duplicates produce one canonical delta                       |
| Provider identity      | started, progress, and completed notifications with one item id upsert one item                |
| Message segmentation   | eight provider agent messages produce eight assistant rows                                     |
| Channel isolation      | command, file, plan, and reasoning deltas cannot change assistant text                         |
| Private reasoning      | sentinel reasoning text is absent from public DB rows, snapshots, logs, and frames             |
| Diff exclusion         | sentinel diff text is absent from events, diagnostics, artifacts, snapshots, and frames        |
| Command output         | multi-megabyte output creates a local artifact and at most an 8 KiB public preview             |
| File activity          | only relative paths, operations, counts, and status are public                                 |
| Message parts          | all assistant and tool-role parts have matching normalized part rows                           |
| Artifacts              | every `artifact.recorded` event has one materialized artifact row                              |
| Turn state             | queued -> running -> suspended/terminal transitions update `agent_turns`                       |
| Terminal cleanup       | completed, failed, and cancelled tasks have zero streaming/running child items                 |
| Projection             | snapshot contains ordered messages, activities, and interactions without raw events            |
| Snapshot bounds        | 200-item and 512 KiB limits are enforced                                                       |
| Subscribe race         | an event committed during snapshot construction is delivered once after snapshot               |
| Reconnect              | active turn continues and authoritative snapshot restores the timeline                         |
| Duplicate replay       | replayed provider and canonical events do not duplicate timeline items                         |
| Protocol strictness    | unknown fields, unknown types, version 1, and malformed payloads are rejected                  |
| Protocol mapping       | one canonical public event emits at most one sequenced server message                          |
| Slow client            | overflow causes resync/close without slowing provider consumption                              |
| Reducer                | duplicate, stale, historical, snapshot, delta, and impossible revision cases are deterministic |
| Poll removal           | renderer has no chat interval refresh                                                          |
| UI grouping            | consecutive activities collapse with correct semantic counts                                   |
| Failure visibility     | failed group expands once and exposes the failed activity                                      |
| Interaction visibility | open approval and user input are never collapsed                                               |
| Header                 | title, origin, summary, and status are not duplicated                                          |
| Scroll                 | follow threshold, new-activity control, prepend anchor, and expansion anchor are verified      |
| Accessibility          | keyboard expansion, labels, status text, focus, and alerts pass tests                          |
| Destructive reset      | only agents database and package-owned agent artifacts are removed                             |
| Architecture           | UI has no runtime imports; desktop has no SQLite imports; API does no lifecycle mutation       |

### 21.1 Screenshot Regression Fixture

An end-to-end fixture equivalent to the inspected screenshot MUST contain:

- at least 8 assistant items;
- at least 60 commands;
- at least 25 file activities;
- reasoning events;
- plan updates;
- at least 2.7 MB of command output;
- a failing test command;
- a terminal task.

The resulting UI MUST:

- render separate assistant messages;
- render command and file activities in collapsed groups;
- keep the failing command discoverable;
- show no raw terminal output in assistant Markdown;
- show no diff body;
- show no private reasoning;
- end with no streaming cursor;
- remain within the application width;
- avoid repeating the full ticket title in title, origin, and summary.

The fixture MUST demonstrate that public WebSocket bytes are bounded by previews and logical items,
not by the full 2.7 MB output or progressive message snapshots.

### 21.2 Required Test Locations

Tests SHOULD be placed with their canonical owner:

- provider and durable normalization under `packages/agents/test`;
- projection tests under `packages/agent-chat/test`;
- protocol and gateway tests under `packages/api/test`;
- client/reducer tests under `packages/desktop/test`;
- component and Storybook coverage under `packages/ui`.

## 22. Implementation Plan

### Phase 1: Contracts and Fresh Schema

1. Define typed provider item, message phase, activity details, chat snapshot, and v2 protocol
   schemas.
2. Add required message/item sequence and revision fields.
3. Implement the destructive agents database reset.
4. Add storage invariants and strict schema tests.

### Phase 2: Provider and Durable Normalization

1. Remove duplicate Codex assistant delta emission.
2. Preserve provider item ids through the harness and supervisor.
3. Classify command, file, search, tool, plan, reasoning-summary, usage, and interaction events.
4. Materialize one assistant message per provider item.
5. Implement command-output artifacts and preview caps.
6. Discard diffs before public persistence.
7. Fix turn and terminal item transitions.

### Phase 3: Chat Projection

1. Replace the current minimal `AgentChatView` with typed summary, snapshot, and timeline items.
2. Project tool-role message parts into typed chat activities.
3. Project interactions without generic fields at the UI boundary.
4. Add bounded snapshot and history-page operations.
5. Delete transport-shaped compatibility helpers from `@cycle/agent-chat`.

### Phase 4: WebSocket Version 2

1. Add the renderer-safe protocol schema module.
2. Implement `/v2/chat/ws`.
3. Implement snapshot-before-tail and bounded connection queues.
4. Push thread summaries instead of relying on polling.
5. Delete `/v1/chat/ws` and version 1 tests/helpers.

### Phase 5: Desktop Client

1. Add the scoped Effect WebSocket client.
2. Add the pure normalized reducer.
3. Add React external-store bindings.
4. Remove parsing, reconnect, and reducer logic from `ChatPanel`.
5. Remove the four-second refresh loop.

### Phase 6: Shared UI

1. Split large chat component files.
2. Replace the prototype activity strip with the typed activity-group contract.
3. Add specialized bounded detail renderers.
4. Deduplicate the header and status surface.
5. Implement scroll anchoring and new-activity behavior.
6. Complete Storybook and accessibility coverage.

### Phase 7: Hardening

1. Run the screenshot regression fixture.
2. Run provider replay, restart, cancellation, and slow-client fault tests.
3. Inspect generated frames for diff/reasoning sentinels.
4. Measure database, frame, and render-update growth.
5. Delete dead version 1 and legacy projection code.

## 23. Definition of Done

The work is complete only when:

1. both interactive and ticket-implementation threads use the same typed timeline contract;
2. one provider agent-message item produces one assistant message;
3. command output never appears in assistant prose;
4. file diffs never appear in the chat database public projection or WebSocket;
5. private reasoning never appears in public state;
6. command, file, search, tool, plan, usage, and interaction items render as typed activities;
7. consecutive non-blocking activities collapse by default;
8. failures and open interactions remain immediately visible;
9. terminal tasks leave no streaming or running child items;
10. turn rows reflect actual lifecycle state;
11. artifact events and artifact rows remain consistent;
12. snapshots are bounded, authoritative, and sent before live tail;
13. live frames are strict protocol version 2 and one-to-one with public canonical events;
14. the desktop no longer polls or owns protocol interpretation inside React;
15. the header does not repeat title/status information;
16. the screenshot regression fixture passes;
17. the pre-v2 agents database is purged without touching tickets, repositories, or worktrees;
18. all version 1 protocol and legacy compatibility code is removed;
19. package typechecks, tests, lint, formatting, Storybook build, and desktop build pass.
