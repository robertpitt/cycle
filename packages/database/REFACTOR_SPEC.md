# Cycle Database Code Architecture Refactor Specification

Status: Implemented

Version: 0.1.0

Package: `@cycle/database`

Companion contract: [`packages/database/SPEC.md`](./SPEC.md)

## 1. Purpose

This specification defines an atomic internal refactor of `@cycle/database`. The refactor replaces
oversized, mixed-responsibility modules with focused Effect services and pure domain modules. It
also removes synchronous Effect execution, manually managed scopes, synchronous schema decoding,
ad hoc resource ownership, and generic helper modules from production package code.

The existing database specification remains the authority for observable repository, projection,
query, write, history, and materialization behavior. This document defines how that behavior MUST
be implemented and how the refactor MUST be validated.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are
to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the exact mechanism, but it MUST
document the choice in code or tests and MUST preserve the contracts in this specification.

## 3. Relationship to the Existing Database Specification

The refactor MUST preserve the externally observable behavior defined by
[`packages/database/SPEC.md`](./SPEC.md), subject to these rules:

1. This refactor MAY change TypeScript service shapes, constructors, exports, and internal module
   paths when all in-repository consumers are updated in the same atomic change.
2. It MUST NOT deliberately change database semantics, event formats, query semantics, projection
   contents, or failure outcomes merely to simplify implementation.
3. It MUST NOT redesign the SQLite schema, increment the projection schema version, or add a data
   migration unless a separately approved correctness fix makes that unavoidable.
4. A known behavioral gap in the current implementation is not automatically in scope. The
   refactor MUST preserve passing behavior and MUST NOT claim to implement an unimplemented product
   feature solely because the existing specification describes it.
5. When an accidental implementation detail conflicts with an existing behavioral requirement and
   changing it would expand this work beyond a code refactor, the implementation MUST preserve the
   current tested behavior and record the conflict as follow-up work outside this specification.

## 4. Problem Statement

The current package concentrates unrelated concerns in a small number of modules:

- `Projection.ts` contains SQL-client adaptation, Effect runtime execution, manual scope ownership,
  schema initialization, migrations, row definitions, JSON decoding, projection writes, queries,
  search, history, inbox behavior, and page integration.
- `DatabaseServiceImplementation.ts` contains repository registry state, synchronization,
  materialization application, Git transaction emulation, write consistency, ticket commands,
  draft commands, shared metadata commands, inbox operations, page integration, and public facade
  assembly.
- `DatabaseMaterialization.ts`, `DatabaseHelpers.ts`, `PageOperations.ts`, and `PageProjection.ts`
  each combine multiple independently testable responsibilities.
- `Projection.ts` calls `Effect.runSync`, builds a `Layer` with a manually created `Scope`, and
  transports an Effect transaction context through mutable closure state.
- persisted and untrusted values are decoded with `Schema.decodeUnknownSync`, so parse failures can
  escape as throws or defects rather than precise typed failures.
- time, elapsed-time measurement, JSON processing, cursor encoding, collection state, and
  transaction lifecycle are partly implemented with local wrappers even where Effect or the pinned
  SQL integration already supplies the required abstraction.

These choices obscure dependency ownership, make failure and requirement channels difficult to
audit, increase control-flow complexity, and make focused testing expensive.

## 5. Goals

The refactor MUST:

1. Keep `DatabaseService` as the package's primary public facade.
2. Move implementation behavior behind focused internal services and pure domain modules.
3. Make every production database operation Effect-native from the public service boundary through
   SQL, storage, schema, clock, concurrency, and resource boundaries.
4. Ensure service operations expose accurate success, typed-error, and requirement channels.
5. Capture implementation dependencies while constructing service layers so service methods
   normally have `Requirements = never`.
6. Let `Layer` and the supplied SQLite layer own database acquisition, migrations, transactions,
   finalization, and shutdown.
7. Decode all untrusted command, event, SQL-row, cursor, and persisted JSON input through Effect
   Schema's effect interpreter.
8. Preserve atomic projection updates and Git-write-then-projection-sync consistency behavior.
9. Make per-repository synchronization and writes explicitly serialized with Effect concurrency
   primitives.
10. Keep deterministic calculations pure and independently testable.
11. Prefer APIs from Effect, Effect SQL, `@cycle/sqlite`, `@cycle/git-store`, or Node.js over local
    implementations when the pinned dependency already models the operation correctly.
12. Eliminate catch-all implementation modules and make source ownership discoverable from file and
    service names.
13. Keep control flow small and readable without imposing arbitrary line-count or cyclomatic-
    complexity thresholds.
14. Land as one atomic rewrite with all required consumer changes and tests in the same change.

## 6. Non-Goals

This refactor MUST NOT:

1. Redesign the SQLite schema, indexes, migration history, or projection persistence model.
2. Change the GitDB event model or repository storage layout.
3. Add a new compatibility layer for the removed collection document model.
4. Add product features such as new filters, new commands, background polling, or new history
   behavior solely as part of this refactor.
5. Establish a numeric performance target or require the rewrite to outperform the current code.
6. Impose a fixed file-size, function-size, or cyclomatic-complexity limit.
7. Refactor the package's standalone `.mjs` import and seed scripts. Those scripts are application
   boundaries and MAY continue to call `Effect.runPromise` and use direct Node.js APIs.
8. Preserve the deprecated synchronous construction API when doing so would retain manual runtime
   or scope management.
9. Introduce a general-purpose ORM, repository framework, transaction framework, or abstraction
   layer not justified by this package's concrete operations.
10. Re-export internal services, row schemas, SQL helpers, or implementation types from the public
    package root.

## 7. Scope and Atomic Delivery

### 7.1 Included Work

The atomic change MUST include:

- all required production changes under `packages/database/src`;
- database package test and fixture changes needed to verify the new architecture;
- addition of `@effect/vitest` to `packages/database` and migration away from the local
  `test/effect-vitest.ts` adapter;
- updates to in-repository consumers affected by public contract changes, including use-case,
  backend, API, desktop, and testing code;
- deletion of obsolete implementations and compatibility shims;
- architecture tests that prevent the removed patterns from returning.

### 7.2 Excluded Work

The change SHOULD leave `packages/database/scripts` untouched. A script MAY be adjusted only when a
public API change would otherwise make that script unusable; such a change MUST remain a narrow
integration update and MUST NOT pull script architecture into this refactor.

### 7.3 Atomicity

The new architecture MUST replace the old architecture in one mergeable change. The final change
MUST NOT contain parallel legacy and replacement implementations, feature flags selecting between
them, temporary adapters around synchronous projection APIs, or a follow-up requirement to update
known in-repository consumers.

The implementation MAY be developed through intermediate commits, but only the complete final
state is conformant.

## 8. Required Architecture

### 8.1 Responsibility Layers

The implementation MUST have the following logical layers:

```text
DatabaseService facade
  -> domain command/query services
    -> repository coordination and write consistency
      -> materialization planning and event folding
        -> focused projection stores and RepositoryStore
          -> Effect SqlClient and @cycle/git-store
```

Dependencies MUST point downward through these layers. SQL and Git implementation details MUST NOT
flow upward into the public facade or domain command contracts.

### 8.2 Required Components

Exact filenames are implementation-defined, but the following components and ownership boundaries
are REQUIRED:

| Component                   | Owns                                                                                      | Must not own                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `DatabaseService`           | Public facade contract and delegation                                                     | SQL, row codecs, mutable registry state, event folding, migrations |
| Database layer assembly     | Composition of live/test layers and dependency hiding                                     | Domain workflows or query SQL                                      |
| Repository registry         | Open repository runtime registrations and effectful lookup/update                         | SQL projection state, materialization algorithms, command rules    |
| Repository coordinator      | Per-repository exclusion, sync/rebuild orchestration, write/sync ordering                 | Domain-specific ticket/page/catalog mutation rules                 |
| Projection repository store | Repository rows, status, snapshot activation, warnings                                    | Ticket/page/catalog query behavior                                 |
| Ticket projection store     | Ticket, record, search, and ticket-history reads/writes                                   | Git transactions or repository registry state                      |
| Catalog projection store    | User, label, saved-view, template, and initiative projection access                       | Git transactions or ticket command rules                           |
| Inbox projection store      | Inbox queries and local inbox-state mutations                                             | Event folding and general ticket queries                           |
| Page projection store       | Page, comment, hierarchy, path, and page-history projection access                        | Page command orchestration or Git commits                          |
| Projection writer           | One atomic application of a complete materialization plan                                 | Reading Git history or building the plan                           |
| Materialization planner     | History selection, incremental/full-rebuild decision, and plan assembly                   | SQL transaction ownership                                          |
| Event folder                | Pure state transitions from ordered events                                                | SQL, service lookup, logging, clock reads, or Git writes           |
| Write coordinator           | Git event commit, projection resync, visibility verification, consistency failure mapping | Domain-specific construction of events                             |
| Ticket commands             | Ticket, relation, record, initiative, and ticket-comment rules                            | SQL statements, scopes, or repository registry mutation            |
| Draft commands              | Draft lifecycle and commit planning                                                       | SQL statements, scopes, or unrelated catalog rules                 |
| Catalog commands            | Users, labels, views, templates, and repository metadata rules                            | Ticket/page command rules                                          |
| Page commands               | Page lifecycle and generic comment rules                                                  | Direct SQL and unrelated ticket/catalog rules                      |
| Inbox operations            | Inbox input normalization and projection mutation delegation                              | Git-backed ticket/page writes                                      |

A component MAY group closely related operations when the grouping creates a deep module with a
small stable interface. It MUST NOT become a renamed catch-all containing the former oversized
module.

### 8.3 Expected Source Layout

A conforming implementation SHOULD converge on a layout equivalent to:

```text
src/
  DatabaseService.ts
  DatabaseServiceLive.ts
  DatabaseErrors.ts
  DatabaseIdentity.ts
  DatabaseIdGenerator.ts
  RepositoryStore.ts
  domain/
  internal/
    codecs/
      JsonCodec.ts
      CursorCodec.ts
    repository/
      RepositoryRegistry.ts
      RepositoryCoordinator.ts
      WriteCoordinator.ts
    projection/
      ProjectionRepositoryStore.ts
      ProjectionTicketStore.ts
      ProjectionCatalogStore.ts
      ProjectionInboxStore.ts
      ProjectionPageStore.ts
      ProjectionWriter.ts
      rows/
    materialization/
      MaterializationPlan.ts
      MaterializationHistory.ts
      EventFold.ts
      TicketEvents.ts
      PageEvents.ts
      InboxDerivation.ts
    commands/
      TicketCommands.ts
      DraftCommands.ts
      CatalogCommands.ts
      PageCommands.ts
      InboxOperations.ts
    DatabaseServiceAssembly.ts
  migrations/
```

Names MAY differ, but ownership MUST remain equivalently discoverable. New files named `Helpers`,
`Utils`, `Common`, `Implementation`, or similarly generic terms SHOULD NOT be introduced.

### 8.4 Oversized Module Disposition

The refactor MUST remove the current catch-all responsibilities from:

- `Projection.ts`;
- `DatabaseServiceImplementation.ts`;
- `DatabaseMaterialization.ts`;
- `internals/DatabaseHelpers.ts`.

These files MAY be deleted or reduced to a focused compatibility-free entry point. Merely moving
large blocks unchanged into new files or renaming a monolith does not conform.

`PageProjection.ts`, `PageOperations.ts`, and `PageEvent.ts` MUST be brought under the same service,
codec, failure, and Effect-boundary rules as ticket functionality. Pages MUST NOT retain a separate
synchronous sub-architecture.

## 9. Service and Layer Contracts

### 9.1 Internal Services

Reusable internal capabilities MUST be modeled with `Context.Service` and MUST use globally unique
identifiers containing `@cycle/database` and the owning module name.

Each service interface MUST:

- expose only operations needed by its consumers;
- return Effects for SQL, Git, clock, concurrency, mutable-state, logging, and schema-boundary work;
- expose typed expected failures;
- normally have `Requirements = never` on each method;
- capture `SqlClient`, clock, registry, identity, ID generation, and other implementation
  dependencies in its live layer;
- use `Service.of` when constructing implementations.

Pure transformations MUST remain ordinary functions and MUST NOT be converted into services or
wrapped in `Effect.sync`.

### 9.2 Layer Graph

The live graph MUST be composed once near `DatabaseServiceLive.ts` and MUST follow these ownership
rules:

1. `makeSqliteLayer` owns the SQLite client and applies `databaseProjectionMigrations`.
2. Projection store layers capture the same `SqlClient.SqlClient` instance.
3. Repository registry and keyed coordination state are allocated in layers, not at module import
   time.
4. Materialization and write-coordination layers capture their projection, registry, clock, and
   storage dependencies.
5. Domain command layers capture the focused dependencies they use.
6. The facade layer assembles `DatabaseService.of(...)` by delegating to command, query, and
   repository services.
7. Dependencies supplied only to construct the database service MUST be hidden from the resulting
   `DatabaseService` layer with `Layer.provide` rather than leaked to callers.

The graph MUST reuse layer values so memoization produces one instance of each intended resource.
It MUST NOT create a SQLite layer, runtime, registry, or coordination primitive per request.

### 9.3 Public Construction API

`DatabaseLive` and `DatabaseLiveWithOptions` SHOULD remain the supported public construction API.
`DatabaseServiceOptions.projectionPath` MAY remain supported without changing its semantics.

The deprecated synchronous `makeDatabaseService(identity, ids, options)` API MUST be removed. A
replacement constructor, if required for testing or embedding, MUST return an Effect or Layer and
MUST receive or require `SqlClient` through Effect context rather than constructing and running a
runtime internally.

`DatabaseService.close` MUST be removed from the public service shape. Closing SQLite and any
scoped coordination resources is the responsibility of the owning layer scope. All in-repository
callers and stubs MUST be updated in the atomic change.

### 9.4 Public Facade

`DatabaseService` MUST remain the one primary capability consumed by the use-case and application
layers. Its operations MAY remain flat or be grouped by domain, provided that:

- the resulting facade has one documented organization;
- every existing in-repository workflow is migrated in the same change;
- delegation contains no SQL, Git transaction construction, materialization, or domain algorithm;
- a facade operation performs at most input routing, delegation, and public error normalization;
- tests can replace the facade with a small deterministic test layer.

The package root MUST continue to export public domain contracts from their canonical owning
modules. It MUST NOT export the internal component services listed in Section 8.

### 9.5 Configuration

The refactor MUST NOT add a second configuration path. `DatabaseServiceOptions.projectionPath`
remains the only database-package construction option in scope and MUST default to `":memory:"` when
omitted.

Configuration MUST be captured when constructing the live layer. Production domain and projection
services MUST NOT read `process.env`. An invalid or unusable projection path MUST fail layer
acquisition through the typed SQLite-layer failure; it MUST NOT fall back silently to an in-memory
database.

Configuration is fixed for the lifetime of the layer. Runtime reload is out of scope; changing the
projection path requires construction of a new layer and scope.

### 9.6 External Dependency Boundaries

`RepositoryStoreShape` MUST remain the sole Git persistence capability consumed by repository
coordination, materialization, and write services. Direct `@cycle/git-store` implementation calls
MUST remain inside `RepositoryStore.ts` or the composition/testing boundary. Domain command modules
MUST depend on the database-owned store contract, not on Git-store implementation services.

The refactor MUST preserve the required store capabilities for snapshot resolution, history, diff,
event reads, event appends, transactions, and synchronization. It MAY refine their TypeScript
signatures if `RepositoryStore.ts` and every implementation are updated atomically. Store errors
MUST be normalized only when they cross into database workflows.

`SqlClient.SqlClient` MUST remain the sole production SQL execution capability. Projection modules
MUST NOT open a driver, discover a database path, or depend directly on a Node SQLite API.

Identity and ID generation MUST continue to enter through `DatabaseIdentity` and
`DatabaseIdGenerator`. Commands MUST NOT read process identity, generate IDs with a private utility,
or obtain current time outside the Effect services captured by their layers.

## 10. Effect Boundary Rules

### 10.1 Runtime Execution

Production files under `packages/database/src` MUST NOT call:

- `Effect.runSync`;
- `Effect.runPromise`;
- `Effect.runFork` or another `Effect.run*` variant;
- `Layer.build`, `Layer.buildWithScope`, or an equivalent local runtime bridge;
- `Scope.make`, `Scope.close`, or manual scope extension.

Effects MUST be run only by application, script, or test-runner boundaries outside production
database services.

### 10.2 Effect Construction

All multi-step effectful workflows MUST use `Effect.gen` unless a short, direct combinator pipeline
is clearer. Exported and service workflow functions MUST use `Effect.fn("QualifiedName")`; the name
MUST match the function or service method represented in traces.

The implementation MUST NOT:

- wrap deterministic calculations in `Effect.sync`;
- use `Effect.sync` around code that may throw;
- create a zero-argument `() => Effect` solely to make an already-lazy Effect lazy;
- hide error or requirement channels with casts;
- call `Effect.run*` inside another Effect;
- catch every failure when only one tagged failure requires recovery.

Throwing synchronous platform or JSON calls MUST use `Effect.try`. Promise APIs that can reject MUST
use `Effect.tryPromise`. Effects that fail with domain errors MUST use `Effect.fail` or yield the
error directly.

### 10.3 Time and Duration

Business and service logic MUST use Effect `Clock` or `DateTime` for current time and elapsed-time
measurement. Production workflow code MUST NOT call `Date.now()`, construct `new Date()` to obtain
the current time, or call `performance.now()` directly.

Formatting a timestamp from a value already supplied by `Clock` MAY use the pinned Effect
`DateTime` API or another non-throwing pure formatter verified against the installed version.

### 10.4 Native Capability Preference

Before adding a local abstraction, the implementation MUST check the APIs exported by the pinned
`effect@4.0.0-beta.78`, `@cycle/sqlite`, `@cycle/git-store`, and the supported Node.js runtime.

The following existing capabilities SHOULD be used where applicable:

- `SqlClient.withTransaction` for SQL transaction ownership and rollback;
- `SqlSchema.findAll`, `findOne`, `findOneOption`, and `void` for schema-protected SQL boundaries;
- `Schema.decodeUnknownEffect`, `Schema.encodeUnknownEffect`, and JSON codecs for persisted values;
- `Clock` and `DateTime` for time;
- `Encoding.encodeBase64Url` and `Encoding.decodeBase64UrlString` for opaque cursors instead of
  direct `Buffer` conversion;
- `Ref`, `SynchronizedRef`, semaphore/resource-map primitives, and structured concurrency for
  shared state and exclusion;
- `Option`, `Result`, `Match`, `Predicate`, `Array`, `Record`, and `String` utilities when they
  directly model the operation.

Use of a Node.js standard library primitive is acceptable when it is deterministic, isolated, and
better matched than an Effect capability. Direct Node.js filesystem, process, database, timer, or
resource-lifecycle APIs MUST NOT be introduced into core database services.

## 11. SQL and Projection Contracts

### 11.1 SQL Client Boundary

Every projection operation MUST return an Effect. The current synchronous `SqliteDatabaseLike`
interface and synchronous `Projection` class API MUST be removed.

SQL operations MUST use the Effect SQL client supplied by the live layer. Query parameters MUST be
bound through the SQL client's statement API. `sql.unsafe` MUST be confined to static,
repository-owned migration statements or an audited dynamic SQL builder in which all external
values remain bound parameters.

A SQL helper MUST add actual policy—such as request encoding, row decoding, or error mapping. A
helper that only takes `() => projection.method()` and catches a throw MUST NOT exist.

### 11.2 Transactions

Projection writes that activate a materialized snapshot MUST execute inside one
`SqlClient.withTransaction` effect. The transaction body MUST directly compose effectful store
operations. It MUST NOT use a synchronous callback, mutable transaction context, or nested
`Effect.runSync` call.

Failure or interruption before snapshot activation MUST roll back every row change in the
transaction. Snapshot activation MUST be the final logical write after deletes, upserts, history,
warnings, search, inbox, page, and metadata operations succeed.

Local inbox-state mutations that update multiple rows MUST also use `SqlClient.withTransaction`.

### 11.3 Migrations

The existing migration list and schema version MUST remain unchanged unless a separate correctness
change is explicitly approved. Migration code MUST use the repository's Effect migration runner and
the pinned SQL client.

Migration code MUST NOT tokenize SQL by splitting an arbitrary SQL string on semicolons. Migrations
SHOULD declare statements individually or use a driver operation that explicitly supports a static
SQL batch. No user-controlled value may enter an unsafe migration statement.

Runtime projection constructors MUST NOT inspect tables and apply ad hoc migrations. Schema setup
and version handling belong exclusively to the migration layer.

### 11.4 Row Schemas

Every result row crossing from SQLite into domain code MUST be decoded by a schema owned by the
corresponding projection module. Row schemas MUST express SQLite nullability and numeric/string
representations before mapping to domain values.

Row-to-domain conversion MUST be separated into:

1. SQL row decoding;
2. persisted JSON decoding where applicable;
3. a pure mapping from validated values to the domain value.

SQL queries SHOULD use `SqlSchema` when its cardinality helpers match the query. When a dynamic
query cannot use `SqlSchema` cleanly, it MUST still decode returned rows with
`Schema.decodeUnknownEffect` before domain mapping.

Type assertions MUST NOT substitute for row validation. Optional rows SHOULD use `Option` inside
projection services and MAY be normalized to `null` only at the public facade if the existing API
requires it.

### 11.5 JSON Persistence

Persisted JSON MUST use a schema codec in both directions. Decoding MUST:

1. parse text with an Effect-aware JSON/schema codec or `Effect.try`;
2. validate the parsed representation with `Schema.decodeUnknownEffect`;
3. map parsing and schema failures into the typed boundary error for the owning operation.

Encoding MUST use `Schema.encodeUnknownEffect` when a schema owns the value and MUST wrap any
remaining throwing JSON serialization boundary with `Effect.try`.

Production database code MUST NOT use `Schema.decodeUnknownSync`, `Schema.encodeUnknownSync`, or a
throwing schema constructor for untrusted input.

### 11.6 Query Composition

Common filtering and pagination rules MAY be expressed as pure query-plan values. A query-plan
builder MUST accept validated domain input and emit only closed, known SQL fragments plus separately
bound values.

Ticket, catalog, inbox, page, search, and history SQL MUST remain with their owning projection
store. A generic SQL module that knows every table is prohibited.

## 12. Repository Runtime and Concurrency

### 12.1 Registry State

The repository registry MUST own the mapping from `repositoryId` to `RepositoryRuntime`. The state
MUST be allocated by its layer and accessed through `Ref`, `SynchronizedRef`, or another Effect
state primitive appropriate to the required atomicity.

Registry operations MUST include effectful registration, lookup, update of cached Cycle metadata,
and removal/cleanup if the public repository lifecycle supports it. Missing lookup MUST fail with
`DatabaseRepositoryNotFoundError`.

No command or projection module may capture or mutate the registry's backing collection directly.

### 12.2 Per-Repository Exclusion

Sync, rebuild, and Git-backed write workflows MUST acquire the same keyed permit for a repository.
The permit MUST be released automatically on success, typed failure, defect, or interruption.

The implementation MUST use an Effect-native semaphore or keyed scoped-resource mechanism supported
by the pinned version. It MUST NOT implement exclusion with polling, mutable booleans, or assumptions
about fiber start order.

Operations for different repository IDs SHOULD be able to proceed concurrently. Reads MAY proceed
while materialization planning occurs, but MUST observe only the last activated SQL snapshot.

### 12.3 Resource Lifecycle

Registry state, coordination resources, and any background fibers MUST be owned by a layer scope.
If the implementation starts background work, it MUST use structured scoped fibers and MUST prove
shutdown interruption in a test. The refactor MUST NOT introduce detached fibers.

The SQLite resource MUST be closed by the SQLite layer finalizer exactly once. Database services
MUST NOT expose or invoke an additional close path.

### 12.4 Registry Lifecycle

The in-memory runtime registry has these transitions:

| State                       | Trigger                                  | Required outcome                                                                                                     |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| absent                      | layer construction                       | Lookup fails with `DatabaseRepositoryNotFoundError`                                                                  |
| absent to registered        | successful `openRepository` registration | Runtime store and repository metadata become available to coordinators                                               |
| registered to registered    | reopening the same repository ID         | Registration is atomically replaced with the new supplied runtime and the projection registration remains consistent |
| registered metadata update  | successful snapshot activation           | Cached Cycle metadata changes only after the projection transaction commits                                          |
| registered with failed sync | initial or later sync failure            | Runtime remains registered and the projection status exposes the failure without activating partial rows             |
| any to unavailable          | owning layer scope closes                | SQL and scoped resources finalize; no public manual-close operation remains                                          |

Repository registration MUST be complete before sync begins. A failed sync MUST NOT silently remove
the registration, because callers need to inspect status and retry. Registry state MUST NOT claim
new Cycle metadata before the corresponding SQL snapshot is active.

## 13. Materialization Contracts

### 13.1 Materialization Plan

Materialization planning MUST produce an explicit immutable `MaterializationPlan` value containing,
at minimum:

- repository ID;
- previous and target snapshot IDs;
- full-rebuild versus incremental mode;
- ticket, record, user, label, saved-view, template, page, comment, history, commit, commit-change,
  warning, and inbox upserts;
- deleted identifiers for every supported projected entity;
- resolved Cycle repository metadata.

The plan MUST contain no live SQL transaction, service context, scope, mutable callback, or deferred
Effect execution.

### 13.2 Planning Phases

The materialization workflow MUST separate these phases:

1. select incremental history or full history;
2. read ordered event changes through `RepositoryStore`;
3. decode event metadata and payloads;
4. fold valid events into pure aggregate state;
5. detect non-additive changes and choose full-rebuild fallback when required;
6. derive warnings, history rows, commit changes, and inbox items;
7. assemble an immutable materialization plan;
8. hand the plan to the projection writer.

The orchestrating function MAY sequence all phases, but each phase MUST delegate its algorithm to a
focused module. It MUST NOT contain entity-specific switch logic for every domain type.

### 13.3 Event Folding

Event folding SHOULD be pure after payload decoding. Entity-specific event unions MUST be handled by
focused ticket, page, comment, draft, user, label, view, template, and repository-metadata handlers.
Non-trivial tagged unions MUST be exhaustive.

Expected invalid source data MUST become a typed fold result that the materializer can convert into
a `MaterializationWarning`. An invalid individual object MUST NOT be represented by an uncaught
throw or defect.

Programmer invariants MAY remain defects only when continuing would make state correctness
unknowable. The distinction between invalid persisted data and a broken program invariant MUST be
covered by tests.

### 13.4 Plan Application

The projection writer MUST apply a plan using an algorithm equivalent to:

```text
apply(plan):
  begin Effect SQL transaction
  if plan is full rebuild:
    clear repository projection rows
  apply entity deletes
  apply entity upserts
  apply page and comment projection changes
  upsert commits and replace commit changes
  replace materialization warnings
  apply derived inbox items
  write Cycle repository metadata
  activate target snapshot as the final logical operation
  commit transaction
  return repository status
```

Entity operations MAY be batched with `Effect.forEach` or native SQL batching where supported.
Concurrency inside one SQLite transaction MUST remain sequential unless the driver explicitly
supports safe concurrent use and a test proves atomic behavior.

## 14. Write Workflow Contracts

### 14.1 Immutable Write Plans

The current mutable `DatabaseTransaction` event buffer, `closed` flag, and manual `abort` behavior
MUST be replaced by an immutable write-plan model.

A domain command MUST build a value equivalent to:

```text
WritePlan<A>:
  command tag
  repository ID
  affected object ID, when known
  ordered event append requests
  commit author and committer
  commit message
  result description needed after commit
  visibility assertion description
```

Constructing the plan SHOULD be pure after the command has obtained its actor, IDs, current
projection state, and timestamp through Effects.

### 14.2 Commit and Resync

The write coordinator MUST execute a write plan under the repository's keyed permit:

```text
execute(plan):
  require registered repository
  read previous active projection snapshot
  run one RepositoryStore.transaction
    append every event in plan order
    commit through RepositoryStore transaction ownership
  obtain committed snapshot ID
  materialize previous -> committed snapshot
  verify affected object visibility through an effectful projection query
  return command result
```

The coordinator MUST rely on `RepositoryStore.transaction` for Git transaction acquisition,
commit, abort, and finalization. It MUST NOT emulate a transaction lifecycle with mutable closure
state.

If Git commit succeeds and materialization or visibility verification fails, the coordinator MUST
return `DatabaseConsistencyError` with the context required by the existing database specification.

### 14.3 Domain Commands

Ticket, draft, catalog, page, and inbox modules MUST own their respective validation and event-plan
construction. Shared command policy MAY be extracted only when at least two command modules use the
same invariant or protocol.

A command module MUST NOT call SQL directly. Reads needed to validate or assemble a command MUST go
through the appropriate projection service.

Repeated command workflows SHOULD share a single write-coordinator operation rather than duplicating
Git commit, resync, visibility, and consistency-error logic.

## 15. Failure Model

### 15.1 Failure Ownership

Expected failures MUST remain in the Effect error channel and MUST be mapped once at the boundary
that owns their meaning:

| Boundary                                    | Required failure mapping                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| SQL execution                               | `DatabaseSqliteError` with stable operation name and safe cause                |
| SQL row or persisted projection JSON decode | A schema-backed projection decode/SQLite failure with operation and safe cause |
| Git store operation                         | `DatabaseStorageError` with stable operation name and safe cause               |
| Public command input                        | `DatabaseValidationError` or the existing specific Pages failure               |
| Invalid GitDB event/object                  | Typed fold failure converted to `MaterializationWarning` when object-local     |
| Materialization orchestration               | `DatabaseMaterializationError` with repository context                         |
| Post-commit projection failure              | `DatabaseConsistencyError`                                                     |
| Missing open repository                     | `DatabaseRepositoryNotFoundError`                                              |
| Workflow policy violation                   | `DatabaseWorkflowError` or the applicable Pages failure                        |

The implementation MAY introduce a schema-backed `DatabaseProjectionDecodeError` if it improves the
contract. If introduced, it MUST be included in `DatabaseFailure`, exported from
`@cycle/database/errors`, and handled by all exhaustive consumers in the atomic change.

### 15.2 Recovery

Recovery MUST be targeted by tag or predicate. The implementation MUST NOT use a catch-all solely to
turn every failure into `DatabaseFailure` when individual failures require different policies.

Local SQL failures MUST NOT be retried automatically. Existing remote push divergence recovery MAY
remain, but it MUST be bounded to the documented rebase-and-retry workflow. Defects and
interruptions MUST NOT be retried or converted into empty results.

### 15.3 Defects and Interruption

Defects are reserved for broken internal invariants and programmer errors. Invalid command input,
invalid persisted rows, malformed external events, missing repositories, and storage failures are
not defects.

Interruption MUST propagate through SQL and Git transactions so their native finalizers roll back or
release resources. Ordinary domain code MUST NOT catch interruption or inspect `Cause`.

## 16. Complexity and Module Quality

No numeric size or complexity ceiling is required. Conformance instead requires all of the
following:

1. Each production module has one stated primary responsibility.
2. A workflow function orchestrates phases or implements one phase; it does not do both for every
   supported entity.
3. Domain-specific branches are moved behind entity-specific handlers or exhaustive tagged-union
   matching.
4. Repeated SQL, schema, transaction, and error policy is centralized in the narrow owner of that
   policy.
5. Local abstractions MUST remove more complexity from callers than they add to their own public
   interface.
6. One-line wrappers that only rename an existing Effect/Node API SHOULD be removed.
7. Pure algorithms remain pure and receive values explicitly.
8. Mutable state is local to its owning layer or pure fold and is not shared through module-level
   variables.
9. Cross-domain convenience re-exports and generic helper buckets are prohibited.
10. Reviewers MUST be able to identify the owner of a query, event handler, codec, command, and
    runtime resource from its import path.

During review, any module that begins accumulating a second subsystem MUST be split at that seam,
even when it remains below an arbitrary line count.

## 17. Observability

All meaningful service operations MUST use qualified `Effect.fn` names. Repository open, sync,
rebuild, materialization, Git write, projection apply, and post-write verification SHOULD have
named spans or the spans supplied by their `Effect.fn` boundaries.

Structured log annotations MUST include, where applicable:

- `service: "@cycle/database"`;
- `repositoryId`;
- `command`;
- previous and target snapshot IDs;
- full-rebuild flag;
- entity counts;
- warning count;
- elapsed duration.

Annotations MUST remain low-cardinality except for identifiers needed to diagnose a single
operation. Logs and span annotations MUST NOT include full ticket/page/comment bodies, record
payloads, event payloads, tokens, credentials, or raw persisted JSON.

Elapsed durations MUST be measured through Effect time services so tests can provide deterministic
time when timing behavior matters.

## 18. Security and SQL Safety

The refactor MUST preserve the existing unsafe-content validation for public writes.

SQL values MUST be parameterized. Dynamic identifiers or SQL fragments MUST come from closed,
repository-owned enumerations or constructors and MUST never include untrusted text directly.

Schema and SQL errors included as causes MUST not be rendered into logs when doing so could expose a
full persisted payload. User content MUST remain in GitDB and the SQLite projection as defined by
the existing specification; the refactor MUST NOT add caches, temporary files, or telemetry sinks.

## 19. Test Strategy

### 19.1 Test Framework

Effect tests MUST use `@effect/vitest` and `it.effect`. The custom
`packages/database/test/effect-vitest.ts` adapter MUST be removed. Tests MUST NOT call
`Effect.runPromise` inside an Effect test.

Test layers MUST supply deterministic identity, ID generation, Git stores, clocks when relevant,
and SQLite dependencies. Tests SHOULD exercise public service contracts or focused internal service
contracts rather than reaching through implementation objects.

### 19.2 Architecture Tests

An automated architecture test MUST recursively scan production TypeScript under
`packages/database/src` and fail on at least these patterns:

- any `Effect.run*` call;
- `Scope.make` or `Scope.close`;
- `Layer.build` or `Layer.buildWithScope`;
- `Schema.decodeUnknownSync` or `Schema.encodeUnknownSync`;
- imports from `@cycle/sqlite/sync` or `node:sqlite`;
- synchronous prepared-statement wrappers;
- direct construction of the removed synchronous `Projection` implementation;
- direct current-time reads with `Date.now()`, `new Date()`, or `performance.now()` in service
  workflow modules.

The test MAY use synchronous Node filesystem APIs because the test itself is an integration/tooling
boundary.

### 19.3 Unit Tests

Focused tests MUST cover:

- every persisted row schema, including nullability and malformed rows;
- JSON encode/decode round trips for projection-owned JSON columns;
- valid and invalid cursor decoding;
- event handlers for each aggregate type;
- distinction between object-local invalid events and fatal invariants;
- incremental-history selection and full-rebuild fallback;
- inbox derivation and recipient matching;
- immutable write-plan construction for each command family;
- error mapping at SQL, schema, Git storage, materialization, and consistency boundaries;
- registry lookup/update behavior;
- keyed exclusion release on success, failure, and interruption.

Pure fold and query-plan tests MUST not require SQLite or a Git repository.

### 19.4 Integration Tests

Integration tests through `DatabaseService` MUST preserve all currently passing database package
behaviors, including:

- repository open and initial hydration;
- event-only ticket persistence and rebuild;
- ticket, record, comment, page, catalog, inbox, history, and search operations;
- incremental sync and full rebuild;
- write visibility after commit;
- consistency failures after a committed write;
- invalid-object warnings;
- multiple repositories in one SQLite client;
- projection transaction rollback;
- resource finalization when the layer scope closes.

At least one concurrency test MUST prove that two writes or syncs for the same repository do not
overlap. A separate test SHOULD prove that operations for two repositories are not globally
serialized.

### 19.5 Consumer Validation

Tests and typechecks for direct consumers MUST pass after public contract migration. This includes
at least:

- `@cycle/usecases`;
- `@cycle/backend`;
- `@cycle/api`;
- `@cycle/desktop`;
- public testing layers and stubs that construct `DatabaseServiceShape`.

No consumer may retain a cast or compatibility stub solely to emulate a removed `close` or
synchronous constructor.

### 19.6 Benchmark

`packages/database/test/database-benchmark.test.ts` MUST continue to pass with its existing dataset,
assertions, and timeout. No percentage regression threshold is required.

The refactor MAY reorganize benchmark setup for changed public APIs, but MUST NOT reduce the
workload, remove assertions, increase the timeout, or skip benchmark operations to obtain a pass.

## 20. Reference Workflows

### 20.1 Effect-Native Projection Read

```text
ProjectionTicketStore.get(repositoryId, ticketId):
  execute parameterized query with SqlClient
  decode optional row with SqlSchema or Schema.decodeUnknownEffect
  decode schema-owned JSON columns effectfully
  map validated row to TicketDocument purely
  map SQL/schema failures to the owning typed failure
  return Option<TicketDocument>
```

### 20.2 Repository Sync

```text
RepositoryCoordinator.sync(repositoryId):
  acquire keyed repository permit
  load RepositoryRuntime from RepositoryRegistry
  mark sync started in ProjectionRepositoryStore
  resolve current GitDB snapshot
  if no snapshot:
    atomically clear repository projection and activate empty state
  else if snapshot unchanged:
    refresh active repository status
  else:
    build MaterializationPlan
    apply plan atomically through ProjectionWriter
  update cached Cycle metadata through RepositoryRegistry
  emit structured completion data
  on typed failure:
    mark sync failed without replacing the previous active snapshot
    preserve and return the mapped failure
```

The coordinator MUST provide an internal variant for a caller that already holds the keyed permit so
write-and-sync does not deadlock by acquiring the same permit recursively.

### 20.3 Git-Backed Command

```text
TicketCommands.updateTicket(input):
  validate public input effectfully
  obtain actor, IDs if needed, and current timestamp
  read current ticket through TicketProjectionStore
  apply pure domain transition
  build immutable ordered WritePlan
  delegate plan to WriteCoordinator
  return the coordinator result
```

### 20.4 Invalid Event

```text
foldEvent(rawEvent):
  decode event path and payload effectfully
  select aggregate-specific pure handler
  if payload or state transition is invalid for one object:
    return object-local fold issue
  if handler reports a broken program invariant:
    fail the materialization workflow

materialize(fold issue):
  suppress the invalid object and dependent rows as required
  append redacted MaterializationWarning
  continue folding unrelated objects
```

## 21. Validation Commands

The final change MUST pass, from the workspace root:

```text
pnpm --filter @cycle/database typecheck
pnpm --filter @cycle/database test
pnpm typecheck
pnpm lint
pnpm format:check
```

The database benchmark MUST run as part of the package test suite and pass unchanged as specified in
Section 19.6. If consumer packages expose separate test scripts, their affected tests MUST also be
run; repository-wide typecheck alone is not a substitute for behavioral consumer tests.

## 22. Definition of Done

The atomic refactor is complete only when all of the following are true:

1. The existing database behavioral tests pass through the refactored `DatabaseService` facade.
2. The current benchmark passes without weakening its workload or timeout.
3. Every direct in-repository consumer compiles and its affected tests pass.
4. No production database source calls `Effect.run*`, manually constructs/closes a scope, or builds
   a Layer into a local context.
5. No production database source uses synchronous Schema decoding for untrusted input.
6. The synchronous projection adapter and deprecated synchronous service constructor are removed.
7. SQLite acquisition, migration, transaction, and finalization are owned by layers and the Effect
   SQL client.
8. Repository registry and keyed write/sync exclusion are Effect-owned and test-covered.
9. SQL rows and persisted JSON are decoded effectfully into typed failures.
10. Materialization planning and application are separated by an immutable plan.
11. Git command planning uses immutable event batches and `RepositoryStore.transaction`; no custom
    mutable transaction lifecycle remains.
12. The public facade contains delegation rather than domain, SQL, materialization, or lifecycle
    implementation.
13. Catch-all modules have been deleted or reduced to one focused responsibility, and their former
    concerns have canonical owners.
14. The architecture tests in Section 19.2 prevent the removed boundary violations from returning.
15. Package and repository typecheck, lint, format, and required tests all pass with no ignored
    diagnostics or new casts around Effect error/requirement channels.

## 23. Implementation Review Checklist

Reviewers MUST confirm:

- each internal service identifier is stable and globally unique;
- service methods have named `Effect.fn` spans and no accidental requirements;
- layer dependency direction matches Section 8;
- one SQLite client is shared by all projection stores in one database layer;
- transaction rollback and interruption behavior are tested;
- all schema errors are mapped at their owning boundary;
- no invalid persisted object becomes an ordinary defect;
- no retry is unbounded;
- no user content or secret-bearing payload is logged;
- all removed public APIs have no remaining in-repository consumers;
- migrations and the SQLite schema are behaviorally unchanged;
- the implementation uses pinned Effect v4 APIs verified against installed declarations rather
  than examples from another Effect version;
- no unresolved compatibility shim or follow-up phase is required for the repository to work end to
  end.
