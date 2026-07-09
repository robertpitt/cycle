# Cycle Agents and Agent Chat Runtime Redesign Specification

Status: Draft implementation specification

Version: 1.0.0-draft

Date: 2026-07-09

Target packages: `@cycle/agents` and `@cycle/agent-chat`

Supersedes, where conflicting:

- `packages/agents/SPEC.md`
- `packages/agents/ARCHITECTURE.md`
- `packages/agent-chat/AGENT_CHAT_PACKAGE_STREAMLINE.md`
- `specs/CLANKA_AGENT_RUNTIME_REDESIGN_SPEC.md`
- `specs/AGENT_CHAT_RESUME_RECONCILIATION_SPEC.md`
- agent execution and chat-runtime portions of the Agent Work specifications

## 1. Purpose

This specification defines a breaking redesign of Cycle's local agent runtime. The target is one
durable, Effect-native execution system that can run interactive conversations and unattended
ticket work through the same task, thread, run, attempt, event, scheduling, and provider contracts.

The redesigned `@cycle/agents` package MUST own the complete local execution lifecycle: its own
SQLite database, threads, tasks, turns, runs, attempts, sessions, interactions, workflow steps,
leases, scheduling, concurrency gates, provider execution, replay, reconciliation, retention, and
diagnostics. `@cycle/agent-chat` MUST become a thin chat application service and projection over
that runtime; it MUST NOT maintain a second execution engine or duplicate chat database.

The primary product workflow is:

1. A human explicitly assigns a planned ticket to an agent.
2. Cycle creates a durable ticket-implementation task and thread.
3. A Cycle workflow adapter creates and acquires a dedicated implementation worktree.
4. The agent runs in that worktree and may be observed, steered, interrupted, or asked questions.
5. Cycle durably suspends the task whenever human input or approval is required.
6. On successful completion, Cycle finalizes and pushes the branch, posts a detailed handover
   comment, and moves the ticket to `needs-review`.
7. A human validates the result and owns any later pull-request or completion decision.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` are to be
interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

`Implementation-defined` means an implementation may choose an internal name or algorithm only
where this specification says so. The choice MUST preserve the observable contract, be documented,
and be covered by tests when it affects durability, scheduling, recovery, security, or consumers.

`Semantic event` means a durable state or activity event such as a task transition, completed
message, tool call, interaction, child run, usage report, warning, or terminal result.

`Diagnostic event` means provider-native or implementation detail retained for debugging but not
used as the canonical application protocol.

`Workflow adapter` means a host-provided Effect service that implements domain-specific preparation
and handover around a generic agent task. Ticket and worktree behavior are supplied this way so
`@cycle/agents` does not depend on `@cycle/usecases` and create a package cycle.

## 3. Source Context and Design Basis

This specification is based on direct inspection of:

- all source modules, migrations, tests, package exports, architecture notes, and existing specs in
  `packages/agents` and `packages/agent-chat`;
- all current consumers of `@cycle/agents` and `@cycle/agent-chat` in backend, API, usecases,
  desktop, contracts, and UI packages;
- the worktree lifecycle, lease, setup, finalization, branch publication, remote push, handover, and
  reconciliation services in `@cycle/git-worktrees`;
- `vendor/clanka`, especially its `Agent`, `AgentExecutor`, `AgentTools`, `AgentOutput`, provider
  model layers, toolkit renderer, steering, subagent, retry, timeout, and scoped-resource design;
- the complete public module surface of the vendored Effect v4 repository, including core Effect,
  AI, workflow, persistence, event log, SQL, RPC, process, platform-node, observability, cluster,
  worker, transactional, stream, resource, configuration, schema, and testing modules;
- source and tests for the Effect modules most relevant to this design, including `Workflow`,
  `WorkflowEngine`, `Activity`, `DurableQueue`, `DurableDeferred`, `PersistedQueue`, `Persistence`,
  `EventLog`, `SqlEventJournal`, `LayerMap`, `FiberMap`, `FiberSet`, `Queue`, `PubSub`, `Stream`,
  `Semaphore`, `ExecutionPlan`, `Chat`, `LanguageModel`, `Tool`, `Toolkit`, and Effect SQL.

### 3.1 Effect Capability Decisions

The design MUST use the following Effect capabilities directly:

- `Effect`, `Effect.gen`, and named `Effect.fn` for all side-effecting workflows;
- `Context.Service` and focused `Layer` values for dependencies and implementations;
- `Scope`, `Effect.acquireRelease`, `Effect.addFinalizer`, and `Effect.forkScoped` for lifetime
  management;
- `Stream` for provider output, durable replay, and live subscriptions;
- bounded `Queue` for internal commands and wake-ups, and bounded `PubSub` for live fan-out;
- `FiberMap`, `FiberSet`, or `FiberHandle` for supervised live work;
- `LayerMap.Service` for keyed, scoped provider/runtime resources;
- `Semaphore` and keyed capacity services for in-process admission enforcement;
- `Schedule`, `Clock`, `Duration`, `Crypto`, `Config`, `ConfigProvider`, `Redacted`, `Metric`, and
  `Tracer` instead of direct platform globals;
- `Schema.Class`, `Schema.TaggedClass`, `Schema.TaggedErrorClass`, branded schemas, codecs, and
  strict decoding for every durable and external boundary;
- Effect SQL and `@cycle/sqlite` for migrations and transactional storage;
- `FileSystem`, `Path`, and `ChildProcessSpawner` at platform boundaries;
- `TestClock` and Effect's test layers for deterministic tests.

The design MUST NOT use Effect's unstable `WorkflowEngine` as the production runtime in this
version. Its built-in local engine is explicitly in-memory and its production durable engine is
cluster-backed. Cycle requires a local SQLite engine with product-specific scheduling, replay, and
inspection semantics. The package MAY later implement a SQLite `WorkflowEngine.Encoded` adapter,
but that adapter is not required by this specification.

The design MUST NOT use `PersistedQueue` as the authoritative task model. Its SQL store provides
valuable deduplication, lock expiration, scoped acknowledgement, and retries, but it does not own
Cycle's priority lanes, queryable lifecycle, interaction suspension, parent limits, workflow steps,
or event transaction. The implementation SHOULD reuse its locking and scoped-take ideas.

The design MUST NOT use unstable `EventLog` as the canonical journal. Its replication and conflict
model does not provide the per-thread monotonic sequence and atomic projection contract required by
Cycle. The implementation SHOULD reuse its typed event, SQL journal, handler, and live-change ideas.

Transactional `Tx*` structures MAY coordinate ephemeral state but MUST NOT be mistaken for durable
state. SQLite transactions remain authoritative across restarts.

Effect AI `LanguageModel`, `Chat`, `Tool`, and `Toolkit` MAY back future direct-model harnesses.
Codex app-server and Claude Agent SDK are native agent harnesses in the first implementation and
MUST retain their richer session, tool, approval, and resume semantics behind the common harness
contract.

## 4. Problem Statement

Cycle currently has overlapping execution systems:

- `AgentTaskService` persists queued tasks but does not execute them;
- `AgentRuntime` executes provider work but has only process-local active-run management and no
  complete scheduler;
- compatibility orchestration maintains another run/event model;
- `@cycle/agent-chat` directly calls the old provider registry through Promises, raw maps,
  `AbortController`, detached `Effect.runFork`, and its own provider-event projection;
- task, runtime, chat, provider session, and Agent Work schemas overlap without one canonical
  lifecycle;
- chat and background work cannot share reliable attach, replay, suspension, steering, restart, or
  child-agent behavior;
- mutable state and side effects cross Effect boundaries too early;
- SQLite writes, live publication, and state transitions are not one atomic protocol;
- worktree and ticket handover operations are not expressed as resumable, idempotent workflow
  steps owned by the task lifecycle.

This makes autonomous execution unreliable. A hard restart may leave stale active state, a queued
task has no worker, provider output may be lost, a waiting approval may consume an unmanaged
runtime handle, and chat has a second source of truth. Adding more adapters or compatibility layers
would increase rather than remove these problems.

## 5. Goals

The redesign MUST:

1. Expose one clean, provider-neutral Effect interface to the Cycle backend.
2. Treat threads, tasks, turns, runs, attempts, interactions, workflow steps, and events as durable
   local domain objects.
3. Use a package-owned SQLite database distinct from the main Cycle and worktree databases.
4. Resume or reconcile all non-terminal work after process or machine restart.
5. Allow a consumer to attach at any time, replay by sequence, then tail without gaps.
6. Allow a consumer to steer, interrupt, cancel, answer questions, and resolve approvals through
   durable commands.
7. Queue eligible work until global, provider, repository, and parent capacity is available.
8. Support Codex app-server and Claude Agent SDK behind one normalized harness contract.
9. Support root and bounded child-agent runs with attribution and cancellation propagation.
10. Suspend durably for user input or approval, release scheduler capacity, and resume at high
    priority after a response.
11. Model ticket preparation and handover as idempotent workflow steps around provider execution.
12. Integrate with the independently durable worktree service without sharing its database.
13. Persist semantic output efficiently while bounding loss and write amplification for deltas.
14. Make provider-native data, secrets, and diagnostics explicitly classified and retained.
15. Remove Promise-first, async-iterable-first, detached-fiber, and unmanaged-resource package
    APIs.
16. Make crash points, retries, duplicate commands, stale fibers, and partial external success
    observable and testable.

The redesign SHOULD:

1. Preserve useful Codex app-server functionality: native thread resume, MCP, approvals, user
   input, steering, interruption, tool activity, usage, and provider history reconciliation.
2. Preserve useful Claude Agent SDK session and resume functionality.
3. Use Clanka's separation between agent, executor, toolkit, provider, and output concepts without
   copying its process-local durability assumptions.
4. Keep the first scheduler understandable: fixed lanes, FIFO ordering, explicit gates, and no
   preemption.
5. Make future direct Effect AI, remote harness, and worker-process adapters additive.

## 6. Non-Goals

The first implementation MUST NOT:

1. Support multiple competing backend processes or distributed runners.
2. Require Effect Cluster, Redis, a hosted queue, or a remote workflow engine.
3. Create pull requests automatically.
4. Allow an agent to mark a ticket `done` or bypass human validation.
5. Trigger implementation merely because a ticket entered `ready`; explicit agent assignment is
   required.
6. Put agent-runtime state into GitDB or synchronize it to other users.
7. Move worktree tables into the agents database or agent tables into the worktree database.
8. Preserve obsolete provider-turn, compatibility orchestration, or agent-chat store APIs as
   convenience facades.
9. Guarantee exactly-once execution of external effects. The system guarantees at-least-once
   execution with stable idempotency keys and fenced state changes.
10. Persist or expose hidden chain-of-thought. Provider-supplied reasoning summaries MAY be stored.

## 7. Package and Responsibility Boundaries

### 7.1 Target Dependency Shape

```text
@cycle/backend
  composes runtime, workflow adapters, transport, and platform layers
       |
       +--> @cycle/agent-chat --> @cycle/agents
       |
       +--> ticket implementation workflow adapter
       |       +--> @cycle/agents contracts
       |       +--> @cycle/git-worktrees
       |       +--> Cycle ticket/usecase services
       |
       +--> @cycle/agents
               +--> @cycle/sqlite
               +--> effect / @effect/platform-node
               +--> Codex app-server boundary
               +--> Claude Agent SDK boundary
```

`@cycle/agents` MUST NOT import `@cycle/agent-chat`, `@cycle/api`, `@cycle/backend`,
`@cycle/desktop`, renderer code, or `@cycle/usecases`.

`@cycle/agent-chat` MAY depend on `@cycle/agents`, Effect, and shared schema contracts. It MUST NOT
depend on provider adapters, SQLite, `@cycle/api`, `@cycle/backend`, `@cycle/desktop`, or renderer
code.

### 7.2 `@cycle/agents` Ownership

`@cycle/agents` owns:

- the primary `AgentRuntime` service;
- all durable agent lifecycle schemas and typed errors;
- the agent SQLite schema, migrations, stores, compaction, retention, and reconciliation;
- thread, task, turn, run, attempt, session, interaction, event, workflow-step, side-effect receipt,
  artifact, and lease state;
- task scheduling and all concurrency gates;
- provider/harness capabilities, selection, process/session lifetime, normalized events, and error
  mapping;
- live fiber supervision and keyed runtime resource management;
- prompt envelopes, generic conversation assembly, provider context, and token-budget policy;
- root/child run orchestration;
- attach/replay/tail, cancellation, interruption, steering, and interaction response;
- generic workflow adapter contracts and execution of workflow steps;
- test harnesses and conformance suites for stores, schedulers, and providers.

### 7.3 `@cycle/agent-chat` Ownership

`@cycle/agent-chat` owns:

- chat-specific request and response schemas;
- mapping chat commands onto `AgentRuntime` operations;
- chat thread defaults, chat prompt policy, and chat-specific context assembly;
- mapping canonical agent snapshots and events to the public chat projection expected by API/UI;
- chat-specific typed errors and tests.

`@cycle/agent-chat` MUST NOT own:

- a SQLite store;
- active-turn maps, fibers, provider clients, abort controllers, or session bindings;
- provider event normalization;
- a second message, turn, question, activity, or event source of truth;
- HTTP or WebSocket transport;
- ticket mention parsing or ticket workflow policy.

### 7.4 Host Workflow Adapters

Domain-specific workflows MUST be supplied through an `AgentWorkflowRegistry`. The adapter
contract is owned by `@cycle/agents`; implementations are composed by the backend.

The ticket implementation adapter owns:

- confirming that explicit assignment remains valid;
- resolving ticket and repository context;
- creating and acquiring an implementation worktree through `@cycle/git-worktrees`;
- transitioning the ticket to `in-progress`;
- producing the implementation prompt context;
- invoking worktree finalization and required branch push;
- attaching the branch, posting the handover comment, and transitioning to `needs-review`;
- failure retention and cleanup policy.

The agents package executes and records those steps but MUST NOT implement ticket storage or Git
commands directly.

## 8. Core Domain Model

All identifiers MUST be schema-branded non-empty strings. Prefixes MUST be stable:

| Entity            | Prefix               |
| ----------------- | -------------------- |
| Thread            | `agent_thread_`      |
| Task              | `agent_task_`        |
| Turn              | `agent_turn_`        |
| Run               | `agent_run_`         |
| Attempt           | `agent_attempt_`     |
| Session           | `agent_session_`     |
| Interaction       | `agent_interaction_` |
| Event             | `agent_event_`       |
| Workflow step     | `agent_step_`        |
| Operation receipt | `agent_operation_`   |
| Artifact          | `agent_artifact_`    |

IDs MUST be generated through an injected Effect service backed by `Crypto.randomUUIDv7` or an
equivalent time-sortable cryptographic identifier. Tests MUST be able to inject deterministic IDs.

### 8.1 Thread

An `AgentThread` is the long-lived conversation and observation boundary. It MUST contain:

- `threadId`, `kind`, `status`, `createdAt`, and `updatedAt`;
- optional human title and generated summary;
- default agent, harness, provider, model, authority, and workflow references;
- optional `repositoryId` and `ticketId` correlation;
- JSON metadata with an explicit schema version;
- `lastSequence`, `lastTaskId`, and optional `activeTaskId`;
- optional `archivedAt` and retention policy.

`kind` MUST be `interactive`, `ticket-implementation`, `research`, `scheduled`, or an explicitly
registered extension value. `status` MUST be `open` or `archived`. Task state MUST NOT be collapsed
into thread status.

### 8.2 Task

An `AgentTask` is one durable schedulable unit attached to exactly one thread. It MUST contain:

- `taskId`, `threadId`, `kind`, `status`, `priorityLane`, and FIFO `enqueueSequence`;
- stable `idempotencyKey` and request hash;
- `workflowId` and schema-validated workflow input;
- agent, harness, provider, model, authority, and repository selection;
- optional `parentRunId` for child work;
- retry policy, current attempt number, and maximum attempts;
- `notBefore`, `createdAt`, `queuedAt`, `startedAt`, `completedAt`, and `updatedAt` as applicable;
- current run, active interaction, terminal result, and last typed error references;
- cancellation request state;
- metadata and retention classification.

Task status MUST be one of:

```text
queued
claimed
preparing
running
suspending
suspended
resuming
retry-wait
cancelling
completed
failed
cancelled
```

An interactive chat message MUST create a new `interactive-turn` task on its existing thread. A
ticket assignment MUST create one `ticket-implementation` task and a new or explicitly selected
thread. A task MUST NOT represent an indefinitely reusable provider session.

### 8.3 Turn and Message

An `AgentTurn` groups one submitted user/system input with the agent's response within a task. It
MUST reference `threadId`, `taskId`, and the root `runId`.

An `AgentMessage` MUST contain:

- a stable message ID;
- thread, task, turn, run, and attempt correlation where applicable;
- role: `system`, `user`, `assistant`, or `tool`;
- schema-tagged content parts rather than one unvalidated JSON blob;
- created, completed, and updated timestamps;
- completion status and visibility;
- an optional provider-native message identifier.

Message parts MUST support text, provider-supplied reasoning summary, tool call, tool result, file
reference, image reference, artifact reference, approval request/result, and user-input
request/result. Hidden provider reasoning MUST be discarded.

### 8.4 Run

An `AgentRun` is one root or child-agent execution inside a task. It MUST contain:

- `runId`, `taskId`, `threadId`, and `rootRunId`;
- optional `parentRunId`;
- depth and child ordinal;
- agent, harness, provider, and model selection;
- normalized authority and workspace binding;
- status, current attempt ID, terminal result, and timestamps;
- token, time, and child budgets;
- provider session binding reference.

Run status MUST be `queued`, `running`, `suspended`, `completed`, `failed`, or `cancelled`.

### 8.5 Attempt

An `AgentAttempt` is one crash/retry execution of a run. It MUST contain:

- `attemptId`, `runId`, `ordinal`, and status;
- owner ID, lease expiry, heartbeat, and monotonically increasing fencing token;
- provider-native thread/session/turn IDs and replay cursor;
- started, interrupted, and completed timestamps;
- last typed error and retry decision;
- prompt hash, authority hash, and workspace binding hash.

Attempt status MUST be `claimed`, `preparing`, `running`, `suspending`, `suspended`, `completed`,
`failed`, `cancelled`, or `interrupted`.

`interrupted` is not automatically a terminal task state. Reconciliation MUST either reattach the
attempt or create a new attempt under the task's retry policy.

### 8.6 Provider Session Binding

An `AgentSessionBinding` MUST store only serializable, non-secret provider state:

- Cycle session ID;
- thread and run references;
- harness and provider IDs;
- provider-native session/thread IDs;
- resume and replay cursors;
- capability snapshot and adapter version;
- status and timestamps.

Provider clients, SDK objects, process handles, scopes, fibers, queues, callbacks, abort
controllers, bearer tokens, and secrets MUST NOT be persisted.

### 8.7 Interaction

An `AgentInteraction` represents an approval or user-input request. It MUST contain:

- `interactionId`, thread/task/run/attempt IDs, and provider request ID;
- type: `approval` or `user-input`;
- schema-validated prompt, fields/options, authority context, and safe default when one exists;
- status: `open`, `answered`, `cancelled`, `expired`, or `rejected`;
- response, responder identity, and timestamps;
- an idempotency key.

Only one unresolved interaction MAY suspend a given root run at a time unless the harness reports a
stable independent identifier for every parallel interaction.

### 8.8 Workflow Step and Operation Receipt

Every non-provider external side effect MUST be represented by an `AgentWorkflowStep`. A step MUST
contain a stable operation ID, name, input hash, status, attempt count, output, error, and
timestamps. Step status MUST be `pending`, `running`, `succeeded`, `failed`, or `compensated`.

An `AgentOperationReceipt` records the durable result of an idempotent external operation. Workflow
adapters MUST accept the operation ID and MUST return the same logical result when it is repeated.
This is REQUIRED because a process may crash after an external operation succeeds but before the
agents transaction stores its result.

### 8.9 Artifact

An `AgentArtifact` MUST record metadata, not unbounded file contents. It MUST include artifact ID,
kind, thread/task/run correlation, path or URI, media type, size when known, content digest when
known, visibility, and retention class. Paths MUST be validated against the authorized workspace.

### 8.10 Invariants

The store MUST enforce these invariants transactionally:

1. Every task belongs to one existing thread.
2. Every run belongs to one task and thread.
3. A child run has the same task and root run as its parent.
4. At most one non-terminal root task is active on an interactive thread.
5. At most one attempt per run is active.
6. At most one owner holds a task lease at a fencing token.
7. Only the current fencing token may mutate active attempt state or append its provider events.
8. Every event sequence is strictly increasing within its thread.
9. A terminal task, run, attempt, or interaction cannot return to a non-terminal state.
10. A task cannot be `suspended` without an open interaction or explicit durable wait reason.
11. A ticket-implementation task cannot enter `running` without a valid acquired worktree binding.
12. A successful ticket-implementation task cannot complete until required handover steps succeed.
13. One idempotency key and request hash identify one logical active task. Reuse with a different
    hash MUST fail.

### 8.11 State Transitions

Only the following task transitions are valid:

| From                               | Allowed next states                                             |
| ---------------------------------- | --------------------------------------------------------------- |
| `queued`                           | `claimed`, `cancelling`, `cancelled`                            |
| `claimed`                          | `preparing`, `queued`, `cancelling`                             |
| `preparing`                        | `running`, `suspending`, `retry-wait`, `failed`, `cancelling`   |
| `running`                          | `suspending`, `retry-wait`, `completed`, `failed`, `cancelling` |
| `suspending`                       | `suspended`, `failed`, `cancelling`                             |
| `suspended`                        | `resuming`, `cancelling`                                        |
| `resuming`                         | `claimed`, `retry-wait`, `failed`, `cancelling`                 |
| `retry-wait`                       | `queued`, `failed`, `cancelling`                                |
| `cancelling`                       | `cancelled`, `failed`                                           |
| `completed`, `failed`, `cancelled` | none                                                            |

`claimed -> queued` is permitted only when admission is rolled back before an external side effect.
`running -> completed` is permitted only after required completion workflow steps succeed.
`retry-wait -> failed` is permitted when the retry budget is exhausted or an operator rejects
retry. Manual retry of a failed task creates a new task execution generation linked to the original;
terminal rows are never reopened.

Only the following run transitions are valid:

| From                               | Allowed next states                             |
| ---------------------------------- | ----------------------------------------------- |
| `queued`                           | `running`, `failed`, `cancelled`                |
| `running`                          | `suspended`, `completed`, `failed`, `cancelled` |
| `suspended`                        | `running`, `failed`, `cancelled`                |
| `completed`, `failed`, `cancelled` | none                                            |

Only the following attempt transitions are valid:

| From                                              | Allowed next states                                             |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `claimed`                                         | `preparing`, `interrupted`, `failed`, `cancelled`               |
| `preparing`                                       | `running`, `suspending`, `interrupted`, `failed`, `cancelled`   |
| `running`                                         | `suspending`, `completed`, `interrupted`, `failed`, `cancelled` |
| `suspending`                                      | `suspended`, `interrupted`, `failed`, `cancelled`               |
| `suspended`                                       | `running`, `interrupted`, `failed`, `cancelled`                 |
| `completed`, `interrupted`, `failed`, `cancelled` | none                                                            |

`suspended -> running` requires a new valid lease/fencing token and a successful provider reattach.
When reattach is impossible, the suspended attempt becomes `interrupted` and a new attempt is
created. Interaction transitions are `open -> answered | cancelled | expired | rejected` only.
Workflow-step transitions are `pending -> running -> succeeded | failed`, with `failed -> running`
only under its retry policy and `succeeded -> compensated` only through an explicit compensation.

## 9. Public Runtime Contract

### 9.1 Primary Service

`@cycle/agents` MUST expose one primary `AgentRuntime` service. Exact helper type names may vary,
but the service shape MUST be equivalent to:

```ts
export class AgentRuntime extends Context.Service<
  AgentRuntime,
  {
    readonly createThread: (
      input: AgentThreadCreateInput,
    ) => Effect.Effect<AgentThreadSnapshot, AgentError>;

    readonly submit: (input: AgentTaskSubmitInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;

    readonly send: (input: AgentThreadSendInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;

    readonly getThread: (
      threadId: AgentThreadId,
    ) => Effect.Effect<Option.Option<AgentThreadSnapshot>, AgentError>;

    readonly getTask: (
      taskId: AgentTaskId,
    ) => Effect.Effect<Option.Option<AgentTaskSnapshot>, AgentError>;

    readonly listThreads: (
      query: AgentThreadQuery,
    ) => Stream.Stream<AgentThreadSummary, AgentError>;

    readonly listTasks: (query: AgentTaskQuery) => Stream.Stream<AgentTaskSummary, AgentError>;

    readonly observe: (input: AgentObserveInput) => Stream.Stream<AgentRuntimeEvent, AgentError>;

    readonly steer: (input: AgentSteerInput) => Effect.Effect<AgentCommandReceipt, AgentError>;

    readonly interrupt: (
      input: AgentInterruptInput,
    ) => Effect.Effect<AgentCommandReceipt, AgentError>;

    readonly cancel: (input: AgentCancelInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;

    readonly retry: (input: AgentRetryInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;

    readonly respond: (
      input: AgentInteractionResponseInput,
    ) => Effect.Effect<AgentInteraction, AgentError>;

    readonly archiveThread: (
      input: AgentThreadArchiveInput,
    ) => Effect.Effect<AgentThreadSnapshot, AgentError>;

    readonly reconcile: (
      input?: AgentReconcileInput,
    ) => Stream.Stream<AgentReconciliationResult, AgentError>;
  }
>()("@cycle/agents/AgentRuntime") {}
```

All input and output values MUST have canonical Effect Schemas. Public functions MUST return
`Effect` or `Stream`; package APIs MUST NOT return `Promise`, `AsyncIterable`, callbacks, or raw
fibers. The root package export SHOULD expose `AgentRuntime` and the minimal composition schemas.
Specialized schemas and services MUST use explicit package subpaths.

### 9.2 Create and Submit Semantics

`createThread` MUST transactionally create the thread and its initial durable event. It MUST be
idempotent when an idempotency key is supplied.

`submit` MUST validate workflow, harness, authority, budgets, and metadata before creating a task.
It MUST transactionally create the task, initial turn/input when supplied, queue record, and events.
It MUST return after durable acceptance, not after execution starts.

`send` is chat-oriented sugar over `submit`. It MUST create an `interactive-turn` task on an open
thread and MUST reject a second root turn while that thread already has a non-terminal root task.
It MUST NOT invoke a provider directly.

### 9.3 Observation Semantics

`observe` MUST support:

- `threadId`;
- optional `afterSequence`, defaulting to zero;
- optional event visibility filter;
- `tail`, defaulting to true;
- optional bounded replay page size.

Observation MUST provide replay-then-tail without gaps or duplicates even when events are committed
concurrently with attachment. The canonical algorithm is:

1. acquire a scoped live subscription before reading the durable high-water mark;
2. read and stream durable events after the caller's sequence through that high-water mark;
3. read once more after the high-water mark to close the subscription race;
4. consume live notifications, loading canonical rows by sequence from SQLite;
5. discard sequences already emitted;
6. repeat durable reads when the live channel reports overflow or a sequence gap.

The live `PubSub` carries wake-up hints or lightweight sequence notices. It MUST NOT be the source
of truth. Slow consumers MUST recover from SQLite rather than forcing unbounded in-memory buffering.

### 9.4 Command Semantics

Commands MUST be durably recorded before delivery to a live harness.

- `steer` appends an ordered user message or control item. If the harness can accept live steering,
  the supervisor delivers it. Otherwise it becomes input to the next resumable continuation.
- `interrupt` stops the active attempt but leaves the task resumable unless the caller requests
  cancellation.
- `cancel` is terminal for the task, cascades to child runs, closes open interactions, interrupts
  live attempts, and invokes configured cleanup steps.
- `retry` creates a linked execution generation from a failed or manual-recovery task while reusing
  valid workflow receipts and workspace state according to workflow policy.
- `respond` resolves one open interaction idempotently and queues a high-priority continuation.
- repeated commands with the same command ID MUST return the original receipt.

Commands aimed at stale, terminal, or unrelated entities MUST fail with a specific typed error;
they MUST NOT silently succeed, except that repeating the same cancel command is idempotent.

### 9.5 Snapshots

An `AgentThreadSnapshot` MUST contain the thread, messages, current/open task summaries, open
interactions, artifacts, and last durable sequence. It MUST NOT embed the complete event history.

An `AgentTaskSnapshot` MUST contain the task, runs, attempts, workflow steps, interactions,
artifacts, terminal result, and last event sequence relevant to the task. Large collections MUST be
pageable or separately streamed.

## 10. Durable Event Protocol

### 10.1 Envelope

Every canonical event MUST be a `Schema.TaggedClass` member of a closed versioned union. Common
fields MUST include:

```ts
{
  readonly eventId: AgentEventId
  readonly schemaVersion: 1
  readonly sequence: number
  readonly threadId: AgentThreadId
  readonly taskId?: AgentTaskId
  readonly turnId?: AgentTurnId
  readonly runId?: AgentRunId
  readonly rootRunId?: AgentRunId
  readonly parentRunId?: AgentRunId
  readonly attemptId?: AgentAttemptId
  readonly occurredAt: DateTime.Utc
  readonly persistedAt: DateTime.Utc
  readonly visibility: "public" | "internal" | "diagnostic"
}
```

Sequence MUST be allocated by SQLite in the same transaction as the corresponding state mutation.
Timestamps are informational and MUST NOT define event order.

### 10.2 Required Event Families

The canonical union MUST cover:

- thread opened, settings updated, summarized, archived, and retentio bn changed;
- task submitted, queued, claimed, preparing, started, suspending, suspended, resuming,
  retry-scheduled, cancelling, completed, failed, and cancelled;
- run queued, started, suspended, resumed, completed, failed, and cancelled;
- attempt claimed, provider-attached, heartbeat, interrupted, completed, failed, and cancelled;
- turn and message started, delta, completed, and failed;
- reasoning-summary started, delta, and completed;
- tool call started, progress, completed, rejected, and failed;
- script/command started, output, and completed where a harness exposes it;
- approval requested and resolved;
- user input requested and resolved;
- steering accepted, queued, and rejected;
- child requested, queued, started, completed, failed, and cancelled;
- workflow step started, completed, retried, failed, and compensated;
- workspace requested, ready, acquired, released, retained, and failed;
- artifact recorded;
- usage reported;
- warning and recoverable error reported;
- reconciliation started, reattached, replayed, retried, suspended, and failed.

Provider adapters MUST emit normalized `AgentHarnessEvent` values. Only the supervisor/store layer
may assign Cycle event IDs and sequences and convert them to `AgentRuntimeEvent`.

### 10.3 Delta Coalescing

The runtime MUST persist every semantic event. High-frequency message, reasoning-summary, command,
and tool-output deltas MAY be coalesced per logical item before persistence.

Default flush limits MUST be:

- 50 milliseconds since the first buffered delta;
- 32 KiB of accumulated UTF-8 content; or
- an item boundary, semantic event, suspension, interruption, or scope finalizer;

whichever occurs first.

Each flush MUST update the materialized message/activity projection and append one delta event in a
single transaction. The final item event MUST contain or reference the complete final snapshot.
After a process crash, at most one unflushed interval may be absent. Provider history reconciliation
MUST repair it where the harness supports replay.

### 10.4 Diagnostics

Raw provider notifications MUST NOT appear in the public union. A separate diagnostic record MAY
store a redacted provider tag, cursor, and bounded payload. Diagnostic decode failures MUST produce
a normalized warning and MUST NOT corrupt canonical replay.

## 11. SQLite Storage Contract

### 11.1 Database Ownership and Lifecycle

`@cycle/agents` MUST open one package-owned SQLite database through `@cycle/sqlite`. The database
path MUST be supplied through `Config`; business logic MUST NOT read `process.env` directly. The
host SHOULD default the file to its local application-data directory as `agents.sqlite`.

The database layer MUST:

- enable foreign keys;
- use WAL mode unless the platform cannot support it;
- configure a bounded busy timeout;
- run package-owned numbered migrations before exposing `AgentRuntime`;
- acquire the client in a layer scope and close it on scope finalization;
- fail startup with a typed migration or open error rather than falling back to memory;
- provide an in-memory database only from `src/testing`.

### 11.2 Required Tables

The schema MUST include normalized tables equivalent to:

- `agent_threads`;
- `agent_tasks`;
- `agent_turns`;
- `agent_messages` and `agent_message_parts`;
- `agent_runs`;
- `agent_attempts`;
- `agent_session_bindings`;
- `agent_interactions`;
- `agent_workflow_steps`;
- `agent_operation_receipts`;
- `agent_artifacts`;
- `agent_events`;
- `agent_provider_diagnostics`;
- `agent_commands`;
- `agent_retention_runs`;
- `agent_schema_migrations`.

Important lifecycle fields MUST be queryable columns, not only JSON. Extension metadata and
versioned provider-native payloads MAY use JSON text after strict schema decoding.

### 11.3 Indexes and Constraints

At minimum the schema MUST index:

- unique thread sequence `(thread_id, sequence)`;
- unique event ID;
- task status, lane, `not_before`, and enqueue sequence;
- task idempotency key and request hash;
- active task by thread;
- tasks by provider, repository, parent, and status;
- attempts by run and ordinal;
- active attempts and lease expiry;
- provider-native session/thread/turn IDs;
- open interactions by thread and task;
- workflow steps by task and stable operation ID;
- commands by target and status;
- events by task/run and events by retention class.

Partial unique indexes SHOULD enforce one active root task per interactive thread and one active
attempt per run. All foreign-key deletion behavior MUST be explicit.

### 11.4 Transaction Boundary

Every command handler MUST use one SQLite transaction to:

1. read and validate the expected state and fencing token;
2. write the state transition;
3. update materialized projections;
4. append canonical event rows and advance the thread high-water mark;
5. enqueue any durable follow-up command or workflow step;
6. commit;
7. publish a non-authoritative wake-up after commit.

Publishing before commit is forbidden. A failed transaction MUST publish nothing.

### 11.5 Store Services

Persistence MUST be split into focused services such as `AgentThreadStore`, `AgentTaskStore`,
`AgentEventJournal`, and `AgentWorkflowStore`. Store methods MUST accept and return schema-backed
domain values and typed storage errors. Public runtime code MUST NOT embed SQL strings.

SQLite row decoding MUST use Effect Schema. `JSON.parse(...) as T` is forbidden for durable rows.

## 12. Scheduler and Capacity Management

### 12.1 Scheduler Lifetime

The scheduler MUST run as a scoped background layer. It SHOULD be launched with
`Layer.effectDiscard` and `Effect.forkScoped`. Closing the application layer MUST interrupt the
scheduler and every supervised attempt before closing SQLite or provider resources.

An in-memory bounded `Queue<void>` MUST be used only to wake the scheduler. On every wake and on a
periodic reconciliation tick, the scheduler MUST query SQLite for eligible work. Lost or duplicate
wake-ups MUST therefore be harmless.

### 12.2 Priority Lanes

The first implementation MUST use four understandable lanes:

| Rank | Lane          | Work                                                                       |
| ---- | ------------- | -------------------------------------------------------------------------- |
| 0    | `control`     | interaction responses, resumptions, steering continuations, reconciliation |
| 1    | `interactive` | user chat turns                                                            |
| 2    | `assigned`    | explicitly assigned ticket work and its children                           |
| 3    | `background`  | mentions, scheduled work, and autonomous research                          |

Selection MUST be FIFO by durable enqueue sequence within a lane. Child tasks inherit their root
task's lane. The scheduler MUST NOT preempt a running provider turn. Operators MAY override a queued
task's lane through an audited command.

To prevent starvation without introducing a complex fairness system, a task waiting more than 15
minutes SHOULD be promoted by one effective lane for admission only. It MUST retain its stored lane.

### 12.3 Capacity Gates

Admission MUST satisfy all applicable configured limits:

- global running attempts;
- running attempts for the selected provider/harness;
- running attempts for the repository;
- running child attempts under the same parent run.

Default limits MUST be configurable and SHOULD initially be:

- global: `4`;
- default per provider: `2`;
- default per repository: `2`;
- children running per parent: `4`.

The scheduler MUST support explicit per-provider and per-repository overrides. `null` MAY mean no
additional cap but MUST NOT bypass the global cap.

SQLite claim state is authoritative. Effect semaphores provide in-process backpressure and protect
against programming errors, but semaphore counts MUST be reconstructed from durable state after
restart.

### 12.4 Claim and Lease Algorithm

Claiming MUST be transactional:

1. select the oldest eligible task in the highest effective lane;
2. confirm pause, `notBefore`, dependency, workflow, and capacity conditions;
3. change `queued` or `resuming` to `claimed`;
4. allocate a new lease and fencing token;
5. create or select the run and create an attempt;
6. append claim events;
7. commit;
8. start the supervised attempt fiber.

The runtime is single-process in this version, but leases and fencing tokens remain REQUIRED for
crash recovery and stale-fiber rejection. A heartbeat SHOULD extend the lease at one-third of its
duration. Lease loss MUST interrupt the local attempt and prevent further writes from its old token.

### 12.5 Retry Policy

Retryability MUST be determined from typed error reasons, not message regexes. Default policy:

- retry transient provider, rate-limit, unavailable, process-crash, and retryable storage errors;
- do not retry authentication, authority, invalid request, invalid schema, unsupported capability,
  explicit cancellation, or deterministic workflow errors;
- use exponential backoff with jitter, capped at 5 minutes;
- default maximum provider attempts: `3`;
- persist the selected delay and next eligible timestamp before sleeping;
- never hold capacity during `retry-wait`.

Provider switching during an automatic retry is forbidden unless an explicit workflow policy says
otherwise. Native sessions are not assumed portable between providers.

### 12.6 Pause and Shutdown

Global and repository pause settings MUST stop new claims but MUST NOT silently interrupt running
work. Graceful shutdown MUST stop claims, request interruption of active attempts, allow a bounded
drain interval, persist remaining attempts as interrupted, and close scopes.

## 13. Child-Agent Orchestration

Child agents MUST be durable `AgentRun` records under the same task and thread. They MUST use the
same provider contract, scheduler, event journal, budgets, authority enforcement, and recovery
logic as the root run.

Defaults MUST be configurable and initially set to:

- maximum delegation depth: `3`;
- maximum concurrently running children per parent: `4`;
- maximum total child runs per task: `16`.

A child MUST receive no more authority than its parent. Workspace, tool, network, and ticket scopes
MUST be intersected with the requested child scope. Authority escalation MUST fail before the child
is queued.

A delegation request MUST persist the child run before reporting acceptance to the parent. Child
output MUST retain child attribution; the UI MAY group it beneath the parent. A child terminal
summary MUST be delivered to the parent's provider tool/result channel through a durable command.

If no provider capacity can ever run a requested child under the configured limits, delegation
MUST return a typed capacity error instead of deadlocking the parent. Cancelling a task MUST cancel
all descendants. Cancelling an individual child MUST not cancel its parent unless the workflow
declares that child required.

## 14. Suspension, Interactions, and Resumption

When a harness requests approval or user input, the supervisor MUST:

1. flush pending deltas;
2. persist the interaction and provider resume metadata;
3. transition the attempt through `suspending` to `suspended`;
4. transition the task through `suspending` to `suspended`;
5. release global, provider, repository, and parent scheduler capacity;
6. retain the logical worktree association and apply its independent lease policy;
7. emit the interaction event;
8. close or detach live provider resources only as allowed by harness capabilities.

An interaction response MUST be strict-schema decoded, authorization checked, and idempotently
stored. It MUST transition the task to `resuming`, enqueue it in the `control` lane, and wake the
scheduler. The adapter MUST either deliver the answer to a reattached native provider request or
start a continuation attempt containing the persisted interaction and response.

No default approval MAY silently grant more authority than the task already owns. Expiration policy
MUST be explicit. The default is no automatic expiry for user input and denial on expiry for a
provider approval that declares a deadline.

## 15. Provider and Harness Contract

### 15.1 Separation of Concerns

A provider SDK or executable is an integration detail. Callers and `@cycle/agent-chat` MUST see only
Cycle-owned schemas and errors.

The provider boundary MUST separate:

- `AgentHarnessDefinition`: identity, detection, capabilities, and configuration schema;
- `AgentHarnessSession`: one scoped live or reattached provider session;
- `AgentHarnessEvent`: normalized provider output before persistence;
- `AgentHarnessRegistry`: keyed lookup of definitions;
- `AgentHarnessResources`: `LayerMap.Service` or equivalent keyed resource manager for provider
  processes and clients.

### 15.2 Required Interface

The normalized contract MUST be equivalent to:

```ts
export interface AgentHarness {
  readonly id: AgentHarnessId;
  readonly providerId: AgentProviderId;
  readonly capabilities: AgentHarnessCapabilities;

  readonly detect: Effect.Effect<AgentHarnessAvailability, AgentHarnessError>;

  readonly open: (
    input: AgentHarnessOpenInput,
  ) => Effect.Effect<AgentHarnessSession, AgentHarnessError, Scope.Scope>;

  readonly reattach: (
    input: AgentHarnessReattachInput,
  ) => Effect.Effect<AgentHarnessReattachResult, AgentHarnessError, Scope.Scope>;
}

export interface AgentHarnessSession {
  readonly binding: AgentHarnessBinding;
  readonly events: Stream.Stream<AgentHarnessEvent, AgentHarnessError>;
  readonly steer: (input: AgentHarnessSteerInput) => Effect.Effect<void, AgentHarnessError>;
  readonly interrupt: (input: AgentHarnessInterruptInput) => Effect.Effect<void, AgentHarnessError>;
  readonly respond: (
    input: AgentHarnessInteractionResponse,
  ) => Effect.Effect<void, AgentHarnessError>;
}
```

`AgentHarnessSession` MUST be scoped. Closing its scope MUST interrupt or detach the underlying
operation according to the requested exit and provider capability.

### 15.3 Capabilities

Capabilities MUST be schema-backed and cover at least:

- streaming;
- native persistent sessions;
- live reattachment;
- history replay and cursor semantics;
- steering;
- interruption;
- approval requests;
- user-input requests;
- MCP HTTP and stdio;
- provider-native code tools;
- structured output;
- read-only and workspace-write sandboxing;
- usage reporting;
- tool, command, file-change, artifact, and reasoning-summary events;
- model listing;
- maximum supported concurrency when discoverable.

The supervisor MUST validate required capabilities before claiming provider capacity. Unsupported
capability errors are not retryable.

### 15.4 Effect Boundary Rules

Provider SDK Promise, callback, `AbortController`, event emitter, async iterable, child process, and
raw stream APIs MAY exist only inside the provider adapter.

Adapters MUST wrap them deliberately:

- `Effect.tryPromise` for rejecting Promise calls;
- `Effect.async` or `Effect.callback` for callbacks, with interruption cleanup;
- `Stream.fromAsyncIterable` or a bounded queue bridge for async iterables;
- `Effect.acquireRelease` for clients, processes, and listeners;
- Effect interruption bridged to SDK cancellation inside the adapter;
- `ChildProcessSpawner` instead of direct process spawning where supported;
- bounded buffers with an explicit overflow policy.

Adapters MUST NOT call `Effect.runPromise`, `Effect.runFork`, or another runtime runner internally.
They return composed effects to the application runtime.

### 15.5 Error Normalization

`AgentHarnessError` MUST be a tagged error whose `reason` is one of:

- `Authentication`;
- `RateLimited` with optional retry-after;
- `QuotaExhausted`;
- `InvalidRequest`;
- `UnsupportedCapability`;
- `ExecutableMissing`;
- `ProcessStartFailed`;
- `ProcessExited`;
- `TransportFailed`;
- `ProtocolViolation`;
- `ProviderRejected`;
- `ContentPolicy`;
- `Timeout`;
- `Interrupted`;
- `HistoryUnavailable`;
- `ReattachUnavailable`;
- `InteractionUnavailable`;
- `Unknown`.

Each reason MUST declare retryability structurally. Provider-native codes and bounded redacted
metadata MAY be retained. Error classification by message regular expression is forbidden except as
a last-resort compatibility fallback that emits a diagnostic warning.

### 15.6 Codex App-Server Adapter

The Codex adapter MUST:

- manage app-server process and protocol resources inside scopes;
- persist native thread and turn IDs and the last accepted provider cursor;
- use thread resume/read/history APIs for reconciliation when available;
- normalize notifications into the shared event model;
- preserve MCP, sandbox, approval, user-input, steering, interruption, file-change, command, usage,
  and model capabilities;
- validate that workspace-write runs target the authorized worktree path;
- reject provider events whose thread/turn does not match the active fenced attempt;
- keep generated protocol types internal to the Codex adapter subpath.

The app-server process MAY be shared through a keyed `LayerMap` resource, but one failing session
MUST NOT terminate unrelated sessions. Process restart MUST trigger reconciliation for affected
attempts.

### 15.7 Claude Agent SDK Adapter

The Claude adapter MUST:

- wrap all SDK Promises and async iterables at the adapter boundary;
- persist resumable SDK session identifiers and supported cursors;
- normalize assistant, tool, file, usage, result, system, approval, and input events;
- bridge Effect interruption to SDK abort without exposing `AbortController`;
- validate workspace, permission mode, MCP, and tool policy against Cycle authority;
- report unsupported reattachment honestly and allow the supervisor to create a continuation
  attempt when full live reattachment is unavailable.

### 15.8 Provider Selection

Provider and model selection MUST be persisted before execution. Configuration precedence MUST be:

1. explicit task selection authorized by the caller;
2. repository workflow policy;
3. agent profile default;
4. runtime default.

Selection MUST NOT change silently during a retry. Detection status, enabled providers, and model
availability MUST be exposed to callers through a separate read service or subpath without adding
provider SDK types to `AgentRuntime`.

## 16. Prompt, Context, Tools, and Authority

### 16.1 Prompt Envelope

The runtime MUST build a schema-backed `AgentPromptEnvelope` containing:

- template ID and version;
- system instructions;
- current user/task input;
- bounded conversation history or provider-native resume reference;
- agent, workflow, repository, ticket, worktree, and authority context;
- tool/MCP declarations;
- response contract;
- prompt and context digests;
- redacted diagnostics preview;
- token-budget decision.

Prompt assembly MUST be an Effect service. Prompt text MUST not be duplicated independently across
API, chat, Agent Work, and provider modules.

### 16.2 Context Ownership

`@cycle/agents` owns generic prompt envelopes and conversation history. Workflow adapters supply
schema-validated domain context. `@cycle/agent-chat` supplies chat-specific instructions. Provider
adapters only translate the completed envelope.

Prompts MUST identify authoritative context and stale snapshots. An agent MUST use Cycle services or
MCP for mutable ticket state rather than assuming an old prompt snapshot remains current.

### 16.3 Tools and MCP

Tools MUST be described with Effect Schema. A toolkit registry MAY expose Cycle-native tools,
provider-native tools, MCP connections, or a Clanka-style typed executor. Tool handlers MUST be
Effect functions with typed failures and explicit service requirements.

Codex and Claude SHOULD use their mature native code tools where those tools enforce the requested
sandbox. The redesign does not require forcing both providers through one JavaScript VM. A
Clanka-style `execute` toolkit MAY be added as a harness capability when it improves composition or
provider parity.

MCP attachment MUST be scoped per task/run and contain only redacted, serializable connection
metadata in durability. Secrets and bearer headers MUST be supplied at execution time through
`Redacted` services. Tool and MCP allowlists MUST be derived by intersecting:

- workflow permissions;
- repository permissions;
- task authority;
- parent authority for child runs;
- provider capability.

### 16.4 Authority Modes

Cycle authority MUST be independent from provider sandbox terminology. Required modes:

- `conversation-read`: read explicit context and approved read tools;
- `repository-read`: read one repository without mutation;
- `implementation-worktree`: read/write only inside an acquired worktree plus approved Cycle
  workflow writes;
- `disposable-worktree`: read/write inside a disposable worktree without ticket handover authority;
- `operator-full-access`: optional, disabled by default, and never inferred.

The ticket implementation workflow MUST use `implementation-worktree`. The provider sandbox MUST
be at least as restrictive as the Cycle authority. A provider that cannot enforce the required
boundary MUST be rejected.

## 17. Ticket Implementation Workflow

### 17.1 Trigger and Idempotency

Entering `ready` MUST NOT start implementation. A human MUST explicitly assign the ticket to an
agent. The assignment handler MUST submit a task using an idempotency key containing repository ID,
ticket ID, assignment identity/generation, workflow version, and agent profile.

Repeating the same assignment event MUST return the existing task. Reassigning after cancellation
or completion MUST create a new assignment generation and task. Unassigning before execution MUST
cancel the queued task. Unassigning while running MUST request cancellation and follow failure
retention policy.

### 17.2 Durable Steps

The ticket workflow MUST execute these named durable steps:

```text
validate-assignment
load-ticket-context
create-worktree
acquire-worktree
transition-in-progress
assemble-implementation-context
run-root-agent
finalize-worktree
publish-branch
push-branch
attach-branch
publish-handover-comment
transition-needs-review
release-or-clean-worktree
```

Each step MUST have a stable operation ID and idempotent adapter call. Steps that already succeeded
MUST be replayed from their stored output after restart.

### 17.3 Worktree Coordination

The worktree package remains the authority for worktree records, setup, leases, fencing, branch
associations, push, handover, retention, and cleanup. The agents database stores only the returned
workspace binding and workflow receipt.

No distributed transaction exists between the databases. Coordination is a persisted saga:

- the agents workflow records intent and a stable operation ID;
- the worktree operation is called idempotently;
- the returned worktree ID, lease token, branch, and path are stored;
- reconciliation queries both services when a crash leaves an operation outcome uncertain.

The provider MUST start only after worktree setup succeeds and the agent lease is acquired. The
worktree path and lease fencing token MUST be part of the attempt authority hash.

### 17.4 Completion and Handover

Provider completion is not task completion. On a successful root run, Cycle MUST:

1. inspect and finalize the worktree;
2. create a managed commit when changes exist and are not already committed;
3. publish the managed branch association;
4. push the branch according to a required push policy;
5. attach the branch to the ticket;
6. publish a detailed handover comment containing summary, commits, branch, remote reference,
   validations, limitations, and follow-up tickets;
7. transition the ticket to `needs-review`;
8. apply the worktree cleanup policy;
9. only then mark the agent task completed.

The workflow MUST NOT create a pull request. It MUST NOT transition the ticket to `done`.

After a successful push and handover, the default worktree policy SHOULD remove the worktree while
retaining the branch and all worktree lifecycle records. On provider, validation, push, or handover
failure, the default policy SHOULD retain the worktree for debugging and emit a clear recovery
action.

### 17.5 Failure Semantics

Failure before provider start MUST leave the ticket in its prior state unless an earlier idempotent
step already transitioned it. Failure after `in-progress` MUST post or expose a failure handover and
retain enough state for retry. The ticket MUST NOT be moved to `needs-review` unless branch push,
comment, and transition prerequisites succeed.

A retry MUST reuse the same logical worktree when its lease and state remain valid. Creating a
replacement worktree requires a recorded reconciliation decision; it MUST NOT happen silently.

## 18. Restart and Reconciliation

### 18.1 Startup Order

Application composition MUST:

1. open and migrate the agents database;
2. build provider and workflow registries;
3. start event and retention services;
4. run reconciliation;
5. start scheduler claims;
6. expose transport readiness.

Read-only inspection MAY become available before reconciliation finishes, but new task execution
MUST not start until stale claims are classified.

### 18.2 Reconciliation Classification

For every non-terminal task/attempt, reconciliation MUST classify it as:

- `live-local`: a supervised current fiber exists;
- `reattached`: provider-native execution was rejoined;
- `replayed-terminal`: provider history supplied a terminal result;
- `retryable-interruption`: live execution is gone and a new attempt may be queued;
- `suspended-interaction`: a persisted unanswered interaction remains;
- `workflow-recovery`: provider completed but preparation/handover steps remain;
- `manual-recovery`: state cannot be safely inferred;
- `cancelled`: a durable cancellation request takes precedence.

### 18.3 Automatic Recovery

The runtime MUST automatically reattach when supported. If reattachment is unavailable, it MUST
mark the prior attempt interrupted and automatically queue a new attempt when the typed error and
retry policy allow it. The new attempt MUST use the same task, run, thread, workflow state, and
operation receipts.

If provider history reports completion, the runtime MUST project missing events idempotently before
continuing workflow handover. It MUST NOT rerun the provider merely because the local terminal event
was missing.

If neither provider state nor idempotent workflow state can establish a safe continuation, the task
MUST enter `suspended` with a manual-recovery interaction. Guessing and duplicating side effects is
forbidden.

### 18.4 Reconciliation Idempotency

Reconciliation MAY run at startup, periodically, on attachment, and after provider process failure.
Concurrent triggers MUST coalesce by task/run key. Repeating reconciliation without new external
state MUST produce no additional canonical transitions.

## 19. `@cycle/agent-chat` Target Design

### 19.1 Primary Service

`@cycle/agent-chat` MUST expose an Effect-native `AgentChat` service equivalent to:

```ts
export class AgentChat extends Context.Service<
  AgentChat,
  {
    readonly create: (
      input: AgentChatCreateInput,
    ) => Effect.Effect<AgentChatSnapshot, AgentChatError>;

    readonly list: (query: AgentChatQuery) => Stream.Stream<AgentChatSummary, AgentChatError>;

    readonly snapshot: (
      threadId: AgentThreadId,
    ) => Effect.Effect<Option.Option<AgentChatSnapshot>, AgentChatError>;

    readonly send: (
      input: AgentChatSendInput,
    ) => Effect.Effect<AgentChatTaskAccepted, AgentChatError>;

    readonly events: (
      input: AgentChatObserveInput,
    ) => Stream.Stream<AgentChatEvent, AgentChatError>;

    readonly steer: (
      input: AgentChatSteerInput,
    ) => Effect.Effect<AgentCommandReceipt, AgentChatError>;

    readonly interrupt: (
      input: AgentChatInterruptInput,
    ) => Effect.Effect<AgentCommandReceipt, AgentChatError>;

    readonly cancel: (
      input: AgentChatCancelInput,
    ) => Effect.Effect<AgentChatSnapshot, AgentChatError>;

    readonly respond: (
      input: AgentChatInteractionResponseInput,
    ) => Effect.Effect<AgentChatInteraction, AgentChatError>;

    readonly archive: (
      input: AgentChatArchiveInput,
    ) => Effect.Effect<AgentChatSnapshot, AgentChatError>;
  }
>()("@cycle/agent-chat/AgentChat") {}
```

The service MUST be implemented entirely by composing `AgentRuntime`. It MUST not call a harness,
registry, SDK, or SQLite store directly.

### 19.2 Projection

Chat messages, activities, questions, approvals, turns, and thread state MUST be deterministic
projections of canonical agents records and events. Projection code SHOULD be pure schema-based
functions. The API may translate those projections into versioned WebSocket messages, but the API
MUST not recreate chat lifecycle logic.

The package MUST remove `AgentChatStoreShape`, `SqliteAgentChatStore`, `ActiveTurnDirectory`, Promise
runtime shapes, provider event switches, and the package-local event bus after migration.

### 19.3 Chat Behavior

Chat defaults MUST use `conversation-read` or `repository-read`. A user may explicitly start an
implementation workflow, but changing a chat runtime-mode field alone MUST NOT grant implementation
authority or bypass ticket assignment.

Sending a message returns durable task acceptance immediately. Clients attach using the returned
thread/task IDs and sequence. Renderer reconnect and full backend restart therefore use the same
observation path.

### 19.4 Public Exports

The package SHOULD expose only:

- root composition exports;
- `./models`;
- `./events`;
- `./errors`;
- `./testing`.

It MUST NOT expose store, SQLite, provider, active-turn, or deep implementation subpaths.

## 20. Configuration

### 20.1 Configuration Service

Runtime configuration MUST be decoded through `Config` and Effect Schema and supplied as a service.
Invalid values MUST fail layer construction. `Config.withDefault` MAY handle missing values; invalid
configured values MUST NOT silently fall back.

Required configuration fields:

- database path, busy timeout, and maintenance interval;
- runtime owner ID and lease/heartbeat durations;
- graceful shutdown drain duration;
- default harness, provider, model, and agent profile;
- enabled providers;
- global and default keyed concurrency limits;
- per-provider and per-repository overrides;
- maximum attempts and retry schedule bounds;
- delegation depth, concurrent-child, and total-child limits;
- default task time and token budgets;
- delta flush interval and byte limit;
- prompt and diagnostic redaction policy;
- retention and compaction intervals;
- Codex and Claude adapter configuration;
- global and repository pause settings where not sourced from a higher policy service.

### 20.2 Reload Semantics

Pause settings and concurrency limits SHOULD be reloadable. A lower concurrency limit MUST affect
new admissions only; it MUST NOT cancel running work. Provider executable path, database path, and
schema settings require restart. Every reload decision MUST be observable.

Secrets MUST be supplied as `Config.redacted` values or host services. They MUST NOT appear in
snapshots, persisted metadata, logs, spans, errors, or event payloads.

## 21. Retention, Compaction, Archival, and Deletion

### 21.1 Default Policy

Default retention MUST be:

- thread/task/run summaries, terminal results, workflow receipts, interactions, artifact metadata,
  completed messages, usage, and non-delta semantic events: retained until explicit thread deletion;
- raw provider diagnostics: 7 days;
- high-frequency delta events: compactable 24 hours after the owning item and task are terminal;
- superseded prompt previews and bounded debug context: 30 days;
- secrets: never persisted.

The policy MUST be configurable by retention class. An archived thread remains readable and is not
automatically deleted.

### 21.2 Compaction

Compaction MUST preserve an equivalent replay for public consumers. It MAY replace many deltas with
one compacted content event only after the final message/activity projection is durable. Compaction
MUST preserve sequence ranges or emit a compaction marker so cursors can advance deterministically.

Compaction MUST run incrementally in bounded transactions, yield between batches, and never hold a
write transaction while waiting on external work. It MUST expose progress and failure metrics.

### 21.3 Deletion

Thread deletion MUST be an explicit authorized operation distinct from archival. It MUST cancel or
reject deletion when non-terminal tasks exist unless a destructive operator flow first cancels them.
Deletion MUST remove or tombstone all package-owned child records according to policy but MUST NOT
delete worktree, branch, ticket, or Git history owned by other packages.

## 22. Failure Model and Typed Errors

All recoverable package errors MUST use `Schema.TaggedErrorClass` or a parent schema error class with
typed reasons. Required error families:

- `AgentValidationError`;
- `AgentNotFoundError`;
- `AgentStateConflictError`;
- `AgentIdempotencyConflictError`;
- `AgentAuthorityError`;
- `AgentCapacityError`;
- `AgentStorageError`;
- `AgentMigrationError`;
- `AgentHarnessError`;
- `AgentWorkflowError`;
- `AgentInteractionError`;
- `AgentReconciliationError`;
- `AgentRetentionError`.

Each error MUST carry a stable code, safe message, retryability, and relevant non-secret entity IDs.
Internal cause data MUST be redacted before crossing public boundaries.

Defects MUST represent invariant violations or programmer errors, not provider rejection, invalid
input, storage unavailability, or expected process failure. Background fiber failures MUST be
reported and reflected in durable state; they MUST NOT disappear through `Effect.catch(() =>
Effect.void)` without a canonical event.

## 23. Observability and Operations

### 23.1 Logging

Structured logs MUST include applicable:

- thread, task, turn, run, root run, parent run, attempt, and interaction IDs;
- workflow and step names;
- provider, harness, model, repository, ticket, and worktree IDs;
- lane, owner, fencing token, attempt ordinal, and event sequence;
- retry decision and error tag;
- trace and span IDs.

Prompts, message bodies, tool inputs/outputs, paths outside approved safe forms, headers, and secrets
MUST NOT be logged by default.

### 23.2 Spans

The runtime MUST create nested spans for task lifecycle, scheduler claim, workflow step, root/child
run, provider attempt, tool call, interaction suspension, reconciliation, database transaction, and
handover. Provider-native telemetry SHOULD be linked to the Cycle attempt span.

### 23.3 Metrics

At minimum expose:

- queued tasks by lane/provider/repository;
- running and suspended tasks;
- capacity configured, used, and blocked by dimension;
- claim latency and queue wait duration;
- task/run/attempt outcomes and retry counts;
- provider start, reconnect, protocol, and event lag;
- open interaction count and wait duration;
- event append latency, batch size, delta coalescing ratio, and subscriber gap recovery;
- SQLite busy, transaction, migration, and compaction failures;
- token usage by provider/model/task kind;
- workflow-step and handover failures;
- reconciliation classifications.

### 23.4 Operator Inspection

Operators MUST be able to inspect why a task is queued or suspended. A snapshot MUST report every
blocking gate: pause, `notBefore`, global capacity, provider capacity, repository capacity, parent
capacity, dependency, interaction, workflow step, authority, provider availability, or manual
recovery.

## 24. Security and Safety

### 24.1 Trust Boundaries

User messages, ticket content, repository content, provider output, tool input, SDK payloads, MCP
messages, database JSON, and imported legacy rows are untrusted. Every process and persistence
boundary MUST decode with strict schemas and bounded sizes.

### 24.2 Filesystem and Command Execution

Implementation tasks MUST be confined to the acquired worktree. Paths MUST be normalized through
`Path`, checked against the workspace root, and resistant to `..`, symlink, and alternate-path
escapes according to the worktree path policy.

Provider command execution MUST use the provider sandbox or a Cycle executor with equivalent
authority enforcement. Prompt instructions are not a security boundary.

### 24.3 Network and External Writes

Network access and external writes MUST be explicit authority capabilities. Ticket transitions,
comments, branch push, and handover MUST occur through workflow adapters with operation IDs. A
provider MUST NOT receive raw database or internal API credentials.

### 24.4 Reasoning and Sensitive Content

Hidden chain-of-thought MUST not be requested, stored, or exposed. Provider-supplied reasoning
summaries MAY be treated as normal visible content. Diagnostic payloads MUST pass redaction and size
limits before persistence.

## 25. Reference Algorithms

### 25.1 Scheduler Loop

```text
scheduler = scoped background effect

repeat:
  wait for wake-up OR reconciliation interval
  while runtime is not paused:
    candidate = transaction(select highest-lane oldest eligible task)
    if no candidate:
      break

    claim = transaction(
      re-check candidate and all capacity counts
      allocate lease + fencing token
      create attempt
      transition task/run
      append events
    )

    if claim lost:
      continue

    fork attempt in FiberMap keyed by attemptId
```

The scheduler MUST bound the number of claims per wake cycle so other fibers and SQLite users are
not starved.

### 25.2 Attempt Supervisor

```text
acquire capacity permits in deterministic order
acquire attempt scope
run required preparation workflow steps
open or reattach harness session
persist binding and running transition

consume harness events:
  reject stale fence/session/cursor
  coalesce eligible deltas
  on semantic event: flush then transactionally project + append
  on interaction: flush, persist, suspend, close scope
  on terminal provider result: flush, close provider run

if root run succeeded:
  execute remaining completion/handover steps

transactionally persist terminal task result
release permits and leases in finalizers
```

Finalizers MUST never be the only place a durable terminal transition occurs. On unclean finalizer
failure, reconciliation owns repair.

### 25.3 External Workflow Step

```text
step = transaction(load step by stable operationId)
if step.succeeded: return stored output
if step.running with unexpired fence: suspend/retry later

transaction(mark running, allocate step fence)
result = adapter.execute(operationId, decoded input)

transaction:
  verify step fence
  store success output OR typed failure
  append step event

if process crashes after adapter success but before commit:
  reconciliation repeats adapter.execute with same operationId
```

### 25.4 Reattach or Retry

```text
binding = load provider binding and last cursor
result = harness.reattach(binding)

match result:
  Live(session): supervise session from cursor
  Replay(events, terminal?): append missing events; continue or finish
  Suspended(interaction): restore interaction and suspended state
  Unavailable(retryable): interrupt old attempt; schedule new attempt
  Unavailable(unsafe): create manual-recovery interaction
```

## 26. Performance Requirements

The implementation MUST:

1. stream replay rows incrementally rather than loading an unbounded event history;
2. keep provider and subscriber buffers bounded;
3. avoid polling faster than configured backoff when no work exists;
4. avoid full-table scans in scheduler, replay, reconciliation, and retention paths;
5. batch adjacent event and projection writes where semantics allow;
6. use one SQLite transaction per semantic batch, not one per token;
7. ensure one slow subscriber cannot delay provider consumption or other subscribers;
8. limit snapshot sizes and paginate large runs, artifacts, and histories;
9. close idle keyed provider resources through scoped `LayerMap` lifetime policy;
10. bound diagnostic payload and provider event sizes before allocation or persistence.

The conformance benchmark SHOULD demonstrate on development hardware:

- 10,000 queued tasks without scheduler full scans;
- 100,000 events replayed with bounded memory;
- live attach while events are committed with zero missing or duplicate sequences;
- delta coalescing substantially below one transaction per provider delta;
- capacity limits never exceeded under concurrent submit, resume, and child requests.

Numeric latency targets are environment-specific and SHOULD be recorded by the implementation's
benchmark suite rather than hard-coded as universal product guarantees.

## 27. Testing and Validation Matrix

### 27.1 Schema and State Tests

Tests MUST cover strict decoding, branded IDs, every allowed and forbidden state transition,
terminal immutability, stale fencing tokens, idempotency hash conflicts, and malformed legacy or
provider payloads.

### 27.2 SQLite Store Tests

Run the complete store conformance suite against real temporary SQLite. Cover atomic state/event
transactions, rollback, sequence monotonicity, unique constraints, concurrent claims, busy retry,
lease expiry, command idempotency, pagination, migration from every supported version, compaction,
retention, and clean scope closure.

### 27.3 Scheduler Tests

Use `TestClock` and deterministic IDs. Cover FIFO lanes, lane preference, aging promotion, pause,
`notBefore`, all four capacity dimensions, released capacity on suspension/retry, no preemption,
cancelled queued tasks, and repeated wake-ups.

### 27.4 Replay Tests

Inject commits at every attach algorithm boundary. Assert strictly increasing, gap-free,
duplicate-free delivery. Test live buffer overflow and SQLite gap recovery. Test compaction cursor
behavior.

### 27.5 Provider Conformance

Every harness MUST pass one shared fake-driven suite for open, stream, terminal result, typed error,
interruption, steering, interaction suspension/resume, reattachment, replay, stale event rejection,
scope close, and secret redaction.

Codex app-server and Claude Agent SDK MUST each have opt-in real smoke tests for availability,
authentication, one turn, interruption, and resume. Unit tests MUST not require installed provider
credentials.

### 27.6 Crash and Fault Injection

The test suite MUST simulate process loss after every durable boundary:

- task accepted before wake-up;
- task claimed before fiber start;
- provider started before binding commit;
- event projection before/after commit;
- interaction requested before suspension;
- response stored before provider delivery;
- provider completed before terminal event;
- every worktree/handover operation before receipt commit;
- branch push before ticket comment;
- ticket comment before status transition.

Restart tests MUST prove safe reattachment, replay, retry, or manual suspension without duplicate
external effects.

### 27.7 Child-Agent Tests

Cover depth, total, and concurrent limits; child authority intersection; parent/child attribution;
required and optional children; cancellation cascade; child result delivery; restart while a parent
waits; and impossible-capacity rejection without deadlock.

### 27.8 Ticket Workflow Tests

Cover explicit assignment gating, duplicate assignment, unassignment, ticket missing, worktree setup
failure, provider failure, successful commit/push/handover, no-change completion, push failure,
comment failure, status failure, retry using the same worktree, retention on failure, cleanup on
success, no PR creation, and no agent transition to `done`.

### 27.9 Static Architecture Tests

Static checks MUST reject:

- `Promise` or `AsyncIterable` in public agents/chat service shapes;
- `Effect.runPromise`, `runSync`, or detached `runFork` inside these packages;
- direct `process.env`, `Date.now`, `crypto.randomUUID`, Node filesystem, or child-process use outside
  approved adapters/platform layers;
- imports from forbidden higher packages;
- provider SDK types in public exports;
- `JSON.parse(...) as` durable row decoding;
- convenience re-exports of another package's symbols;
- production in-memory store fallback.

## 28. Migration and Compatibility

### 28.1 Breaking Migration

This is an intentional breaking redesign. The old `AgentService`, `AgentServiceRegistry`,
compatibility orchestration, `AgentTaskService`, Promise-based `AgentChatRuntime`, agent-chat SQLite
store, and duplicate event schemas MUST be removed after consumers migrate. New convenience facades
or re-export aliases MUST NOT preserve those APIs.

### 28.2 Legacy Data Import

The backend composition layer MUST provide an idempotent one-time importer for existing agent-chat,
provider session, agent task, and runtime data. The importer MUST:

1. open the legacy source database read-only; if the SQLite integration cannot enforce read-only
   mode, acquire exclusive migration ownership and verify that the importer issues no source writes;
2. decode legacy rows defensively;
3. map threads, messages, turns, activities, questions, events, sessions, and tasks to new schemas;
4. preserve original timestamps, provider IDs, native IDs, text, terminal states, and correlation;
5. allocate deterministic new IDs where legacy IDs do not conform;
6. record source-to-target ID mappings and a migration ledger in `agents.sqlite`;
7. mark imported active work interrupted and send it through normal reconciliation;
8. quarantine malformed rows with a safe diagnostic instead of dropping the whole import;
9. never dual-write old and new stores;
10. leave the legacy database unchanged until an explicit later cleanup.

### 28.3 Cutover

Cutover MUST be atomic at application composition: either the old runtime starts or the new runtime
starts after successful import; both MUST NOT execute simultaneously. API and renderer consumers
MUST migrate in the same implementation series.

## 29. Target Source Layout

The exact names MAY change, but each public file MUST own one primary concept and follow project
package guidance. A conforming shape is:

```text
packages/agents/src/
  AgentRuntime.ts
  AgentThread.ts
  AgentTask.ts
  AgentTurn.ts
  AgentMessage.ts
  AgentRun.ts
  AgentAttempt.ts
  AgentSessionBinding.ts
  AgentInteraction.ts
  AgentWorkflowStep.ts
  AgentArtifact.ts
  AgentIds.ts
  AgentEvents.ts
  AgentErrors.ts
  AgentConfig.ts
  AgentThreadStore.ts
  AgentTaskStore.ts
  AgentEventJournal.ts
  AgentWorkflowStore.ts
  AgentScheduler.ts
  AgentCapacity.ts
  AgentSupervisor.ts
  AgentHarness.ts
  AgentHarnessRegistry.ts
  AgentHarnessResources.ts
  AgentWorkflow.ts
  AgentWorkflowRegistry.ts
  AgentPrompt.ts
  AgentAuthority.ts
  AgentRetention.ts
  AgentReconciler.ts
  providers/
    codex/
    claude/
  internal/
  migrations/
  testing/

packages/agent-chat/src/
  AgentChat.ts
  AgentChatThread.ts
  AgentChatMessage.ts
  AgentChatInteraction.ts
  AgentChatEvents.ts
  AgentChatProjection.ts
  AgentChatPrompt.ts
  AgentChatErrors.ts
  internal/
  testing/
```

Provider generated code MUST stay inside the owning provider directory. Test layers MUST live under
`src/testing`; production root exports MUST not expose them.

## 30. Implementation Plan

### Phase 1: Contracts and Store

- Define canonical schemas, errors, state machines, events, config, and public service contracts.
- Create agents SQLite migrations and focused stores.
- Implement atomic transitions, sequences, observation, retention primitives, and conformance tests.

### Phase 2: Scheduler and Supervisor

- Implement wake-up queue, lanes, capacity service, leases, fencing, retries, reconciliation, and
  supervised fiber lifecycle.
- Add fake workflow and harness adapters and pass crash/fault tests.

### Phase 3: Provider Adapters

- Rebuild Codex app-server behind the new harness contract.
- Rebuild Claude Agent SDK behind the same contract.
- Pass provider conformance and smoke suites.

### Phase 4: Chat Cutover

- Implement `AgentChat` as a projection/facade over `AgentRuntime`.
- Migrate API WebSocket/HTTP handlers and renderer consumers.
- Import legacy chat/session data.
- Delete the agent-chat store and active-turn runtime.

### Phase 5: Ticket Workflow and Worktrees

- Implement the ticket workflow adapter with explicit assignment trigger.
- Integrate idempotent worktree creation/acquisition/finalization/push/handover.
- Migrate Agent Work/usecase consumers and task data.
- Pass end-to-end restart and handover tests.

### Phase 6: Removal and Hardening

- Delete old task, runtime, provider-turn, orchestration, store, and compatibility modules.
- Add static boundary rules and performance benchmarks.
- Run full repository typecheck, lint, format, unit, integration, restart, and provider smoke tests.

## 31. Definition of Done

The redesign is complete only when:

1. all public `@cycle/agents` and `@cycle/agent-chat` runtime APIs are Effect-native;
2. one agents SQLite database is the sole source of truth for threads and execution lifecycle;
3. chat and unattended work both run through the same scheduler and supervisor;
4. attach provides gap-free replay and tail across reconnect and restart;
5. suspended interactions release capacity and resume durably with answers;
6. Codex and Claude pass the shared harness conformance suite;
7. hard restart safely reattaches or retries active work;
8. stale fibers cannot write after lease/fence loss;
9. all four concurrency limits are enforced;
10. child agents are bounded, attributed, recoverable, and cancellation-safe;
11. explicit ticket assignment creates the implementation workflow and worktree;
12. successful implementation commits, pushes, comments, and transitions to `needs-review` without
    creating a PR or marking the ticket done;
13. every external workflow step is idempotent and fault-injection tested;
14. retention and compaction run without breaking replay;
15. legacy consumers and duplicate stores/runtimes are removed rather than re-exported;
16. package dependency and side-effect boundary checks pass;
17. the full repository validation suite passes.

## Appendix A. Chosen Defaults

The following defaults are design choices made where the product does not require customization on
day one. They are configurable and do not change the core contract:

| Setting                        | Default                                    |
| ------------------------------ | ------------------------------------------ |
| Scheduler lanes                | control, interactive, assigned, background |
| Preemption                     | disabled                                   |
| Global concurrency             | 4                                          |
| Per-provider concurrency       | 2                                          |
| Per-repository concurrency     | 2                                          |
| Concurrent children per parent | 4                                          |
| Delegation depth               | 3                                          |
| Total child runs per task      | 16                                         |
| Provider attempts              | 3                                          |
| Delta flush                    | 50 ms or 32 KiB                            |
| Diagnostic retention           | 7 days                                     |
| Delta compaction eligibility   | 24 hours after terminal state              |
| Debug context retention        | 30 days                                    |
| Ticket completion status       | `needs-review`                             |
| Branch push                    | required for successful ticket handover    |
| Pull request creation          | prohibited                                 |
| Successful worktree cleanup    | remove after pushed handover               |
| Failed worktree cleanup        | retain for recovery/debugging              |

## Appendix B. Explicitly Deferred Extensions

The architecture leaves deliberate extension points for:

- direct Effect AI model harnesses;
- OpenCode or other executable harnesses;
- RPC or worker-process executors;
- multiple local worker processes using the existing lease/fence model;
- a SQLite implementation of Effect's `WorkflowEngine.Encoded` contract;
- provider fallback plans through `ExecutionPlan` after portable session semantics exist;
- semantic repository search and richer typed executor toolkits;
- remote execution or cluster sharding.

These extensions MUST conform to the same durable task, event, authority, interaction, and
observation contracts. They MUST NOT add a parallel runtime.
