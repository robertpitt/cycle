# @cycle/agents Redesign Specification

Status: Draft implementation specification
Version: 0.1.0
Date: 2026-06-30
Package: `@cycle/agents`

## 1. Purpose

`@cycle/agents` is Cycle's local agent runtime package. It combines a local agent harness, a
job-scoped MCP connection, durable run/session state, and predefined prompt contracts so local
agents can perform useful work against Cycle tickets and repositories.

The package MUST expose a small Effect-first interface for starting, resuming, observing, steering,
and cancelling agent runs. Codex is the first required harness. Additional harnesses MUST be added
behind the same runtime contracts without changing Agent Work, chat, schedule, or comment-tag
callers.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

Implementation-defined means an implementation may choose the internal mechanism, storage engine,
or concrete TypeScript names, but it MUST preserve the externally observable contract described in
this specification and MUST document behavior that affects operators, tests, or durability.

## 3. Problem Statement

The current `@cycle/agents` package is a useful Codex app-server adapter, but its public contract is
provider-turn-centric. Callers assemble prompts, MCP context, ticket metadata, session IDs,
cancellation behavior, and completion behavior outside the package. The newer orchestration layer
normalizes provider streams into schema-tagged runtime events, but it is still an in-memory
compatibility wrapper over the old `AgentService.stream` API.

Cycle needs a package-level runtime that can be trusted by several entrypoints:

- a chat turn with an existing user conversation;
- a structured agent mention on a ticket comment;
- a scheduled scan that looks for tickets needing attention;
- a background ticket implementation run in an isolated worktree.

Those entrypoints need the same durable run state, prompt contracts, MCP attachment policy,
authority mapping, provider selection, resume behavior, event stream, and failure model. That
contract belongs in `@cycle/agents`; durable ticket queues, ticket transitions, branch finalization,
and comments remain outside this package.

## 4. Goals

`@cycle/agents` MUST:

1. Provide an Effect v4-first runtime service for local agent runs.
2. Treat schema-tagged runtime events as the canonical activity protocol.
3. Own durable local state for agent sessions, runs, attempts, events, provider bindings,
   interactions, and resumability cursors.
4. Support starting and resuming an agent run for chat, comment-tag, schedule, and Agent Work
   sources.
5. Support Codex as the first executable harness while allowing additional harness adapters later.
6. Attach a local MCP endpoint to harness runs through an explicit job/run scope.
7. Make prompt assembly a typed service backed by predefined prompt templates and schemas.
8. Separate Cycle authority modes from provider runtime modes.
9. Support a read/research mode with MCP access and read-only repository access.
10. Support an implementation-worktree mode with full read/write access inside a dedicated
    worktree.
11. Validate every run request before provider execution starts.
12. Persist enough state to explain, inspect, and reconcile runs after process restart.
13. Provide deterministic event ordering and replay for UI, API, tests, and Agent Work logs.
14. Normalize provider errors, MCP errors, storage errors, interruptions, and cancellations.
15. Avoid direct Node runtime usage in core code when Effect v4 or `@effect/platform-node` services
    provide an equivalent boundary.

`@cycle/agents` SHOULD:

1. Preserve the useful Codex app-server behaviors from the current adapter: MCP warmup, native
   thread persistence, approval/user-input bridging, structured output parsing, usage reporting,
   cancellation, and timeout handling.
2. Use `effect/unstable/ai` models, tools, toolkits, prompts, streams, queues, schedules, and
   schemas where they simplify the runtime.
3. Use Clanka's toolkit rendering pattern if Cycle needs to expose extra non-MCP model tools.
4. Keep provider-native tool support available when the harness already supplies high-quality code
   tools.
5. Keep public contracts narrow enough that Agent Work can rewire onto them without inheriting
   provider-specific details.

## 5. Non-Goals

`@cycle/agents` MUST NOT:

1. Own the Agent Work durable job queue, scheduler gates, ticket delegates, worktree records, branch
   records, or retry policy for ticket jobs.
2. Own Cycle ticket writes, status transitions, final handover comments, commits, branch naming, or
   branch publication.
3. Implement the Cycle MCP server.
4. Store local runtime state in GitDB.
5. Require hosted, remote, or multi-tenant agent execution.
6. Require non-Codex executable harness support in the first implementation phase.
7. Define a broad filesystem/shell toolkit as the primary tool path for Codex when Codex native
   tools and MCP are sufficient.
8. Persist raw secrets, MCP bearer tokens, process handles, provider clients, abort controllers, or
   other non-serializable runtime handles.
9. Continue the old provider-turn API as the primary public interface. Compatibility adapters MAY
   exist during migration.

## 6. Current Baseline

The current package has these useful pieces:

- provider detection and executable resolution;
- Codex app-server integration;
- normalized provider turn events;
- Codex session binding persistence;
- Codex MCP HTTP attachment and warmup;
- Codex approval and user-input request roundtrips;
- structured output parsing through Effect Schema;
- schema-tagged runtime events in `runtime-events.ts`.

The main design issues are:

- `AgentService` exposes provider sessions and turns as the package center;
- `makeAgentOrchestrationService` is an in-memory compatibility adapter over `AgentService`;
- runtime state is not durable enough to reconcile active runs after restart;
- prompt assembly is split across API/chat/Agent Work code;
- authority modes are collapsed into provider runtime modes too early;
- provider events are mapped into runtime events after the provider boundary instead of runtime
  events being the first-class contract;
- core streaming uses custom async iterables and queues where Effect streams and queues should be
  used;
- direct Node globals and process concerns appear inside adapter logic instead of service layers.

Breaking changes are allowed when they replace these boundaries with the runtime described here.

## 7. System Overview

The redesigned package is organized around one runtime service and several supporting services:

```text
Caller: chat, comment tag, schedule, Agent Work
        |
        v
AgentRuntime
  - validates request
  - resolves or creates durable session
  - creates durable run + attempt
  - assembles prompt bundle
  - resolves authority profile
  - attaches scoped MCP connection
  - selects harness adapter
  - streams canonical AgentRuntimeEvent records
        |
        +--> AgentDurability
        +--> PromptTemplateRegistry / PromptAssembler
        +--> AgentHarnessRegistry
        +--> AgentMcpConnector
        +--> AgentAuthorityPolicy
        +--> AgentWorkspacePolicy
        +--> Clock / IdGenerator / Logger
```

Responsibility boundaries:

- `AgentRuntime` owns live execution, resume orchestration, event replay, cancellation, steering,
  and reconciliation.
- `AgentDurability` owns local serializable records for sessions, runs, attempts, interactions, and
  events.
- `AgentHarnessRegistry` owns harness adapter lookup and capabilities.
- Harness adapters own provider protocol translation only.
- `PromptAssembler` owns predefined prompts and context rendering.
- `AgentMcpConnector` owns the normalized MCP connection contract supplied to harnesses.
- `AgentAuthorityPolicy` maps Cycle authority to allowed MCP operations, provider sandbox mode,
  approval behavior, and workspace constraints.
- `AgentWorkspacePolicy` validates workspace paths and read/write expectations.

## 8. Public Runtime API

The package MUST expose one primary Effect service. Exact TypeScript names are
implementation-defined, but the shape MUST be equivalent to:

```ts
export type AgentRuntimeShape = {
  readonly start: (
    request: AgentRunStartRequest,
  ) => Effect.Effect<AgentRunHandle, AgentRuntimeError, AgentRuntimeServices>;

  readonly resume: (
    request: AgentRunResumeRequest,
  ) => Effect.Effect<AgentRunHandle, AgentRuntimeError, AgentRuntimeServices>;

  readonly cancel: (
    request: AgentRunCancelRequest,
  ) => Effect.Effect<AgentRunSnapshot, AgentRuntimeError, AgentRuntimeServices>;

  readonly steer: (
    request: AgentRunSteerRequest,
  ) => Effect.Effect<AgentRunSnapshot, AgentRuntimeError, AgentRuntimeServices>;

  readonly inspect: (
    runId: AgentRunId,
  ) => Effect.Effect<Option.Option<AgentRunSnapshot>, AgentRuntimeError, AgentRuntimeServices>;

  readonly events: (
    request: AgentRunEventsRequest,
  ) => Stream.Stream<AgentRuntimeEvent, AgentRuntimeError, AgentRuntimeServices>;

  readonly reconcile: (
    request?: AgentRuntimeReconcileRequest,
  ) => Effect.Effect<readonly AgentRunSnapshot[], AgentRuntimeError, AgentRuntimeServices>;
};

export class AgentRuntime extends Context.Service<AgentRuntime, AgentRuntimeShape>()(
  "@cycle/agents/AgentRuntime",
) {}
```

Required semantics:

- `start` MUST create or find a durable run before provider execution begins.
- `resume` MUST continue a durable run from stored state when possible and MUST create a new attempt
  record for the resumed execution.
- `events` MUST replay durable events by sequence and MAY continue tailing live events.
- `cancel` MUST be idempotent.
- `steer` MUST either deliver the steering message to the live harness or persist it as a
  rejected/undeliverable interaction with a normalized reason.
- Provider terminal failures MUST be represented by terminal runtime events. `start` and `resume`
  SHOULD fail only for validation, storage, configuration, or pre-run setup failures.
- The old `AgentService` API MAY be kept as a compatibility adapter, but it MUST NOT be the primary
  package contract.

## 9. Core Domain Model

### 9.1 Stable Identifiers

Identifiers MUST be stable strings with explicit prefixes.

Required prefixes:

- `agent_session_`
- `agent_run_`
- `agent_attempt_`
- `agent_event_`
- `agent_interaction_`
- `agent_prompt_`

Callers MAY provide idempotency keys. The runtime MUST store normalized idempotency keys on run
records and use them to prevent duplicate non-terminal runs.

### 9.2 Agent Run Start Request

`AgentRunStartRequest` is the normalized input to `AgentRuntime.start`.

Required fields:

- `source`: `chat`, `comment-tag`, `schedule`, `agent-work`, `manual`, or extension value.
- `idempotencyKey`.
- `agent`: local agent profile reference containing at least `agentId`.
- `harness`: requested harness/provider reference.
- `prompt`: prompt template ID plus template input.
- `authority`: authority mode and scoped identifiers.
- `mcp`: MCP connection request or explicit `disabled`.
- `session`: session selection policy.
- `metadata`: JSON object.

`authority` MUST include:

- `mode`
- `repositoryId`
- optional `ticketId`
- optional `commentId`
- optional `jobId`
- optional `scheduleId`
- optional `workspacePath`
- optional `worktreeId`
- optional `allowedOperations`

`session` MUST support these policies:

- `create`: always create a new session.
- `reuse`: use an explicit `sessionId`.
- `by-conversation-key`: find or create a session for a stable caller-owned conversation key.

Validation rules:

- Unknown source values MAY be accepted only when the caller supplies a registered prompt template
  that supports them.
- The prompt template MUST support the selected source and authority mode.
- The harness MUST support the selected authority mode after provider capability mapping.
- The MCP request MUST be compatible with the selected authority mode.
- The request MUST be decoded by Effect Schema before any durable run is created.

### 9.3 Agent Session

An Agent Session is a durable conversation or harness thread binding.

Required fields:

- `sessionId`
- `harnessId`
- `providerId`
- `status`: `idle`, `running`, `waiting`, `closed`, or `error`
- `createdAt`
- `updatedAt`
- `title`
- `conversationKey`
- `repositoryId`
- `ticketId`
- `model`
- `native`: provider-owned serializable resume identifiers
- `metadata`: JSON object

Invariants:

- A session MUST NOT contain live provider clients or abort controllers.
- Provider-native thread IDs MUST be stored under `native`.
- A session MAY be reused across chat turns.
- A comment-tag, schedule, or Agent Work run MAY create a fresh session or reuse a scoped session
  according to prompt policy.

### 9.4 Agent Run

An Agent Run is a durable invocation of an agent for a specific source and authority context.

Required fields:

- `runId`
- `sessionId`
- `source`: `chat`, `comment-tag`, `schedule`, `agent-work`, `manual`, or extension value
- `status`
- `authorityMode`
- `harnessId`
- `providerId`
- `model`
- `promptTemplateId`
- `idempotencyKey`
- `repositoryId`
- `ticketId`
- `commentId`
- `scheduleId`
- `jobId`
- `workspacePath`
- `worktreeId`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `terminal`
- `metadata`

Run statuses:

- `created`
- `preparing`
- `running`
- `waiting-for-approval`
- `waiting-for-input`
- `cancelling`
- `completed`
- `failed`
- `cancelled`
- `interrupted`

Terminal statuses are `completed`, `failed`, `cancelled`, and `interrupted`.

Invariants:

- A run MUST have at most one active attempt.
- A run MUST have exactly one terminal runtime event when it reaches a terminal status.
- A run MUST keep its source identity. A resumed run is the same run with a new attempt, not a new
  run.
- A run MUST NOT mutate Agent Work job state directly.

### 9.5 Agent Attempt

An Attempt is one live provider execution for a run.

Required fields:

- `attemptId`
- `runId`
- `sessionId`
- `status`: `starting`, `running`, `waiting`, `completed`, `failed`, `cancelled`, or `interrupted`
- `ownerId`
- `leaseExpiresAt`
- `providerTurnId`
- `native`: provider-owned serializable attempt metadata
- `startedAt`
- `heartbeatAt`
- `completedAt`
- `lastError`

Attempts are process-scoped execution records. After process restart, active attempts without a
valid lease MUST be reconciled to `interrupted`.

### 9.6 Provider Binding

A Provider Binding stores durable harness-native identifiers separately from live harness handles.

Required fields:

- `bindingId`
- `sessionId`
- `runId`
- `attemptId`
- `harnessId`
- `providerId`
- `status`: `active`, `idle`, `closed`, or `error`
- `native`: provider-owned JSON object
- `createdAt`
- `updatedAt`
- `lastError`

Provider bindings MUST be serializable. They MAY contain native thread IDs, resume cursors, model
selection, and provider-specific capability metadata. They MUST NOT contain provider clients,
process IDs treated as authoritative handles, file descriptors, or secrets.

### 9.7 Prompt Bundle

A Prompt Bundle is the durable redacted record of what the runtime sent to a harness.

Required fields:

- `promptId`
- `runId`
- `templateId`
- `templateVersion`
- `systemHash`
- `userHash`
- `redactedSystemPreview`
- `redactedUserPreview`
- `context`
- `createdAt`

The runtime MAY persist full prompt text when diagnostics configuration allows it. Full prompt text
MUST still be redacted and MUST NOT contain bearer tokens or raw secrets.

### 9.8 Interaction

An Interaction represents a provider or runtime request for external input.

Required fields:

- `interactionId`
- `runId`
- `attemptId`
- `type`: `approval`, `user-input`, `steering`, or extension value
- `status`: `open`, `resolved`, `expired`, `cancelled`, or `rejected`
- `prompt`
- `schema`
- `defaultDecision`
- `createdAt`
- `resolvedAt`
- `payload`

Interactions MUST be durable so UI/API callers can recover open questions after refresh. Secrets
MUST be redacted before persistence.

## 10. Authority Model

Cycle authority modes are package-level policy inputs. They MUST NOT be treated as provider sandbox
strings until after validation.

Core authority modes:

### 10.1 `ticket-context`

Purpose: research, planning, triage, comment replies, and scheduled ticket inspection.

Rules:

- Codebase access MUST be read-only.
- A worktree path is NOT required.
- Harness file writes MUST be disabled or rejected.
- Shell or command execution MUST be disabled unless the command is provably read-only by the
  selected harness policy.
- MCP access MAY include read and write operations, but it MUST be scoped by repository, ticket,
  run, and source.
- The MCP scope MAY allow ticket comments, planning metadata, or other Cycle writes when the
  prompt template requires them.
- The runtime MUST record the selected MCP scope on the run record without storing bearer tokens.

### 10.2 `implementation-worktree`

Purpose: implementing a ticket in parallel with other local work.

Rules:

- A dedicated worktree path is REQUIRED.
- The runtime MUST reject the run if `workspacePath` is missing.
- The harness working directory MUST be the worktree path or a child path allowed by
  `AgentWorkspacePolicy`.
- File writes MAY be allowed inside the worktree.
- Provider sandbox mode SHOULD be workspace-write or the closest equivalent.
- MCP access MAY include scoped read/write operations for the ticket and job.
- The runtime MUST NOT create final commits, transition tickets, or write handover comments; those
  are Agent Work/usecase responsibilities.

### 10.3 Optional Extension Modes

Future modes MAY include `diagnostic-readonly`, `disposable-worktree`, or `full-access`, but they
MUST be added as authority policy extensions with tests. `full-access` MUST NOT be enabled by
default.

## 11. Workspace Policy

`AgentWorkspacePolicy` MUST validate workspace inputs before provider execution.

Required checks:

- `ticket-context` MUST NOT require a worktree.
- `ticket-context` MUST configure the harness so repository code access is read-only.
- `implementation-worktree` MUST require `workspacePath`.
- `implementation-worktree` MUST reject paths outside the repository's known worktree root when the
  caller provides a worktree root.
- The runtime MUST pass a normalized cwd to the harness.
- The runtime SHOULD record a workspace fingerprint containing path, base ref, branch name, and
  worktree ID when supplied.

The policy MAY rely on a caller-provided worktree service to validate worktree ownership. The agents
package MUST NOT create or clean worktrees in the core runtime.

### 11.1 Runtime Configuration

`AgentRuntimeConfig` MUST be decoded with Effect Schema.

Required configuration fields:

- `ownerId`
- `defaultHarnessId`
- `defaultProviderId`
- `defaultModel`
- `defaultTimeout`
- `defaultMcpFailurePolicy`: `warn-and-continue` or `fail-run`
- `eventDiagnostics`: `redacted` or `raw-private`
- `automaticResume`: boolean
- `leaseDuration`
- `promptDiagnostics`: `redacted-preview` or `redacted-full`

Configuration precedence MUST be:

1. explicit run request;
2. existing session defaults;
3. runtime configuration;
4. harness adapter defaults.

Invalid configuration MUST fail the layer or runtime construction before any run starts. Runtime
configuration reload behavior is implementation-defined, but changes MUST NOT mutate active run
authority after an attempt has started.

## 12. MCP Contract

MCP is the primary extension mechanism for Cycle context and ticket operations.

`AgentMcpConnector` MUST expose a normalized connection record equivalent to:

```ts
type AgentMcpConnection =
  | {
      readonly mode: "http";
      readonly url: string;
      readonly headers: RedactedHeaders;
      readonly tokenRef?: string;
      readonly scope: AgentMcpScope;
    }
  | {
      readonly mode: "stdio";
      readonly command: string;
      readonly args: readonly string[];
      readonly env: RedactedEnv;
      readonly scope: AgentMcpScope;
    };
```

Required `AgentMcpScope` fields:

- `runId`
- `sessionId`
- `source`
- `authorityMode`
- `repositoryId`
- `ticketId`
- `commentId`
- `jobId`
- `workspacePath`
- `allowedOperations`
- `expiresAt`

MCP rules:

- The runtime MUST NOT log or persist raw bearer tokens.
- The runtime MUST provide the harness with the actual secret only at execution time.
- MCP startup or warmup failures MUST emit `McpUnavailable` or `WarningReported` events and MUST
  follow the prompt template's failure policy.
- Codex HTTP MCP attachment MUST remain supported.
- Stdio MCP MAY be supported when the harness adapter can supply it safely.

## 13. Harness Adapter Contract

Harness adapters translate runtime requests to local provider protocols.

The package MUST define a provider-neutral harness adapter shape equivalent to:

```ts
type AgentHarnessAdapter = {
  readonly harnessId: string;
  readonly providerId: AgentProviderId;
  readonly capabilities: Effect.Effect<AgentHarnessCapabilities, AgentRuntimeError>;

  readonly openSession: (
    request: HarnessOpenSessionRequest,
  ) => Effect.Effect<HarnessSessionBinding, AgentRuntimeError, Scope.Scope>;

  readonly execute: (
    request: HarnessExecuteRequest,
  ) => Stream.Stream<HarnessEvent, AgentRuntimeError, Scope.Scope>;

  readonly cancel: (
    request: HarnessCancelRequest,
  ) => Effect.Effect<HarnessCancelResult, AgentRuntimeError>;

  readonly steer: (
    request: HarnessSteerRequest,
  ) => Effect.Effect<HarnessSteerResult, AgentRuntimeError>;

  readonly resolveInteraction: (
    request: HarnessInteractionResponse,
  ) => Effect.Effect<HarnessInteractionResult, AgentRuntimeError>;
};
```

Capabilities MUST include:

- `sessionResume`
- `nativeThreadResume`
- `streaming`
- `mcpHttp`
- `mcpStdio`
- `providerNativeCodeTools`
- `workspaceWrite`
- `readOnlyWorkspace`
- `approvalRequests`
- `userInputRequests`
- `steering`
- `usageReporting`
- `structuredOutput`
- `interrupt`

Codex requirements:

- Codex app-server MUST be the first production adapter.
- Codex native thread IDs MUST be persisted in session binding `native`.
- Codex MCP HTTP configuration and warmup MUST be preserved.
- Codex approval and user-input requests MUST be represented as durable interactions.
- Codex provider events MUST be converted into canonical runtime events before reaching callers.

## 14. Optional Tooling Contract

Codex already supplies provider-native code tools, so the first implementation MUST NOT define a
large Cycle-owned filesystem/shell toolkit unless a prompt template explicitly needs extra tools.

If Cycle exposes extra non-MCP tools directly to a model, it SHOULD use the Clanka-style pattern:

1. Expose one model-visible tool named `execute`.
2. Render available script functions from Effect Schema or `effect/unstable/ai/Toolkit`.
3. Execute scripts through an `AgentToolExecutor` service with explicit authority context.
4. Emit `ScriptStarted`, `ScriptDelta`, `ScriptOutput`, `ToolStarted`, `ToolCompleted`, and
   `ToolFailed` runtime events.
5. Keep the executor replaceable so local and future RPC executors share the same contract.

This optional tooling path MUST obey the same authority policy as MCP and harness-native tools.

## 15. Prompt Contracts

Prompt assembly MUST be a package service, not ad hoc caller code.

Required services:

- `PromptTemplateRegistry`
- `PromptAssembler`
- `PromptContextProvider`

Each prompt template MUST define:

- `templateId`
- `version`
- `supportedSources`
- `supportedAuthorityModes`
- `inputSchema`
- `contextSchema`
- `outputPolicy`
- `mcpPolicy`
- `workspacePolicy`
- `renderSystem`
- `renderUser`

Core prompt templates:

- `chat.reply`
- `ticket.comment_mention`
- `ticket.schedule_scan`
- `ticket.research`
- `ticket.implementation`

Prompt assembly rules:

- The assembler MUST decode input and context with Effect Schema.
- The assembler MUST include authority mode, run ID, session ID, repository ID, ticket ID, and
  source metadata.
- The assembler MUST include MCP availability and scope in the system prompt when MCP is attached.
- The assembler MUST include workspace policy in the system prompt.
- The assembler SHOULD include repository instructions such as `AGENTS.md` when a repository path is
  available and the policy allows reading it.
- Prompt templates MUST state what the agent should return or which Cycle operation it should call
  through MCP when complete.
- Prompt templates MUST NOT include raw tokens, API secrets, or unredacted local configuration.

## 16. Runtime Events

`AgentRuntimeEvent` MUST be the canonical event protocol. Events MUST be defined with Effect Schema
tagged classes.

Every event MUST include:

- `_tag`
- `schemaVersion`
- `eventId`
- `runId`
- `sessionId`
- `attemptId`
- `sequence`
- `occurredAt`
- `source`
- `authorityMode`
- optional `repositoryId`
- optional `ticketId`
- optional `commentId`
- optional `jobId`

Required event categories:

- run lifecycle: started, resumed, completed, failed, cancelled, interrupted;
- assistant output: message delta and final message;
- reasoning output;
- script/tool output when available;
- provider-native tool activity;
- MCP activity and warnings;
- interactions: approval requested/resolved, user input requested/resolved;
- steering accepted/rejected;
- usage;
- retry or resume scheduling;
- warning.

Event rules:

- Events MUST be append-only.
- Sequence numbers MUST be monotonically increasing per run.
- Terminal events MUST be final for a run.
- Public events MUST be redacted.
- Raw provider payloads MAY be persisted in a private diagnostics field only when configured.
- Consumers MUST be able to replay a run from `sequence > n`.

## 17. Durability Contract

`AgentDurability` MUST be a package-owned service interface. The storage engine is
implementation-defined.

Required operations:

- `getSession(sessionId)`
- `upsertSession(session)`
- `getRun(runId)`
- `findRunByIdempotencyKey(key)`
- `createRun(run)`
- `updateRun(runId, patch)`
- `createAttempt(attempt)`
- `updateAttempt(attemptId, patch)`
- `upsertProviderBinding(binding)`
- `getProviderBinding(bindingId)`
- `appendEvent(event)`
- `listEvents(runId, afterSequence?)`
- `getInteraction(interactionId)`
- `upsertInteraction(interaction)`
- `listOpenInteractions(runId?)`
- `claimRun(runId, ownerId, leaseDuration)`
- `heartbeatRun(runId, ownerId, leaseDuration)`
- `releaseRun(runId, ownerId)`
- `listActiveRuns(ownerId?)`
- `close()`

Durability rules:

- Records MUST be JSON-serializable.
- The event log MUST be durable before an event is emitted to callers.
- The latest run snapshot MAY be a projection, but it MUST be rebuildable from durable records.
- Leases MUST prevent two local runtime owners from executing the same run concurrently.
- A process restart MUST NOT leave active runs appearing healthy indefinitely.
- Raw secrets MUST NOT be persisted.
- Provider-native resume identifiers MAY be persisted.
- Storage failures MUST be surfaced as `storage_error` and MUST NOT be hidden behind provider
  failures.

## 18. Runtime State Machines

### 18.1 Start Flow

Reference algorithm:

```text
start(request):
  decode request schema
  normalize source and idempotency key
  if non-terminal run exists for key:
    return handle for existing run
  validate authority policy
  validate workspace policy
  create or resume durable session
  create durable run(status=created)
  claim run lease
  create attempt(status=starting)
  append AgentRunStarted
  assemble prompt bundle
  resolve MCP connection
  open harness session
  update run(status=running), attempt(status=running)
  stream harness events
  map each harness event to runtime event and append before emit
  on terminal event:
    update attempt and run terminal state
    release lease
```

### 18.2 Resume Flow

Resume MUST support durable process recovery and user-requested continuation.

Reference algorithm:

```text
resume({ runId, reason, message? }):
  load run
  reject missing run
  if run is completed/cancelled/failed and no resume policy allows continuation:
    return current snapshot
  claim run lease
  inspect latest session binding and provider native cursor
  create new attempt
  append AgentRunResumed
  if harness supports native thread resume:
    continue in native session with resume prompt
  else:
    create a continuation prompt from durable run summary and latest events
  execute as a new attempt for the same run
```

On process restart, `reconcile` MUST mark stale active attempts as `interrupted`. It MAY then
resume runs according to caller policy, but automatic resume MUST be explicit and bounded.

### 18.3 Cancellation Flow

Cancellation MUST be idempotent.

Reference algorithm:

```text
cancel({ runId, reason }):
  load run
  if terminal: return snapshot
  update run(status=cancelling)
  append AgentRunCancelling
  if live attempt exists:
    request harness interrupt
  append AgentRunCancelled when provider confirms or timeout expires
  update run and attempt terminal state
  release lease
```

### 18.4 Steering Flow

Steering is best-effort.

Rules:

- If the harness supports live steering, the runtime MUST pass the message to the harness and append
  `SteeringAccepted`.
- If the run is not live or the harness does not support steering, the runtime MUST append
  `SteeringRejected` with a reason.
- Steering messages MUST be persisted as interactions.
- Steering MUST NOT create a new run by itself.

## 19. Integration With Agent Work And Chat

Agent Work and chat MUST call `AgentRuntime` rather than provider adapters directly after migration.

`@cycle/agents` owns:

- run/session durability;
- prompt assembly;
- MCP attachment;
- harness execution;
- runtime event persistence/replay;
- cancellation and steering at the harness level;
- provider error normalization.

Agent Work/usecases own:

- job queues;
- scheduler gates;
- ticket delegates;
- worktree creation and cleanup;
- branch and commit finalization;
- ticket status transitions;
- handover comments;
- durable job logs and UI projections.

Chat owns:

- chat thread/message persistence;
- UI rendering;
- user-facing question surfaces;
- selecting an existing session or conversation key.

Schedule logic owns:

- when to scan;
- which repositories/tickets are in scope;
- whether a scheduled run should enqueue Agent Work jobs or only report findings.

## 20. Failure Model

`AgentRuntimeError` MUST normalize failures into stable categories.

Required codes:

- `invalid_request`
- `authority_denied`
- `workspace_unavailable`
- `harness_unavailable`
- `harness_unsupported`
- `authentication_error`
- `rate_limit`
- `mcp_unavailable`
- `mcp_unauthorized`
- `timeout`
- `cancelled`
- `interrupted`
- `storage_error`
- `parse_error`
- `provider_error`
- `unknown`

Rules:

- Retry behavior MUST be bounded.
- Retry attempts MUST emit durable events.
- Provider failures after run creation SHOULD become terminal run events.
- Validation and durability failures before run creation MAY fail the returned Effect.
- Authentication and authorization failures MUST be operator-visible.
- MCP warmup failures MUST include remediation text when known.
- If a provider stream ends without a terminal provider event, the runtime MUST produce either a
  completed event from accumulated output or a failed event with `provider_error`; the choice MUST
  be deterministic and tested per harness.

## 21. Observability

The runtime MUST provide enough information to inspect active and historical runs without a
debugger.

Required observability:

- structured logs for run start, resume, terminal state, provider start, MCP attach, MCP warmup,
  interaction open/resolution, cancellation, and storage failure;
- run snapshots from durable state;
- event replay by sequence;
- attempt lease and heartbeat fields;
- harness/provider/model identifiers;
- redacted MCP scope;
- normalized failure code and message;
- token usage when provided by the harness.

Logs and persisted events MUST redact:

- authorization headers;
- MCP bearer tokens;
- environment variables containing secret-like names;
- raw provider payloads unless diagnostics mode is enabled.

## 22. Security And Safety

The trust boundary is local but still explicit.

Security requirements:

- User prompts, ticket comments, schedule criteria, MCP responses, and provider output MUST be
  treated as untrusted input.
- Secrets MUST be supplied at execution time through a secret-bearing service or connector and MUST
  be redacted before logging or persistence.
- `ticket-context` MUST prevent codebase writes.
- `implementation-worktree` MUST constrain codebase writes to the approved worktree.
- The runtime MUST reject implementation runs without a validated worktree path.
- Provider-native approval requests MUST be durable interactions.
- Prompt templates MUST describe authority and workspace limits to the agent.
- The package MUST NOT grant full filesystem or network authority by default.
- Optional direct tool execution MUST run behind an executor service with explicit authority checks.

## 23. Effect And Dependency Rules

Core package code MUST prefer Effect v4 imports and services.

Requirements:

- Use `Effect`, `Stream`, `Queue`, `Scope`, `Layer`, `Context`, `Schema`, `Clock`, `Schedule`, and
  related Effect modules for runtime flow.
- Use `@effect/platform-node` services for filesystem, path, process, and platform boundaries in
  Node-specific layers.
- Isolate direct Node APIs inside adapter-specific or platform-specific modules when no Effect
  equivalent exists.
- Do not expose Promise/AsyncIterable as the primary public runtime API.
- Compatibility functions MAY convert Effect streams to async iterables for existing callers during
  migration.

## 24. Test And Validation Matrix

Core conformance tests MUST cover:

| Area | Required validation |
| --- | --- |
| Runtime API | `start`, `resume`, `cancel`, `steer`, `inspect`, and `events` are Effect-first and typed. |
| Durability | Runs, sessions, attempts, interactions, and events survive process restart simulation. |
| Reconciliation | Active stale attempts become `interrupted`; explicit resume creates a new attempt. |
| Idempotency | Duplicate start requests with the same key do not create concurrent runs. |
| Event ordering | Events are appended before emission and replay in sequence order. |
| Authority | `ticket-context` rejects workspace writes; `implementation-worktree` requires a worktree. |
| MCP | HTTP MCP attachment passes scoped configuration to Codex without persisting tokens. |
| Codex | Native thread IDs persist and resume through the harness binding. |
| Interactions | Approval and user-input requests persist, resolve, and replay after refresh. |
| Cancellation | Cancellation interrupts live Codex attempts and reaches a terminal state. |
| Steering | Supported steering succeeds; unsupported steering emits a rejected event. |
| Prompt templates | Inputs decode through Schema and render deterministic prompt bundles. |
| Errors | Provider, MCP, timeout, parse, auth, and storage failures map to stable codes. |
| Redaction | Tokens and secret-like environment values are absent from events and logs. |

Integration tests SHOULD cover:

- chat run start and resume through an existing session;
- comment-tag run with scoped repository/ticket/comment metadata;
- scheduled ticket scan with no worktree;
- implementation run with a dedicated worktree path;
- Agent Work consuming runtime events without using provider-specific APIs.

## 25. Implementation Checklist

An implementation is conformant when:

1. `AgentRuntime` is the primary package entrypoint.
2. The old `AgentService` contract is removed from primary callers or wrapped as compatibility
   only.
3. Runtime events are schema-tagged and append-only.
4. `AgentDurability` exists and has deterministic test and local layers.
5. Codex runs through the new harness adapter.
6. MCP attachment and warmup remain supported for Codex.
7. Prompt templates cover chat, comment mentions, schedule scans, research, and implementation.
8. Authority policy enforces `ticket-context` and `implementation-worktree`.
9. Restart reconciliation is implemented and tested.
10. No raw secrets are persisted or logged.
11. Package tests pass through `pnpm --filter @cycle/agents test`.
12. Type checking passes through `pnpm --filter @cycle/agents typecheck`.

## 26. Migration Notes

Migration SHOULD proceed in phases:

1. Introduce schemas, runtime events, durability service, and prompt templates alongside existing
   adapters.
2. Wrap the current Codex app-server implementation as an `AgentHarnessAdapter`.
3. Replace `makeAgentOrchestrationService` with the new `AgentRuntime`.
4. Add compatibility helpers for existing chat and Agent Work callers.
5. Rewire chat to `AgentRuntime`.
6. Rewire Agent Work/usecases to `AgentRuntime`.
7. Remove provider-turn APIs from public exports once all callers have migrated.

## 27. Future Extensions

Future specifications MAY add:

- additional harnesses such as Claude Code or OpenCode;
- remote or RPC tool executors;
- semantic repository search;
- advanced multi-agent delegation;
- hosted or remote runner support;
- richer schedule policy;
- provider cost accounting;
- optional direct tool execution using the Clanka-style single `execute(script)` tool.
