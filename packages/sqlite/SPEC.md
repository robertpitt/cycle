# Cycle SQLite Package Specification

Status: Draft implementation specification

Version: 0.1.0

Package: `@cycle/sqlite`

## 1. Purpose

`@cycle/sqlite` is Cycle's shared local SQLite infrastructure package. It provides the Effect SQL
runtime, SQLite layer construction, migration execution, parent-directory preparation,
sqlite-vector extension loading, and typed capability/error surfaces needed by packages that own
their own SQLite-backed tables.

The package is infrastructure-only. Domain packages such as `@cycle/database`, `@cycle/agent-chat`,
`@cycle/agents`, and `@cycle/desktop` MUST continue to own their domain schemas, migrations, stores,
and query APIs. `@cycle/sqlite` exists to remove direct coupling to `node:sqlite` and repeated
SQLite setup code from those packages.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for callers and conformance tests to reason about it.

## 3. Problem Statement

Cycle currently opens SQLite databases directly through `node:sqlite` in multiple packages. The
database projection, agent chat store, desktop agent session store, and agent task store each repeat
some combination of parent-directory creation, connection setup, schema initialization, raw SQL
execution, and storage error wrapping. Some packages also import schema/path helpers from
`@cycle/database` only because that package currently happens to contain SQLite infrastructure.

This creates the wrong package boundary. Packages that only need local SQLite storage become
coupled to the primary database package, and the project has no single place to configure Effect SQL
or sqlite-vector support. Cycle needs a reusable SQLite infrastructure package so domain packages
can keep table ownership while sharing one vetted runtime and capability layer.

## 4. Goals

`@cycle/sqlite` MUST:

1. Provide a new workspace package named `@cycle/sqlite`.
2. Provide SQLite runtime layers built on Effect SQL, specifically the Node SQLite Effect SQL
   package used by the application runtime.
3. Provide typed layer options for opening file-backed and in-memory SQLite databases.
4. Create parent directories for file-backed databases when requested by layer options.
5. Treat `:memory:` as an in-memory database path and MUST NOT attempt to create a parent directory
   for it.
6. Enable `PRAGMA foreign_keys = ON` by default for every opened connection.
7. Allow callers to provide additional SQLite pragmas during layer construction.
8. Provide a migration runner interface where domain packages supply migration records or effects.
9. Run migrations after the connection is opened and after required SQLite extensions are loaded.
10. Provide sqlite-vector wiring, including platform extension resolution and extension loading.
11. Expose vector support through typed capabilities and typed failures so vector-dependent
    consumers can disable semantic search with an operator-visible error when vector support is
    unavailable.
12. Provide typed recoverable errors for path preparation, connection opening, migration failure,
    pragma application, and sqlite-vector unavailability.
13. Manage SQLite resources with Effect layers and scoped finalizers.
14. Preserve existing public APIs in consuming packages during the extraction.
15. Remove direct runtime use of `node:sqlite` from packages that can use `@cycle/sqlite`.

## 5. Non-Goals

`@cycle/sqlite` v0.1 MUST NOT:

1. Own Cycle's primary database file path or choose the app's shared `cycle.db` location.
2. Own the `@cycle/database` projection schema, repository tables, search FTS tables, materialized
   read model, or GitDB synchronization logic.
3. Own agent chat, agent session, or agent task schemas.
4. Define ticket, chat, task, repository, session, or semantic-search domain APIs.
5. Implement embedding generation, content chunking, vectorization policy, semantic search ranking,
   or background indexing.
6. Replace GitDB or make SQLite a durable source of truth for repository data.
7. Provide a general ORM or query builder beyond the Effect SQL primitives already exposed by
   Effect SQL.
8. Read raw `process.env` inside business logic or domain stores.
9. Load SQLite extensions from untrusted user input.
10. Introduce breaking public API changes in `@cycle/database`, `@cycle/agent-chat`, or
    `@cycle/agents` as part of the initial extraction.

## 6. System Overview

### 6.1 Layer Position

Cycle storage layers are:

```text
@cycle/sqlite
  Effect SQL SQLite client/layers, migrations, pragmas, sqlite-vector capability

@cycle/database
  GitDB-backed domain write service and app-wide SQLite projection schema

@cycle/agent-chat, @cycle/agents, @cycle/desktop
  Domain-owned local tables and stores that may use the same app database file

Applications
  Desktop, API, CLI, tests, and future semantic-search services
```

### 6.2 Main Components

`@cycle/sqlite` has these responsibility boundaries:

- Layer factory: opens SQLite through Effect SQL and provides the Effect SQL services to callers.
- Path preparation: creates the parent directory for file-backed databases when requested.
- Pragma runner: applies default and caller-provided SQLite pragmas.
- Migration runner: executes caller-supplied migrations in a deterministic order.
- Vector extension resolver: resolves the sqlite-vector binary for the current platform.
- Vector extension loader: loads sqlite-vector into the active SQLite connection.
- Capability service: reports whether vector support is loaded, unavailable, or disabled.
- Error model: exposes typed recoverable failures for infrastructure operations.
- Test helpers: provide deterministic in-memory layers and vector-loader test doubles.

### 6.3 External Dependencies

Core runtime dependencies are:

- `effect` for services, layers, schemas, configuration, scoped resource management, logging, and
  tests.
- `@effect/sql-sqlite-node` for the SQLite client and migrator.
- Effect SQL modules such as `SqlClient`, `SqlError`, `SqlSchema`, `SqlResolver`, and related
  primitives where required by callers.
- `@sqliteai/sqlite-vector` and its platform packages for sqlite-vector binary resolution.
- `@effect/platform-node` or the existing application platform layer for filesystem and path
  services where needed.

The package MAY copy or adapt the sqlite-vector platform resolution approach from the clanka
reference, but it MUST keep that logic internal to `@cycle/sqlite` unless exported as an explicitly
documented utility.

## 7. Public Package Contract

### 7.1 Package Exports

The package MUST export these categories from `@cycle/sqlite`:

- Layer factories for base SQLite and vector-enabled SQLite.
- Option types and schemas for layer construction.
- Capability services and capability value types.
- Typed error classes.
- Path helpers for generic SQLite database paths.
- Migration helper types.
- Test-layer helpers.

The package SHOULD also export narrower subpaths when useful:

- `@cycle/sqlite/errors`
- `@cycle/sqlite/vector`
- `@cycle/sqlite/migrations`
- `@cycle/sqlite/testing`

### 7.2 Layer Factories

The package MUST provide a base layer factory equivalent to:

```ts
type SqliteLayerOptions = {
  readonly filename: string;
  readonly createParentDirectory?: boolean;
  readonly pragmas?: ReadonlyArray<string>;
  readonly migrations?: SqliteMigrationSource;
  readonly vector?: "disabled" | "required";
};
```

The exact exported names are implementation-defined, but the implementation MUST provide:

- A base layer that opens SQLite without requiring sqlite-vector.
- A vector-required layer or option that fails with `SqliteVectorUnavailableError` when
  sqlite-vector cannot be loaded.
- An in-memory test layer that uses `:memory:` and does not touch the filesystem.

Layer factories MUST provide Effect SQL's SQLite services to downstream code, including
`SqlClient.SqlClient` and the sqlite-node client service used to call `loadExtension`.

Layer factories MUST manage the SQLite connection lifetime with `Effect.acquireRelease` or an
equivalent scoped Effect SQL layer finalizer. Consumers MUST NOT need to call `close()` manually
when they compose the provided layer.

### 7.3 Capability Service

The package MUST expose a capability value equivalent to:

```ts
type SqliteVectorCapability =
  | {
      readonly status: "disabled";
    }
  | {
      readonly status: "loaded";
      readonly extensionPath: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: SqliteVectorUnavailableReason;
      readonly message: string;
    };

type SqliteCapabilities = {
  readonly vector: SqliteVectorCapability;
};
```

The capability service MUST be available to consumers that need to decide whether a
vector-dependent feature can run. The service MUST NOT perform embedding, indexing, or semantic
search work.

### 7.4 Error Classes

The package MUST define typed recoverable errors using `Schema.TaggedErrorClass` or
`Schema.ErrorClass`.

Required error categories:

- `SqlitePathError`: parent-directory creation or path validation failed.
- `SqliteOpenError`: the SQLite connection could not be opened.
- `SqlitePragmaError`: a required pragma failed.
- `SqliteMigrationError`: a caller-supplied migration failed.
- `SqliteVectorUnavailableError`: sqlite-vector could not be resolved or loaded.

Errors MUST include:

- `operation`: a short stable operation name.
- `message`: a human-readable message.
- `cause`: the original unknown cause when available.

Vector errors SHOULD include:

- `platform`: the detected platform identifier when known.
- `extensionPath`: the attempted extension path when known.
- `reason`: one of `unsupported_platform`, `package_missing`, `binary_missing`, `load_failed`, or
  `unknown`.

### 7.5 Path Helpers

The package MUST provide generic path helpers:

- `isInMemorySqlitePath(path: string): boolean`
- `ensureSqliteParentDirectory(path: string): Effect.Effect<void, SqlitePathError, FileSystem | Path>`

The package MAY provide synchronous helpers only for compatibility with existing synchronous store
factories. New code SHOULD use Effectful helpers.

The package MUST NOT own `cycleHomeDirectory`, `cycleDatabasePath`, or other app-specific path
defaults. Those remain in the packages or composition roots that own those paths.

## 8. Configuration Contract

### 8.1 Required Options

Every runtime layer construction MUST receive an explicit `filename`.

`filename` MAY be:

- `:memory:` for an in-memory database.
- A relative path resolved according to the caller's process working directory.
- An absolute path.

Callers SHOULD pass absolute paths in application composition roots.

### 8.2 Defaults

Default behavior MUST be:

- `createParentDirectory: true` for file-backed databases.
- `createParentDirectory: false` behavior for `:memory:` regardless of the supplied option.
- `vector: "disabled"` for the base layer.
- `PRAGMA foreign_keys = ON` always applied.

The implementation MAY choose additional defaults, but it MUST document them and keep them safe for
both `:memory:` and file-backed databases. WAL mode SHOULD be opt-in because it is not meaningful
for every SQLite target.

### 8.3 Config Sources

`@cycle/sqlite` MUST accept typed options and MAY provide `Config`-based helpers. It MUST NOT read
raw environment variables from package internals. Composition roots such as desktop or CLI MAY read
configuration and pass typed values into the layer.

## 9. Migration Contract

### 9.1 Migration Ownership

Domain packages own domain migrations.

Examples:

- `@cycle/database` owns projection, FTS, inbox, and local metadata migrations.
- `@cycle/agent-chat` owns agent chat table migrations.
- `@cycle/agents` owns agent task table migrations.
- `@cycle/desktop` owns desktop-only session binding migrations if those tables remain in desktop.

`@cycle/sqlite` only owns the mechanism that runs migrations.

### 9.2 Migration Source

The migration source MUST support a deterministic collection of named migrations. A migration name
MUST be stable once released. Migration names SHOULD be prefixed by the owning package or feature,
for example:

- `database/0001_projection`
- `agent-chat/0001_threads`
- `agents/0001_tasks`
- `desktop/0001_agent_sessions`

The migration runner MUST execute migrations in deterministic order. Lexicographic ordering by
migration name is acceptable if documented.

### 9.3 Migration Execution

Migrations MUST run after:

1. The database connection opens.
2. Required pragmas are applied.
3. Required extensions are loaded.

Migrations MUST run before the layer is considered ready for domain services.

Migration failures MUST fail layer construction with `SqliteMigrationError`. The error MUST include
the migration name when known.

Migrations SHOULD use SQLite idempotency guards such as `CREATE TABLE IF NOT EXISTS` where safe, but
the migration ledger remains the authoritative record of completed migrations.

### 9.4 Legacy Schema Migration

The initial extraction MAY preserve current domain bootstrap behavior while moving connection setup
to `@cycle/sqlite`. If a domain package currently manages schema compatibility imperatively, it MAY
continue to do so behind its existing API while the package is incrementally moved to declarative
migrations.

New domain SQLite schema changes SHOULD be expressed as caller-supplied migrations to
`@cycle/sqlite`.

## 10. Vector Extension Contract

### 10.1 Scope

`@cycle/sqlite` MUST wire sqlite-vector so future vector-dependent services can compose a
vector-enabled SQLite layer. It MUST NOT define how Cycle content is vectorized.

Out of scope for this package:

- embedding provider selection
- embedding dimensions policy beyond passing dimensions into caller SQL
- content chunking
- document hashing
- vector index refresh scheduling
- semantic-search ranking
- UI search behavior

### 10.2 Extension Resolution

The package MUST resolve sqlite-vector from trusted package-installed binaries, not from arbitrary
user-provided paths.

The resolver MUST account for supported operating system and architecture combinations. It SHOULD
detect musl Linux separately from glibc Linux when the platform packages require that distinction.

The implementation MAY expose a test-only or explicitly trusted override for extension paths. If it
does, the override MUST be clearly marked as trusted configuration and MUST NOT be populated from
untrusted user input.

### 10.3 Loading Behavior

When `vector: "required"` is configured, the layer MUST attempt to load sqlite-vector before running
caller migrations.

If sqlite-vector loads successfully:

- The capability service MUST report `vector.status === "loaded"`.
- The extension path SHOULD be available for diagnostics.
- Caller migrations MAY use sqlite-vector functions.

If sqlite-vector cannot be resolved or loaded:

- Layer construction MUST fail with `SqliteVectorUnavailableError` for vector-required layers.
- Vector-dependent consumers, such as future semantic search services, MUST catch or map this error
  into a disabled semantic-search state with an operator-visible error.
- Non-vector database consumers MAY continue to use a base SQLite layer that does not require
  sqlite-vector.

This means sqlite-vector is REQUIRED for vector-dependent features, but unavailable vector support
MUST NOT force unrelated non-vector SQLite stores to fail startup.

## 11. Runtime Workflows

### 11.1 Base SQLite Layer Startup

Reference algorithm:

```text
openSqliteLayer(options):
  validate filename
  if createParentDirectory and filename is not ":memory:":
    create parent directory
  open sqlite client through Effect SQL
  apply PRAGMA foreign_keys = ON
  apply caller pragmas in order
  if vector is "required":
    resolve sqlite-vector extension path
    load sqlite-vector extension
    publish vector capability "loaded"
  else:
    publish vector capability "disabled"
  run caller migrations, if provided
  provide SqlClient, sqlite-node client, and capabilities
  close connection when layer scope closes
```

### 11.2 Vector Failure Workflow

Reference algorithm:

```text
openVectorRequiredLayer(options):
  result = openSqliteLayer(options with vector = "required")
  if result fails with SqliteVectorUnavailableError:
    log vector unavailable with reason and platform
    fail layer construction

semanticSearchLayer:
  provide vector-required sqlite layer
  catch SqliteVectorUnavailableError
  expose semantic search disabled status and message
```

`@cycle/sqlite` owns the first algorithm. Future semantic-search packages own the second algorithm's
feature-disable mapping.

### 11.3 Consumer Store Startup

Domain package stores SHOULD compose their own layer or factory as:

```text
makeDomainStore(path):
  provide @cycle/sqlite base layer for path
  run domain migrations or compatibility bootstrap
  construct domain store using SqlClient
```

Synchronous compatibility factories MAY remain temporarily, but new Effect services SHOULD prefer
Layer-based composition.

## 12. Consumer Integration Requirements

### 12.1 `@cycle/database`

`@cycle/database` MUST keep ownership of:

- `DatabaseService`
- `DatabaseLive`
- `DatabaseLiveWithOptions`
- `DatabaseTest`
- projection schema and projection methods
- GitDB synchronization and materialization behavior
- app-specific database path helpers, unless a later spec moves them

The initial extraction MUST preserve the public API exported from `@cycle/database`.

Internally, `@cycle/database` SHOULD replace direct `node:sqlite` connection construction with
`@cycle/sqlite` layer composition or a compatibility adapter backed by `@cycle/sqlite`.

### 12.2 `@cycle/agent-chat`

`@cycle/agent-chat` MUST keep ownership of:

- agent chat schemas
- `makeSqliteAgentChatStore`
- `makeDesktopAgentChatStore`
- chat store records and query behavior

The package SHOULD stop importing SQLite schema/path helpers from `@cycle/database`. It SHOULD use
`@cycle/sqlite` for generic parent-directory handling and connection/runtime setup.

### 12.3 `@cycle/agents`

`@cycle/agents` MUST keep ownership of:

- agent task schemas
- task store domain contracts
- task event ordering and idempotency behavior

The package SHOULD replace direct `node:sqlite` loading with `@cycle/sqlite`.

### 12.4 `@cycle/desktop`

Desktop-specific stores MAY continue to own desktop-only table definitions. They SHOULD use
`@cycle/sqlite` for parent-directory handling and SQLite runtime setup.

The desktop app MAY continue using one shared `cycle.db` file for the primary projection and local
supporting tables. `@cycle/sqlite` MUST NOT force separate databases per domain.

## 13. Storage and Resource Management

`@cycle/sqlite` MUST use Effect layers for resource ownership.

File-backed databases:

- MUST create parent directories when configured.
- MUST fail with `SqlitePathError` if directory creation fails.
- SHOULD log the database path at debug or info level only when useful for diagnostics.

In-memory databases:

- MUST not touch the filesystem.
- MUST be isolated per layer instance unless an implementation explicitly documents shared-cache
  behavior.

Connection lifecycle:

- MUST close when the layer scope closes.
- MUST not require callers to manually close Effect-managed connections.
- MUST not leak open handles in tests.

Concurrency:

- MUST rely on Effect SQL's SQLite client concurrency semantics.
- SHOULD document whether a layer creates one connection, a pool-like abstraction, or an
  implementation-defined serialized client.
- Domain packages remain responsible for domain-level write serialization and idempotency.

## 14. Observability

The package SHOULD emit structured logs for:

- SQLite layer startup.
- Parent-directory creation failure.
- SQLite open failure.
- Migration start, success, and failure.
- sqlite-vector load success and failure.
- Layer shutdown failure if observable.

Logs SHOULD include:

- `service: "sqlite"`
- `operation`
- `databasePath` when safe and useful
- `migrationName` for migration logs
- `vectorStatus`
- `platform` for vector resolution logs

Logs MUST NOT include SQL parameter values that may contain user content, secrets, prompts, chat
messages, ticket bodies, or agent outputs.

The capability service is the minimum status surface for vector support. Future semantic-search
services SHOULD expose their own higher-level status based on this capability.

## 15. Failure Model and Recovery

Failures are recoverable unless explicitly documented as defects.

- Path failures: fail layer startup; operator action is to fix permissions or path configuration.
- Open failures: fail layer startup; operator action is to fix file locks, permissions, or corrupt
  database state.
- Pragma failures: fail layer startup; operator action is to inspect SQLite compatibility.
- Migration failures: fail layer startup for the owning domain store; operator action depends on
  the failed migration and domain package.
- Vector unavailable: fail vector-required layer startup; vector-dependent features MUST disable
  themselves with an error, while non-vector stores MAY use base SQLite.

The package MUST preserve original causes on typed errors where possible.

The package MUST NOT retry unboundedly. Retrying path, open, migration, or extension load failures
is the responsibility of a higher-level supervisor or explicit caller policy.

## 16. Security and Operational Safety

SQLite database paths are trusted local filesystem paths supplied by application composition roots
or tests.

The package MUST NOT:

- Load extensions from untrusted user input.
- Accept arbitrary SQL strings from remote or untrusted users as migrations.
- Log sensitive SQL values.
- Read secrets or auth tokens.
- Perform network access.

If an extension path override exists for tests or development, it MUST be treated as trusted
configuration. Production composition roots SHOULD prefer package-resolved sqlite-vector binaries.

Domain packages remain responsible for validating user/domain data before writing it to SQLite.

## 17. Test and Validation Matrix

### 17.1 `@cycle/sqlite` Unit Tests

The package MUST include tests that verify:

1. `:memory:` opens without filesystem writes.
2. File-backed paths create missing parent directories.
3. `PRAGMA foreign_keys = ON` is applied.
4. Caller-provided pragmas run in order.
5. Caller migrations run before the layer is ready.
6. Migration failures map to `SqliteMigrationError` and include the migration name.
7. Layer scope closes the SQLite connection without leaked handles.
8. Vector-disabled base layers do not attempt extension loading.
9. Vector-required layers report loaded capability when a test extension loader succeeds.
10. Vector-required layers fail with `SqliteVectorUnavailableError` when extension resolution or
    loading fails.
11. Vector unavailable errors include a stable reason.

### 17.2 Consumer Regression Tests

The extraction is not complete until these existing suites pass:

- `pnpm --filter @cycle/database test`
- `pnpm --filter @cycle/database typecheck`
- `pnpm --filter @cycle/agent-chat test`
- `pnpm --filter @cycle/agent-chat typecheck`
- `pnpm --filter @cycle/agents test`
- `pnpm --filter @cycle/agents typecheck`
- `pnpm --filter @cycle/desktop test`
- `pnpm --filter @cycle/desktop typecheck`

The root `pnpm typecheck` SHOULD pass before merging.

### 17.3 Boundary Tests

Conformance SHOULD include repository checks that:

- No package except `@cycle/sqlite` imports `node:sqlite` for runtime SQLite access after the
  extraction.
- `@cycle/agent-chat` no longer imports SQLite schema/path helpers from `@cycle/database`.
- `@cycle/agents` task storage no longer uses `createRequire("node:sqlite")`.
- Existing public exports from `@cycle/database`, `@cycle/agent-chat/store`, and
  `@cycle/agents` remain available.

## 18. Implementation Checklist

1. Create `packages/sqlite` with package metadata, exports, TypeScript config, and tests.
2. Add dependencies for Effect SQL SQLite and sqlite-vector.
3. Implement typed errors.
4. Implement generic path helpers.
5. Implement base SQLite layer construction.
6. Implement migration source helpers and migration execution.
7. Implement sqlite-vector platform resolution and loading.
8. Implement capability service.
9. Add in-memory and vector-loader test helpers.
10. Refactor `@cycle/database` to use `@cycle/sqlite` for connection setup while preserving public
    APIs.
11. Refactor `@cycle/agent-chat` to own its schema and use `@cycle/sqlite` instead of
    `@cycle/database` helpers.
12. Refactor `@cycle/agents` task SQLite storage to use `@cycle/sqlite`.
13. Refactor desktop-only SQLite stores to use `@cycle/sqlite` where practical.
14. Remove direct runtime `node:sqlite` imports outside `@cycle/sqlite`.
15. Run the validation matrix.

## 19. Reference Alignment

The intended shape is aligned with the clanka reference:

- A small SQLite layer creates parent directories, opens Effect SQL SQLite, loads sqlite-vector, and
  runs migrations.
- Higher-level services build domain repositories on top of that layer.
- Vector-specific repository/search logic stays outside the SQLite infrastructure layer.

Cycle differs from clanka in one important boundary: `@cycle/sqlite` MUST be reusable
infrastructure, not a semantic-search package. Semantic search and vectorization remain future
domain work.
