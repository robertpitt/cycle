# Agent Work Runtime Boundaries Specification

Status: Draft implementation specification

Version: 0.1.0

Scope: `@cycle/contracts`, `@cycle/usecases`, `@cycle/database`, `@cycle/api`,
`@cycle/desktop`, `@cycle/agents`, and Agent Work HTTP/runner tests.

## 1. Purpose

This specification defines the migration that makes Agent Work follow a strict
`api -> services -> db` runtime boundary with shared API types. The target outcome is that
`@cycle/api` exposes HTTP routes and performs HTTP-only adaptation, while Agent Work DTO schemas,
runtime service contracts, business rules, scheduler state, and persistence implementations live in
lower packages that can be used without importing `@cycle/api`.

## 2. Normative Language

The keywords `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174.

`Implementation-defined` means the implementation may choose the internal mechanism, but it MUST
document the choice in code or package documentation and expose enough tests for reviewers to reason
about it.

`Public Agent Work contract` means an Effect Schema value exported by `@cycle/contracts` plus the
TypeScript type derived from that schema.

`Agent Work service contract` means a Promise or Effect-facing interface exported by
`@cycle/usecases` that owns Agent Work business operations and hides storage details from HTTP
adapters.

## 3. Source Context

This specification is based on inspection of:

- `specs/AGENT_WORK_ORCHESTRATION_SPEC_V1.1.md`
- `specs/EFFECT_SCHEMA_CONTRACTS_SPEC.md`
- `specs/CLANKA_AGENT_RUNTIME_REDESIGN_SPEC.md`
- `packages/agents/SPEC.md`
- `packages/api/src/agent-work/httpAdapter.ts`
- `packages/api/src/agent-work/runtime.ts`
- `packages/api/src/agent-work/store.ts`
- `packages/api/src/agent-work/types.ts`
- `packages/api/src/agentWork/runtime.ts`
- `packages/api/src/http/runtime/CycleApiRuntime.ts`
- `packages/api/src/http/schemas.ts`
- `packages/api/src/http/handlers/v1/agentWork.ts`
- `packages/api/src/http/handlers/v1/agentWorkEvents.ts`
- `packages/api/src/http/handlers/v1/agentWorkRunner.ts`
- `packages/desktop/src/main/DesktopApi.ts`

The requested target mirrors the Forge-style boundary described by the user: API adapters depend
inward on service and database packages, and shared API types live outside the API package.

## 4. Problem Statement

Agent Work currently straddles two incompatible boundaries:

1. `packages/api/src/agent-work/*` contains the newer durable Agent Work runtime, store, event hub,
   settings, and HTTP adapter.
2. `packages/api/src/agentWork/runtime.ts` contains legacy DTOs, `AgentWorkRuntimeShape`, helper
   logic, and an in-memory compatibility runtime.

The visible leak is in `packages/api/src/agent-work/httpAdapter.ts`, which imports public DTOs and
`AgentWorkRuntimeShape` from `../agentWork/runtime.ts` while adapting the newer durable runtime.
`packages/api/src/http/runtime/CycleApiRuntime.ts`, `agentWorkRunner.ts`, and desktop composition
also type and construct Agent Work through `@cycle/api`.

That shape makes `@cycle/api` more than an HTTP adapter:

- It owns shared wire DTOs that renderer, tests, and handlers depend on.
- It exports Agent Work runtime factories through `AgentWorkRuntimeV11`.
- It provides a default in-memory Agent Work runtime when callers do not inject one.
- It hosts scheduler/runner orchestration under HTTP handler code.
- It keeps legacy `agentWork` DTOs alive solely as a compatibility surface.

The result is contract drift, unclear ownership, and a package graph that makes future Agent Work
service and database changes look like API changes.

## 5. Goals

The migration MUST:

1. Make `@cycle/contracts` the canonical owner of public Agent Work API schemas and derived DTO
   types.
2. Make `@cycle/usecases` the canonical owner of the Agent Work service contract, runtime-facing
   inputs, scheduler/business operations, and storage port.
3. Move durable Agent Work persistence implementations below the service boundary, preferably into
   `@cycle/database`.
4. Keep `@cycle/api` as an HTTP adapter that decodes HTTP input, calls an injected Agent Work
   service, maps service failures to HTTP responses, and encodes response envelopes.
5. Remove `packages/api/src/agentWork/runtime.ts` and every import from it.
6. Remove `@cycle/api` root exports that expose Agent Work runtime/store factories as API package
   responsibilities.
7. Preserve the existing Agent Work HTTP endpoint behavior unless this spec explicitly says a shape
   is changing.
8. Add static boundary tests that prevent the legacy API-owned runtime surface from returning.
9. Keep the runtime compatible with the Agent Work state machine and event model specified by
   `AGENT_WORK_ORCHESTRATION_SPEC_V1.1.md`.

## 6. Non-Goals

This migration MUST NOT:

1. Redesign the Agent Work state machine, scheduler gates, worktree policy, provider orchestration,
   or retry semantics except where required to move ownership.
2. Introduce a new public Agent Work HTTP version.
3. Require remote runners, hosted collaboration, pull request creation, or non-Codex providers.
4. Make renderer code import from `@cycle/api` for shared DTOs.
5. Keep a compatibility alias from `packages/api/src/agentWork/runtime.ts`.
6. Hide migration failures behind broad `unknown`, `any`, or unvalidated JSON at public boundaries.

## 7. Target Package Boundaries

### 7.1 Package Graph

The target runtime graph MUST be:

```text
@cycle/desktop
  composes services, database adapters, and @cycle/api server

@cycle/api
  HTTP routes, auth, request/response envelopes, OpenAPI
  depends on @cycle/contracts and @cycle/usecases

@cycle/usecases
  Agent Work service contract, scheduler/runtime business logic, storage port
  depends on @cycle/contracts and storage packages

@cycle/database
  durable Agent Work store implementations and SQL/schema migration support
  depends on lower infrastructure only

@cycle/contracts
  public Agent Work schemas, DTO types, and usecase/API contracts
```

`@cycle/contracts` MUST NOT depend on `@cycle/api`, `@cycle/usecases`, or `@cycle/database`.

`@cycle/usecases` MUST NOT depend on `@cycle/api`.

`@cycle/database` MUST NOT depend on `@cycle/api`.

`@cycle/api` MAY depend on `@cycle/contracts`, `@cycle/usecases`, `@cycle/agents`, `@cycle/git`,
and `@cycle/logging`, but it MUST NOT own Agent Work persistence, scheduler decisions, or provider
run completion logic.

### 7.2 Contracts Ownership

`@cycle/contracts` MUST export a new Agent Work schema module, for example
`@cycle/contracts/schemas/AgentWork`.

That module MUST own schemas and derived types for all public Agent Work HTTP DTOs:

- `AgentWorkAuthorityMode`
- `AgentWorkJobStatus`
- `AgentWorkTrigger`
- `AgentWorkSettings`
- `AgentWorkSettingsPatch`
- `RepositoryAgentWorkSettings`
- `RepositoryAgentWorkSettingsPatch`
- `AgentWorkDelegate`
- `AgentWorkDelegateInput`
- `AgentWorkDelegateJobInput`
- `AgentWorkDelegateJob`
- `AgentWorkJob`
- `AgentWorkActivity`
- `AgentWorkJobLogEntry`
- `AgentWorkJobLog`
- `AgentWorkJobCreateInput`, if external callers can create jobs directly
- `AgentWorkJobListQuery`
- `AgentWorkActivityQuery`
- `AgentWorkJobCancelPayload`
- `AgentWorkJobResumePayload`

The initial public JSON shape SHOULD preserve the existing `/v1` response fields:

- `AgentWorkJob.lastError` remains `string | null` at the HTTP boundary.
- optional durable fields that are absent internally are emitted as `null` where the current API
  does so.
- timestamps are ISO-8601 strings, not `Date` instances.
- `metadata` and `payload` are JSON objects.

If a field is renamed from the legacy `Agent*` prefix to `AgentWork*`, the HTTP JSON key MUST remain
unchanged unless a new endpoint version is introduced.

### 7.3 Usecase Service Ownership

`@cycle/usecases` MUST export an Agent Work service contract that represents product operations, not
HTTP endpoints. The service MAY be Promise-facing for easy API composition or Effect-facing for
native usecase integration, but the exported boundary MUST be stable and tested.

The service contract MUST include operations equivalent to:

- read and patch global Agent Work settings;
- read and patch repository Agent Work settings;
- get, put, and delete ticket delegates;
- create delegate jobs;
- create jobs when a service-level workflow requires it;
- list jobs;
- get a job;
- get a job log;
- record job activity;
- complete, fail, wait, resume, and cancel jobs;
- attach worktree and branch association records;
- list Agent Work activity;
- emit local ticket events after successful ticket-domain writes;
- evaluate assignment pickup;
- handle successful comments and agent mentions;
- request or schedule execution for startable jobs.

The service contract MUST use `@cycle/contracts` DTOs at public service boundaries where the value is
also used by HTTP clients. It MAY use narrower internal domain records for storage and scheduler
internals.

Business helpers currently imported from `packages/api/src/agentWork/runtime.ts`, including
structured agent mention parsing and logical job key construction, MUST move to `@cycle/usecases`
or a lower package. `@cycle/api` MUST NOT own those helpers after migration.

### 7.4 Database Ownership

The Agent Work storage port MUST live outside `@cycle/api`. A conforming implementation SHOULD use:

- `@cycle/usecases` for the `AgentWorkStore` or `AgentWorkRepository` interface;
- `@cycle/database` for SQLite-backed store creation, SQL schema, migrations, and database test
  fixtures.

The current SQL table definitions and store methods from `packages/api/src/agent-work/store.ts`
MUST move out of `@cycle/api` or be replaced by equivalent lower-package implementations.

An in-memory store MAY exist only as a test fixture or local development fixture below the API
boundary. `@cycle/api` MUST NOT create or export a default in-memory Agent Work runtime as a
production compatibility fallback.

### 7.5 API Ownership

`@cycle/api` MUST retain:

- HTTP route definitions;
- HTTP request decoding and query normalization;
- auth and request context extraction;
- resource and collection envelope construction;
- OpenAPI generation;
- mapping service failures to HTTP responses;
- process-local server composition using injected services.

`@cycle/api` MUST NOT retain:

- `AgentWorkRuntimeShape` definitions;
- Agent Work DTO interfaces;
- Agent Work runtime factories;
- Agent Work store factories;
- Agent Work SQL schema;
- scheduler gate decisions;
- logical job key construction;
- structured agent mention parsing;
- provider run completion policy;
- worktree cleanup policy.

`packages/api/src/agent-work/httpAdapter.ts` MAY remain temporarily during migration, but its final
shape MUST depend only on `@cycle/contracts` DTOs and an Agent Work service contract from
`@cycle/usecases`.

### 7.6 Desktop Composition

`@cycle/desktop` MUST compose Agent Work explicitly:

1. create or open the durable Agent Work database/store through a lower package;
2. create the Agent Work service/runtime through `@cycle/usecases`;
3. pass the service into `startCycleApiServer` or `makeCycleApi`;
4. close lower-package stores during server shutdown.

Desktop main code MUST NOT import Agent Work runtime/store factories from `@cycle/api`.

## 8. Public Contract Details

### 8.1 Schema Rules

Public Agent Work schemas MUST follow `EFFECT_SCHEMA_CONTRACTS_SPEC.md`:

- schemas are Effect Schema values;
- TypeScript types are derived from schemas;
- public request payload schemas are strict by default;
- known extension bags use explicit JSON object fields such as `metadata` or `payload`;
- untrusted HTTP request input is decoded before service calls;
- response values are encoded or validated before crossing the HTTP boundary.

### 8.2 Naming

New contract exports SHOULD use the `AgentWork*` prefix. Legacy internal names such as `AgentJob`,
`AgentSettings`, and `RepositoryAgentSettings` MUST NOT be introduced in new shared contract files.

Existing HTTP endpoints MAY continue returning JSON fields such as `jobId`, `providerId`, and
`agentWorkDisabled`.

### 8.3 Nullability

The service layer MAY represent absent optional fields as `undefined`. The HTTP adapter MUST
normalize nullable public response fields consistently with the current endpoint behavior.

Patch payload schemas MUST distinguish absent fields from fields explicitly set to `null`.

### 8.4 JSON Payloads

`metadata`, `payload`, settings override maps, and diagnostic detail objects MUST be JSON-serializable
objects. They MUST NOT contain functions, `Date` instances, class instances, buffers, file handles,
or provider SDK objects.

### 8.5 Identifiers

The contracts MUST treat the following as stable string identifiers:

- `repositoryId`
- `ticketId`
- `jobId`
- `executionId`
- `workflowId`
- `eventId`
- `delegate` composite key: `repositoryId + ticketId`
- `worktreeId`
- `branchAssociationId`
- `providerSessionId`

The service layer MUST own generation and deduplication of Agent Work identifiers. HTTP adapters
MUST NOT generate job IDs, execution IDs, workflow IDs, or logical job keys.

## 9. Service Workflows

### 9.1 HTTP Request Flow

Agent Work HTTP handlers MUST follow this flow:

```text
HTTP request
  -> auth/request context
  -> decode params/query/payload with @cycle/contracts schemas
  -> call @cycle/usecases Agent Work service
  -> map success to resource/collection envelope
  -> map service failure to HTTP error envelope
```

Handlers MUST NOT inspect or mutate durable store records directly.

### 9.2 Ticket Write Event Flow

After a ticket-domain usecase write succeeds, the API runtime MAY notify Agent Work through the
service event methods. That notification MUST happen after the ticket write has committed.

If event emission fails after the ticket write has already succeeded, the original HTTP response
SHOULD still reflect the successful ticket write. The Agent Work emission failure MUST be logged with
at least `requestId`, `repositoryId`, `ticketId` when available, `eventType`, and normalized failure
code.

Explicit Agent Work mutation endpoints, such as delegate updates and job actions, MUST return a
failure response when the Agent Work service operation fails.

### 9.3 Job Execution Flow

Agent Work job execution MUST be requested through the Agent Work service boundary. The final design
MUST NOT require HTTP handler modules to run provider turns, attach worktrees, infer completion, or
translate runtime terminal events.

`packages/api/src/http/handlers/v1/agentWorkRunner.ts` MUST be removed from `@cycle/api` or reduced
to a thin call into a lower-package execution service. The lower-package execution service MUST own:

- acquiring and heartbeating job leases;
- checking scheduler gates;
- starting or resuming provider/orchestration runs;
- persisting runtime events into Agent Work activity/log storage;
- completing, failing, cancelling, or waiting jobs based on terminal runtime events;
- invoking worktree and branch finalization policy.

### 9.4 Reconciliation

Startup reconciliation of stale jobs and leases MUST be owned by the Agent Work service/runtime, not
by HTTP adapter construction. API server startup MAY call a single injected service startup method,
but it MUST NOT create runtime internals to trigger reconciliation.

## 10. Failure Model

The Agent Work service MUST expose normalized failures that the API can map without inspecting
storage exceptions. At minimum, failures MUST distinguish:

- invalid input;
- not found;
- conflict or duplicate active job;
- scheduler gate blocked;
- provider unavailable;
- MCP unavailable or unauthorized;
- worktree unavailable;
- storage unavailable;
- timeout;
- unexpected defect.

HTTP handlers MUST map:

- invalid input to `400`;
- unauthorized or forbidden actor policy failures to `401` or `403`;
- missing job/delegate resources to `404`;
- conflicts and duplicate active jobs to `409`;
- transient provider/storage/timeouts to `503` or another documented retryable error status;
- unexpected defects to `500`.

Every failure response MUST include the request ID and a stable error code.

## 11. Observability

Agent Work service operations MUST log or annotate:

- `requestId` when called from API;
- `source`;
- `actor` when available;
- `repositoryId`;
- `ticketId` when available;
- `jobId` when available;
- operation name;
- result category;
- normalized failure code when failed.

The API adapter MUST NOT swallow Agent Work failures silently. Best-effort post-write event emission
MAY avoid failing the original ticket response, but it MUST still log a normalized warning.

Static boundary failures MUST be visible in CI.

## 12. Security and Safety

Public Agent Work contracts MUST NOT expose secrets, bearer tokens, provider credentials, local
environment variables, raw command output beyond intentionally persisted activity, or full provider
SDK payloads.

The service layer MUST redact sensitive values before they enter Agent Work events, job logs,
metadata, or failure details.

HTTP adapters MUST treat all params, query values, and payloads as untrusted and decode them through
schemas before service calls.

Worktree paths and branch names MUST be validated by the lower service/worktree boundary. HTTP
adapters MUST NOT trust caller-supplied paths or branch refs as authorization to mutate the
filesystem or Git state.

## 13. Migration Plan

### Phase 1: Extract Public Contracts

1. Add `packages/contracts/src/schemas/AgentWork.ts`.
2. Move public Agent Work HTTP schemas out of `packages/api/src/http/schemas.ts`.
3. Export the new schemas through `@cycle/contracts/schemas` and root contract exports.
4. Update API endpoint schemas to import from `@cycle/contracts`.
5. Update renderer parsers and tests to prefer shared contract schemas where practical.

Phase 1 is complete when no public Agent Work DTO type is declared in `@cycle/api`.

### Phase 2: Introduce Agent Work Service Boundary

1. Add `@cycle/usecases` Agent Work service contract and runtime factory.
2. Move durable runtime logic from `packages/api/src/agent-work/runtime.ts` into the service
   boundary or a lower internal module consumed by that boundary.
3. Move settings validation and logical job key/mention helpers into the service boundary.
4. Keep existing HTTP endpoint behavior by adapting the new service to the existing handler calls.

Phase 2 is complete when `CycleApiRuntimeShape.agentWork` is typed by `@cycle/usecases`, not by a
local API module.

### Phase 3: Move Persistence Below API

1. Move `AgentWorkRuntimeStore` and store filter types out of `@cycle/api`.
2. Move SQLite schema and node store creation into `@cycle/database` or another lower persistence
   package.
3. Keep in-memory store support only as a test/development fixture outside `@cycle/api`.
4. Update desktop composition to create lower-package stores and pass the service into API startup.

Phase 3 is complete when `packages/desktop/src/main/DesktopApi.ts` no longer imports
`AgentWorkRuntimeV11` from `@cycle/api`.

### Phase 4: Move Runner Logic Out Of HTTP Handlers

1. Move job execution orchestration from `packages/api/src/http/handlers/v1/agentWorkRunner.ts` into
   the Agent Work service/runtime layer.
2. Replace handler-side `launchAgentWorkJob` calls with a service operation such as
   `requestJobExecution(jobId, context)` or `wakeStartableJobs(context)`.
3. Ensure provider/orchestration terminal events update durable jobs through service methods.

Phase 4 is complete when HTTP handlers contain no provider turn execution, worktree finalization,
or job terminal-state inference.

### Phase 5: Delete Legacy Compatibility Surface

1. Delete `packages/api/src/agentWork/runtime.ts`.
2. Delete `makeHttpInMemoryAgentWorkRuntime` and API-owned Agent Work runtime/store exports.
3. Remove `export * as AgentWorkRuntimeV11` from `packages/api/src/index.ts`.
4. Update all imports and tests.
5. Add static tests that fail on `packages/api/src/agentWork` imports or files.

Phase 5 is complete when `rg "agentWork/runtime|AgentWorkRuntimeV11|makeHttpInMemoryAgentWorkRuntime"`
returns no production references.

## 14. Validation Matrix

| Area | Required validation |
| --- | --- |
| Contract ownership | A test or lint check proves Agent Work public DTO schemas are exported from `@cycle/contracts` and not declared in `@cycle/api`. |
| Package boundaries | Static checks fail if `@cycle/usecases`, `@cycle/database`, or renderer code imports from `@cycle/api` for Agent Work types. |
| Legacy deletion | Static checks fail if `packages/api/src/agentWork/runtime.ts` exists or any code imports `../agentWork/runtime.ts`. |
| HTTP behavior | Existing Agent Work endpoint tests pass with the same response JSON shape and status codes unless a deliberate schema change is documented. |
| Service behavior | Unit tests cover delegate CRUD, job creation/dedupe, settings validation, pause/resume, cancellation, assignment pickup, comment mention handling, and job log projection at the service boundary. |
| Persistence | Store tests cover event append/replay, job list filters, non-terminal dedupe lookup, status history, leases, checkpoints, worktrees, branch associations, activity, and settings. |
| Runner migration | Tests prove HTTP handlers do not run provider turns directly and can request job execution through the service. |
| Failure mapping | API tests cover invalid payload, not found job, conflict/duplicate job, storage failure, and best-effort ticket event emission failure logging. |
| Desktop composition | A desktop or integration test proves desktop starts API with lower-package Agent Work store/service construction and closes the store on shutdown. |

## 15. Definition Of Done

The migration is done when:

1. `@cycle/contracts` owns every public Agent Work DTO schema used by HTTP, renderer, and tests.
2. `@cycle/usecases` owns the Agent Work service contract used by API and desktop composition.
3. Agent Work persistence implementations are outside `@cycle/api`.
4. `@cycle/api` starts only from injected service dependencies or lower-package composition inputs.
5. `packages/api/src/agentWork/runtime.ts` is deleted.
6. `packages/api/src/agent-work/httpAdapter.ts`, if still present, imports no legacy DTOs and
   contains only mapping code.
7. `packages/api/src/http/handlers/v1/agentWorkRunner.ts` is deleted or reduced to a one-call
   adapter into the service layer.
8. `@cycle/api` no longer exports `AgentWorkRuntimeV11` or Agent Work runtime/store factories.
9. Static boundary tests and package tests pass.
10. The Agent Work HTTP endpoints used by desktop continue to function with shared contract schemas.

## 16. Open Questions

No blocking product questions remain for this boundary cleanup. The main implementation-defined
choice is whether the durable Agent Work SQLite implementation lands directly in `@cycle/database`
or in a narrower lower package. It MUST NOT remain in `@cycle/api`.
