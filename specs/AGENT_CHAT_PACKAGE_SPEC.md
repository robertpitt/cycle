# @cycle/agent-chat Package Specification

Status: Draft implementation specification
Version: 0.1.0
Date: 2026-07-05
Target package: `@cycle/agent-chat`

## 1. Purpose

`@cycle/agent-chat` is the local agent chat application-service package for Cycle. It owns the
chat domain model, persistence boundary, SQLite-backed chat store, chat prompt assembly, provider
turn projection, and chat runtime operations that are currently mixed into `@cycle/api` and desktop
main-process code.

The first implementation MUST be a behavior-preserving extraction. It MUST make chat state and chat
runtime behavior reusable outside the API package without changing the public WebSocket protocol,
without redesigning `@cycle/agents`, and without introducing broader lifecycle or authorization
changes.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

Implementation-defined means an implementation may choose concrete TypeScript names, folder names,
helper functions, storage mechanisms, or internal algorithms, but it MUST preserve the externally
observable contract described in this specification and MUST document behavior that affects tests,
operators, or package consumers.

## 3. Source Context

This specification is based on inspection of:

- `packages/api/src/http/handlers/v1/chat/ws.ts`
- `packages/api/src/http/handlers/v1/chat/domain.ts`
- `packages/api/src/http/handlers/v1/chat/prepare.ts`
- `packages/api/src/http/handlers/v1/chat/records.ts`
- `packages/api/src/http/handlers/v1/chat/store.ts`
- `packages/api/src/http/handlers/v1/chat/stream.ts`
- `packages/api/src/http/handlers/v1/commentMentions.ts`
- `packages/api/src/http/runtime/CycleApiRuntime.ts`
- `packages/api/src/agents/services/AgentActiveTurnDirectory.ts`
- `packages/desktop/src/main/DesktopAgentChatStore.ts`
- `packages/database/src/store/AgentChatSchema.ts`
- `packages/agents/src/types.ts`
- `packages/agents/ARCHITECTURE.md`
- `packages/agents/SPEC.md`
- `specs/AGENT_CHAT_REFACTOR_SPECIFICATION_PLAN.md`
- `specs/AGENT_CHAT_RESUME_RECONCILIATION_SPEC.md`

User-confirmed boundary decisions:

1. `@cycle/agent-chat` SHOULD become the extracted chat runtime owner for current Cycle agent chat
   behavior.
2. `@cycle/agent-chat` MAY depend directly on `@cycle/agents`.
3. `@cycle/api` MUST continue to own the public WebSocket message protocol.
4. `@cycle/agent-chat` MAY depend on `@cycle/database` for persistence.
5. `@cycle/agent-chat` SHOULD accept an already-scoped MCP attachment from `@cycle/api` or the host.
6. Chat-specific prompt assembly SHOULD move into `@cycle/agent-chat`; `@cycle/agents` remains a
   provider execution black box that should not know Cycle product semantics.
7. Background turn lifecycle redesign, restart reconciliation, and stricter MCP authorization MUST
   NOT be in scope for the first implementation.
8. This specification lives at `specs/AGENT_CHAT_PACKAGE_SPEC.md`.

## 4. Problem Statement

Cycle's current agent chat implementation has no clear package boundary. `@cycle/api` owns public
HTTP and WebSocket transport, but it also owns chat records, chat store interfaces, prompt assembly,
provider event projection, active turn tracking, provider execution orchestration, persisted chat
projection updates, and comment-mention chat turn behavior. The desktop package owns the SQLite
store implementation but imports chat record types from `@cycle/api`.

This creates several dependency and ownership problems:

- desktop persistence depends on the API package for domain record types;
- API runtime options contain chat store and chat record contracts that are not API-specific;
- chat prompt assembly is coupled to API runtime shape, static token handling, request origin, and
  MCP URL construction;
- chat provider execution and event projection are too large for a route handler module;
- future consumers cannot reuse chat state management without importing API server wiring;
- tests for chat persistence, projection, and prompt behavior are split across API and desktop.

The first extraction should separate chat application behavior from transport. `@cycle/api` remains
the public protocol boundary. `@cycle/agent-chat` becomes the package that the API calls when a
validated WebSocket command needs chat state, prompt assembly, provider execution, or persistence.

## 5. Goals

The implementation MUST:

1. Create a new workspace package named `@cycle/agent-chat`.
2. Move chat domain record types out of `@cycle/api` into `@cycle/agent-chat`.
3. Move the `AgentChatStoreShape` contract out of `@cycle/api` into `@cycle/agent-chat`.
4. Provide a SQLite-backed chat store implementation that depends on `@cycle/database` schema
   exports and is no longer owned by the desktop package.
5. Move chat prompt assembly and Cycle-specific chat instructions into `@cycle/agent-chat`.
6. Move chat provider event projection and persisted projection updates into `@cycle/agent-chat`.
7. Expose an application-level chat runtime service that `@cycle/api` can call from its WebSocket
   protocol handlers.
8. Preserve the current public WebSocket behavior unless an incompatibility is explicitly approved
   in a later spec.
9. Keep `@cycle/agents` as the provider execution boundary and depend on its public provider-neutral
   types and services.
10. Accept scoped MCP attachments from the API or host boundary instead of constructing MCP
    authorization scope internally.
11. Keep public package exports small and explicit.
12. Preserve current tests by moving or adapting them to the new package boundary.
13. Remove desktop's dependency on `@cycle/api` for chat persistence types.
14. Remove chat domain and store contracts from `CycleApiRuntimeShape`.

The implementation SHOULD:

1. Use Effect v4 service and layer patterns for the new runtime where practical.
2. Keep the extraction mechanically reviewable by moving code before changing behavior.
3. Preserve compatibility re-exports from `@cycle/api` for one migration window if needed.
4. Use type-level dependency checks or lint rules to prevent `@cycle/agent-chat` from importing
   `@cycle/api` or desktop packages.
5. Keep store methods and record shapes stable enough that existing SQLite data remains readable.

## 6. Non-Goals

The first implementation MUST NOT:

1. Change the public chat WebSocket command names, event names, or payload semantics owned by
   `@cycle/api`.
2. Move public WebSocket protocol validation out of `@cycle/api`.
3. Redesign background turn execution, scoped fibers, shutdown cancellation, or server lifecycle
   ownership.
4. Implement restart reconciliation, active-turn rejoin, provider-native history recovery, replay
   journal recovery, or stale active-turn repair beyond existing behavior.
5. Implement stricter MCP authorization, per-turn MCP tool allowlists, new MCP scope enforcement, or
   new MCP token semantics.
6. Redesign `@cycle/agents` or require the future `AgentRuntime` described in
   `packages/agents/SPEC.md`.
7. Move Cycle ticket usecases, repository usecases, MCP server implementation, or worktree
   management into `@cycle/agent-chat`.
8. Move chat UI components into `@cycle/agent-chat`.
9. Persist chat state to GitDB.
10. Add remote, multi-device, or multi-tenant chat behavior.
11. Require a new `@cycle/api-contracts` package.

## 7. System Overview

### 7.1 Target Package Role

`@cycle/agent-chat` owns chat as an application service. It does not expose a public network
protocol. It receives already-authenticated, already-validated requests from `@cycle/api` and
returns domain results or emits domain events that the API maps to WebSocket protocol messages.

```text
Desktop renderer
  |
  | JSON WebSocket messages
  v
@cycle/api
  - owns public WS protocol and auth
  - validates command messages
  - maps protocol commands to agent-chat runtime operations
  - maps agent-chat events to protocol messages
  |
  v
@cycle/agent-chat
  - owns chat records and store contract
  - owns SQLite chat store implementation
  - owns prompt/context assembly
  - owns provider event projection into chat records
  - runs chat turns through @cycle/agents
  |
  v
@cycle/agents
  - provider service registry
  - provider capabilities
  - provider sessions and turns
```

### 7.2 Main Components

The package MUST contain components equivalent to these responsibilities:

- `AgentChatStore`: persistence interface for threads, messages, turns, activities, questions, and
  event replay records.
- `SqliteAgentChatStore`: SQLite-backed implementation using `@cycle/database`'s chat schema.
- `AgentChatRuntime`: application service for thread management, turn execution, cancellation,
  question and approval responses, and provider event projection.
- `AgentChatPromptAssembler`: converts chat records, selected repositories, origin metadata, and
  host-provided MCP attachment into `AgentTurnRequest`.
- `AgentChatProjector`: maps `@cycle/agents` provider events into chat messages, activities,
  questions, turns, threads, and domain events.
- `AgentChatPublisher`: implementation-defined event sink used by the runtime to notify API-owned
  WebSocket subscribers.
- `AgentChatIdGenerator`: implementation-defined ID boundary for deterministic tests and generated
  chat identifiers.
- `AgentChatClock`: implementation-defined time boundary for deterministic timestamps.

### 7.3 Dependency Rules

`@cycle/agent-chat` MAY import:

- `@cycle/agents`
- `@cycle/database`
- `effect`
- `@effect/platform-node` where required by a Node-backed store layer
- Node SQLite APIs for the SQLite implementation

`@cycle/agent-chat` MUST NOT import:

- `@cycle/api`
- `@cycle/desktop`
- renderer code
- API middleware or `CycleApiRuntime`
- API WebSocket protocol schemas
- Electron bridge modules

`@cycle/api` MAY import `@cycle/agent-chat` runtime services, records, and store types.

`@cycle/desktop` MAY import `@cycle/agent-chat` store constructors and types.

## 8. Core Domain Model

The first implementation MUST preserve the current persisted projection model unless a later
migration spec changes it.

### 8.1 Thread

`AgentChatThreadRecord` represents one local chat conversation.

Required fields:

- `id`: stable thread identifier.
- `title`: user-visible title.
- `summary`: short display summary.
- `status`: one of `active`, `archived`, `draft`, `error`, or `waiting`.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.

Optional or nullable fields:

- `agentId`: selected provider id.
- `activeTurnId`: active turn id or null.
- `archivedAt`: ISO timestamp or null.
- `lastError`: latest user-visible error or null.
- `model`: selected provider model id or null.
- `origin`: JSON record describing where the thread came from.
- `runtimeMode`: `read-only`, `workspace-write`, `full-access`, or null.
- `sessionId`: provider session id.
- `thinkingLevel`: provider thinking or reasoning setting id or null.

Invariants:

- A thread MUST have at most one `activeTurnId`.
- A deleted thread MUST cascade-delete messages, turns, activities, questions, and events when the
  backing store supports referential integrity.
- `origin` MUST be JSON-serializable and MUST NOT contain secrets.

### 8.2 Message

`AgentChatMessageRecord` represents user or agent text in a thread.

Required fields:

- `id`
- `threadId`
- `actor`: `user` or `agent`
- `body`
- `createdAt`

Optional fields:

- `metadata`: JSON record.
- `sequence`: numeric message ordering value within the thread.
- `streaming`: whether the message is currently receiving deltas.
- `turnId`: associated turn id or null.
- `updatedAt`: ISO timestamp.

Invariants:

- `sequence` values SHOULD be assigned by the store when absent.
- Streaming assistant messages MUST eventually be marked non-streaming by terminal turn projection
  under existing behavior.
- Message metadata MUST be JSON-serializable and MUST NOT contain secrets.

### 8.3 Turn

`AgentChatTurnRecord` represents one user request and provider response lifecycle.

Required fields:

- `id`
- `threadId`
- `inputMessageId`
- `providerId`
- `status`: `queued`, `running`, `waiting_for_user`, `completed`, `failed`, or `cancelled`
- `createdAt`
- `updatedAt`

Optional or nullable fields:

- `assistantMessageId`
- `completedAt`
- `lastError`
- `metadata`
- `model`
- `runtimeMode`
- `thinkingLevel`

Invariants:

- A non-terminal turn MUST NOT have `completedAt`.
- A terminal turn SHOULD have `completedAt`.
- `failed` turns SHOULD set `lastError`.
- `providerId` MUST be a value accepted by `@cycle/agents` provider lookup at execution time.

### 8.4 Activity

`AgentChatActivityRecord` represents non-message timeline entries.

Required fields:

- `id`
- `threadId`
- `kind`: `error`, `progress`, `question`, `system`, `thinking`, `tool`, or `usage`
- `title`
- `createdAt`

Optional or nullable fields:

- `detail`
- `payload`
- `status`: `cancelled`, `completed`, `failed`, `pending`, `running`, or null.
- `turnId`
- `updatedAt`

Invariants:

- `payload` MUST be JSON-serializable and MUST NOT contain unredacted secrets.
- Tool and progress activity SHOULD be upserted by stable activity ids when provider events refer to
  the same provider item.

### 8.5 Question

`AgentChatQuestionRecord` represents a provider-requested user input prompt.

Required fields:

- `id`
- `threadId`
- `turnId`
- `prompt`
- `questions`
- `status`: `open`, `answered`, `cancelled`, or `expired`
- `createdAt`

Optional or nullable fields:

- `answer`
- `answeredAt`
- `updatedAt`

Invariants:

- An `answered` question SHOULD include `answer` and `answeredAt`.
- Question item options MUST remain serializable and renderable by the UI after process restart.

### 8.6 Event

`AgentChatEventRecord` is a persisted event projection used for API WebSocket replay and snapshot
timeline sequence assignment.

Required fields:

- `eventId`
- `threadId`
- `sequence`
- `type`
- `payload`
- `createdAt`

Invariants:

- `sequence` MUST be monotonically increasing per thread.
- `(threadId, eventId)` MUST be idempotent.
- `(threadId, sequence)` MUST be unique.
- Event payloads are API-mapped domain payloads, not provider-native raw logs.

## 9. Store Contract

### 9.1 Required Shape

The package MUST expose a store interface equivalent to:

```ts
export type AgentChatStoreShape = {
  readonly appendEvent?: (
    input: Omit<AgentChatEventRecord, "sequence">,
  ) => Promise<AgentChatEventRecord>;
  readonly close?: () => Promise<void> | void;
  readonly deleteThread?: (threadId: string) => Promise<boolean>;
  readonly getThread?: (threadId: string) => Promise<AgentChatThreadWithMessages | undefined>;
  readonly listActivities?: (threadId: string) => Promise<readonly AgentChatActivityRecord[]>;
  readonly listEventsAfter?: (
    threadId: string,
    sequence: number,
  ) => Promise<readonly AgentChatEventRecord[]>;
  readonly listMessages: (threadId: string) => Promise<readonly AgentChatMessageRecord[]>;
  readonly listQuestions?: (threadId: string) => Promise<readonly AgentChatQuestionRecord[]>;
  readonly listThreads: () => Promise<readonly AgentChatThreadWithMessages[]>;
  readonly listTurns?: (threadId: string) => Promise<readonly AgentChatTurnRecord[]>;
  readonly upsertActivity?: (input: AgentChatActivityRecord) => Promise<AgentChatActivityRecord>;
  readonly upsertMessage: (input: AgentChatMessageRecord) => Promise<AgentChatMessageRecord>;
  readonly upsertQuestion?: (input: AgentChatQuestionRecord) => Promise<AgentChatQuestionRecord>;
  readonly upsertThread: (input: AgentChatThreadRecord) => Promise<AgentChatThreadRecord>;
  readonly upsertTurn?: (input: AgentChatTurnRecord) => Promise<AgentChatTurnRecord>;
};
```

Exact TypeScript names are implementation-defined, but the first implementation SHOULD keep these
names to minimize migration risk.

### 9.2 SQLite Store

The package MUST provide a SQLite store constructor equivalent to the current
`makeDesktopAgentChatStore(path)` behavior.

The SQLite store MUST:

- create parent directories when needed;
- enable SQLite foreign keys;
- execute `agentChatSchemaSql` from `@cycle/database`;
- preserve existing compatibility column additions for already-created databases;
- preserve current ordering rules for thread lists, message lists, activity lists, question lists,
  turn lists, and event replay;
- assign message sequence values when absent;
- assign event sequence values when appending events;
- parse invalid JSON record fields defensively using current behavior;
- close the underlying database when `close` is called.

The SQLite store MUST NOT depend on desktop-specific modules.

### 9.3 Store Error Semantics

Store methods MAY reject with implementation-defined errors. `AgentChatRuntime` MUST convert store
operation failures into normalized runtime errors or command results that API can map to existing
protocol `command.error` messages.

The first implementation MUST preserve current user-visible error behavior where possible:

- missing store maps to chat store unavailable;
- failed store operations map to chat store failed;
- unsupported optional store methods map to operation unavailable when the caller requires them.

## 10. Runtime Contract

### 10.1 Runtime Inputs

`AgentChatRuntime` MUST be constructed with dependencies equivalent to:

- `store`: `AgentChatStoreShape`.
- `agentServices`: `AgentServiceRegistryShape` from `@cycle/agents`.
- `agentProviderProfiles`: function returning provider profiles.
- `now`: clock function.
- `makeId`: ID generator or equivalent.
- `publish`: domain event callback or event sink.
- `mcp`: host-provided scoped MCP attachment resolver or static attachment.
- `repositoryDirectory`: optional resolver used to enrich repository context from thread origin.

The runtime MUST NOT read raw API request headers, raw API tokens, or `CycleApiRuntime`.

### 10.2 Operations

The package MUST expose runtime operations equivalent to:

- `listThreads(input)`
- `createThread(input)`
- `getThreadSnapshot(input)`
- `updateThreadSettings(input)`
- `deleteThread(input)`
- `sendTurn(input)`
- `cancelTurn(input)`
- `respondToQuestion(input)`
- `respondToApproval(input)`

The API may wrap these in its own WebSocket command handlers. The runtime operation names are
implementation-defined, but their responsibilities MUST be separately testable without a WebSocket.

### 10.3 Thread Snapshot

`getThreadSnapshot` MUST return enough data for the API to emit the current `thread.snapshot`
protocol message:

- thread;
- messages;
- turns when supported by the store;
- activities when supported by the store;
- questions when supported by the store;
- persisted events when supported by the store and needed for timeline sequence assignment.

The runtime MUST NOT decide public WebSocket message names. It returns domain data only.

### 10.4 Turn Send

`sendTurn` MUST preserve current behavior:

1. Validate thread id, message, and provider id at the runtime boundary.
2. Load the target thread.
3. Reject when the thread has an active turn.
4. Create and persist a user message.
5. Create and persist a queued turn.
6. Update the thread with active turn metadata.
7. Publish message, turn, and thread update domain events.
8. Start provider execution through `@cycle/agents`.
9. Return an acknowledgement payload or domain result to the API before provider execution
   completes, matching current protocol timing.

The first implementation MUST NOT redesign the background execution lifecycle. It MAY preserve the
current promise-based asynchronous provider turn execution while moving it into the new package.

### 10.5 Turn Cancellation

`cancelTurn` MUST preserve current behavior:

- Return `not_active` when no active turn exists.
- Return `not_active` when a requested turn id does not match the active turn.
- Abort live in-memory controller when available.
- Ask the provider service to abort the session when available.
- Clear stale persisted active turn state using existing behavior when no live cancellation target is
  found.
- Persist cancellation state and publish domain events consistent with current API protocol mapping.

This operation MUST NOT add restart reconciliation or live-provider rejoin behavior in the first
implementation.

### 10.6 Question and Approval Responses

The runtime MUST preserve existing question and approval response behavior from the WebSocket
gateway, including:

- validating target thread and pending request ids;
- persisting answered questions where supported;
- publishing resolved question or approval events;
- delivering provider user-input or approval responses through `@cycle/agents` where current code
  supports it.

The runtime MUST return domain-level command results. The API remains responsible for public
`command.ack` and `command.error` message shapes.

## 11. Prompt and Context Assembly

### 11.1 Ownership

`@cycle/agent-chat` MUST own chat-specific prompt assembly.

This includes:

- the main Cycle in-app chat instruction block;
- selected repository rendering;
- previous conversation rendering;
- assigned ticket implementation workflow instructions;
- issue comment mention instructions;
- thread-origin instructions for ticket implementation and issue-comment origins;
- mapping chat records into `AgentTurnRequest`.

`@cycle/agents` MUST NOT learn Cycle ticket, repository, issue mention, or assigned-ticket workflow
semantics as part of this extraction.

### 11.2 MCP Attachment

`@cycle/agent-chat` MUST accept an already-scoped MCP attachment from the API or host boundary.

The package MUST NOT:

- derive a bearer token from `staticToken`;
- construct MCP authorization headers from API runtime state;
- choose MCP tool allowlists;
- enforce new MCP authorization policy.

The package MAY:

- include or omit the host-provided MCP attachment in `AgentTurnRequest`;
- mark the attachment required when the operation input explicitly requests required MCP;
- include prompt text that tells the agent whether MCP is attached.

If a required MCP attachment is absent, behavior is implementation-defined for the first extraction,
but it SHOULD preserve current behavior for comment mentions and chat turns.

### 11.3 Repository Context

The runtime SHOULD accept selected repository payloads from the API or thread origin resolver.
Repository context MUST be rendered into prompts in the current format unless a later protocol spec
changes it.

Repository context MAY include:

- repository id;
- display name;
- filesystem path.

Repository context MUST NOT require `@cycle/agent-chat` to call repository usecases directly.

## 12. Provider Integration

`@cycle/agent-chat` depends on `@cycle/agents` as a black-box provider execution package.

The runtime MUST use `@cycle/agents` for:

- provider id validation where practical;
- provider profile and capability inputs supplied by the host;
- provider service lookup;
- session creation or resume;
- non-streaming and streaming turn execution;
- provider abort;
- normalized provider event types;
- provider runtime modes.

The runtime MUST NOT:

- import provider-specific Codex internals;
- call Codex app-server protocols directly;
- persist provider process handles or abort controllers in the store;
- move provider detection into `@cycle/agent-chat`.

Provider events MUST be projected into chat records and domain events by `@cycle/agent-chat`, not by
`@cycle/api`.

## 13. API Integration Contract

`@cycle/api` remains the public transport package.

`@cycle/api` MUST continue to own:

- WebSocket route mounting;
- client authentication;
- public WebSocket command schema;
- public WebSocket server message schema;
- command id handling;
- protocol version handling;
- conversion from runtime domain errors to protocol `command.error`;
- conversion from runtime domain results to protocol `command.ack`;
- subscriber connection management unless explicitly moved in a later spec.

`@cycle/api` SHOULD become thinner:

- parse and validate a WebSocket command;
- call the corresponding `@cycle/agent-chat` runtime operation;
- map returned domain data or emitted domain events to current protocol messages.

`@cycle/api` MUST NOT continue to define chat record types, store shape, prompt assembly, or provider
event projection after the extraction is complete.

Compatibility re-exports from `@cycle/api` MAY exist temporarily:

- `AgentChatStoreShape`
- `AgentChatThreadRecord`
- `AgentChatMessageRecord`
- `AgentChatTurnRecord`
- `AgentChatActivityRecord`
- `AgentChatQuestionRecord`
- `AgentChatEventRecord`

Those re-exports SHOULD be marked as transitional and removed after consumers import from
`@cycle/agent-chat`.

## 14. Desktop Integration Contract

Desktop main process MUST stop owning the chat SQLite store implementation after the new package is
available.

Desktop SHOULD:

- import the SQLite store constructor from `@cycle/agent-chat`;
- pass the configured database path to the constructor;
- pass the resulting store to API server startup;
- stop importing chat record or store types from `@cycle/api`.

Desktop MUST remain responsible for:

- choosing the local database path;
- providing agent services and session store;
- providing local settings and repository directory resolvers;
- starting and stopping the API server.

## 15. Error Model

The package MUST define normalized runtime error categories sufficient for API mapping:

- `invalid_payload`
- `thread_not_found`
- `thread_turn_active`
- `chat_store_unavailable`
- `chat_store_failed`
- `chat_delete_unavailable`
- `provider_unavailable`
- `provider_disabled`
- `provider_concurrency_limit`
- `provider_execution_failed`
- `unsupported_operation`
- `unknown`

Exact TypeScript error names are implementation-defined. Recoverable errors SHOULD use tagged
Effect errors or structured result objects rather than thrown untyped exceptions at package
boundaries.

The first extraction SHOULD preserve current user-visible message text where tests assert it.

## 16. Observability

The package SHOULD emit structured logs or return observable events for:

- thread creation;
- thread deletion;
- turn queued;
- turn running;
- turn completed;
- turn failed;
- turn cancelled;
- provider blocker applied;
- store operation failure;
- prompt assembly failure;
- question or approval response failure.

Logs SHOULD include:

- thread id;
- turn id when available;
- provider id when available;
- request id or command id when supplied by API;
- operation name;
- normalized error code.

Logs MUST NOT include:

- MCP bearer tokens;
- authorization headers;
- full raw provider payloads containing secrets;
- user-provided file contents unless already part of persisted chat message body.

## 17. Security and Safety

The package's trust boundary starts after API authentication and public protocol validation. Inputs
from API are still partially trusted and MUST be validated at runtime boundaries where malformed
values could corrupt storage or provider requests.

The package MUST:

- treat prompt inputs, user messages, origin metadata, and repository display names as untrusted
  content for logging purposes;
- avoid logging secrets;
- avoid constructing or broadening MCP authority;
- only pass through host-provided MCP attachment data;
- keep chat state local to the host database;
- avoid importing desktop renderer or Electron APIs.

The package MUST NOT claim to enforce per-turn MCP authorization in the first implementation.

## 18. Migration Plan

### Phase 1: Package Scaffold

Create `packages/agent-chat` with:

- `package.json` named `@cycle/agent-chat`;
- TypeScript config aligned with workspace packages;
- exports for main runtime, store, records, prompt assembly, and errors;
- dependencies on `@cycle/agents`, `@cycle/database`, and `effect`.

No behavior should change in this phase.

### Phase 2: Move Records and Store Contract

Move chat record types and `AgentChatStoreShape` from `CycleApiRuntime.ts` into
`@cycle/agent-chat`.

Update `@cycle/api` to import those types from `@cycle/agent-chat`.

Optionally add transitional re-exports from `@cycle/api`.

### Phase 3: Move SQLite Store

Move `makeDesktopAgentChatStore` behavior into `@cycle/agent-chat` as a package-owned SQLite store
constructor.

Update desktop to import the constructor from `@cycle/agent-chat`.

Move or duplicate desktop store tests into the new package, then remove desktop-specific coverage
that only exists to test the generic chat store.

### Phase 4: Move Prompt and Record Helpers

Move:

- `chat/domain.ts`
- `chat/prepare.ts`
- `chat/records.ts`
- relevant comment mention instruction helpers

into `@cycle/agent-chat`.

Refactor prompt assembly so it accepts a host-provided scoped MCP attachment instead of reading
`CycleApiRuntimeShape.staticToken`, `mcpPath`, or `mcpUrl`.

### Phase 5: Move Runtime Projection

Move provider event projection and chat persistence mutation logic from the API WebSocket module into
`@cycle/agent-chat`.

The API WebSocket module should call package operations and map domain events back to the existing
protocol.

This phase MUST preserve current behavior and MUST NOT introduce scoped background fiber lifecycle
changes.

### Phase 6: API Cleanup

Remove chat record and store fields from `CycleApiRuntimeShape` when all API handlers use
`@cycle/agent-chat` services directly.

Delete stale API chat helper modules after compatibility re-exports are no longer needed.

## 19. Validation Matrix

### Package Boundary Tests

- `@cycle/agent-chat` MUST typecheck without importing `@cycle/api` or desktop modules.
- Desktop chat store imports MUST no longer reference `@cycle/api`.
- API chat handlers MUST import chat records and store contracts from `@cycle/agent-chat`.

### Store Tests

- Existing SQLite data MUST remain readable.
- Thread list ordering MUST match current behavior.
- Message sequence assignment MUST match current behavior.
- Event sequence assignment MUST match current behavior.
- Invalid JSON projection fields MUST degrade as current store behavior does.
- Deleting a thread MUST remove dependent projection rows.

### Prompt Tests

- Basic chat turn prompt assembly MUST preserve current instruction content.
- Selected repositories MUST be rendered into prompt context.
- Conversation history MUST preserve role labels.
- Ticket implementation origin instructions MUST preserve assigned ticket workflow content.
- Issue comment mention instructions MUST preserve issue context URI behavior.
- MCP-present and MCP-absent prompt text MUST preserve current user-visible guidance.

### Runtime Tests

- Creating a thread MUST persist and return the expected thread projection.
- Sending a turn MUST persist user message, queued turn, active thread state, and publish domain
  events in current order.
- Provider text deltas MUST upsert streaming assistant messages.
- Provider content deltas MUST create segmented assistant messages where current behavior does.
- Provider thinking, tool, progress, artifact, usage, question, approval, failure, cancellation, and
  completion events MUST map to current chat records and API-mappable domain events.
- Cancelling a live turn MUST preserve current cancellation result behavior.
- Cancelling a stale persisted active turn MUST preserve current stale-cleared behavior.

### API Compatibility Tests

- Existing chat WebSocket tests in `packages/api/test/api.test.ts` MUST continue to pass.
- Public protocol command names MUST not change.
- Public protocol message names MUST not change.
- Existing authenticated connection behavior MUST not change.
- Existing invalid message handling MUST not change.

### Out-of-Scope Guard Tests

- The first migration MUST NOT add new restart reconciliation states.
- The first migration MUST NOT require new MCP tool allowlist inputs.
- The first migration MUST NOT require API server shutdown to await or cancel background turns.

## 20. Definition of Done

The migration is complete when:

1. `packages/agent-chat` exists and exports the chat domain, store, prompt, and runtime contracts.
2. `@cycle/api` no longer owns chat record types, store shape, prompt assembly, or provider event
   projection.
3. `@cycle/api` still owns the public chat WebSocket protocol.
4. `@cycle/desktop` no longer imports chat persistence types from `@cycle/api`.
5. The SQLite chat store implementation lives in `@cycle/agent-chat`.
6. Current API chat WebSocket behavior is preserved.
7. Package-level typecheck and tests pass for `@cycle/agent-chat`, `@cycle/api`, and
   `@cycle/desktop`.
8. Transitional re-exports, if added, are documented and tracked for removal.

## 21. Open Questions

No blocking open questions remain for the first behavior-preserving extraction. Future specs may
revisit restart reconciliation, scoped background turn lifecycle, and stricter MCP authorization.
