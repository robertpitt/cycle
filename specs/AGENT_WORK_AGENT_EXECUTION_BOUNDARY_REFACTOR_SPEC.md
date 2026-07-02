# Agent Work Agent Execution Boundary Refactor Specification

Status: Draft implementation specification

Version: 0.1.0

Scope: `@cycle/api`, `@cycle/usecases`, `@cycle/agents`, `@cycle/database`, `@cycle/git`,
`@cycle/desktop`, renderer Agent Work surfaces, and tests that exercise Agent Work execution.

## 1. Purpose

This specification defines the refactor that replaces the current Agent Work runtime boundary with a
generic `AgentTask` subsystem owned by `@cycle/agents`. The target outcome is that API handlers
delegate to usecases, usecases translate Cycle domain intent into a provider-neutral agent task, and
`@cycle/agents` owns task queueing, lifecycle state, execution orchestration, event streaming, and
task persistence.

## 2. Normative Language

The keywords `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are
to be interpreted as described in RFC 2119 and RFC 8174.

`Implementation-defined` means the implementation may choose the mechanism, but it MUST document the
choice in code or package documentation and provide enough tests for reviewers to reason about it.

`AgentTask` means a durable, provider-neutral unit of agent execution owned by `@cycle/agents`.

`Origin metadata` means opaque JSON metadata persisted with an `AgentTask` so callers can correlate
tasks to domain objects such as tickets without requiring `@cycle/agents` to understand those
objects.

## 3. Problem Statement

The current Agent Work implementation has unclear responsibility boundaries:

- `packages/usecases/src/agent-work` contains a service facade, runtime state machine, event hub,
  store port, concrete SQLite store, and HTTP DTO adapter.
- `packages/api/src/http/handlers/v1/agentWorkRunner.ts` still performs provider execution,
  worktree setup, terminal event interpretation, and job state updates.
- `@cycle/agents` has the right low-level provider and orchestration primitives, but the durable
  queue and lifecycle around Agent Work live outside the package that owns agent execution.

This makes Agent Work feel misplaced. Usecases should be controllers and domain glue: they receive a
request, load domain data, prepare context, allocate resources such as worktrees, and ask an agent
execution subsystem to run. They should not own the durable agent lifecycle or act as an agent
runtime package.

## 4. Goals

The refactor MUST:

1. Introduce `AgentTask` as the durable task lifecycle object owned by `@cycle/agents`.
2. Move queueing, task lifecycle management, run orchestration, task event streaming, restart
   recovery, and task persistence into `@cycle/agents`.
3. Make `@cycle/usecases` the domain-controller layer that maps tickets, delegates, comments,
   settings, repository state, and user intent into `AgentTaskRequest` values.
4. Keep `@cycle/agents` ticket-agnostic. It MUST NOT fetch tickets, inspect ticket status, evaluate
   delegates, transition tickets, or branch on Cycle-specific origin metadata.
5. Keep workspace provisioning outside `@cycle/agents`. Usecases MUST decide whether a workspace is
   required, ask `@cycle/git` for it, and pass generic workspace authority into the task request.
6. Expose both HTTP polling and WebSocket streaming surfaces for frontend task status and real-time
   task events.
7. Allow API shape changes required by the refactor, with renderer/frontend updates performed in the
   same migration.
8. Delete the legacy `packages/usecases/src/agent-work` subsystem and avoid compatibility barrels,
   wrapper modules, or re-export shims that preserve old import paths.

## 5. Non-Goals

This refactor MUST NOT:

1. Add multi-agent delegation beyond the existing single-root execution path.
2. Add remote runners or hosted execution.
3. Unify chat and Agent Work into one frontend or product surface.
4. Redesign provider-specific behavior, model selection, provider prompts, or Codex integration
   except where required by the new `AgentTask` boundary.
5. Preserve existing Agent Work HTTP JSON shapes when they conflict with the new task model.
6. Keep `packages/usecases/src/agent-work` as a compatibility facade.
7. Require `@cycle/agents` to understand tickets, comments, delegates, boards, or Cycle repository
   domain semantics.

## 6. System Overview

### 6.1 Target Runtime Flow

```text
HTTP or WebSocket request
  -> @cycle/api decodes transport request
  -> @cycle/usecases runs domain controller or stream binding
  -> usecase loads tickets, delegates, settings, repository data
  -> usecase provisions workspace through @cycle/git when needed
  -> usecase builds AgentTaskRequest
  -> @cycle/agents enqueues AgentTask and returns it
  -> frontend polls HTTP or subscribes to WebSocket task stream
  -> @cycle/agents scheduler starts/resumes queued tasks
  -> @cycle/agents orchestrates provider run and emits AgentTaskEvent values
  -> @cycle/agents persists task state and events
  -> usecase/domain follow-up handlers may consume terminal task events
```

### 6.2 Component Responsibilities

`@cycle/api` owns:

- HTTP route definitions;
- WebSocket upgrade and subscription transport;
- auth, request IDs, and request context extraction;
- payload decoding and response envelopes;
- mapping service failures to API errors.

`@cycle/api` MUST NOT own:

- task queueing;
- task state transitions;
- provider turn execution;
- worktree creation;
- ticket-to-prompt mapping;
- task persistence schema.

`@cycle/usecases` owns:

- domain controller operations;
- task stream authorization and binding;
- ticket, delegate, settings, and repository reads/writes needed to prepare an agent task;
- policy decisions such as whether an agent can run for a ticket;
- workspace provisioning requests to `@cycle/git`;
- mapping domain data to `AgentTaskRequest`;
- optional domain follow-up after task completion, such as ticket comments or status updates.

`@cycle/usecases` MUST NOT own:

- generic task queueing;
- generic task lifecycle state;
- provider runtime event normalization;
- task event replay mechanics;
- concrete task storage tables.

`@cycle/agents` owns:

- `AgentTask` schemas and TypeScript types through a browser-safe public subpath;
- `AgentTaskService`;
- task queueing and scheduler loop;
- task state machine;
- task persistence tables and migrations;
- task event persistence and replay;
- WebSocket subscription backend support;
- provider orchestration through the existing agent provider abstraction;
- restart reconciliation and automatic resume.

`@cycle/agents` MUST NOT branch on `origin.kind`, `repositoryId`, `ticketId`, delegate fields, or any
other Cycle-specific metadata.

`@cycle/database` owns:

- shared local database connection, lifecycle, and transaction primitives used by package-owned
  stores.

`@cycle/database` MUST NOT own AgentTask table semantics. The table names, migrations, repository
methods, and serialization rules for `AgentTask` are owned by `@cycle/agents`.

`@cycle/git` owns:

- worktree provisioning;
- worktree cleanup primitives;
- workspace safety checks.

`@cycle/desktop` owns:

- composing the concrete local database connection;
- creating the `AgentTaskService`;
- injecting services into API startup;
- closing stores and services during shutdown.

## 7. Package Boundary Rules

The final package graph MUST satisfy:

```text
@cycle/desktop
  -> @cycle/api
  -> @cycle/usecases
  -> @cycle/agents
  -> @cycle/database
  -> @cycle/git

@cycle/api
  -> @cycle/usecases
  -> @cycle/agents/schemas

@cycle/usecases
  -> @cycle/agents
  -> @cycle/database
  -> @cycle/git

@cycle/agents
  -> @cycle/database connection primitives
  -> provider dependencies

@cycle/agents/schemas
  browser-safe, no Node-only provider imports
```

`@cycle/usecases` MUST NOT import from `@cycle/api`.

`@cycle/agents` MUST NOT import from `@cycle/api` or `@cycle/usecases`.

Renderer code MAY import task schemas from a browser-safe `@cycle/agents/schemas` export. That export
MUST NOT pull provider SDKs, Node-only modules, or package side effects into the renderer bundle.

No production file MUST import from `@cycle/usecases/agent-work` after the migration.

## 8. Core Domain Model

### 8.1 AgentTask

`@cycle/agents` MUST define an `AgentTask` schema with at least:

- `taskId`: stable string identifier generated by `@cycle/agents`;
- `schemaVersion`: integer;
- `status`: `AgentTaskStatus`;
- `request`: persisted task request summary safe for UI and recovery;
- `rootRunId`: string or `null`;
- `providerId`: agent provider identifier;
- `agentId`: logical agent identifier;
- `model`: optional model identifier;
- `authority`: `AgentTaskAuthority`;
- `workspace`: optional `AgentTaskWorkspace`;
- `origin`: optional opaque JSON object;
- `metadata`: JSON object;
- `createdAt`: ISO-8601 string;
- `updatedAt`: ISO-8601 string;
- `startedAt`: optional ISO-8601 string;
- `completedAt`: optional ISO-8601 string;
- `lastHeartbeatAt`: optional ISO-8601 string;
- `lastError`: optional normalized task error;
- `attempt`: integer starting at `0` or `1`, implementation-defined but documented;
- `maxAttempts`: integer.

`AgentTask.origin` MAY contain ticket correlation fields such as:

```json
{
  "kind": "ticket",
  "repositoryId": "repo_123",
  "ticketId": "ticket_456",
  "trigger": "agent-delegate"
}
```

`@cycle/agents` MUST persist this object but MUST treat it as opaque JSON.

### 8.2 AgentTaskRequest

`@cycle/agents` MUST define an `AgentTaskRequest` schema with at least:

- `agentId`: logical agent identifier;
- `providerId`: provider identifier;
- `model`: optional model identifier;
- `instructions`: system or developer instructions for the task;
- `input`: user/task input content;
- `context`: JSON object containing caller-prepared context;
- `authority`: `AgentTaskAuthority`;
- `workspace`: optional `AgentTaskWorkspace`;
- `tools`: optional tool or MCP attachment declarations;
- `responseFormat`: optional response format descriptor;
- `origin`: optional opaque JSON object;
- `metadata`: JSON object;
- `idempotencyKey`: optional string;
- `requestedBy`: string;
- `maxAttempts`: optional integer.

The request MUST NOT require `ticketId`, `repositoryId`, `delegate`, `commentId`, or Agent Work job
fields as first-class fields.

### 8.3 AgentTaskAuthority

`AgentTaskAuthority` MUST describe what the provider may do without naming Cycle ticket concepts.

Required modes:

- `read-only`: provider may read prepared context and approved tools but MUST NOT write files.
- `workspace-write`: provider may mutate only the provided workspace path.
- `full-access`: provider may operate with broader authority only when explicitly enabled by the
  caller and supported by the provider.

When a workspace path is supplied, `@cycle/agents` MUST pass it to provider execution as the working
directory or equivalent provider-specific sandbox.

### 8.4 AgentTaskEvent

`@cycle/agents` MUST define an `AgentTaskEvent` schema for persisted and streamed events.

Required fields:

- `eventId`: stable string identifier;
- `taskId`: task identifier;
- `runId`: optional provider run identifier;
- `sequence`: monotonically increasing integer per task or globally, implementation-defined but
  documented;
- `type`: stable event type string;
- `occurredAt`: ISO-8601 string;
- `payload`: JSON object;
- `visible`: boolean indicating whether the renderer should show the event by default.

The event stream MUST include lifecycle events:

- `task.queued`;
- `task.started`;
- `task.heartbeat`;
- `task.waiting_for_input`;
- `task.completed`;
- `task.failed`;
- `task.cancelled`.

It SHOULD include normalized provider runtime events:

- `agent.run.started`;
- `agent.message.delta`;
- `agent.reasoning.started`;
- `agent.reasoning.delta`;
- `agent.reasoning.ended`;
- `agent.tool.started`;
- `agent.tool.completed`;
- `agent.tool.failed`;
- `agent.run.completed`;
- `agent.run.failed`;
- `agent.run.cancelled`;
- `agent.usage.reported`;
- `agent.warning.reported`.

### 8.5 AgentTaskStatus

`AgentTaskStatus` MUST include:

- `queued`;
- `starting`;
- `running`;
- `waiting_for_input`;
- `cancelling`;
- `completed`;
- `failed`;
- `cancelled`.

Implementations MAY add internal statuses only if they do not cross the public API boundary.

## 9. State Machine

### 9.1 Transitions

The public state machine MUST follow:

```text
queued
  -> starting
  -> running
  -> waiting_for_input
  -> running
  -> completed

queued|starting|running|waiting_for_input
  -> cancelling
  -> cancelled

starting|running
  -> failed

failed
  -> queued, only through an explicit retry operation or automatic retry policy
```

Terminal states are:

- `completed`;
- `failed`;
- `cancelled`.

Terminal tasks MUST NOT restart automatically unless an explicit retry creates a new attempt or a
documented automatic retry policy moves the task back to `queued`.

### 9.2 Queueing and Start

Creating a task MUST enqueue it and return the durable `AgentTask` immediately. The create endpoint
MUST NOT wait for provider execution to finish.

The `AgentTaskService` scheduler MUST start queued tasks when:

- provider capabilities support the requested authority and tools;
- concurrency gates allow execution;
- required workspace information is valid;
- the task is not terminal;
- the task is not already leased by another local worker.

### 9.3 Idempotency

If `AgentTaskRequest.idempotencyKey` is provided, `@cycle/agents` MUST prevent duplicate active tasks
for the same key. The exact uniqueness scope MUST be documented and SHOULD include at least the task
origin and idempotency key.

Duplicate create requests for an active task SHOULD return the existing active task. Duplicate create
requests for a terminal task MAY create a new task if the caller supplies a new idempotency key.

### 9.4 Cancellation

Cancellation MUST:

1. move the task to `cancelling` when cancellation is accepted;
2. signal the active provider run if one exists;
3. persist a cancellation event;
4. move the task to `cancelled` when the provider run has stopped or when no active run exists.

If provider cancellation fails, the task MUST remain observable and MUST include a normalized error in
its event stream.

### 9.5 Automatic Resume After Restart

On process startup, `@cycle/agents` MUST reconcile non-terminal tasks.

Queued tasks MUST remain queued and be eligible for scheduling.

Starting or running tasks MUST resume automatically when the provider and workspace can be recovered.
If a provider session cannot be resumed but the task is retry-safe, the scheduler SHOULD create a new
provider run for the same task attempt or next attempt. If recovery is impossible, the task MUST move
to `failed` with a normalized recovery error.

Waiting tasks MUST remain `waiting_for_input` until user input or resume input is supplied.

Leases older than the configured stale lease threshold MUST be considered stale and recoverable.

## 10. Storage Contract

`@cycle/agents` MUST own the concrete tables or collections used for `AgentTask` state.

Minimum durable storage:

- tasks;
- task events;
- run snapshots;
- leases or equivalent active-run ownership records;
- checkpoints required for resume;
- idempotency records.

The table names SHOULD be clearly namespaced, for example:

- `agent_tasks`;
- `agent_task_events`;
- `agent_task_runs`;
- `agent_task_leases`;
- `agent_task_idempotency`.

`@cycle/agents` MAY use database connection and transaction primitives from `@cycle/database`, but
the SQL schema, migrations, repository methods, and serialization rules MUST live in `@cycle/agents`.

The store MUST expose a close or dispose hook when it owns resources.

An in-memory store MAY exist for tests, but production desktop composition MUST use the durable local
database.

## 11. Service Contracts

### 11.1 AgentTaskService

`@cycle/agents` MUST export an `AgentTaskService` with operations equivalent to:

```ts
type AgentTaskService = {
  createTask(request: AgentTaskRequest): Promise<AgentTask>;
  getTask(taskId: string): Promise<AgentTask | undefined>;
  listTasks(query: AgentTaskListQuery): Promise<AgentTaskPage>;
  cancelTask(taskId: string, input: CancelAgentTaskInput): Promise<AgentTask | undefined>;
  retryTask(taskId: string, input: RetryAgentTaskInput): Promise<AgentTask | undefined>;
  appendTaskInput(taskId: string, input: AgentTaskInput): Promise<AgentTask | undefined>;
  listEvents(query: AgentTaskEventQuery): Promise<readonly AgentTaskEvent[]>;
  subscribe(query: AgentTaskSubscriptionQuery): AsyncIterable<AgentTaskEvent>;
  reconcile(): Promise<AgentTaskReconcileResult>;
  startScheduler(): Promise<AgentTaskSchedulerHandle>;
};
```

The exact TypeScript shape MAY differ, but the same capabilities MUST be present and tested.

### 11.2 Usecase Mapping Contract

Usecases that create agent tasks MUST:

1. validate caller permissions and domain policy;
2. load required ticket, repository, settings, delegate, and comment data;
3. prepare `instructions`, `input`, and `context`;
4. provision a workspace through `@cycle/git` when required;
5. create an `AgentTaskRequest`;
6. call `AgentTaskService.createTask`;
7. return the created `AgentTask` or a domain-specific projection that includes `taskId`.

Usecases MUST NOT mutate `AgentTask` state directly after creation except by calling
`AgentTaskService` operations.

### 11.3 Provider Orchestration Contract

The `AgentTaskService` MUST execute tasks through the existing provider abstraction or a refined
orchestration abstraction in `@cycle/agents`.

Provider adapters MUST receive generic task inputs:

- instructions;
- task input;
- context;
- authority;
- workspace;
- tools/MCP attachments;
- response format;
- model and provider identifiers.

Provider adapters MUST NOT receive ticket records, delegate records, database handles, or usecase
services.

## 12. API Contract

The API MAY replace existing Agent Work endpoint shapes. The renderer MUST be updated in the same
migration.

All AgentTask routes MUST call a usecase/controller operation or a usecase stream binding. API
handlers MUST NOT create tasks, subscribe to task streams, or authorize task access by reaching
directly into task storage.

The API SHOULD expose:

- `POST /v1/agent-tasks` to create a generic task when the caller already has a complete
  `AgentTaskRequest`;
- `POST /v1/repositories/:repositoryId/issues/:issueId/agent-tasks` to create a task from ticket
  context through a usecase;
- `GET /v1/agent-tasks/:taskId` to poll task status;
- `GET /v1/agent-tasks` to list tasks, with origin filters for repository and ticket when needed;
- `GET /v1/agent-tasks/:taskId/events` to replay persisted events;
- `POST /v1/agent-tasks/:taskId/cancel` to cancel a task;
- `POST /v1/agent-tasks/:taskId/retry` to retry a failed task when retry is allowed.

The API MUST expose a WebSocket task stream. The endpoint MAY be either:

- `GET /v1/agent-tasks/:taskId/stream` as a WebSocket upgrade; or
- `GET /v1/agent-tasks/stream?taskId=...` as a WebSocket upgrade.

The WebSocket stream MUST:

- authorize access through a usecase stream binding before subscribing;
- send a snapshot or replay marker on connect;
- stream `AgentTaskEvent` values in sequence order;
- support resuming from a last-seen sequence or event ID;
- close with a typed error message when auth or task lookup fails;
- not leak provider secrets, MCP auth headers, or raw environment variables.

HTTP polling and WebSocket subscription MUST use the same canonical task and event schemas.

## 13. Workspace And Authority

Workspace setup is a usecase responsibility.

When a task requires repository write access, the usecase MUST:

1. resolve the repository and ticket context;
2. ask `@cycle/git` to provision or validate the workspace;
3. ensure the workspace path is outside forbidden paths;
4. pass only generic workspace fields to `@cycle/agents`.

`@cycle/agents` MUST enforce that provider execution happens within the supplied workspace for
`workspace-write` tasks. It MUST NOT create Cycle worktrees or decide which ticket branch should be
used.

## 14. Prompt And Context Assembly

Usecases own domain prompt assembly.

Usecases SHOULD build `AgentTaskRequest` from:

- ticket title, body, comments, status, labels, and type;
- repository metadata;
- delegate notes or requested agent settings;
- trigger source such as assignment, mention, or manual command;
- workspace details when applicable.

`@cycle/agents` MAY adapt the generic request to provider-specific prompt and protocol formats, but
it MUST NOT fetch additional Cycle ticket or repository data.

Provider-specific formatting MUST be deterministic and tested.

## 15. Failure Model

`@cycle/agents` MUST normalize task failures into stable categories:

- `invalid_request`;
- `provider_missing`;
- `provider_unavailable`;
- `unsupported_authority`;
- `workspace_invalid`;
- `tool_unavailable`;
- `provider_authentication_failed`;
- `provider_rate_limited`;
- `provider_timeout`;
- `provider_run_failed`;
- `cancelled`;
- `waiting_for_input`;
- `resume_failed`;
- `storage_failed`;
- `unknown`.

Usecases MUST map domain failures separately:

- ticket not found;
- repository not found;
- delegate not configured;
- invalid ticket status;
- workspace provisioning failed;
- permission denied.

API handlers MUST preserve this distinction. A domain failure SHOULD be returned before task creation.
An agent failure after task creation MUST be visible on the task and event stream.

## 16. Observability

Each task lifecycle operation MUST log or persist enough context to debug without a debugger:

- `taskId`;
- `runId` when available;
- `providerId`;
- `agentId`;
- `status`;
- `origin.kind` when present;
- request ID when initiated by API;
- error code;
- sequence or event ID for streamed events.

Logs MUST NOT include secrets, bearer tokens, raw MCP headers, or full environment maps.

The renderer MUST be able to show:

- current task status;
- recent task events;
- terminal result or error;
- whether a task is queued, running, waiting, failed, cancelled, or completed.

## 17. Security And Safety

`AgentTaskRequest` is partially trusted input. API and usecases MUST decode and validate it before
calling `AgentTaskService`.

`@cycle/agents` MUST enforce provider capability checks before execution:

- requested authority mode;
- workspace write support;
- MCP/tool attachment support;
- structured output support when required;
- cancellation support when needed.

Workspace paths MUST be normalized and validated. Provider execution MUST NOT be allowed to write
outside the authorized workspace for `workspace-write` tasks.

Opaque origin metadata MUST be JSON-serializable and MUST NOT contain secrets, provider SDK objects,
file handles, or unredacted user credentials.

## 18. Migration Plan

### Phase 1: Define AgentTask Contracts

1. Add browser-safe `@cycle/agents/schemas` exports for `AgentTask`, `AgentTaskRequest`,
   `AgentTaskEvent`, query payloads, and command payloads.
2. Add `AgentTaskService` and store interfaces inside `@cycle/agents`.
3. Add static tests proving the schema export is renderer-safe.

### Phase 2: Add Durable AgentTask Store

1. Add `@cycle/agents`-owned SQLite tables and migrations using the existing database connection
   layer.
2. Add in-memory store fixtures for tests.
3. Add store tests for task CRUD, event append/replay, idempotency, leases, checkpoints, and
   recovery queries.

### Phase 3: Implement Scheduler And Execution

1. Implement queue scheduling in `@cycle/agents`.
2. Run tasks through the existing provider orchestration path.
3. Persist normalized runtime events as `AgentTaskEvent` values.
4. Implement cancellation and automatic restart reconciliation.

### Phase 4: Rewire Usecases

1. Replace `packages/usecases/src/agent-work` calls with direct usecase-to-`AgentTaskService` calls.
2. Move ticket-to-task mapping into ordinary usecase/controller modules.
3. Move worktree provisioning to usecases through `@cycle/git`.
4. Ensure no usecase owns task lifecycle state directly.

### Phase 5: Rewire API And Renderer

1. Replace Agent Work endpoints with AgentTask HTTP endpoints.
2. Add WebSocket task streaming.
3. Update renderer polling and real-time task surfaces to consume `AgentTask` and `AgentTaskEvent`.
4. Remove API-side `agentWorkRunner.ts` execution responsibilities.

### Phase 6: Delete Legacy Surface

1. Delete `packages/usecases/src/agent-work`.
2. Delete legacy imports, wrappers, barrels, and compatibility re-exports.
3. Delete obsolete Agent Work HTTP schemas and adapters.
4. Add static boundary tests that fail on legacy import paths.

## 19. Validation Matrix

| Area | Required validation |
| --- | --- |
| Package boundaries | Static checks prove `@cycle/agents` imports neither `@cycle/api` nor `@cycle/usecases`, and production code imports nothing from `@cycle/usecases/agent-work`. |
| Schema safety | Renderer can import `@cycle/agents/schemas` without Node-only provider dependencies. |
| Task lifecycle | Unit tests cover create, queue, start, running, waiting, cancel, complete, fail, retry, and terminal state behavior. |
| Idempotency | Duplicate active creates with the same idempotency key return or identify the existing task. |
| Persistence | Store tests cover task CRUD, event sequence ordering, replay, leases, checkpoints, idempotency records, and close/dispose behavior. |
| Restart recovery | Integration tests prove queued and recoverable running tasks resume automatically after service restart. |
| Usecase mapping | Usecase tests prove ticket/domain inputs are mapped to generic `AgentTaskRequest` without leaking ticket-specific fields into first-class agent task fields. |
| Workspace boundary | Tests prove usecases provision workspaces and `@cycle/agents` only receives generic workspace authority. |
| API polling | HTTP tests cover create, get, list, event replay, cancel, retry, and error mapping. |
| WebSocket streaming | WebSocket tests cover snapshot on connect, ordered events, resume from sequence, terminal event delivery, and auth failure. |
| Renderer behavior | UI tests or integration tests prove frontend can poll and subscribe to task streams using the new schemas. |
| Legacy deletion | Static tests fail if `packages/usecases/src/agent-work`, `agentWorkRunner.ts` execution paths, or old wrapper exports return. |

## 20. Definition Of Done

The refactor is complete when:

1. `@cycle/agents` owns `AgentTask` schemas, service, scheduler, lifecycle state, persistence, event
   replay, streaming backend, and restart reconciliation.
2. `@cycle/usecases` only maps domain requests into `AgentTaskRequest` and handles domain-specific
   setup or follow-up.
3. `@cycle/api` only adapts HTTP/WebSocket transport to usecases and task service operations.
4. `@cycle/git` remains the only owner of worktree provisioning.
5. `packages/usecases/src/agent-work` is deleted.
6. API-side provider execution code is deleted or reduced to transport-only calls.
7. Renderer task views use `AgentTask` and `AgentTaskEvent`.
8. Static boundary tests, unit tests, integration tests, and renderer/API task tests pass.
