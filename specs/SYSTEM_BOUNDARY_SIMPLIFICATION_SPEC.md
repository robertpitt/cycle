# Cycle System Boundary Simplification Specification

Status: Draft implementation specification

Version: 0.1.0

Date: 2026-07-08

Scope: `packages/*`, root architecture documentation, and package boundary tests

## 1. Purpose

This specification defines the breaking architecture cleanup required to make Cycle easier to
compose, test, run in the background, and evolve without accumulating compatibility facades.

The target is a smaller, clearer system where:

- `@cycle/backend` is the isolated local application backend and future daemon boundary.
- `@cycle/api` is a transport adapter, not a runtime composition package.
- `@cycle/contracts` contains schema-backed data contracts, not live service objects.
- `@cycle/agent-chat` is an Effect-managed service with scoped execution and typed failures.
- `@cycle/desktop` renderer code imports only browser-safe packages.
- package exports are intentional and breaking cleanup is preferred over compatibility barrels.
- architecture documentation has one current source of truth plus focused subordinate specs.

This is an implementation-specific spec for the current TypeScript, Effect v4, Electron, and
workspace package architecture.

## 2. Normative Language

The keywords `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are
to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the concrete mechanism, but it MUST
document the choice and expose enough information for tests, package consumers, and maintainers to
reason about the behavior.

## 3. Problem Statement

Cycle already has the right conceptual layers, but the current implementation lets runtime
composition, transport contracts, renderer state, package barrels, and live services bleed into each
other.

The main design problems are:

- `@cycle/contracts` contains contract shapes that permit live service objects, such as repository
  open payloads with opaque `store` values.
- `@cycle/api` constructs default agent, chat, MCP, and usecase runtime pieces even though backend
  should own application composition.
- `@cycle/backend` exists, but it still bridges into API through Promise callback bags and does not
  yet present a clean daemon-ready application runtime boundary.
- `@cycle/agent-chat` uses Promise-returning runtime methods and detached async work instead of
  Effect services, scoped fibers, and typed error channels.
- `@cycle/desktop` renderer imports types and schemas from backend/config/agent packages that are
  not guaranteed to be browser-safe and may pull Node-only dependencies over time.
- broad root barrels and package exports make internal modules look public and preserve accidental
  APIs.
- several architecture specs overlap, which makes it unclear which rules are current.

These problems create unnecessary code: adapters that translate around weak contracts, renderer
switch statements that duplicate API routing, compatibility exports, callback bridges, and
documentation that describes migrations instead of the intended system.

## 4. Goals

The implementation MUST:

1. Make `@cycle/backend` the only local application backend composition package.
2. Keep `@cycle/api` focused on HTTP, WebSocket, OpenAPI, authentication, response envelopes, and
   MCP transport adaptation.
3. Remove live service objects from public contracts and transport payload schemas.
4. Replace compatibility barrels, stale subpaths, alias-driven public facades, and accidental root
   exports with explicit package-owned exports.
5. Convert `@cycle/agent-chat` to an Effect service with scoped provider execution, typed errors,
   explicit store layers, and bounded event fan-out.
6. Keep renderer code browser-safe by restricting it to browser-safe contracts, UI components, and a
   generated or declared API client surface.
7. Align package layout with the local `AGENTS.md` guidance: focused root service files,
   `src/internal` or `src/internals` for implementation details, and `src/testing` for test layers.
8. Consolidate architecture documentation so the current target is easy to find and stale specs are
   either updated, marked superseded, or removed.
9. Preserve product behavior unless the behavior exists only to support an accidental architecture
   surface.
10. Keep all side effects, resources, background work, and boundary calls represented deliberately
    through Effect, layers, scoped fibers, or typed boundary adapters.

The implementation SHOULD:

1. Prefer deleting transitional code over preserving compatibility when consumers are inside this
   monorepo.
2. Migrate package-by-package with focused mechanical changes before altering product behavior.
3. Add boundary checks after each phase is implemented, rather than adding broad tests that fail
   before the corresponding migration is complete.
4. Keep migration commits small enough that package ownership changes are reviewable.

## 5. Non-Goals

This specification MUST NOT:

1. Implement the future installed-app daemon workflow where desktop discovers an already-running
   backend or forks `cycle backend start`.
2. Require background automation, schedules, or monitors to run while the desktop app is closed in
   this phase.
3. Redesign Cycle's ticket, GitDB, projection, MCP tool, or provider feature set.
4. Require a hosted remote backend, account system, cloud scheduler, or multi-tenant service.
5. Preserve old root exports, stale subpaths, or compatibility wrappers unless a migration blocker
   is documented in this spec.
6. Add a new package only to paper over ownership confusion that can be solved by moving code to an
   existing owner.
7. Require all pure helpers to become services.
8. Add conformance tests that intentionally fail against known in-progress drift before the
   relevant migration phase is implemented.

## 6. System Overview

### 6.1 Target Package Graph

The target dependency direction is:

```text
@cycle/git
  -> effect, @effect/platform-node where required

@cycle/git-db
  -> @cycle/git
  -> effect, @effect/platform-node where required

@cycle/sqlite
  -> effect, @effect/platform-node, @effect/sql-sqlite-node

@cycle/contracts
  -> effect

@cycle/config
  -> @cycle/contracts only for browser-safe schema values
  -> effect, @effect/platform-node only in Node-specific modules

@cycle/database
  -> @cycle/contracts
  -> @cycle/git-db
  -> @cycle/sqlite
  -> effect

@cycle/agents
  -> @cycle/contracts
  -> @cycle/sqlite when owning agent persistence
  -> @cycle/codex-app-server for Codex provider integration
  -> effect, @effect/platform-node where required

@cycle/agent-chat
  -> @cycle/agents
  -> @cycle/sqlite
  -> @cycle/contracts for shared DTO schemas where needed
  -> effect

@cycle/usecases
  -> @cycle/contracts
  -> @cycle/database
  -> @cycle/agents only for agent-work workflow services
  -> effect

@cycle/api
  -> @cycle/contracts
  -> @cycle/usecases
  -> @cycle/agents and @cycle/agent-chat service contracts
  -> @cycle/logging
  -> effect, @effect/platform-node for server entrypoints

@cycle/backend
  -> @cycle/api
  -> @cycle/config
  -> @cycle/database
  -> @cycle/git
  -> @cycle/git-db
  -> @cycle/sqlite
  -> @cycle/usecases
  -> @cycle/agents
  -> @cycle/agent-chat
  -> @cycle/logging
  -> effect, @effect/platform-node

@cycle/desktop main/preload
  -> @cycle/backend
  -> @cycle/config shared browser-safe types where needed
  -> @cycle/logging
  -> Electron and Effect platform services

@cycle/desktop renderer
  -> @cycle/ui
  -> @cycle/contracts
  -> browser-safe generated or declared API client types
  -> React libraries

@cycle/ui
  -> React, styling, component primitives, visual utilities
```

No package MAY import a higher layer. No renderer source file MAY import a package module that
depends on `NodeServices`, Node built-ins, Electron main-process APIs, Git, SQLite, or backend
runtime services.

### 6.2 Runtime Shape

The long-term installed application shape is:

```text
Desktop app startup
  -> discover running backend
  -> connect to running backend if available
  -> otherwise ask a host launcher to start `cycle backend start`
  -> renderer communicates through local API only

Background backend process
  -> owns database, workspace, agent work, chat, API server, hosted MCP, automation, schedules
  -> remains alive independently from desktop windows
```

This phase MUST prepare the backend boundary for that shape, but MUST NOT implement process
discovery, process forking, daemon supervision, or always-running schedules.

### 6.3 Main Components

`@cycle/backend` owns:

- backend runtime lifecycle;
- local settings and app config adaptation;
- repository workspace registration;
- database layer construction;
- repository bootstrap and sync supervision;
- agent provider detection and profile enrichment;
- agent runtime, agent work, and agent task services;
- agent chat runtime and chat store;
- API server startup;
- hosted MCP startup through API;
- runtime discovery file writing where applicable;
- backend status and structured logs.

`@cycle/api` owns:

- Effect `HttpApi` definitions;
- HTTP route handlers;
- WebSocket protocol validation and response mapping;
- auth middleware and request context middleware;
- OpenAPI generation;
- API response envelopes and transport errors;
- MCP stdio/http transport adaptation to local API operations.

`@cycle/api` MUST NOT own:

- default backend runtime composition;
- durable stores;
- agent provider service construction;
- chat store construction;
- workspace repository opening;
- long-running background scheduling.

`@cycle/desktop` owns:

- Electron app lifecycle;
- native windows, menus, shell integration, preload bridge, and renderer hosting;
- user-facing startup screens and connection status;
- forwarding renderer requests to the local backend API.

`@cycle/desktop` MUST NOT own reusable backend services, durable storage contracts, GitDB store
construction, workflow policy, agent provider execution, or backend scheduling.

## 7. Package Boundary Requirements

### 7.1 Public Export Rules

Every package MUST have an intentional public export map in `package.json`.

Package roots MUST export only symbols owned by that package. A package root MUST NOT re-export
another package's types, schemas, services, layers, constants, or helpers as a convenience facade.

Wildcard root barrels such as `export * from "./SomeLargeModule.ts"` SHOULD be removed unless the
module is the package-owned stable public surface. The root barrel MAY re-export package-owned
families in `@cycle/ui`, because UI intentionally exposes grouped component families.

Public subpaths MUST point to package-owned root source files or package-owned public directories
such as `src/testing`. Public subpaths MUST NOT point to `src/internal/*` or `src/internals/*`.

Compatibility wrapper files MUST be deleted during this cleanup unless a blocker is documented with:

- the remaining consumer;
- why the consumer cannot move in the same phase;
- the planned removal phase.

### 7.2 Source Layout

Each package SHOULD follow this layout:

```text
packages/<name>/src/
  index.ts
  PrimaryService.ts
  SecondaryService.ts
  PackageSchemas.ts
  PackageErrors.ts
  internal/ or internals/
    helper.ts
  testing/
    index.ts
```

A root source file that defines a `Context.Service` MUST be named after that service and SHOULD
export the service shape, live layer, and any narrowly related helper types.

Internal implementation files MUST use relative imports. A production source file MUST NOT import
its own package through `@cycle/<package>`.

### 7.3 Boundary Checks

After each migration phase is implemented, that phase MUST add or update tests, lint checks, or
static import scans that enforce the completed boundary.

The project MUST NOT add broad failing checks before the corresponding phase has been migrated.
Boundary checks SHOULD be phase-scoped and monotonic: once a boundary is implemented, later changes
must not regress it.

### 7.4 Effect v4 Implementation Rules

Implementation work under this spec MUST follow the repository `AGENTS.md` Effect v4 rules.

In particular:

- multi-step Effect code MUST prefer `Effect.gen`;
- reusable functions that return effects SHOULD use `Effect.fn("functionName")` with names matching
  the exported function;
- early failure inside `Effect.gen` or `Effect.fn` MUST use `return yield* new MyError(...)` or
  `return yield* Effect.fail(...)` so TypeScript understands execution does not continue;
- synchronous and asynchronous boundary code MUST be wrapped deliberately with `Effect.sync`,
  `Effect.try`, or `Effect.tryPromise`;
- thrown or rejected causes at package boundaries MUST be mapped into typed package errors;
- recoverable errors MUST use `Schema.TaggedErrorClass` or `Schema.ErrorClass`;
- public runtime capabilities MUST use `Context.Service` and return implementations with
  `Service.of`;
- layers MUST be focused and composed with `Layer.provide`, `Layer.provideMerge`, or
  `Layer.mergeAll`;
- resources MUST be acquired and released with scoped layers, `Effect.acquireRelease`, or
  finalizers;
- background jobs MUST run in scoped fibers or layer-managed background effects;
- keyed dynamic resources such as repository runtimes SHOULD use `LayerMap.Service` or an
  equivalent Effect-managed resource map instead of ad hoc unbounded caches;
- application entrypoints SHOULD use `NodeRuntime.runMain`, `BunRuntime.runMain`, `Layer.launch`, or
  a host-owned managed runtime;
- HTTP contracts MUST remain schema-first with `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`, and
  `Schema` values outside route implementation code;
- configuration MUST be read through `Config`, `ConfigProvider`, or package-owned config services,
  not raw `process.env` reads inside business logic.

## 8. Contract Ownership

### 8.1 Schema-First Contracts

All public data crossing package, process, HTTP, WebSocket, MCP, preload, or renderer boundaries
MUST have an Effect `Schema` value and a derived TypeScript type.

Contract schemas MUST describe serializable data. A contract schema MUST NOT contain:

- live services;
- functions;
- class instances;
- file handles;
- database handles;
- `Context.Service` implementations;
- GitDB store implementations;
- provider runtime objects.

`Schema.Unknown` MAY be used only for explicitly opaque JSON-compatible extension payloads. When
used, the owning schema MUST document why the field is opaque and which component interprets it.
`Schema.Unknown` MUST NOT be used to smuggle service dependencies through a public contract.

### 8.2 Repository Opening

The current repository open shape that permits an opaque `store` field MUST be removed from public
application contracts.

The public API for opening or registering a repository MUST accept serializable input only:

- repository path;
- optional display name;
- optional repository id when selecting an existing configured repository;
- optional sync-on-open preference.

The backend MUST resolve that serializable input into:

- Git repository metadata;
- GitDB store layer or service;
- database repository input;
- workspace record.

`@cycle/usecases` MUST NOT cast public contract input into database service input to recover hidden
runtime fields. If a usecase needs a live dependency, the dependency MUST be supplied through the
Effect environment, not through input payload data.

### 8.3 Database and Contract Alignment

`@cycle/database` SHOULD consume canonical shared schemas from `@cycle/contracts` for app-facing
documents, pages, query inputs, and response DTOs.

Database-internal rows, projection cursors, fold state, and storage implementation details MAY remain
package-owned and private.

Usecases SHOULD not normalize database output into contract output as a repeated adapter step. The
preferred target is:

1. database returns app-facing DTOs that already satisfy `@cycle/contracts` schemas; or
2. database exposes a clearly named mapper owned by `@cycle/database`; and
3. usecases apply workflow policy, not structural DTO repair.

## 9. Backend Runtime Contract

### 9.1 Backend Ownership

`@cycle/backend` MUST expose a primary `BackendRuntime` service that can be launched by desktop,
CLI, tests, and a future daemon host.

The service MUST own or compose:

- app config and local settings;
- local workspace repository registry;
- database projection and GitDB store creation;
- repository bootstrap and remote sync supervision;
- agent provider detection;
- agent provider service registry;
- agent runtime and agent work services;
- agent task store and service;
- agent chat store and runtime;
- API server and hosted MCP endpoint;
- backend status reporting;
- resource finalizers.

The backend runtime MUST be representable as an Effect layer. Long-running background work MUST be
forked with `Effect.forkScoped` or started through `Layer.effectDiscard` so it is interrupted when
the backend scope closes.

### 9.2 Daemon-Ready Constraints

Even though daemon startup is out of scope, the backend MUST be designed so a later host can run it
out of process without moving service ownership again.

The backend runtime MUST:

- avoid Electron dependencies;
- avoid renderer dependencies;
- avoid process-global mutable state where a scoped service can own state instead;
- expose enough status for a desktop client to decide whether it is connected, disconnected,
  degraded, starting, or failed;
- make shutdown idempotent;
- close stores, servers, subscriptions, fibers, and runtime discovery files through finalizers;
- keep backend configuration expressible through `Config`, `ConfigProvider`, constructor options, or
  explicit service layers.

The backend runtime SHOULD support an in-process test launch and an in-process desktop launch during
this phase. A later daemon host MAY reuse the same runtime without changing backend service
ownership.

### 9.3 Backend Status Surface

`BackendRuntime.status` MUST report at least:

- lifecycle: `stopped`, `starting`, `running`, `degraded`, `failed`, or `stopping`;
- API state: disabled, starting, running, failed, host, port, base URL, MCP URL when available;
- repository bootstrap state;
- active repository summaries;
- agent provider summary;
- active agent work/task summary;
- last failure with safe message and category;
- updated timestamp.

Status MUST NOT expose secrets, bearer tokens, raw provider credentials, or full prompt payloads.

## 10. API Transport Contract

### 10.1 API Responsibilities

`@cycle/api` MUST remain the owner of the schema-first HTTP API definition. Endpoint params, query,
payload, success, and error shapes MUST be modeled with `Schema`.

Route handlers MUST:

- decode transport input through the endpoint schema or a schema-derived helper;
- read typed services from the Effect context;
- call usecases or backend-provided service ports;
- map typed successes into response envelopes;
- map typed failures into HTTP errors;
- avoid constructing default backend services.

### 10.2 API Runtime Dependencies

API runtime dependencies MUST be supplied as Effect services or explicit layer inputs.

Promise callback bags MAY exist only at framework boundaries where a browser, Electron bridge, HTTP
handler, or external library requires Promise APIs. Those adapters MUST be thin and MUST map
failures into typed errors or response envelopes immediately.

`@cycle/api` MUST NOT call `Effect.runPromise` inside reusable service implementation logic. It MAY
use `NodeRuntime.runMain` for executable entrypoints and MAY use `Effect.runPromise` in test helpers
or external framework adapters where lifecycle ownership is explicit.

### 10.3 Typed Client

The renderer-facing API client SHOULD be generated or derived from `CycleHttpApi` with
`HttpApiClient.make` or an equivalent browser-safe typed client.

The renderer MUST NOT manually maintain a second routing table that maps usecase aliases to REST
paths. Usecase aliases MAY exist for MCP or CLI compatibility only when they are owned by the
usecase contract package and do not become a renderer facade.

## 11. Agent Chat Runtime Contract

### 11.1 Service Shape

`@cycle/agent-chat` MUST expose `AgentChatRuntime` as a `Context.Service`.

Runtime methods MUST return `Effect.Effect<Success, AgentChatError, Requirements>` rather than raw
Promises. The package MAY expose Promise adapters only for API or WebSocket integration boundaries.

The package MUST define recoverable errors with `Schema.TaggedErrorClass` or `Schema.ErrorClass`.
Errors MUST include stable tags and safe messages for:

- invalid payload;
- thread not found;
- turn already active;
- store unavailable;
- store failure;
- provider unavailable;
- provider execution failure;
- cancellation failure;
- unsupported operation.

### 11.2 Store and Event Bus

`AgentChatStore` MUST be an Effect service or service-compatible layer. SQLite-backed chat storage
MUST be acquired and released through scoped layers.

The chat event bus MUST use bounded `PubSub` or another bounded Effect-native primitive. Fan-out
MUST not use an unbounded Promise listener set for core runtime behavior.

Event records and store records crossing package boundaries MUST have schemas. SQLite row mappers
MUST remain internal.

### 11.3 Turn Execution

Starting a chat turn MUST create a scoped fiber or register work with a backend-owned runtime
supervisor. The runtime MUST NOT use detached `void asyncFunction()` calls for provider execution.

Turn lifecycle states SHOULD include:

- queued;
- running;
- waiting-for-user;
- completed;
- failed;
- cancelled.

Transitions MUST be persisted before events are published. If event publication fails after state is
persisted, the runtime MUST retain enough persisted sequence state for clients to reconcile.

Cancellation MUST:

- signal the provider through an `AbortController` or provider-specific cancellation operation;
- clear active-turn indexes;
- persist terminal or stale-cleared state;
- publish a cancellation event when possible;
- be idempotent for already-terminal turns.

### 11.4 Provider Integration

Agent chat MUST call provider services through `@cycle/agents` service contracts. Provider-specific
event projection MAY be internal to `@cycle/agent-chat`, but provider execution and provider
capability ownership MUST remain in `@cycle/agents`.

Prompt assembly MAY remain in `@cycle/agent-chat` if it is chat-specific. Shared agent prompt
policy MUST live in `@cycle/agents` or `@cycle/usecases`, depending on whether it is provider policy
or workflow policy.

## 12. Renderer Boundary

### 12.1 Allowed Imports

Production renderer source MAY import:

- `@cycle/ui`;
- `@cycle/contracts` and `@cycle/contracts/schemas`;
- a browser-safe API client package or subpath that does not import Node services;
- browser-safe React and UI dependencies;
- local renderer files.

Production renderer source MUST NOT import:

- `@cycle/backend`;
- `@cycle/database`;
- `@cycle/git`;
- `@cycle/git-db`;
- `@cycle/sqlite`;
- `@cycle/agents`, unless a browser-safe schema-only subpath is explicitly created and verified;
- `@cycle/config`, unless a browser-safe schema-only subpath is explicitly created and verified;
- `@cycle/usecases`, unless a browser-safe contract-only subpath is explicitly created and verified;
- `@effect/platform-node`;
- Node built-ins;
- Electron main-process modules.

The preferred direction is to move browser-safe shared DTOs into `@cycle/contracts`, then have
renderer imports come from contracts and the generated API client only.

### 12.2 Preload Boundary

The preload bridge MUST expose narrow browser-safe methods. It MUST NOT expose backend service
objects, Effect runtimes, Node service handles, GitDB stores, or arbitrary filesystem access.

Preload payloads MUST be serializable and schema-backed when they cross the renderer boundary.

## 13. Configuration and Environment

Business logic MUST read configuration through `Config`, `ConfigProvider`, service options, or
package-owned config services. Raw `process.env` reads MUST be limited to executable entrypoints,
provider boundary adapters, or configuration loaders.

Secrets MUST be represented with redacted config values where supported. Logs MUST redact:

- bearer tokens;
- API keys;
- authorization headers;
- provider credentials;
- URLs containing credentials;
- prompt or tool payload fragments marked sensitive.

Invalid config values SHOULD fail fast. Defaults SHOULD be applied only for missing keys, not for
malformed values.

## 14. Documentation Consolidation

This specification is the current source of truth for system boundary simplification.

The implementation MUST review existing architecture specs and classify each one as:

- current and referenced by this spec;
- subordinate feature detail;
- superseded by this spec;
- obsolete and removable.

Superseded specs MUST be updated with a short notice at the top that points to this spec, or removed
when no longer useful.

Root architecture documentation SHOULD be reduced to:

- a concise package graph;
- current ownership rules;
- links to current subordinate specs;
- migration status.

Long historical migration plans SHOULD move into archived notes or be deleted if they no longer
describe intended behavior.

## 15. Failure Model and Recovery

Each package MUST map recoverable failures into package-owned typed errors. Cross-package boundaries
MUST not leak arbitrary thrown values as the primary error contract.

Backend startup failures MUST:

- leave status readable;
- include a safe message and failure category;
- release partially acquired resources;
- avoid leaving stale runtime discovery files when possible.

API request failures MUST:

- return a typed response envelope;
- include request id when available;
- avoid exposing secrets or raw internal stack traces;
- preserve enough cause information in logs for debugging.

Agent chat and agent work failures MUST:

- persist terminal or recoverable waiting state before returning success to callers;
- make active-run cleanup idempotent;
- expose restart reconciliation hooks where work can outlive one request.

Repository sync/bootstrap failures MUST:

- mark the affected repository degraded or failed without crashing the whole backend when possible;
- keep other repositories usable;
- expose per-repository error status.

## 16. Observability

Structured logs MUST include:

- service name;
- component name;
- request id or run id when available;
- repository id when applicable;
- thread id or task id when applicable;
- operation name;
- failure tag or category on failure.

Backend status MUST be queryable without a debugger. API, MCP, repository bootstrap, agent runtime,
and chat runtime SHOULD expose enough state for desktop to show whether the backend is usable,
starting, degraded, or failed.

Metrics are optional in this phase, but the implementation SHOULD avoid designs that make later
metrics difficult, such as hidden detached work with no service-owned lifecycle.

## 17. Security and Operational Safety

The local API and hosted MCP endpoint MUST bind only to loopback hosts unless a separate security
spec approves a broader network binding.

Bearer tokens and runtime discovery files MUST remain local-machine trust-boundary mechanisms. A
future daemon workflow MUST preserve restrictive file permissions, but implementing that workflow is
out of scope here.

Renderer code MUST not gain direct Node, Git, SQLite, or backend service access as part of this
cleanup.

Filesystem paths accepted from users MUST be validated at the backend boundary before Git, GitDB,
SQLite, or provider services use them.

Provider execution, command execution, MCP tools, and future automation MUST remain behind explicit
authority and approval policy services.

## 18. Reference Workflows

### 18.1 Backend Launch

```text
BackendRuntime.start(options):
  read backend config through Config/service options
  acquire scoped backend resources:
    app config
    settings
    workspace
    database
    repository bootstrap
    agent stores
    agent runtime/services
    agent chat runtime/store
    api server with hosted MCP
  fork scoped background loops
  write runtime discovery file if configured
  set lifecycle running
  return BackendHandle

on failure:
  set lifecycle failed
  record safe failure status
  release acquired resources
  fail with BackendError

on close:
  set lifecycle stopping
  release scope
  remove/expire discovery file where applicable
  set lifecycle stopped
```

### 18.2 API Request

```text
HTTP request:
  endpoint schema decodes params/query/payload
  middleware authenticates and creates request context
  handler reads required Effect services
  handler calls usecase or backend service
  typed success is encoded into response envelope
  typed failure is mapped into API error envelope
  logs include request id, operation, status, failure tag
```

### 18.3 Repository Open

```text
POST /v1/repositories with { path, displayName?, syncOnOpen? }:
  API decodes serializable payload
  backend workspace service validates path and metadata
  backend creates GitDB store layer/service internally
  database opens repository with live store dependency from Effect environment
  usecase records workflow result
  API returns RepositoryStatus
```

No public payload contains a GitDB store object.

### 18.4 Agent Chat Turn

```text
AgentChatRuntime.sendTurn(input):
  validate input with schema
  acquire thread lock or active-turn registration
  persist user message and queued turn
  publish persisted events
  fork scoped provider execution fiber
  return accepted turn snapshot

provider fiber:
  mark turn running
  assemble prompt and provider request
  stream provider events
  persist event-derived messages/activity/questions
  publish sequence events
  persist terminal completed/failed/cancelled state
  release active-turn registration
```

No provider execution is detached from the runtime scope.

## 19. Migration Plan

### Phase 0: Documentation Baseline

1. Add this spec.
2. Add a documentation index or update root architecture docs to point here.
3. Mark clearly superseded architecture specs.

Exit criteria:

- there is one visible current system-boundary spec;
- stale specs are not presented as current requirements.

### Phase 1: Public Surface Cleanup

1. Audit `package.json` exports for every package.
2. Delete stale subpaths and broad compatibility wrappers.
3. Shrink root barrels to package-owned stable exports.
4. Remove production self-imports from package source.
5. Move package test helpers under `src/testing`.

Exit criteria:

- every public export maps to a supported package-owned file;
- no production source imports its own package root;
- root barrels do not re-export another package's symbols as facades.

### Phase 2: Contract Cleanup

1. Remove live service objects from `@cycle/contracts` schemas.
2. Replace repository-open public input with serializable path/id input.
3. Move GitDB store construction into backend workspace/database composition.
4. Align database app-facing DTOs with contract schemas.

Exit criteria:

- no public contract schema uses `Schema.Unknown` for live service values;
- `RepositoryOpen` no longer casts contract input into database service input;
- repository opening still works through desktop/API tests.

### Phase 3: Backend Isolation

1. Move default runtime construction out of API and into backend.
2. Ensure backend owns agent task, agent runtime, chat runtime, API server, hosted MCP, and
   repository bootstrap composition.
3. Expose backend status suitable for a future desktop-to-daemon connection.
4. Ensure backend startup and shutdown are scoped and idempotent.

Exit criteria:

- API can be constructed only from injected services/layers;
- backend can launch the full local backend in process;
- desktop main depends on backend for local app services;
- backend has no Electron or renderer imports.

### Phase 4: API Transport Thinning

1. Keep route definitions, handlers, middleware, OpenAPI, WebSocket protocol, and MCP transport in
   API.
2. Remove API-owned fallback service construction.
3. Replace Promise callback bags with Effect services where reusable runtime logic is involved.
4. Keep Promise adapters only at framework boundaries.

Exit criteria:

- API route handlers are transport adapters over injected services;
- API package tests pass without API constructing backend defaults;
- API server startup remains loopback-only and schema-first.

### Phase 5: Agent Chat Effect Runtime

1. Rename public files to package-owned canonical names.
2. Define `AgentChatRuntime`, `AgentChatStore`, typed errors, and event bus as Effect services or
   service-compatible layers.
3. Replace detached provider execution with scoped fibers or backend runtime supervision.
4. Convert store operations and runtime methods to `Effect`.
5. Keep WebSocket protocol ownership in API.

Exit criteria:

- agent chat runtime has no detached async provider execution;
- chat resources are acquired/released through scoped layers;
- API chat handlers adapt from HTTP/WebSocket to Effect runtime calls;
- existing chat behavior remains covered by tests.

### Phase 6: Renderer Browser-Safe Boundary

1. Move browser-safe shared types from config/agents/backend/usecases into contracts or a
   browser-safe API client surface.
2. Replace renderer alias-to-route switch logic with generated or declared API client operations.
3. Add a renderer import boundary check after migration.

Exit criteria:

- renderer production source imports no Node-capable package modules;
- renderer API calls compile against the shared API definition or browser-safe client;
- desktop renderer build does not include `NodeServices`, Git, SQLite, backend, or Electron main
  code.

### Phase 7: Documentation Reconciliation

1. Review root and `specs/*` architecture documents.
2. Mark superseded specs or remove obsolete ones.
3. Keep feature-specific specs only when they describe current subordinate behavior.

Exit criteria:

- documentation does not contain competing current package graphs;
- contributors can identify the current architecture rules from root docs and this spec.

## 20. Validation Matrix

| Area               | Required validation                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript         | `pnpm typecheck` passes after each phase.                                                                                                                    |
| Formatting/lint    | Root `pnpm check` or equivalent package checks pass when the phase changes formatting or imports.                                                            |
| Package exports    | Phase-specific tests prove public exports map to real package-owned files.                                                                                   |
| API self-imports   | After Phase 1, API production source has no `@cycle/api` self-imports.                                                                                       |
| Contract purity    | After Phase 2, public contract schemas contain no live service fields.                                                                                       |
| Backend isolation  | After Phase 3, backend imports no desktop, renderer, UI, or Electron modules.                                                                                |
| API transport      | After Phase 4, API tests prove routes work with injected services and without backend default construction.                                                  |
| Agent chat runtime | After Phase 5, tests cover successful turn, provider failure, cancellation, restart/reconciliation hook, and event publication.                              |
| Renderer boundary  | After Phase 6, static import checks reject backend/config/agents/usecases/git/sqlite imports from renderer production source unless explicitly browser-safe. |
| Docs               | After Phase 7, root docs and specs do not present conflicting current architecture rules.                                                                    |

## 21. Definition of Done

The boundary simplification is complete when:

1. backend is the isolated local application runtime and can later be hosted as a daemon without
   moving ownership again;
2. API is transport-only and no longer constructs default app runtime services;
3. public contracts are serializable and schema-backed;
4. repository opening no longer passes GitDB stores through contracts;
5. agent chat is Effect-managed and scoped;
6. renderer imports are browser-safe;
7. package exports are explicit and package-owned;
8. stale compatibility barrels and subpaths are removed;
9. architecture docs are consistent;
10. phase-specific validation passes.
