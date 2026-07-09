# Cycle SQL Refactor Specification

Status: Draft implementation specification

Version: 0.1.0

Date: 2026-07-09

Scope: `@cycle/sqlite`, `@cycle/database`, SQLite-backed consumers, tests, package exports, and
runtime composition that provides SQLite layers.

## 1. Purpose

This specification defines the end-to-end refactor from synchronous, class-centered, raw SQLite
access to declarative Effect SQL services.

The target is a consistent SQL architecture where:

- `@cycle/sqlite` is the only Cycle package that owns SQLite platform setup.
- `@cycle/database` consumes an Effect SQL layer and keeps one app-wide projection database for all
  opened repositories.
- table access is model-first and schema-backed.
- repository/query code is split into focused Effect services instead of a monolithic projection
  class.
- current synchronous SQLite consumers are migrated to Effect SQL.
- direct Node imports are minimized and isolated to infrastructure boundaries.
- breaking API cleanup is allowed when it reduces compatibility wrappers and accidental surfaces.

## 2. Normative Language

The keywords `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are
to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the concrete mechanism, but it MUST
document the choice in code or package documentation and expose enough tests for reviewers to
reason about the behavior.

`Model-first SQL` means every persisted table row, request payload, and decoded result has a
canonical Effect Schema or Effect `Model` contract before application code reads or writes it.

## 3. Source Guidance

Work covered by this specification MUST follow:

- root and package `AGENTS.md` guidance for Effect v4, package boundaries, and file layout.
- `packages/database/SPEC.md` for the current GitDB-backed projection semantics.
- `packages/sqlite/SPEC.md` for the existing SQLite infrastructure intent.
- `vendor/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts`.
- `vendor/effect-v4/packages/effect/src/unstable/sql/SqlSchema.ts`.
- `vendor/effect-v4/packages/effect/src/unstable/sql/SqlModel.ts`.
- `vendor/effect-v4/packages/effect/src/unstable/sql/SqlResolver.ts`.
- `vendor/effect-v4/packages/effect/src/unstable/sql/Migrator.ts`.
- `vendor/effect-v4/packages/effect/src/unstable/schema/Model.ts`.
- `vendor/effect-v4/packages/sql/sqlite-node/src/SqliteClient.ts`.
- `vendor/effect-v4/packages/sql/sqlite-node/src/SqliteMigrator.ts`.
- the existing `@cycle/git-worktrees` Effect SQL pattern in
  `packages/git-worktrees/src/WorktreeStore.ts`.

The implementation MUST use the vendored Effect v4 APIs available in this repository rather than
inventing local SQL abstractions that duplicate them.

## 4. Problem Statement

Cycle already intends `@cycle/sqlite` to be the shared local SQLite infrastructure package, but the
current implementation still mixes two database styles:

- `@cycle/sqlite` has an Effect SQL layer built on `@effect/sql-sqlite-node`.
- `@cycle/sqlite/sync` exposes a direct synchronous `node:sqlite` compatibility API.
- `@cycle/database` opens that synchronous API in `Projection`.
- `DatabaseService` constructs `Projection` outside scoped Effect resource acquisition and wraps
  projection calls with `Effect.try`.
- `Projection` combines schema DDL, migrations, row types, query building, JSON decoding, search,
  projection writes, cursor encoding, and transaction control in one large class.
- SQLite queries commonly use `prepare().get()`, `prepare().all()`, `prepare().run()`, row casts,
  and hand-written JSON parsing instead of `SqlClient`, `SqlSchema`, `SqlModel`, and Effect Schema.
- `@cycle/sqlite` currently exports internal path/vector helpers and sync compatibility from its
  root public API.
- `@cycle/database` owns home-directory/path helpers that directly import Node modules and pull
  SQLite filesystem concerns into the domain package.
- other packages still import `@cycle/sqlite/sync`, so the wrong boundary is reinforced outside
  `@cycle/database`.

This design works functionally, but it adds code and inconsistency. It prevents the SQL layer from
being composed through layers, limits typed SQL error handling, makes migrations harder to reason
about, encourages ad hoc query contracts, and keeps direct Node APIs in places that should be
Effect-managed services.

## 5. Goals

The implementation MUST:

1. Keep `@cycle/database` backed by one app-wide SQLite database that can project multiple
   repositories and support cross-repository reads, search, and referencing.
2. Keep GitDB as the durable source of truth for repository ticket data.
3. Make `@cycle/database` consume `SqlClient.SqlClient` from an Effect layer instead of opening
   SQLite directly.
4. Replace `Projection` as a synchronous monolithic class with focused Effect services and
   model-first repository/query modules.
5. Use Effect SQL primitives directly:
   - `SqlClient` for SQL statements, transactions, and scoped connections.
   - `SqlSchema` for request encoding and result decoding.
   - `SqlModel` where generated CRUD repositories fit the table shape.
   - `SqlResolver` where batched or deduped request loading is useful.
   - `Migrator` or the sqlite-node migrator for migration execution.
6. Define canonical row schemas/models for every SQLite table owned by `@cycle/database`.
7. Move projection DDL into migration records or migration modules executed by `@cycle/sqlite`
   layer construction.
8. Deprecate `@cycle/sqlite/sync` and remove production reliance on it.
9. Migrate current sync consumers to Effect SQL as part of this refactor.
10. Remove `@cycle/sqlite` root exports for internal path/vector implementation details.
11. Move database path discovery and home-directory defaults out of `@cycle/database` business
    logic and into runtime configuration/composition.
12. Use Effect utilities for clocks, crypto, encoding, configuration, filesystem access, logging,
    spans, resource management, and typed errors before writing custom wrappers.
13. Allow breaking public API cleanup in `@cycle/database`, `@cycle/sqlite`, and internal consumers
    when the compatibility surface exists only to preserve the old architecture.
14. Preserve user-visible database behavior unless this spec explicitly changes it.
15. Provide tests that prove the synchronous SQLite path is no longer used in production packages.

The implementation SHOULD:

1. Prefer package-owned imports over convenience re-exports.
2. Keep domain packages responsible for their own table schemas and migrations.
3. Use smaller focused services and files rather than adding a new ORM-like facade.
4. Favor declarative schemas, derived schema variants, and Effect-managed effects over handwritten
   validation, JSON parsing, cursor codecs, timing, and resource cleanup.
5. Keep migration steps reviewable by moving one table family or consumer package at a time.

## 6. Non-Goals

This specification MUST NOT:

1. Make SQLite the durable source of truth for repository tickets.
2. Split `@cycle/database` into one physical SQLite database per repository.
3. Replace GitDB event folding, Git history, Git synchronization, or repository identity semantics.
4. Implement a hosted database service.
5. Build a custom ORM or query builder that competes with Effect SQL.
6. Require every pure helper to become an Effect service.
7. Preserve old `@cycle/database` APIs where they prevent clean service boundaries.
8. Preserve root exports or subpaths that only exist as compatibility facades.
9. Require backward-compatible migration of rebuildable projection tables.
10. Force `SqlModel` onto query shapes where `SqlSchema` is clearer, such as composite keys,
    many-to-many tables, upserts, joins, FTS, aggregates, and materialization batches.

## 7. Target Package Graph

The target SQL-related dependency direction is:

```text
effect
  includes effect/unstable/sql and effect/unstable/schema

@effect/platform-node
@effect/sql-sqlite-node
  platform SQL integration

@cycle/sqlite
  owns SQLite layer construction, sqlite-node integration options, migrations input,
  pragmas, vector capability, path preparation, and SQLite infrastructure errors

@cycle/database
  owns GitDB-backed ticket command services, projection schema/models, projection
  repositories, materialization, search, inbox, repository status, and public database API

@cycle/agent-chat, @cycle/agents, @cycle/backend, @cycle/desktop, @cycle/git-worktrees
  own their table schemas and service APIs, and consume @cycle/sqlite layers where they need
  SQLite persistence
```

Consumers MUST import `SqlClient`, `SqlSchema`, `SqlModel`, `SqlResolver`, and schema `Model`
modules from `effect` directly. `@cycle/sqlite` MUST NOT re-export Effect SQL modules as a
convenience facade.

## 8. `@cycle/sqlite` Contract

### 8.1 Responsibilities

`@cycle/sqlite` MUST own:

- SQLite layer factories.
- file-backed and in-memory SQLite options.
- parent-directory preparation for file-backed databases.
- default foreign key pragma application.
- caller-provided pragma application.
- migration execution during layer construction.
- sqlite-vector loading and capability reporting.
- typed infrastructure errors.
- test helpers for in-memory layers.
- the deprecated synchronous compatibility subpath during the migration window.

`@cycle/sqlite` MUST NOT own:

- `@cycle/database` projection tables.
- agent chat, agent task, session, or worktree tables.
- ticket, chat, task, or session domain APIs.
- application default database paths.
- app-specific config loading.
- cross-package convenience exports for Effect SQL.

### 8.2 Public Exports

The package root MUST export only package-owned APIs:

- SQLite layer factories.
- layer option types and schemas.
- SQLite capability service and capability value types.
- package-owned typed error classes.
- package-owned test-layer entry points through `@cycle/sqlite/testing`.

The package root MUST NOT export:

- `src/internal` or `src/internals` modules.
- vector extension resolution helpers.
- path implementation helpers.
- `openSqliteSync`.
- Effect SQL modules imported from `effect` or `@effect/sql-sqlite-node`.

The package MAY keep `@cycle/sqlite/sync` as a deprecated subpath during this migration. That
subpath MUST be marked with JSDoc `@deprecated`, MUST NOT be exported from the root barrel, and
MUST NOT be imported by production code after this spec is complete.

### 8.3 Layer Construction

`@cycle/sqlite` MUST provide an Effect layer factory equivalent to:

```ts
type SqliteLayerOptions<R = never> = {
  readonly filename: string;
  readonly createParentDirectory?: boolean;
  readonly disableWAL?: boolean;
  readonly readonly?: boolean;
  readonly pragmas?: ReadonlyArray<string>;
  readonly migrations?: SqliteMigrationSource<R>;
  readonly vector?: "disabled" | "required";
};
```

Exact names are implementation-defined.

Layer construction MUST:

1. Prepare file-backed parent directories when requested.
2. Skip parent-directory creation for `:memory:`.
3. Open SQLite through `@effect/sql-sqlite-node`.
4. Provide `SqlClient.SqlClient`.
5. Provide the sqlite-node client service when extension loading or backup needs it.
6. Apply `PRAGMA foreign_keys = ON`.
7. Apply caller pragmas after foreign keys.
8. Resolve and load sqlite-vector when `vector` is `required`.
9. Run migrations after required extensions and pragmas are available.
10. Provide `SqliteCapabilities`.
11. Manage the connection with scoped Effect finalizers.

No consumer MUST need to call `close()` manually when it uses the provided layer.

### 8.4 Configuration and Paths

Application database paths MUST be supplied by runtime composition through `Config`, a
caller-provided options value, or another explicit layer. `@cycle/database` MUST NOT call
`homedir()` or construct default filesystem paths in business logic.

`@cycle/sqlite` SHOULD use `@effect/platform-node` filesystem/path services for path preparation.
Direct Node imports inside `@cycle/sqlite` are allowed only when no Effect or platform API exists
for the boundary, and MUST remain internal to the package.

### 8.5 Synchronous Compatibility Deprecation

`@cycle/sqlite/sync` MAY remain temporarily to avoid blocking unrelated work, but:

- it MUST be documented as deprecated.
- no new production code MAY import it.
- tests SHOULD fail if production packages import it after the migration phase that covers that
  package.
- final completion of this spec requires zero production imports of `@cycle/sqlite/sync`.
- removal of the subpath MAY happen in a later cleanup after all consumers have migrated.

## 9. `@cycle/database` Contract

### 9.1 Responsibilities

`@cycle/database` MUST own:

- the public database service contract for Cycle ticket/repository workflows.
- GitDB-backed command workflows.
- repository registration and repository status.
- SQL table models for the Cycle projection.
- SQL migration records for the Cycle projection.
- projection repositories for ticket, record, user, label, view, template, commit, warning, search,
  inbox, and repository tables.
- materialization from GitDB snapshots and deltas into SQL.
- cross-repository query APIs.
- typed domain errors that map SQL, schema, GitDB, validation, and consistency failures.

`@cycle/database` MUST NOT:

- open SQLite directly.
- import `node:sqlite`.
- import `@cycle/sqlite/sync`.
- own application default path discovery.
- expose synchronous projection objects.
- expose table repository internals as public API unless they are intentionally documented.
- re-export APIs from `@cycle/sqlite`, `@cycle/git-store`, or Effect SQL for convenience.

### 9.2 Single App-Wide Projection Database

One `DatabaseService` runtime MUST use one active SQLite database for all opened repositories in
that runtime. Repository-scoped tables MUST include `repository_id`.

The SQL schema MUST support:

- listing repositories.
- repository-scoped ticket queries.
- cross-repository ticket search.
- cross-repository inbox summary.
- cross-repository references and relationship lookup.
- repository history.
- per-ticket history.
- materialization warnings per repository and snapshot.

The implementation MAY store data for other packages in the same physical SQLite file when the
composition root chooses that path, but table ownership MUST remain with the package that owns the
domain.

### 9.3 Public API Cleanup

Breaking API changes are allowed. The replacement public API MUST be:

- Effect-native.
- service/layer based.
- schema-backed at process, persistence, and public adapter boundaries.
- explicit about dependencies such as identity, ID generation, GitDB stores, and SQLite.
- free of synchronous close/open lifecycle methods where a scoped layer can own lifetime instead.

The implementation MAY provide a small adapter for call sites during migration, but such adapters
MUST be internal, short-lived, and removed before this spec is complete.

## 10. Model-First SQL Policy

### 10.1 Table Row Contracts

Every SQLite table owned by `@cycle/database` MUST have a canonical row contract.

The row contract SHOULD be an Effect `Model.Class` when the table has a stable row shape and
benefits from derived select/insert/update/json variants. The row contract MAY be a `Schema.Class`,
`Schema.Struct`, or `Schema.TaggedClass` when `Model.Class` adds no value.

Row contracts MUST encode and decode:

- SQLite booleans through `Model.BooleanSqlite` or equivalent schemas.
- JSON text columns through `Model.JsonFromString`, `Schema.fromJsonString`, or explicit schema
  codecs.
- nullable columns through `Schema.NullOr`, `Schema.OptionFromNullOr`, or model optional helpers.
- date/time text through Effect schema/date-time helpers where possible.
- cursor payloads through Effect Schema and Effect encoding helpers, not `Buffer`.

Row contracts MUST reject invalid persisted rows with typed schema failures. Application code MUST
not cast unknown SQL rows to domain types without decoding.

### 10.2 `SqlModel` Usage

`SqlModel.makeRepository` SHOULD be used for tables where all of these are true:

- the table has a single-column primary key or a single stable id column that the generated
  repository can use.
- insert, update, find-by-id, and delete match the table semantics.
- soft delete, if present, maps cleanly to one nullable soft-delete column.
- generated SQL does not obscure important behavior.

Good candidates include single-id metadata tables and package-local stores that have simple
create/update/delete flows.

`SqlModel.makeRepository` SHOULD NOT be forced onto:

- composite-key tables such as repository-scoped ticket rows keyed by `repository_id` and
  `ticket_id`.
- join tables such as labels, relations, parents, and changes.
- FTS/search tables.
- aggregate or history views.
- upsert-heavy projection writes.
- multi-table materialization batches.

For those cases, modules MUST still be model-first, but they SHOULD define custom `SqlSchema`
queries and commands over explicit request/result schemas.

### 10.3 `SqlSchema` Usage

Custom SQL operations MUST use `SqlSchema` when they cross a query or persistence boundary.

Use:

- `SqlSchema.findAll` for list queries.
- `SqlSchema.findOne` when absence is exceptional.
- `SqlSchema.findOneOption` when absence is expected.
- `SqlSchema.findNonEmpty` when at least one row is required.
- `SqlSchema.void` for commands where results are discarded.

Each operation MUST define:

- a request schema.
- a result schema when rows are returned.
- a typed error mapping to the owning service error.
- a clear operation name through `Effect.fn`, `Effect.withSpan`, or both.

Ad hoc `sql<T>` generic annotations MAY be used only as a local type aid inside an operation that
still decodes results through a schema before returning to application code.

### 10.4 `SqlResolver` Usage

`SqlResolver` SHOULD be used for repeated per-id or per-group lookups that can occur concurrently
inside materialization or query assembly.

The implementation SHOULD consider resolvers for:

- fetching tickets by repository/ticket ids.
- fetching users by normalized lookup keys.
- fetching comments or records by ticket ids.
- loading relationship groups.
- loading repository status rows.

Resolvers MUST remain transaction-aware by relying on Effect SQL's transaction connection context.

### 10.5 Transactions

SQL transactions MUST use `SqlClient.withTransaction`.

The implementation MUST NOT issue raw `BEGIN`, `COMMIT`, or `ROLLBACK` from application code except
inside infrastructure code that implements or adapts an Effect SQL client.

Materialization MUST apply each repository snapshot or delta atomically:

1. Build the materialization plan from GitDB.
2. Enter `SqlClient.withTransaction`.
3. Delete or upsert repository-scoped projection rows.
4. Insert warnings and search rows.
5. Activate the snapshot.
6. Exit the transaction.

If the transaction fails, the previous fully materialized snapshot MUST remain visible.

## 11. Database Package Layout

The implementation MUST split the current projection responsibilities into focused files.

Exact names are implementation-defined, but the package SHOULD converge on a shape similar to:

- `src/DatabaseService.ts`: public service tag, service interface, and live layer wiring.
- `src/DatabaseConfig.ts`: configuration schema or service for database runtime options.
- `src/DatabaseSchema.ts`: package-owned projection migration records and schema constants.
- `src/DatabaseProjection.ts`: projection/materialization service.
- `src/RepositoryRegistry.ts`: opened repository registry and status service.
- `src/TicketRepository.ts`: SQL ticket table operations.
- `src/RecordRepository.ts`: SQL record/comment table operations.
- `src/UserRepository.ts`: SQL user table operations.
- `src/LabelRepository.ts`: SQL label table operations.
- `src/ViewRepository.ts`: SQL saved-view table operations.
- `src/TemplateRepository.ts`: SQL issue-template table operations.
- `src/SearchRepository.ts`: FTS/search operations.
- `src/HistoryRepository.ts`: commit/history operations.
- `src/InboxRepository.ts`: inbox operations.
- `src/internal/*`: row mapping, SQL fragments, query normalization, cursor codecs, and helpers
  not intended for public import.
- `src/testing/*`: test layers and deterministic services.

Files SHOULD export one primary service, model family, or repository. Large mixed files that
combine table DDL, services, row decoding, and unrelated query families MUST be split.

## 12. Runtime Workflows

### 12.1 Layer Startup

Database startup MUST:

1. Receive SQLite through a provided layer or construct it by composing `@cycle/sqlite` with
   caller-supplied configuration.
2. Run projection migrations during layer construction.
3. Construct SQL repositories from `SqlClient`.
4. Construct projection and command services from SQL repositories, GitDB services, identity, ID
   generation, clock, crypto, and config services.
5. Expose the public `DatabaseService`.

Database startup MUST NOT instantiate a synchronous projection object.

### 12.2 Repository Opening

Opening a repository MUST:

1. Validate the repository input through schema-backed contracts.
2. Register or update the repository row.
3. Ensure required GitDB identity/metadata through GitDB services.
4. Read the watched GitDB pointer.
5. Materialize the current snapshot when needed.
6. Return the repository status from SQL.

The repository row MUST include enough metadata to support cross-repository UI views without
consulting GitDB for each list operation.

### 12.3 Materialization

Materialization MUST remain GitDB-to-SQL derived projection work.

The materializer MUST:

- fold GitDB events with typed event payload schemas.
- skip invalid source objects with materialization warnings.
- use SQL repository commands for all SQL writes.
- use `SqlClient.withTransaction` for atomic application.
- preserve the previous active snapshot when applying a new snapshot fails.
- annotate logs/spans with repository id, snapshot id, previous snapshot id, operation, row counts,
  warning counts, and elapsed time.

Materialization SHOULD use `Effect.forEach` and controlled concurrency where it improves code
clarity or performance without violating transaction or ordering requirements.

### 12.4 Writes

Ticket/domain writes MUST:

1. Validate command input.
2. Resolve the current actor through an Effect service.
3. Write to GitDB first.
4. Materialize the resulting GitDB delta into SQL.
5. Verify the affected object is visible in SQL when visibility is required.
6. Return the domain result from the materialized SQL/domain state.

If GitDB commit succeeds but SQL materialization fails, the public write MUST fail with a typed
consistency error that includes repository id, command name, previous snapshot id, committed
snapshot id, and object id when available.

### 12.5 Reads

Read APIs MUST query SQLite only after the repository is registered and materialized enough to
serve the requested state.

Reads MUST use schema-backed SQL query functions and MUST NOT read GitDB to compensate for missing
SQL projection data unless the API is explicitly documented as a GitDB-only draft or diagnostic
operation.

Cross-repository reads MUST accept repository filters through schema-backed request contracts and
MUST include repository ids in enough returned data for callers to disambiguate results.

## 13. Effect Coding Rules

Effectful functions that perform multiple steps MUST use `Effect.gen`.

Functions that return effects and are part of a service implementation SHOULD use
`Effect.fn("functionName")`; the name SHOULD match the function or method being defined. Additional
behavior such as error mapping, span annotation, and log annotation SHOULD be passed through Effect
combinators rather than wrapping returned functions in ad hoc thunks.

The implementation MUST avoid zero-argument thunks whose only purpose is returning an `Effect`.
Define the `Effect` directly and reuse it unless synchronous code must run before the effect is
created.

Boundary code MUST be wrapped deliberately:

- `Effect.succeed` for already-available values.
- `Effect.sync` for non-throwing synchronous side effects.
- `Effect.try` for throwing synchronous code that cannot be avoided.
- `Effect.tryPromise` for Promise APIs.

Custom recoverable errors MUST use `Schema.TaggedErrorClass` or `Schema.ErrorClass` unless there is
a documented reason to use another Effect error type.

The implementation SHOULD prefer:

- `Clock` over `Date` and `performance.now()` in domain services.
- `Crypto` over direct `node:crypto` in domain services.
- `Encoding` or schema base64/base64url transformations over `Buffer`.
- `Config` and `ConfigProvider` over raw environment reads.
- `FileSystem` and `Path` platform services over direct Node filesystem/path imports.
- `Effect.acquireRelease`, scoped layers, and `Effect.addFinalizer` over manual close methods.

## 14. Consumer Migration

This refactor MUST migrate all current production imports of `@cycle/sqlite/sync`.

Known current consumers include:

- `packages/database/src/store/Projection.ts`.
- `packages/database/src/paths.ts`.
- `packages/agent-chat/src/store/SqliteAgentChatStore.ts`.
- `packages/agents/src/AgentTaskSqliteStore.ts`.
- `packages/backend/src/internals/agentSessionStore.ts`.

Tests that import `@cycle/sqlite/sync` MUST be migrated unless they explicitly test the deprecated
compatibility subpath.

Each consumer migration MUST:

1. Define package-owned row schemas.
2. Define package-owned migrations.
3. Expose an Effect service/layer for the store.
4. Consume `SqlClient.SqlClient`.
5. Use `SqlSchema` or `SqlModel` according to this spec's model-selection policy.
6. Remove manual `close()` requirements from normal runtime composition.
7. Preserve package behavior or document an intentional breaking change.

`@cycle/git-worktrees` already follows the target direction and SHOULD be adjusted only where this
spec requires stricter export, model, or migration consistency.

## 15. Migrations and Storage Compatibility

Projection tables owned by `@cycle/database` are rebuildable from GitDB. The implementation MAY
replace the current projection schema with a new migration baseline if tests confirm projections
can be rebuilt.

Packages with non-rebuildable local state MUST provide migrations that preserve user-visible data
or explicitly document a breaking reset approved by this spec's implementer/reviewer.

Migration records MUST:

- be Effect values requiring `SqlClient.SqlClient`.
- use deterministic numeric ordering.
- be idempotent when rerun through the Effect SQL migrator.
- create indexes, FTS tables, triggers, and foreign keys in the owning package.
- avoid unvalidated string interpolation for identifiers.

Schema versioning MUST be handled by the migrator table, not by ad hoc `PRAGMA user_version` logic
inside domain services, unless a package documents why `user_version` is still required.

## 16. Error Model

`@cycle/sqlite` MUST expose typed infrastructure errors for:

- path preparation.
- connection opening.
- pragma application.
- migration execution.
- vector resolution/loading.

`@cycle/database` MUST expose typed domain errors for:

- repository not found.
- validation failure.
- GitDB storage failure.
- SQL failure.
- schema decode/encode failure.
- materialization failure.
- event fold failure.
- write/materialization consistency failure.
- workflow failure.

SQL errors from Effect SQL MUST be mapped at service boundaries into package-owned errors. Internal
repository modules MAY expose `SqlError` and `SchemaError` to the composing database service, but
public `DatabaseService` methods MUST use the package-owned error union.

Errors MUST include stable operation names and enough context for logs and tests to identify:

- repository id when repository-scoped.
- snapshot id when materialization-scoped.
- table or query family when SQL-scoped.
- field name when validation-scoped.
- original cause when available.

## 17. Observability

The implementation MUST emit structured logs or spans for:

- SQLite layer startup.
- migration start/completion/failure.
- repository registration.
- sync start/completion/failure.
- materialization plan construction.
- materialization transaction application.
- GitDB write commit.
- write-and-sync completion/failure.
- search queries that exceed an implementation-defined slow threshold.

Logs/spans SHOULD include:

- `service`.
- `operation`.
- `repositoryId`.
- `snapshotId`.
- `previousSnapshotId`.
- row counts by table family.
- `warningCount`.
- elapsed milliseconds from `Clock`.

Failures MUST be visible through typed errors and repository status surfaces without requiring a
debugger.

## 18. Security and Safety

SQL query construction MUST use Effect SQL interpolation for values.

Dynamic identifiers MUST be selected from explicit allowlists. The implementation MUST NOT pass
untrusted table names, column names, order fields, directions, pragmas, extension paths, or FTS
operators into `sql.unsafe`.

Caller-provided pragmas MUST be treated as trusted infrastructure configuration, not user input.

sqlite-vector extension paths MUST be resolved internally by `@cycle/sqlite`; callers MUST NOT
provide arbitrary extension paths.

Sensitive data MUST NOT be logged. Errors SHOULD preserve causes for diagnostics, but logs MUST
avoid dumping full SQL payloads, GitDB documents, or user-authored ticket/comment bodies unless the
log is explicitly diagnostic and redacted.

## 19. Reference Algorithms

### 19.1 Model Selection

```text
for each table:
  define row contract
  if single id column and standard CRUD semantics:
    provide SqlModel repository
  else:
    provide SqlSchema operations with explicit request/result schemas

  if operation returns rows:
    decode rows with result schema before returning

  if operation writes rows:
    encode request with request schema before SQL execution
```

### 19.2 Materialize Snapshot

```text
materialize(repositoryId, previousSnapshotId, currentSnapshotId):
  repository <- RepositoryRegistry.get(repositoryId)
  plan <- GitDbMaterializer.build(repository, previousSnapshotId, currentSnapshotId)

  SqlClient.withTransaction:
    if plan.fullRebuild:
      ProjectionRepositories.clearRepository(repositoryId)

    delete removed rows by table family
    upsert tickets, users, labels, views, templates
    upsert visible records and comments
    replace commit parents and changes
    replace search documents
    insert materialization warnings
    upsert inbox items
    activate repository snapshot

  return RepositoryStatusRepository.get(repositoryId)
```

### 19.3 Write And Sync

```text
writeAndSync(repositoryId, command, objectId, writeGitDb):
  repository <- RepositoryRegistry.get(repositoryId)
  previous <- RepositoryStatusRepository.activeSnapshot(repositoryId)
  committed <- writeGitDb(repository)

  status <- materialize(repositoryId, previous, committed.snapshotId)
    catch materializationError:
      mark repository sync failed
      fail DatabaseConsistencyError(previous, committed.snapshotId, command, objectId)

  verify required SQL visibility
  return committed.result
```

## 20. Test and Validation Matrix

### 20.1 Boundary Tests

The implementation MUST add or update tests that assert:

- no production file outside `@cycle/sqlite` imports `node:sqlite`.
- no production file imports `@cycle/sqlite/sync` after its migration phase is complete.
- `@cycle/database` does not call `openSqliteSync`, `prepare().get()`, `prepare().all()`, or
  `prepare().run()`.
- `@cycle/sqlite` root exports do not expose internals, vector resolution, path internals, or sync
  compatibility.
- consumers import Effect SQL modules from `effect`, not from `@cycle/sqlite`.

### 20.2 SQLite Layer Tests

`@cycle/sqlite` tests MUST cover:

- in-memory layer startup.
- file-backed parent-directory creation.
- foreign key pragma default.
- caller pragmas.
- migration success.
- migration failure mapping.
- vector disabled capability.
- vector required success or typed unavailable failure.
- scoped finalizer closes resources.
- deprecated sync subpath remains isolated and marked deprecated while it exists.

### 20.3 Database Projection Tests

`@cycle/database` tests MUST cover:

- layer startup with in-memory SQLite.
- migration idempotency.
- opening multiple repositories into one database.
- cross-repository list/search behavior.
- repository-scoped ticket reads.
- ticket create/update/archive/delete write-and-sync.
- comment/record write-and-sync.
- materialization warnings for invalid GitDB events.
- failed materialization preserves previous active snapshot.
- SQL visibility verification after writes.
- repository history and ticket history queries.
- inbox list, summary, read/unread/archive mutations.
- schema decode failure maps to typed database error.

### 20.4 Consumer Tests

Each migrated SQLite consumer MUST have tests proving:

- store layer starts with `makeInMemorySqliteLayer` or equivalent.
- migrations create required tables.
- core create/read/update/list workflows still pass.
- resources are scoped and do not require manual close in normal composition.
- package no longer imports `@cycle/sqlite/sync`.

### 20.5 Tooling Checks

The implementation SHOULD add repository-level scripts or tests equivalent to:

```text
rg 'node:sqlite' packages --glob '*.ts'
rg '@cycle/sqlite/sync' packages --glob '*.ts'
rg 'openSqliteSync|\\.prepare\\(' packages/database/src --glob '*.ts'
rg 'from "./internals|from "./internal' packages/sqlite/src/index.ts
```

These checks MAY allow test files that specifically exercise deprecated compatibility.

## 21. Implementation Phases

### Phase 1: SQLite Infrastructure Cleanup

1. Mark `@cycle/sqlite/sync` deprecated.
2. Remove sync, path internals, and vector internals from the root export.
3. Make layer options and migration input the preferred public surface.
4. Move path preparation toward `@effect/platform-node` services where practical.
5. Add boundary tests for exports and deprecated sync isolation.

### Phase 2: Database SQL Foundation

1. Add `@cycle/database` projection migration records.
2. Add row schemas/models for all current projection tables.
3. Add SQL repository modules by table family.
4. Add an in-memory `DatabaseTest` layer that composes `@cycle/sqlite/testing`.
5. Keep current public behavior while the old projection is still present.

### Phase 3: Projection Service Migration

1. Replace `Projection` write methods with Effect SQL repository calls.
2. Replace synchronous transactions with `SqlClient.withTransaction`.
3. Replace read methods with schema-backed query modules.
4. Replace cursor `Buffer` usage with Effect encoding/schema codecs.
5. Replace direct clock/timing calls with Effect clock utilities.
6. Remove the synchronous `Projection` class.

### Phase 4: Database API Cleanup

1. Redesign `DatabaseService` around scoped layers and focused services.
2. Remove manual `close` from normal public lifecycle.
3. Remove path defaults from `@cycle/database`.
4. Keep the single cross-repository database behavior.
5. Map `SqlError` and `SchemaError` to package-owned errors at public boundaries.

### Phase 5: Consumer Migration

1. Migrate `@cycle/agent-chat` SQLite store.
2. Migrate `@cycle/agents` task store.
3. Migrate backend agent session store.
4. Migrate desktop/backend tests that inspect SQLite state.
5. Align `@cycle/git-worktrees` with stricter export and schema rules where needed.

### Phase 6: Enforcement and Removal

1. Add or enable repository-level boundary checks.
2. Remove production imports of `@cycle/sqlite/sync`.
3. Remove old synchronous tests except compatibility tests.
4. Delete dead path helpers from `@cycle/database`.
5. Update package specs or mark superseded sections.

## 22. Definition of Done

This specification is complete when:

1. `@cycle/database` runs entirely on `SqlClient` provided by an Effect layer.
2. `@cycle/database` has no production dependency on `@cycle/sqlite/sync`.
3. `@cycle/database` has no synchronous projection class that owns SQLite connection lifetime.
4. All `@cycle/database` table access is model-first and schema-backed.
5. SQL transactions use `SqlClient.withTransaction`.
6. projection migrations run through Effect SQL migrator infrastructure.
7. the database still projects multiple repositories into one SQLite database.
8. cross-repository search and repository-scoped reads pass.
9. all current production sync consumers listed in this spec are migrated to Effect SQL.
10. `@cycle/sqlite` root exports only package-owned public APIs.
11. `@cycle/database` has no direct Node imports for SQLite, path discovery, crypto, clocks, or
    encoding; those boundaries use Effect services or caller-provided configuration.
12. direct Node imports in `@cycle/sqlite` are limited to documented internal infrastructure
    boundaries.
13. tests enforce the new boundaries.
14. package typecheck and relevant test suites pass.

## 23. Open Questions

None.
