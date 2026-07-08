# @cycle/backend Runtime Extraction Specification

Status: Draft implementation specification

Version: 0.1.0

Date: 2026-07-07

Target package: `@cycle/backend`

## 1. Purpose

`@cycle/backend` is the reusable local backend runtime for Cycle. It composes the database,
repository workspace, REST API, hosted MCP endpoint, agent runtime, chat runtime, background tasks,
and streaming infrastructure into one Effect-managed service that can be launched by desktop, CLI,
tests, or future host applications.

The package MUST extract backend composition currently embedded in `@cycle/desktop` and
`@cycle/api` option assembly without importing Electron, React, renderer code, or CLI command
parsing. Host applications provide global platform layers and host-specific shell behavior;
`@cycle/backend` owns the application backend services.

## 2. Normative Language

The keywords `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are
to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the internal mechanism, but it MUST
document the choice and expose enough information for package consumers, tests, and operators to
reason about the behavior.

## 3. Problem Statement

Cycle currently has reusable lower-level packages for contracts, config, database, usecases, API,
agent services, chat, Git, and GitDB. The long-running application composition is still split across
desktop and API code:

- `@cycle/desktop` starts the local API server, creates SQLite-backed stores, resolves app paths,
  opens repositories, adapts app settings, reacts to write usecases, and starts background
  repository bootstrap work.
- `@cycle/api` owns HTTP routes, WebSocket routes, hosted MCP mounting, OpenAPI generation,
  authorization, and `CycleApiRuntime`, but it also builds fallback agent/chat runtime pieces from
  raw option objects.
- `@cycle/cli` currently acts as a client of a discovered API and cannot launch the reusable
  backend runtime.

This makes the desktop package too large and makes future entrypoints depend on desktop-only
composition if they need a running API, MCP server, database, task runner, or agent runtime.

Cycle needs one backend package that owns application runtime composition and leaves only shell
concerns to entrypoints.

## 4. Goals

`@cycle/backend` MUST:

1. Provide a new package under `packages/backend`.
2. Compose the reusable local Cycle backend as an Effect v4 runtime.
3. Depend on reusable Cycle packages and MUST NOT depend on `@cycle/desktop`, `@cycle/ui`, Electron,
   React, or CLI command parsing.
4. Expect host applications to provide global platform layers such as Node services, logging,
   config providers, and process lifecycle wiring.
5. Own backend-local app services that are not Electron-specific: database lifecycle, repository
   workspace registration, repository bootstrap, API startup, hosted MCP startup, agent stores,
   agent task service, chat store/runtime, local settings mutation, runtime discovery, and
   background fibers.
6. Use the existing persisted defaults unless explicitly overridden:
   - `~/.cycle/app-config.json`
   - `~/.cycle/cycle.db`
   - `~/.cycle/agent-task-worktrees`
   - the current per-user API runtime discovery file behavior
7. Provide a backend runtime that can be launched from:
   - the Electron desktop main process;
   - a new CLI command such as `cycle backend start`;
   - tests;
   - future custom local applications.
8. Keep the hosted HTTP MCP endpoint mounted with the API server.
9. Keep stdio MCP as a thin REST client that discovers and calls an already-running backend/API.
10. Preserve local-first security: loopback binding, static bearer token auth, runtime discovery
    files with restrictive permissions, and no public network service by default.
11. Manage resources through Effect scopes, layers, and finalizers so stores, servers, background
    fibers, and runtime discovery files shut down cleanly.
12. Emit enough structured status and logs for desktop, CLI, tests, and operators to diagnose API,
    repository, agent, and task failures without attaching a debugger.

## 5. Non-Goals

`@cycle/backend` MUST NOT:

1. Own Electron app lifecycle, BrowserWindow management, preload bridges, native theme sync,
   desktop IPC, app menus, shell-open behavior, or renderer state.
2. Own CLI command parsing, output formatting, stdin prompts, or normal CLI API-client commands.
3. Own HTTP route definitions, WebSocket protocol definitions, OpenAPI schemas, or MCP tool
   definitions currently owned by `@cycle/api`.
4. Own domain workflow policy already owned by `@cycle/usecases`.
5. Own durable ticket, projection, GitDB, or Git primitives already owned by `@cycle/database`,
   `@cycle/git-store`, and `@cycle/git`.
6. Make stdio MCP start a second backend implicitly.
7. Introduce hosted, remote, or multi-tenant backend behavior.
8. Preserve deprecated desktop-owned backend APIs as long-term public contracts. Breaking changes
   are acceptable because Cycle is unreleased.

## 6. System Overview

### 6.1 Target Position

The target package graph is:

```text
@cycle/contracts
@cycle/config
@cycle/git
@cycle/git-store
@cycle/database
@cycle/usecases
@cycle/agents
@cycle/agent-chat
@cycle/api
        |
        v
@cycle/backend
        |
        +--> @cycle/desktop main process
        +--> @cycle/cli backend start command
        +--> tests and future local hosts
```

Dependency rules:

- `@cycle/backend` MAY depend on `@cycle/api`, `@cycle/config`, `@cycle/database`, `@cycle/git`,
  `@cycle/git-store`, `@cycle/usecases`, `@cycle/agents`, `@cycle/agent-chat`, `@cycle/logging`,
  `@cycle/sqlite`, `effect`, and `@effect/platform-node` types or services.
- `@cycle/backend` MUST NOT depend on `@cycle/desktop`, `@cycle/ui`, Electron, React, or CLI command
  modules.
- `@cycle/api` MUST NOT depend on `@cycle/backend`.
- `@cycle/desktop` MAY depend on `@cycle/backend`.
- `@cycle/cli` MAY depend on `@cycle/backend` only for backend-launch commands. Normal commands
  such as `cycle issues list` SHOULD continue to use API discovery and REST client behavior.

### 6.2 Runtime Shape

`@cycle/backend` composes the backend service:

```text
Host application
  - provides global layers
  - chooses process lifecycle
  - launches backend layer/effect
        |
        v
@cycle/backend
  - app config and local settings
  - local workspace repository registry
  - database projection
  - repository bootstrap/sync/push supervision
  - agent runtime services and stores
  - agent task service
  - chat runtime and store
  - API server and hosted MCP endpoint
  - runtime discovery file
  - backend status and structured logs
        |
        v
@cycle/api
  - REST, WebSocket, OpenAPI, hosted HTTP MCP routes
```

### 6.3 Global Layers

Host applications MUST provide global layers instead of `@cycle/backend` hiding them internally.
Global layers include:

- `NodeServices.layer` or equivalent platform services for filesystem, path, config, crypto, clock,
  and networking.
- The repository's logging layer, configured with the host's logging policy.
- Process lifecycle or shutdown signal handling.
- Any host-specific config provider overrides used for tests or custom launches.

`@cycle/backend` MAY export convenience layer factories for common Node hosts, but the primary
runtime contract MUST remain composable with caller-provided global layers.

## 7. Public Package Contract

### 7.1 Source Layout and File Naming

`@cycle/backend` source layout MUST follow the `@cycle/git` and `@cycle/git-store` package convention:
most implementation files live directly under `src/`, files are named after the service or public
boundary they export, and a service file owns its service contract plus live and test layers when
those layers are available.

The package MUST use this shape:

```text
packages/backend/src/
  index.ts
  BackendApi.ts
  BackendConfig.ts
  BackendDatabase.ts
  BackendErrors.ts
  BackendRuntime.ts
  BackendSchemas.ts
  BackendTesting.ts
  LocalSettings.ts
  LocalWorkspace.ts
  RepositoryBootstrap.ts
  internals/
    *.ts
```

Required file rules:

- A root source file that defines a `Context.Service` MUST be named after that service. For
  example, `LocalWorkspace.ts` MUST define and export `LocalWorkspace`.
- The same service file MUST export the service shape type, public input/output types, live layer,
  and test layer or fixture layer when available. For example, `LocalWorkspace.ts` SHOULD export
  `LocalWorkspace`, `LocalWorkspaceLive`, and `LocalWorkspaceTest`.
- Root source files that do not define a service MUST still be named after a coherent public
  boundary, for example `BackendErrors.ts`, `BackendSchemas.ts`, or `BackendTesting.ts`.
- The package MUST NOT create feature folders such as `src/runtime/`, `src/config/`,
  `src/workspace/`, `src/settings/`, `src/bootstrap/`, `src/database/`, or `src/errors/`.
- The only allowed source subdirectory is `src/internals/`.
- `src/internals/` MUST contain only small helpers, pure functions, native bindings, codecs, or
  functions intended to be called from explicit Effect boundaries such as `Effect.sync`,
  `Effect.try`, or `Effect.tryPromise`.
- Files in `src/internals/` MUST NOT define `Context.Service` classes, public layers, package
  barrels, durable domain contracts, or externally supported package APIs.
- Public package subpaths MAY point at root source files, but they MUST NOT point at
  `src/internals/*`.

### 7.2 Package Exports

`packages/backend/package.json` MUST expose intentional public subpaths that map to root source
files:

| Subpath                    | Target file                    | Purpose                                                           |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `@cycle/backend`           | `./src/index.ts`               | Main backend runtime, options, handle, status, and layer exports. |
| `@cycle/backend/api`       | `./src/BackendApi.ts`          | Backend API server and hosted MCP composition.                    |
| `@cycle/backend/config`    | `./src/BackendConfig.ts`       | Backend path/config resolution contracts.                         |
| `@cycle/backend/database`  | `./src/BackendDatabase.ts`     | Backend database layer and identity/id generator composition.     |
| `@cycle/backend/errors`    | `./src/BackendErrors.ts`       | Backend typed error classes.                                      |
| `@cycle/backend/runtime`   | `./src/BackendRuntime.ts`      | Runtime service, launch effects, and status contracts.            |
| `@cycle/backend/schemas`   | `./src/BackendSchemas.ts`      | Backend status, config, and transport-adjacent schemas.           |
| `@cycle/backend/settings`  | `./src/LocalSettings.ts`       | Local settings service used by API settings endpoints.            |
| `@cycle/backend/workspace` | `./src/LocalWorkspace.ts`      | Local workspace service and repository directory contracts.       |
| `@cycle/backend/bootstrap` | `./src/RepositoryBootstrap.ts` | Repository bootstrap service and status contracts.                |
| `@cycle/backend/testing`   | `./src/BackendTesting.ts`      | Deterministic test layers and fixtures.                           |

The package root SHOULD export the stable app-composition surface only. Internal implementation
modules MUST NOT be exposed as public package subpaths.

`src/index.ts` MUST be a concise public barrel over supported root files. It MUST NOT export
`src/internals/*`.

### 7.3 Primary Runtime Service

The package MUST expose a primary Effect service equivalent to:

```ts
export type BackendRuntimeShape = {
  readonly start: (
    options?: BackendStartOptions,
  ) => Effect.Effect<BackendHandle, BackendError, BackendStartRequirements>;

  readonly status: () => Effect.Effect<BackendStatus, BackendError>;
};

export class BackendRuntime extends Context.Service<BackendRuntime, BackendRuntimeShape>()(
  "@cycle/backend/BackendRuntime",
) {}
```

Required semantics:

- `start` MUST acquire all long-lived resources in the current scope.
- `start` MUST register finalizers for the API server, hosted MCP resources, SQLite stores,
  background fibers, and runtime discovery file cleanup.
- `start` MUST be idempotent within one runtime instance. A second start call for an already
  running backend MUST return the existing handle or fail with a typed `BackendAlreadyStarted`
  error. The selected behavior is implementation-defined and MUST be tested.
- `status` MUST return a structured backend status without requiring an HTTP request.
- `BackendRuntimeLive` MUST be a layer that expects required global/platform services from the
  caller.

### 7.4 Layer and Launch Helpers

The package MUST expose layer/effect helpers equivalent to:

```ts
export const BackendRuntimeLive: Layer.Layer<
  BackendRuntime,
  BackendError,
  BackendRuntimeRequirements
>;

export const BackendLive: (
  options?: BackendStartOptions,
) => Layer.Layer<BackendHandleService, BackendError, BackendRuntimeRequirements>;

export const startBackend: (
  options?: BackendStartOptions,
) => Effect.Effect<BackendHandle, BackendError, BackendRuntimeRequirements>;

export const launchBackend: (
  options?: BackendStartOptions,
) => Effect.Effect<never, BackendError, BackendRuntimeRequirements>;
```

`launchBackend` MUST start the backend and remain alive until interrupted or until a host-provided
shutdown signal completes. The exact blocking primitive is implementation-defined, but it MUST be
interruptible and scope-safe.

`BackendLive(options)` SHOULD be implemented as a scoped layer using `Effect.acquireRelease` or
equivalent layer resource management.

### 7.5 Backend Handle

`BackendHandle` MUST contain at least:

- `api`: the `@cycle/api` `CycleApi` handle or equivalent fetch-capable in-process API handle when
  available.
- `baseUrl`: bound API base URL.
- `host`: API host.
- `port`: bound API port.
- `mcpPath`: hosted MCP path when enabled.
- `mcpUrl`: hosted MCP URL when enabled.
- `runtimeFile`: runtime discovery file path when written.
- `startedAt`: ISO timestamp.
- `close`: idempotent close function for hosts that need callback-style teardown.

The scoped finalizer and `close` MUST share the same teardown path. Calling both MUST NOT double
close resources or throw because a resource has already been closed.

## 8. Backend Configuration and Paths

### 8.1 Configuration Source

`@cycle/backend` MUST use `@cycle/config` as the canonical app config source. It MUST NOT define a
second app config file format.

Backend startup configuration MUST be resolved in this order:

1. Explicit `BackendStartOptions`.
2. Effect `Config` values and environment variables.
3. Persisted app config from `@cycle/config`.
4. Documented backend defaults.

Invalid explicit options MUST fail startup. Missing optional values MAY fall back to defaults.

### 8.2 Default Paths

Unless overridden, the backend MUST use:

- app config: `~/.cycle/app-config.json`, owned by `@cycle/config`;
- projection database: `~/.cycle/cycle.db`;
- agent task worktrees: `~/.cycle/agent-task-worktrees`;
- API runtime discovery file: the same per-user temp file currently resolved by desktop API startup,
  with `CYCLE_API_RUNTIME_FILE` taking precedence when present.

The implementation MUST create parent directories with restrictive permissions where the platform
supports them.

### 8.3 API Configuration

The backend MUST read API config from app config and startup options:

- `enabled`
- `host`
- `port`
- `staticToken`

The default host MUST be loopback-only: `127.0.0.1` or `localhost`. Non-loopback hosts MUST fail
startup unless a future explicit development-only override is specified by another spec.

`port: "auto"` MUST bind an available loopback port. Numeric ports MUST bind the requested port or
fail with a typed startup error.

### 8.4 Runtime Discovery File

When the API server starts, backend MUST write a runtime discovery file containing at least:

- `apiVersion`
- `baseUrl`
- `mcpPath` when hosted MCP is enabled
- `mcpUrl` when hosted MCP is enabled
- `pid`
- `specUrl`
- `startedAt`

The file MUST be written with restrictive permissions where supported. Backend shutdown MUST remove
the file if and only if it was written by the current backend instance.

## 9. Core Components

### 9.1 Backend Database

`@cycle/backend` MUST own the application database layer that replaces desktop-specific
`DesktopDatabaseLive`.

Required behavior:

- Use `@cycle/database` for projection and domain persistence.
- Use the default projection path `~/.cycle/cycle.db`.
- Derive `DatabaseIdentity.currentActor` from the persisted Cycle profile, not from Electron state.
- Preserve current ID generation semantics unless a database spec changes them.
- Create the `~/.cycle` directory before opening the database.
- Close database resources through Effect finalizers.

### 9.2 Local Workspace

`@cycle/backend` MUST own the generic local workspace service currently represented by desktop
workspace code.

The service MUST support:

- listing registered repositories;
- registering or updating a repository path;
- initializing a repository path where allowed by the existing workflow;
- removing a repository from app config;
- updating repository preferences;
- marking a repository opened;
- resolving API repository open requests into `RepositoryInput` values.

The service MUST NOT use Electron APIs. Path validation and Git repository checks MUST use
`@cycle/git` and platform filesystem/path services.

### 9.3 Local Settings

`@cycle/backend` MUST expose a local settings service used by API settings endpoints.

The service MUST own backend-reusable mutations for:

- reading app config;
- completing onboarding;
- updating profile;
- setting interface density;
- updating repository preferences;
- removing repositories;
- updating agent provider preferences.

Desktop-specific native theme synchronization MUST remain in `@cycle/desktop`. Backend MAY update
the persisted theme preference, but applying it to Electron `nativeTheme` is desktop-owned.

### 9.4 Repository Bootstrap

`@cycle/backend` MUST own repository bootstrap and background repository supervision currently tied
to desktop composition.

The bootstrap service MUST support:

- starting background bootstrap for configured repositories;
- opening a repository on demand;
- reporting structured bootstrap status;
- syncing a repository from remote;
- pushing a repository to remote;
- receiving notification that a write usecase changed a repository.

Background work MUST be scoped. Long-running loops MUST use `Effect.forkScoped` or
`Layer.effectDiscard`; detached promises are not allowed inside backend services.

Per-repository failures SHOULD degrade that repository's status without stopping the entire backend
unless the failure prevents the backend from serving API requests.

### 9.5 API Server and Hosted MCP

`@cycle/backend` MUST own the decision to start the local API server and hosted MCP endpoint.
`@cycle/api` remains the owner of route definitions, WebSocket protocols, OpenAPI generation,
authorization middleware, and MCP tool definitions.

Backend startup MUST call `@cycle/api` with fully assembled runtime options:

- static token;
- base URL/host/port;
- local settings provider;
- repository list and open-input resolvers;
- usecase layer;
- database service layer;
- agent task service layer;
- agent services and provider profiles;
- agent chat store/runtime dependencies;
- agent session store;
- worktree service and worktree storage path;
- hosted MCP options;
- `onUseCaseSuccess` hook that notifies backend repository bootstrap after write usecases.

Hosted HTTP MCP MUST remain mounted with the API server. Stdio MCP MUST remain a REST-client
process and MUST NOT import or launch `@cycle/backend`.

### 9.6 Agent Runtime, Tasks, and Chat

`@cycle/backend` MUST own local runtime composition for:

- agent service registry construction;
- provider profile listing with persisted preferences;
- provider model catalog enrichment;
- agent session store;
- agent task store and `AgentTaskService`;
- agent task worktree storage path;
- chat store and chat runtime;
- active agent turn tracking as required by `@cycle/api`.

The implementation SHOULD move generic SQLite store construction out of desktop-specific files.
No backend service may persist raw secrets, process handles, abort controllers, or non-serializable
provider runtime objects in durable stores.

### 9.7 Automation and Future Background Services

If scheduled automations, monitors, or future background services are added, they SHOULD be composed
inside `@cycle/backend` rather than desktop or CLI. Such services MUST use scoped fibers, typed
configuration, and structured status surfaces.

## 10. Runtime Workflows

### 10.1 Backend Startup

Startup MUST follow this logical order:

1. Resolve backend startup options and default paths.
2. Read and validate app config.
3. Initialize backend database and local settings services.
4. Initialize workspace and repository bootstrap services.
5. Initialize agent stores, task service, chat store, and agent service registry.
6. Compose the usecase layer from `@cycle/usecases` plus backend-provided services.
7. Start the API server and hosted MCP endpoint when API config is enabled.
8. Write the runtime discovery file when the API server starts.
9. Start repository bootstrap/background supervision.
10. Publish a running backend status.

API startup failures MUST fail backend startup. Repository bootstrap failures after the API has
started SHOULD be reflected in status and logs rather than tearing down the backend.

If API config is disabled, backend startup MAY still initialize non-API services, but status MUST
report API state as `disabled`, backend MUST NOT write a runtime discovery file, and hosted MCP
MUST NOT start.

### 10.2 Backend Shutdown

Shutdown MUST:

1. Stop accepting API and hosted MCP requests.
2. Interrupt scoped background fibers.
3. Close agent task, chat, and session stores.
4. Close database resources.
5. Remove the runtime discovery file written by this instance.
6. Emit a shutdown log with the base URL and runtime file path.

Shutdown MUST be idempotent.

### 10.3 Repository Open Request

When the API receives a repository open request, backend MUST resolve it as follows:

1. If `path` is provided, validate/register the path through local workspace.
2. If `repositoryId` is provided, resolve it from registered repositories.
3. Fail with a typed backend or config error when neither path nor a known repository id is
   available.
4. Inspect Git metadata through `@cycle/git`.
5. Create a local GitDB store for database `cycle`.
6. Return a `RepositoryInput` for `@cycle/usecases` and `@cycle/database`.

### 10.4 Write Usecase Notification

When an API usecase succeeds:

- If the usecase side effect is not `write`, backend MUST do nothing.
- If the usecase input does not identify a repository, backend MUST do nothing.
- If the usecase is a repository write, backend MUST notify repository bootstrap that the
  repository changed.
- Notification failures MUST be logged and surfaced in backend status but MUST NOT rewrite the
  successful API response.

### 10.5 CLI Backend Launch

`@cycle/cli` SHOULD add a command equivalent to:

```sh
cycle backend start
```

The command MUST:

- compose host/global layers for a Node CLI process;
- launch `@cycle/backend`;
- print or expose the bound API base URL in a machine-readable way when requested;
- keep running until interrupted;
- exit non-zero on startup failure.

Normal CLI commands SHOULD continue to discover and call the running API. They MUST NOT embed a
backend implicitly unless a future command explicitly requests embedded mode.

### 10.6 Desktop Backend Launch

`@cycle/desktop` main process SHOULD replace desktop-owned backend startup with `@cycle/backend`.

Desktop remains responsible for:

- Electron app readiness and shutdown;
- BrowserWindow lifecycle;
- IPC registration;
- preload bridge;
- renderer creation;
- native theme synchronization;
- shell-open behavior.

Desktop SHOULD provide global layers and launch backend in the main process scope. Desktop renderer
requests SHOULD continue to use the local HTTP API and desktop IPC for desktop-only capabilities.

## 11. State and Domain Model

### 11.1 Stable Runtime Entities

Backend status MUST model at least:

- backend lifecycle state: `starting`, `running`, `stopping`, `stopped`, or `failed`;
- API state: disabled, starting, running, failed, stopped;
- base URL and hosted MCP URL when available;
- runtime discovery file path when available;
- repository bootstrap status;
- active agent/task summary when available;
- last failure summary when available;
- started and updated timestamps.

### 11.2 Repository Directory Entry

Backend repository directory entries MUST remain compatible with `@cycle/api`:

- `id`
- `displayName`
- `path`

Backend MAY include additional internal fields, but public API responses MUST follow API schemas.

### 11.3 Provider Profiles

Agent provider profiles returned through API MUST merge:

- provider detection result;
- persisted provider preferences;
- provider capability definitions;
- active run count;
- model catalog data when available.

Unavailable model catalogs MUST not make an otherwise detected provider disappear. The failure MUST
be represented in provider profile configuration and logs.

## 12. Error Model

`@cycle/backend` MUST define typed recoverable errors with `Schema.TaggedErrorClass` or equivalent
Effect schema-backed error classes.

Required error categories:

- `BackendConfigError`
- `BackendStartupError`
- `BackendShutdownError`
- `BackendRuntimeDiscoveryError`
- `BackendWorkspaceError`
- `BackendDatabaseError`
- `BackendApiError`
- `BackendAgentRuntimeError`
- `BackendBootstrapError`

Errors MUST include:

- stable `_tag`;
- human-readable `message`;
- `operation`;
- optional `cause`;
- relevant safe context fields such as `repositoryId`, `providerId`, `runtimeFile`, `host`, or
  `port`.

Secrets, bearer tokens, environment dumps, raw prompts, and full request bodies MUST NOT appear in
error messages or logs.

## 13. Observability

Backend logs MUST be structured and include:

- `service: "backend"`;
- component name, such as `api`, `database`, `workspace`, `bootstrap`, `agent`, `chat`, or `mcp`;
- operation name;
- request id where available;
- repository id where available;
- provider id or run id where available;
- safe failure details.

Startup MUST log:

- effective API host and port;
- runtime discovery file path;
- hosted MCP URL when enabled;
- database path;
- agent worktree path.

Shutdown MUST log:

- base URL;
- runtime discovery file path;
- whether cleanup succeeded.

Backend SHOULD expose status through both an in-process service and the existing API status/health
routes where practical.

## 14. Security and Operational Safety

The backend MUST preserve local-first safety rules:

- Bind HTTP API and hosted MCP only to loopback hosts by default.
- Require bearer token auth for API and hosted MCP unless explicitly disabled for tests.
- Write runtime discovery files with restrictive permissions.
- Redact static tokens and provider credentials from logs and errors.
- Pass only the minimum required environment values to agent providers.
- Keep stdio MCP as a client of the running API, not a backend launcher.
- Validate filesystem paths before registering repositories or creating worktrees.
- Keep all background work scoped to backend lifetime.

Host applications MAY add stronger process sandboxing or OS-specific security controls outside this
package.

## 15. Migration Plan

The first implementation SHOULD be a direct extraction before deeper redesign.

### 15.1 Create Package

Create `packages/backend` with:

- `package.json`;
- `tsconfig.json`;
- `src/index.ts`;
- root source files listed in Section 7.1;
- one optional `src/internals/` folder for small helper/native-boundary files only;
- package-local tests.

Add it to workspace typecheck and package dependency references.

### 15.2 Move or Split Desktop Backend Code

The implementation SHOULD move or split these desktop-owned backend pieces:

| Current source                                       | Target                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/DesktopApi.ts`                 | `packages/backend/src/BackendApi.ts` and `packages/backend/src/BackendRuntime.ts`                                                                 |
| `packages/desktop/src/DesktopApiRuntimeDiscovery.ts` | `packages/backend/src/BackendConfig.ts`, or a lower shared config/API root file if reused outside backend                                         |
| `packages/desktop/src/DesktopDatabaseLive.ts`        | `packages/backend/src/BackendDatabase.ts`                                                                                                         |
| `packages/desktop/src/DesktopBootstrapLive.ts`       | `packages/backend/src/RepositoryBootstrap.ts`                                                                                                     |
| `packages/desktop/src/shared/Bootstrap.ts`           | `packages/backend/src/RepositoryBootstrap.ts`                                                                                                     |
| `packages/desktop/src/LocalWorkspaceLive.ts`         | `packages/backend/src/LocalWorkspace.ts`                                                                                                          |
| `packages/desktop/src/shared/LocalWorkspace.ts`      | `packages/backend/src/LocalWorkspace.ts`                                                                                                          |
| `packages/desktop/src/DesktopAgentSessionStore.ts`   | `packages/backend/src/BackendApi.ts`, `packages/backend/src/BackendRuntime.ts`, or an `@cycle/agents` root service file if it becomes agent-owned |
| non-Electron parts of `ElectronPreferences.ts`       | `packages/backend/src/LocalSettings.ts`                                                                                                           |

Desktop MUST keep or recreate only Electron-specific adapters:

- native theme sync;
- Electron shell and window services;
- IPC/preload contracts;
- desktop app lifecycle.

### 15.3 Refactor API Options

`@cycle/api` SHOULD remain behavior-compatible as a transport package. Backend SHOULD supply
assembled `CycleApiOptions` instead of desktop building them.

Any API fallback construction that belongs to full backend composition SHOULD move to backend. API
MAY keep lightweight defaults for tests and in-process handler construction only when they do not
allocate durable app resources.

### 15.4 Update Desktop

Desktop main-process startup SHOULD become:

1. start Electron-specific services;
2. launch backend in the main process Effect scope;
3. register IPC;
4. create windows;
5. run desktop lifecycle until shutdown.

`DesktopApi` SHOULD be removed or kept only as a short-lived compatibility wrapper around
`@cycle/backend` during migration.

### 15.5 Update CLI

CLI SHOULD add backend launch support while preserving client commands:

- `cycle backend start` launches backend and blocks;
- existing commands discover `CYCLE_API_RUNTIME_FILE`, `CYCLE_API_URL`, and app config token as
  before;
- stdio MCP continues to use REST discovery.

## 16. Test and Validation Matrix

The implementation MUST include deterministic tests for:

| Area              | Required validation                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package boundary  | `@cycle/backend` has no imports from `@cycle/desktop`, `@cycle/ui`, Electron, React, or CLI command modules.                                                                         |
| Source layout     | Backend production source has no subdirectories except `src/internals/`; service files live at `src/<ServiceName>.ts` and export their service plus live/test layers when available. |
| Public exports    | Every `package.json` export maps to a root source file or `src/index.ts`; no export maps to `src/internals/*`.                                                                       |
| Startup           | Backend starts API and hosted MCP with temp `HOME`, writes runtime discovery, and `/health` succeeds.                                                                                |
| Shutdown          | Backend close/finalizer closes stores, stops server, interrupts fibers, and removes the runtime discovery file.                                                                      |
| Paths             | Defaults resolve to `~/.cycle/cycle.db`, `~/.cycle/agent-task-worktrees`, and the expected runtime discovery file.                                                                   |
| Config            | Explicit options override env/config; invalid host/port/token config fails with typed errors.                                                                                        |
| Repository open   | Path and repository-id open requests produce `RepositoryInput`; missing inputs fail with typed errors.                                                                               |
| Write hook        | Write usecase success notifies repository bootstrap; read success does not.                                                                                                          |
| Local settings    | API settings mutations update app config without Electron dependencies.                                                                                                              |
| Provider profiles | Detection, preferences, active run counts, and model catalog failures are merged correctly.                                                                                          |
| Hosted MCP        | Hosted MCP remains mounted with API and uses the configured bearer token.                                                                                                            |
| Stdio MCP         | Stdio MCP tests prove it discovers REST API and does not import or launch backend.                                                                                                   |
| CLI launch        | `cycle backend start` can launch against temp state and exits non-zero on startup failure.                                                                                           |
| Desktop migration | Desktop startup uses backend while Electron lifecycle tests remain desktop-owned.                                                                                                    |

Existing tests in `packages/desktop/test/desktop-api.test.ts` SHOULD move to backend tests or be
rewritten as desktop integration tests over `@cycle/backend`.

## 17. Acceptance Criteria

The backend extraction is complete when:

1. `packages/backend/SPEC.md` is implemented by a real `@cycle/backend` package.
2. `@cycle/backend` can be launched from a test with caller-provided global layers and temp
   `HOME`.
3. `@cycle/backend` starts the local API, hosted MCP, database, repository bootstrap, agent task
   service, chat runtime, and required stores.
4. `@cycle/backend` writes and removes the runtime discovery file correctly.
5. `@cycle/desktop` no longer owns backend runtime composition or imports backend-owned service
   implementations from local desktop files.
6. `@cycle/desktop` still owns Electron lifecycle, IPC, preload, window, shell, native theme, and
   renderer behavior.
7. `@cycle/cli` can launch the backend explicitly and normal CLI commands can consume the launched
   API.
8. Stdio MCP remains a REST client and hosted HTTP MCP remains mounted by the backend/API server.
9. No production code in `@cycle/backend` imports `@cycle/desktop`, `@cycle/ui`, Electron, React, or
   CLI command modules.
10. `packages/backend/src` uses root service files and has no source subdirectories except
    `src/internals/`.
11. Every backend `Context.Service` is exported from a same-named root source file with its service
    shape and live/test layers when available.
12. Typecheck and package-local tests pass for backend, API, desktop, and CLI after migration.

## 18. Open Implementation Choices

These choices are implementation-defined, but the implementation MUST document and test the chosen
behavior:

1. Whether repeated `BackendRuntime.start()` returns the existing handle or fails with
   `BackendAlreadyStarted`.
2. Whether `BackendLive(options)` exposes the handle through a dedicated `BackendHandleService` or
   only starts resources and exposes status through `BackendRuntime`.
3. Whether generic local settings live entirely in `@cycle/backend` or a lower future package after
   extraction.
4. Whether runtime discovery parsing helpers live in `@cycle/backend`, `@cycle/config`, or
   `@cycle/api` after public subpath cleanup.
5. Whether API fallback construction for tests remains in `@cycle/api` or moves completely to
   backend test fixtures.
