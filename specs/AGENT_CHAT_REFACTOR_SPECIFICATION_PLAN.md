# Agent Chat Refactor Specification Plan

Status: Draft
Date: 2026-06-16
Target repository: Cycle

## 1. Purpose

This specification defines the refactor of Cycle's agent chat into a first-class, realtime,
local-only chat system with a complete reusable UI surface in `packages/ui`, a single JSON
WebSocket endpoint in `@cycle/api`, and server-owned local SQLite persistence.

The first implementation phase is intentionally narrow. It MUST deliver:

- realtime assistant text streaming;
- provider, model, and thinking-level controls;
- a structured timeline for assistant text, thinking summaries, progress, tool activity, usage,
  failures, and cancellations;
- agent-initiated questions rendered as interactive UI.

It MUST NOT deliver approval gates or issue/repository context attachments in this phase.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119.

Implementation-defined means the implementation may choose the internal mechanism, but it must
preserve the externally observable contract described in this specification.

## 3. Problem Statement

Cycle currently has a chat implementation split across desktop renderer state, local REST
persistence endpoints, a blocking turn endpoint, and an SSE streaming endpoint. The renderer owns
too much chat state, manually persists thread snapshots, and consumes a stream shape that is too
small for interactive product-grade agent workflows.

The current shape creates several problems:

- chat UI is not developed end-to-end in `packages/ui`;
- the active desktop implementation lives primarily in one large renderer component;
- realtime streaming is SSE-based and request-scoped rather than a bidirectional session channel;
- there are separate chat REST paths for persistence and turn execution;
- renderer reloads and reconnects cannot reliably resume active chat state from the server;
- multiple active threads cannot be naturally multiplexed over one realtime connection;
- structured runtime events such as thinking, tool activity, usage, and agent questions do not have
  a complete protocol and UI contract.

Cycle needs one simpler model: a local API chat WebSocket owns the runtime conversation, persists
thread state in local SQLite, and pushes structured updates to UI clients. The UI package owns the
visual system and mock examples. The desktop renderer only connects the UI to the local API.

## 4. Goals

### 4.1 UI Goals

1. The complete end-to-end chat UI MUST be developed in `packages/ui`.
2. The UI package MUST expose first-class atoms, molecules, and organisms as needed.
3. The UI package MUST include mocked stories that render the chat surface inside the existing app
   shell so the design can be visually reviewed without the desktop runtime.
4. The UI MUST support:
   - thread list;
   - active conversation header;
   - provider/model/thinking controls;
   - realtime assistant text rendering;
   - structured activity timeline;
   - agent question cards with interactive answer controls;
   - loading, streaming, failed, cancelled, disconnected, and empty states.
5. `packages/ui` MUST remain runtime-independent. It MUST NOT import `@cycle/api`,
   `@cycle/agents`, Electron bridge modules, desktop query clients, database modules, or filesystem
   services.

### 4.2 API and Runtime Goals

1. Chat MUST have exactly one public chat endpoint: a WebSocket endpoint.
2. The WebSocket protocol MUST use simple versioned JSON messages, not RPC.
3. A single WebSocket connection MUST support many subscribed threads.
4. A single WebSocket connection MUST support many active turns at once, provided they are in
   different threads.
5. A single thread MUST allow at most one active turn at a time.
6. The API server MUST own chat thread state, message state, activity state, question state, and
   active turn lifecycle.
7. Chat state MUST be persisted in local SQLite and MUST be resumable across renderer reloads and
   API restarts where possible.
8. Chat data MUST remain local to the application SQLite database and MUST NOT be committed to the
   GitDB substrate.
9. Existing chat REST and SSE paths MUST be removed from the active desktop chat path after the
   WebSocket migration.

### 4.3 Agent Integration Goals

1. Agent provider services MUST emit normalized events that can drive the chat protocol and
   timeline.
2. Provider, model, and thinking-level selections MUST be supplied with each turn.
3. Providers MAY report unsupported capabilities, but the UI and protocol MUST represent those
   states cleanly.
4. Agent questions MUST be modeled as durable pending requests and resolved through the same
   WebSocket connection.

## 5. Non-Goals

This phase MUST NOT implement:

- human approval gates;
- command, file-read, file-write, or tool approval UI;
- approval response protocol messages;
- issue/repository context attachments in the composer;
- `@` mention insertion as a required chat feature;
- persisting chat threads, messages, activities, or questions into GitDB;
- multi-device chat sync;
- remote collaboration over chat;
- a general Effect RPC WebSocket layer;
- a full t3code-style orchestration event-sourcing architecture;
- isolated worktree execution workflows;
- plan acceptance workflows;
- review, approve, request-changes, or follow-up issue creation workflows.

The UI MAY contain neutral visual placeholders for future extension areas only when those
placeholders are not actionable and cannot be mistaken for implemented approval or context features.

## 6. System Overview

### 6.1 Components

The refactor has these major components:

- `@cycle/ui` chat components:
  Pure presentational React components, mock data, and Storybook stories for the full chat
  experience.

- Desktop chat adapter:
  Renderer code that connects the `@cycle/ui` components to the local API WebSocket. It owns
  browser-side connection state, reconnection, local optimistic composer state, and event dispatch to
  the UI components. It MUST NOT be the source of truth for persisted chat data.

- API WebSocket gateway:
  The only public chat endpoint. It authenticates local clients, validates JSON protocol messages,
  multiplexes subscribed threads, dispatches turns, and pushes snapshots and events.

- Chat persistence service:
  Local SQLite-backed storage for threads, messages, turns, activities, questions, and event
  sequence history.

- Chat runtime service:
  The server-side coordinator for active turns. It enforces one active turn per thread, runs provider
  streams, persists normalized state, and publishes events to subscribed WebSocket clients.

- Agent service layer:
  Provider-neutral adapter boundary for Codex, Claude, OpenCode, and future providers. It emits
  normalized events consumed by the chat runtime.

### 6.2 Responsibility Boundaries

`packages/ui` owns visual composition and component-level behavior only. It receives data and
callbacks through props.

The desktop renderer owns transport connection setup and mapping protocol state into UI props.

The API server owns:

- canonical thread state;
- message append/update ordering;
- turn lifecycle;
- active turn concurrency;
- persistence;
- event sequencing;
- reconnect snapshots;
- agent provider invocation;
- question request and response state.

The agent package owns provider-specific process or SDK integration. It MUST NOT know about React,
Storybook, desktop renderer state, or UI-specific shapes.

GitDB owns no chat state in this phase.

## 7. UI Package Contract

### 7.1 Package Placement

Reusable chat UI MUST be implemented under `packages/ui` using the repository's existing UI
conventions.

The implementation SHOULD organize components into:

- atoms only when a new primitive is broadly reusable;
- molecules for individual chat controls or rows;
- organisms for composed chat regions;
- pages or stories for full app-shell examples.

The implementation SHOULD avoid creating large runtime-aware page components in the desktop package
when a presentational component belongs in `@cycle/ui`.

### 7.2 Required Organisms

The UI package MUST provide organisms equivalent to the following responsibilities:

- `AgentChatShell`:
  Full chat layout composed of thread list, conversation, composer, and status surfaces.

- `AgentChatThreadList`:
  Thread navigation with selected, active, streaming, error, unread, empty, and archived-capable
  visual states. Archive behavior MAY remain nonfunctional in this phase.

- `AgentChatConversation`:
  Header, timeline, scroll container, reconnect/disconnect state, and composer region.

- `AgentChatTimeline`:
  Ordered rendering of messages and structured activity entries.

- `AgentChatComposer`:
  Text input, submit/cancel behavior, provider/model/thinking controls, disabled states, and
  pending question answer mode.

### 7.3 Required Molecules

The UI package MUST provide molecules equivalent to the following responsibilities:

- thread list item;
- assistant/user message bubble or row;
- streaming assistant message content;
- provider/model picker;
- thinking-level selector;
- structured activity row;
- tool activity row;
- thinking/progress row;
- usage summary row;
- agent question card;
- answer option group;
- connection status banner;
- turn status indicator;
- message copy action where existing UI conventions support it.

Component names are implementation-defined, but responsibilities MUST be discoverable and reusable.

### 7.4 UI State Inputs

The top-level chat organism MUST be renderable from serializable props. It MUST accept, directly or
through a view model:

- thread list entries;
- selected thread id;
- selected thread detail;
- current connection status;
- available provider profiles;
- selected provider/model/thinking values;
- pending composer text;
- pending question drafts;
- active turn ids;
- callback props for selecting a thread, creating a thread, sending a message, cancelling a turn,
  changing provider/model/thinking values, and answering a question.

The UI package MUST NOT create WebSocket connections or call local API clients.

### 7.5 Required Mock Stories

Storybook or equivalent UI examples MUST include:

1. Empty chat in app shell.
2. Thread with live assistant streaming text.
3. Thread with structured thinking, progress, tool, and usage activity.
4. Pending agent question with single-choice options.
5. Pending agent question with multi-choice options.
6. Failed turn.
7. Cancelled turn.
8. Disconnected/reconnecting state.
9. Multiple active threads in the thread list.
10. Provider/model/thinking controls with available and unavailable providers.

The stories MUST use mocked data and MUST NOT require a running API server.

### 7.6 Visual Requirements

The chat UI MUST be usable in the app shell at desktop widths supported by the existing workspace UI.

The timeline MUST preserve stable layout while assistant text streams. Streaming text MUST NOT cause
toolbar, composer, or thread list layout shifts outside the timeline content area.

Interactive question cards MUST remain readable with long option labels and descriptions.

Provider/model/thinking controls MUST clearly show disabled or unavailable states without hiding the
current selection.

## 8. Core Domain Model

### 8.1 Identifiers

All identifiers MUST be stable strings.

Required identifier prefixes are implementation-defined, but each id type MUST be distinguishable in
tests and logs:

- `threadId`;
- `messageId`;
- `turnId`;
- `activityId`;
- `questionId`;
- `eventId`;
- `clientCommandId`.

Generated ids SHOULD use `crypto.randomUUID()` where available.

### 8.2 Thread

A chat thread represents a local conversation.

Required fields:

- `id`: stable thread id;
- `title`: user-visible title;
- `summary`: short thread summary;
- `status`: `active`, `draft`, `waiting`, `error`, or `archived`;
- `providerId`: selected provider id, nullable when no provider is selected;
- `model`: selected model id, nullable when no model is selected;
- `thinkingLevel`: selected thinking level, nullable when unsupported or unset;
- `sessionId`: provider session id, nullable until a provider session exists;
- `activeTurnId`: active turn id, nullable;
- `lastError`: last user-visible error, nullable;
- `createdAt`: ISO timestamp;
- `updatedAt`: ISO timestamp;
- `archivedAt`: ISO timestamp, nullable.

Thread data MUST be stored in local SQLite.

### 8.3 Message

A chat message is user, assistant, or system-authored text.

Required fields:

- `id`;
- `threadId`;
- `role`: `user`, `assistant`, or `system`;
- `text`;
- `turnId`: nullable;
- `sequence`: integer ordered within the thread;
- `streaming`: boolean;
- `createdAt`;
- `updatedAt`;
- `metadata`: JSON object, nullable.

Assistant text streaming MUST update the same assistant message until the assistant message is
completed or the turn fails/cancels.

### 8.4 Turn

A turn is one user request plus the provider runtime activity produced in response.

Required fields:

- `id`;
- `threadId`;
- `inputMessageId`;
- `assistantMessageId`: nullable until created;
- `providerId`;
- `model`;
- `thinkingLevel`: nullable;
- `status`: `queued`, `running`, `waiting_for_user`, `completed`, `failed`, or `cancelled`;
- `startedAt`: nullable;
- `completedAt`: nullable;
- `lastError`: nullable;
- `createdAt`;
- `updatedAt`.

At most one turn per thread MAY be in `queued`, `running`, or `waiting_for_user`.

### 8.5 Activity

An activity is a structured timeline entry that is not itself a chat message.

Required fields:

- `id`;
- `threadId`;
- `turnId`: nullable;
- `kind`: one of `thinking`, `progress`, `tool`, `usage`, `question`, `error`, or `system`;
- `status`: `pending`, `running`, `completed`, `failed`, or `cancelled`, nullable where not
  meaningful;
- `title`;
- `detail`: nullable;
- `payload`: JSON object;
- `createdAt`;
- `updatedAt`.

The UI MUST render activities in the timeline interleaved with messages by timestamp and sequence.

### 8.6 Question

A question is an agent-initiated user input request.

Required fields:

- `id`;
- `threadId`;
- `turnId`;
- `status`: `open`, `answered`, `cancelled`, or `expired`;
- `prompt`: short user-visible prompt;
- `questions`: ordered array of question items;
- `answer`: JSON object, nullable until answered;
- `createdAt`;
- `answeredAt`: nullable;
- `updatedAt`.

Each question item MUST contain:

- `id`;
- `header`;
- `question`;
- `options`: ordered array of choices;
- `multiSelect`: boolean.

Each option MUST contain:

- `label`;
- `description`: nullable.

Free-form answers are out of scope for the first implementation unless the provider emits an option
that explicitly represents "Other" and the UI treats it as an ordinary choice.

### 8.7 Event Log

The persistence layer MUST record a per-thread event sequence sufficient to support reconnect
snapshots and deduplication.

Required fields:

- `eventId`;
- `threadId`;
- `sequence`: monotonically increasing integer per thread;
- `type`;
- `payload`;
- `createdAt`.

The server MAY compact or prune old event rows later, but the initial implementation SHOULD retain
all local chat events because chat data is local-only.

## 9. Local SQLite Persistence Contract

### 9.1 Storage Location

Chat state MUST be stored in the same local application SQLite database family currently used by the
desktop runtime.

Chat state MUST NOT be stored in repository GitDB refs, issue documents, or repository working tree
files.

### 9.2 Required Tables

The implementation MUST provide SQLite persistence for:

- chat threads;
- chat messages;
- chat turns;
- chat activities;
- chat questions;
- chat event log.

The existing `agent_chat_threads` and `agent_chat_messages` tables MAY be migrated in place if that
is safer than replacing them.

### 9.3 Migration Requirements

Existing local chat thread and message data SHOULD be removed and replaced with the new schema, DONT implement any migration, tihs is big bang cutover.

Migration MUST NOT write to GitDB.

### 9.4 Startup Reconciliation

On API startup, any persisted turn in `queued`, `running`, or `waiting_for_user` MUST be reconciled.

If the implementation cannot prove the provider turn is still alive, it MUST mark the turn as
`failed` with a user-visible error equivalent to `Chat turn interrupted by API restart.`

The corresponding thread MUST clear `activeTurnId` unless the provider turn is proven alive.

## 10. WebSocket Endpoint Contract

### 10.1 Endpoint

The API MUST expose one chat endpoint:

```text
/v1/chat/ws
```

The endpoint MUST use WebSocket transport.

No other public endpoint MAY be required for chat thread listing, thread detail loading, sending
turns, receiving stream updates, cancelling turns, or answering questions.

Provider discovery used by the chat UI SHOULD be available through this WebSocket endpoint. If the
application keeps a non-chat provider status endpoint for other screens, the chat UI MUST NOT depend
on it.

### 10.2 Protocol Format

Every message MUST be UTF-8 JSON.

Every message MUST include:

- `version`: integer, initially `1`;
- `type`: string.

Client command messages MUST include:

- `commandId`: client-generated stable command id.

Thread-scoped messages MUST include:

- `threadId`.

Server event messages SHOULD include:

- `eventId`;
- `threadId`, when applicable;
- `sequence`, when applicable;
- `createdAt`.

Unknown top-level fields MUST be ignored by receivers unless they conflict with required fields.

Invalid JSON MUST close the connection with a protocol error after logging a redacted failure.

### 10.3 Authentication

The WebSocket MUST use the same local trust boundary as the existing local API.

Browser clients cannot reliably set arbitrary authorization headers, so the preferred
authentication flow is:

1. client opens the socket;
2. client sends `connection.authenticate` as the first message;
3. server validates the token;
4. server sends `connection.ready`.

The server MUST close unauthenticated sockets that do not authenticate within an
implementation-defined timeout no longer than 5 seconds.

The token MUST NOT be sent in the URL query string by default.

Authentication payloads, tokens, and token-like values MUST be redacted from logs.

### 10.4 Client to Server Messages

The protocol MUST support these client message types.

#### `provider.list`

Requests provider profiles usable by the chat UI.

Payload: optional JSON object.

The response MUST include provider availability, models, default model, and supported thinking
levels. The chat UI MUST use this command rather than a separate chat-related HTTP endpoint.

#### `connection.authenticate`

Authenticates the socket.

Payload:

- `token`: local API token, nullable only in explicitly configured unauthenticated dev mode.

#### `thread.list`

Requests thread summaries.

Payload:

- `includeArchived`: boolean, default false.

#### `thread.create`

Creates a local chat thread.

Payload:

- `title`: optional string;
- `providerId`: optional provider id;
- `model`: optional model id;
- `thinkingLevel`: optional string.

#### `thread.subscribe`

Subscribes the connection to thread state and live events.

Payload:

- `threadId`;
- `afterSequence`: optional integer.

The server MUST respond with a snapshot even when `afterSequence` is provided. The server MAY also
replay events after `afterSequence`.

#### `thread.unsubscribe`

Stops sending live events for a thread to this connection.

Payload:

- `threadId`.

Unsubscribing MUST NOT cancel active turns.

#### `thread.update_settings`

Updates thread-level provider selection.

Payload:

- `threadId`;
- `providerId`: optional provider id;
- `model`: optional model id;
- `thinkingLevel`: optional string or null.

This command MUST fail with `THREAD_TURN_ACTIVE` when the thread has an active turn unless the
implementation can safely apply the setting only to future turns.

#### `turn.send`

Appends a user message and starts an agent turn.

Payload:

- `threadId`;
- `message`: non-empty string;
- `providerId`: provider id;
- `model`: model id;
- `thinkingLevel`: optional string or null;
- `metadata`: optional JSON object.

If the thread already has an active turn, the server MUST reject the command with
`THREAD_TURN_ACTIVE`.

#### `turn.cancel`

Cancels the active turn for a thread.

Payload:

- `threadId`;
- `turnId`.

Cancellation MUST be idempotent. Cancelling an already terminal turn MUST return an acknowledged
no-op or a typed stale-turn error.

#### `question.respond`

Answers an open agent question.

Payload:

- `threadId`;
- `questionId`;
- `answers`: JSON object mapping question item ids to selected option labels. A single-select
  answer MUST be a string. A multi-select answer MUST be an array of strings.

The server MUST reject answers for non-open questions.

#### `ping`

Application-level heartbeat.

Payload: optional JSON object.

### 10.5 Server to Client Messages

The protocol MUST support these server message types.

#### `connection.ready`

Confirms authentication and protocol readiness.

Payload:

- `serverTime`;
- `connectionId`;
- `protocolVersion`.

#### `command.ack`

Acknowledges a client command.

Payload:

- `commandId`;
- `type`: original command type;
- `result`: optional JSON object.

#### `command.error`

Reports a command failure.

Payload:

- `commandId`;
- `type`: original command type;
- `code`;
- `message`;
- `retryable`;
- `details`: optional sanitized JSON object.

#### `thread.list.snapshot`

Returns thread summaries.

Payload:

- `threads`: array of thread summaries.

#### `provider.list.snapshot`

Returns provider profiles usable by the chat UI.

Payload:

- `providers`: array of provider profiles.

#### `thread.snapshot`

Returns a complete selected thread state.

Payload:

- `thread`;
- `messages`;
- `activities`;
- `questions`;
- `turns`;
- `lastSequence`.

#### `thread.updated`

Publishes thread summary or status changes.

Payload:

- `thread`.

#### `message.created`

Publishes a new message.

Payload:

- `message`.

#### `message.delta`

Publishes assistant text streaming.

Payload:

- `messageId`;
- `turnId`;
- `delta`;
- `snapshot`: optional complete message text.

Clients MUST prefer `snapshot` when present. Clients MUST append `delta` only when `snapshot` is
absent.

#### `message.completed`

Marks a message as no longer streaming.

Payload:

- `message`.

#### `activity.upserted`

Publishes a structured timeline activity.

Payload:

- `activity`.

#### `question.opened`

Publishes an agent question.

Payload:

- `question`.

#### `question.resolved`

Publishes a question resolution.

Payload:

- `questionId`;
- `status`;
- `answer`;
- `answeredAt`.

#### `turn.started`

Publishes turn start.

Payload:

- `turn`.

#### `turn.waiting_for_user`

Publishes a turn waiting on an open agent question.

Payload:

- `turnId`;
- `questionId`.

#### `turn.completed`

Publishes turn completion.

Payload:

- `turn`;
- `usage`: optional usage object.

#### `turn.failed`

Publishes turn failure.

Payload:

- `turn`;
- `error`.

#### `turn.cancelled`

Publishes turn cancellation.

Payload:

- `turn`;
- `error`: optional error object.

#### `pong`

Responds to client `ping`.

### 10.6 Message Ordering

For each thread, the server MUST assign monotonically increasing `sequence` values to persisted
events.

Clients MUST apply thread events in sequence order. Duplicate `eventId` values MUST be ignored.

Events from different threads MAY be interleaved over one WebSocket.

### 10.7 Reconnect Behavior

After reconnect, the client MUST authenticate again.

The client SHOULD resubscribe to previously visible threads using the last applied per-thread
sequence.

The server MUST send `thread.snapshot` on subscription regardless of the requested sequence.

If the server can replay events after `afterSequence`, it SHOULD send them after the snapshot or
include them in the snapshot response as implementation-defined. The snapshot is authoritative.

## 11. Runtime Workflows and State Machines

### 11.1 Thread State

Thread status transitions:

- `draft` to `active`: first user message is sent or thread receives persisted activity.
- `active` to `waiting`: active turn is waiting for an agent question answer.
- `waiting` to `active`: pending question is answered and provider resumes.
- `active` to `error`: latest turn fails.
- `error` to `active`: a later turn starts or succeeds.
- any non-archived state to `archived`: future archive action, not required in this phase.

### 11.2 Turn State

Turn status transitions:

- `queued`: turn command accepted and persisted.
- `running`: provider stream begins.
- `waiting_for_user`: provider emits an agent question.
- `running`: question is answered and provider resumes.
- `completed`: provider emits successful terminal result.
- `failed`: provider emits failure or server runtime fails.
- `cancelled`: user cancels or provider reports cancellation.

Terminal states are `completed`, `failed`, and `cancelled`.

### 11.3 Send Turn Workflow

Reference behavior:

```text
on turn.send(command):
  authenticate connection
  validate payload
  load thread
  if thread has activeTurnId:
    send command.error THREAD_TURN_ACTIVE
    return

  persist user message
  create turn in queued state
  set thread.activeTurnId = turn.id
  persist message.created, turn.started/thread.updated events
  send command.ack
  start provider stream asynchronously
```

The command MUST be acknowledged only after the user message and queued turn are durably persisted.

### 11.4 Provider Stream Workflow

Reference behavior:

```text
run provider stream:
  mark turn running
  create empty assistant message when first assistant text arrives or when provider starts output
  for each normalized provider event:
    map event to message, activity, question, usage, or terminal update
    persist state mutation in SQLite transaction
    append event log row
    publish event to subscribed sockets for the thread
  on terminal event:
    clear thread.activeTurnId
    mark assistant message streaming=false
    persist terminal turn status
```

Each persisted event MUST be publishable after commit. The server MUST NOT publish an event that
cannot be recovered by a following snapshot.

### 11.5 Agent Question Workflow

When a provider asks a question:

1. server persists question with `open` status;
2. server marks turn `waiting_for_user`;
3. server persists a `question` activity;
4. server publishes `question.opened` and `turn.waiting_for_user`;
5. UI renders an interactive question card;
6. user answers through `question.respond`;
7. server validates the question is open;
8. server persists the answer and `answered` status;
9. server forwards the answer to the provider runtime;
10. server marks the turn `running` when provider resumes.

If the provider runtime cannot resume after an answer, the turn MUST fail with a visible error.

### 11.6 Cancellation Workflow

Cancellation MUST be server-owned.

When `turn.cancel` is accepted:

1. server marks the active turn as cancellation requested or directly invokes the provider abort
   signal;
2. provider receives abort;
3. terminal cancellation event is persisted;
4. thread `activeTurnId` is cleared;
5. subscribers receive `turn.cancelled`.

If the WebSocket disconnects, active turns MUST continue unless explicitly cancelled or the API
process stops.

### 11.7 Parallel Thread Workflow

The chat runtime MUST allow active turns in different threads concurrently.

The active-turn directory MUST be keyed by `threadId`, not by connection id.

Events MUST be multiplexed over every subscribed connection. A connection subscribed to thread A and
thread B MUST receive events for both threads interleaved with thread ids and sequences.

## 12. Agent Provider Contract

### 12.1 Capabilities

Each provider profile SHOULD report:

- provider id;
- display name;
- availability status;
- models;
- default model;
- supported thinking levels;
- whether streaming text is supported;
- whether structured activity is supported;
- whether agent questions are supported;
- user-visible unavailable/degraded message.

The chat UI MUST render unavailable providers without allowing turn submission through them.

### 12.2 Turn Request

The provider turn request MUST include:

- input text;
- provider id;
- model;
- thinking level, if selected;
- thread/session id;
- abort signal;
- metadata required to correlate events to the chat turn.

Issue or repository context attachments are out of scope for this phase.

### 12.3 Normalized Provider Events

The chat runtime MUST consume provider-neutral events equivalent to:

- `turn.started`;
- `assistant.delta`;
- `assistant.completed`;
- `thinking.updated`;
- `progress.updated`;
- `tool.started`;
- `tool.updated`;
- `tool.completed`;
- `tool.failed`;
- `usage.updated`;
- `question.requested`;
- `question.resolved`;
- `turn.completed`;
- `turn.failed`;
- `turn.cancelled`.

Existing provider events MAY be mapped into this vocabulary.

Providers that cannot emit structured thinking or tool events MAY emit progress events instead.

Thinking text MUST only represent provider-sanctioned summaries or visible reasoning summaries. The
system MUST NOT invent hidden chain-of-thought content.

## 13. Desktop Renderer Contract

The desktop renderer MUST replace direct chat REST/SSE usage with the WebSocket chat client.

The renderer MAY maintain ephemeral UI state for:

- current composer draft;
- selected thread id;
- local pending command ids;
- reconnect backoff state;
- last applied sequence by thread.

The renderer MUST NOT be the source of truth for:

- persisted thread list;
- persisted messages;
- persisted activities;
- active turn status;
- pending question status;
- provider session id.

After reconnect, the renderer MUST resubscribe and accept server snapshots as authoritative.

## 14. Removal of Old Chat Endpoints

After the WebSocket chat path is implemented, the active desktop chat feature MUST NOT call:

- `GET /v1/chat/threads`;
- `PUT /v1/chat/threads/:threadId`;
- `GET /v1/chat/threads/:threadId/messages`;
- `PUT /v1/chat/threads/:threadId/messages/:messageId`;
- `POST /v1/chat/turns`;
- `POST /v1/chat/turns/stream`.

The API OpenAPI document SHOULD remove these endpoints when the migration is complete.

If compatibility retention is temporarily required, retained endpoints MUST be marked deprecated and
MUST NOT be used by the desktop chat UI.

## 15. Error Model

### 15.1 Error Categories

The protocol MUST normalize command and runtime errors into these categories:

- `UNAUTHENTICATED`;
- `FORBIDDEN`;
- `INVALID_MESSAGE`;
- `INVALID_PAYLOAD`;
- `THREAD_NOT_FOUND`;
- `THREAD_TURN_ACTIVE`;
- `TURN_NOT_FOUND`;
- `STALE_TURN`;
- `QUESTION_NOT_FOUND`;
- `QUESTION_NOT_OPEN`;
- `PROVIDER_UNAVAILABLE`;
- `PROVIDER_UNSUPPORTED`;
- `PROVIDER_ERROR`;
- `CANCELLED`;
- `SERVER_RESTARTED`;
- `INTERNAL_ERROR`.

### 15.2 User Visibility

Every failed turn MUST produce a persisted user-visible error in thread state or activity state.

Protocol validation errors MAY be command-scoped and do not need to create timeline activity unless
they affect a persisted turn.

### 15.3 Retry Behavior

Automatic reconnect SHOULD use capped exponential backoff with jitter.

Provider turn retries MUST NOT happen automatically in this phase. The user may send a new message
after a failure.

## 16. Observability

The API server MUST emit structured logs for:

- socket open;
- authentication success/failure;
- command received;
- command rejected;
- thread subscription;
- turn started;
- provider event mapped;
- question opened;
- question answered;
- turn completed;
- turn failed;
- turn cancelled;
- socket close.

Logs MUST include when available:

- request or connection id;
- command id;
- thread id;
- turn id;
- provider id;
- event id;
- sequence;
- error code.

Logs MUST NOT include:

- auth tokens;
- raw secrets;
- full command output when it may contain secrets;
- provider raw payloads unless explicitly sanitized.

The desktop client SHOULD expose a visible disconnected/reconnecting state in the chat UI.

## 17. Security and Safety

The chat WebSocket is a local API surface. It MUST enforce the same local authentication posture as
the existing API.

Chat persistence MUST treat provider payloads as untrusted. JSON payloads MUST be bounded by
implementation-defined size limits.

The server MUST validate every client message before mutation.

The UI MUST render markdown through existing safe markdown rendering conventions and MUST NOT render
unsanitized HTML from provider output.

The protocol MUST NOT send tokens in URL query strings by default.

Approval gates are out of scope, so the UI MUST NOT imply that the user has approved command or file
actions from this chat phase.

## 18. Validation Matrix

### 18.1 UI Validation

Tests or stories MUST verify:

- full app-shell chat mock renders;
- empty state renders;
- streaming assistant text state renders;
- structured activity timeline renders thinking, progress, tool, usage, error, and cancellation
  rows;
- provider/model/thinking controls render available and unavailable providers;
- single-choice agent question can be selected;
- multi-choice agent question can be selected;
- long message and option text does not overlap controls;
- disconnected/reconnecting state is visible.

### 18.2 Protocol Validation

API tests MUST verify:

- unauthenticated socket cannot issue chat commands;
- authenticated socket receives `connection.ready`;
- invalid JSON closes or errors according to protocol;
- invalid payload returns `command.error`;
- `provider.list` returns provider profiles with model and thinking-level metadata;
- `thread.create` persists a thread;
- `thread.list` returns persisted local threads;
- `thread.subscribe` returns authoritative snapshot;
- `turn.send` persists user message before ack;
- assistant deltas stream as `message.delta`;
- terminal provider result emits `turn.completed`;
- provider failure emits `turn.failed`;
- cancellation emits `turn.cancelled`;
- agent question emits `question.opened`;
- answering a question emits `question.resolved`;
- one active turn per thread is enforced;
- active turns in two different threads can run concurrently over one WebSocket;
- reconnect and resubscribe returns a snapshot with persisted state;
- API restart reconciles nonterminal turns.

### 18.3 Persistence Validation

Tests MUST verify:

- threads persist in SQLite;
- messages persist in SQLite;
- activities persist in SQLite;
- questions persist in SQLite;
- event sequence is monotonic per thread;
- chat writes do not create or mutate GitDB refs;
- existing chat messages migrate where practical.

### 18.4 Desktop Integration Validation

Desktop tests or integration checks SHOULD verify:

- renderer no longer calls the old chat REST/SSE methods;
- one WebSocket connection can subscribe to multiple threads;
- reload restores thread list and selected thread details from server state;
- cancelling a turn is server-owned and reflected after snapshot reload.

## 19. Implementation Checklist

1. Define shared chat view-model types for `@cycle/ui`.
2. Build mocked `@cycle/ui` chat organisms, molecules, and stories in the app shell.
3. Define WebSocket JSON protocol types in `@cycle/api` or a shared contract package.
4. Add SQLite schema and migrations for threads, messages, turns, activities, questions, and event
   log.
5. Implement chat persistence service.
6. Implement API WebSocket gateway at `/v1/chat/ws`.
7. Implement authentication handshake.
8. Implement thread list, create, subscribe, unsubscribe, and update settings commands.
9. Implement turn send and cancel commands.
10. Extend or map agent provider events into the normalized event vocabulary.
11. Implement agent question request and response flow.
12. Implement desktop WebSocket chat client.
13. Replace desktop `ChatPanel` internals with `@cycle/ui` chat organisms wired to the new client.
14. Remove active usage of chat REST/SSE methods from desktop renderer.
15. Add protocol, persistence, UI, and desktop integration tests.
16. Remove or deprecate old chat REST/SSE endpoints from the public API surface.

## 20. Definition of Done

The refactor is complete when:

- the chat screen is composed from first-class `packages/ui` components;
- mocked app-shell stories demonstrate all required visual states;
- the desktop chat UI uses only `/v1/chat/ws` for chat;
- one WebSocket can handle multiple subscribed and active threads;
- the server owns persisted chat state in local SQLite;
- chat state survives renderer reload;
- interrupted active turns are reconciled on API restart;
- provider/model/thinking controls affect submitted turns;
- assistant text streams in realtime;
- structured timeline events render in the UI;
- agent questions can be answered interactively;
- no chat data is written to GitDB;
- approval gates and issue/repository context attachments remain out of scope.
