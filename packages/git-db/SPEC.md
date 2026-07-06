# GitDB Package Refactor Specification

Status: Draft implementation specification

Version: 0.1.0

Package: `@cycle/git-db`

## 1. Purpose

This specification defines the required refactor of `@cycle/git-db` into a clear package boundary
with stable public exports, package-local schemas and errors, focused Effect services and layers,
and tests that validate the public API expected by downstream Cycle packages.

The refactor is structural. It MUST preserve GitDB's current storage, transaction, event, snapshot,
pointer, sync, and repository identity behavior unless this specification explicitly says otherwise.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the mechanism, but it MUST document the
choice when callers, tests, or operators need to reason about the behavior.

## 3. Problem Statement

`@cycle/git-db` already owns Cycle's Git-backed Level 1 storage primitives, but its source layout
and exports still expose historical implementation groupings such as `store/`, `domain/`,
`schemas/`, and `errors/`. This makes the public API less obvious, encourages consumers and scripts
to import from package internals, and leaves duplicated schema/domain barrels that are harder to
validate after package-level refactors.

Cycle needs `@cycle/git-db` to follow the same package shape as the recently refactored packages:
public contracts and services are exported from intentional package entrypoints; implementation
helpers live under `internals/`; package errors and schemas are package-local; and consumers import
through stable `@cycle/git-db` exports rather than source paths.

## 4. Goals

`@cycle/git-db` MUST:

1. Present a stable public API through `src/index.ts` and explicit `package.json` subpath exports.
2. Define a final `src/` directory structure that separates public modules from internals.
3. Move package-owned domain schemas, DTO schemas, typed errors, store service contracts, layers,
   and helper modules into package-local files with clear ownership.
4. Preserve the existing root import shape used by downstream packages, including `Event`,
   `Store`, `GitDbFilesystem`, `GitDbInMemory`, and `GitDbLive`.
5. Remove obsolete wrapper barrels and historical grouping folders once consumers are migrated.
6. Keep all recoverable GitDB errors as typed `Schema.TaggedErrorClass` errors with
   `@cycle/git-db/...` tags.
7. Keep runtime boundaries Effect-native, using `Context.Service`, `Layer`, typed error channels,
   and `Effect.gen` for multi-step Effect code.
8. Keep downstream consumers importing through stable package exports or declared subpath exports.
9. Validate the refactor with package tests, merge-scenario tests, typechecks, and affected
   consumer tests.

## 5. Non-Goals

This refactor MUST NOT:

1. Change the durable GitDB storage layout or Git ref contract.
2. Change event path semantics, event JSON canonicalization, ticket sharding, or append-only event
   invariants.
3. Reintroduce the removed collection/document convenience API.
4. Move ticket, label, user, repository, projection, or SQLite read-model logic into GitDB.
5. Replace `@cycle/git` object, tree, commit, ref, fetch, or push responsibilities.
6. Change repository ID derivation or the root identity workflow defined by
   `specs/GITDB_REPOSITORY_ID_SPEC.md`.
7. Require normal Git branches, worktree files, Git index state, or `HEAD` mutation for GitDB
   reads and writes.
8. Add network access to local reads, local transactions, or in-memory tests.

## 6. System Overview

### 6.1 Package Boundary

`@cycle/git-db` is the Git-backed storage primitive package for Cycle. It owns:

- Store configuration and validation.
- Store service and live layers.
- Raw path transactions.
- Document wrappers for Git blob contents.
- Event path construction, canonical event encoding, append, list, and introduced-event discovery.
- Pointer, snapshot, history, diff, and sync operations exposed directly on `StoreService` and
  `StorePointer`.
- GitDB schemas, DTOs, and typed errors.
- In-memory, filesystem, and CLI-backed layer composition.

It depends on `@cycle/git` for Git object, ref, fetch, push, merge-base, and ancestry operations.
It MUST NOT duplicate Git object model schemas or shell out directly when `@cycle/git` provides the
required capability.

### 6.2 External Dependencies

Core dependencies are:

- `effect` for services, layers, schemas, caches, refs, logging spans, and tests.
- `@effect/platform-node` for Node runtime services used by live layers.
- `@cycle/git` for Git object store services, schemas, and typed Git transport errors.

Package internals MAY use Node APIs in scripts and development-only tests. Runtime source under
`src/` SHOULD prefer Effect services when a service exists in the package dependency graph.

## 7. Final Source Layout

After the refactor, `packages/git-db/src` MUST have this public shape:

```text
src/
  Document.ts
  Event.ts
  GitDbErrors.ts
  GitDbLive.ts
  GitDbSchemas.ts
  Store.ts
  index.ts
  internals/
    bytes.ts
    json.ts
    path.ts
    tree.ts
```

The following current folders MUST be removed after migration:

```text
src/domain/
src/errors/
src/schemas/
src/store/
```

The implementation MAY add additional files under `src/internals/` when splitting large internal
algorithms improves maintainability. It MUST NOT add new public directories unless this
specification is updated.

### 7.1 Public Module Responsibilities

- `Document.ts`: public `Document` class and document JSON parsing helpers.
- `Event.ts`: public event constants, event path helpers, canonical event JSON helpers, append,
  list, and introduced-event APIs.
- `GitDbErrors.ts`: all GitDB tagged error classes and the `GitDbError` union.
- `GitDbLive.ts`: live layer constructors and aliases: `cli`, `filesystem`, `layer`,
  `GitDbLive`, `GitDbFilesystem`, and `GitDbInMemory`.
- `GitDbSchemas.ts`: public schemas and schema-derived types for options, store config, snapshots,
  changes, entries, sync, pointer status, history options, read options, commit options, and path
  identifiers.
- `Store.ts`: `StoreConfig`, store option parsing, `StoreService`, `StoreServiceShape`,
  `StorePointer`, `Transaction`, repository identity types, and the live store implementation.
- `index.ts`: root public barrel.

### 7.2 Internal Module Responsibilities

- `internals/bytes.ts`: byte/string encoding helpers.
- `internals/json.ts`: stable JSON encoding for raw documents and event payloads.
- `internals/path.ts`: namespace, pointer, remote, database, and store-path validation helpers.
- `internals/tree.ts`: mutable tree construction, mutation application, tree read/write helpers,
  and other Git tree algorithms.

Internal modules MUST NOT be exported through `package.json`. Tests MAY import internals only for
white-box algorithm coverage when public API coverage would be impractical.

## 8. Required Package Exports

### 8.1 `package.json` Exports

`packages/git-db/package.json` MUST expose exactly these package subpaths unless a later
specification expands the public API:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./document": "./src/Document.ts",
    "./errors": "./src/GitDbErrors.ts",
    "./event": "./src/Event.ts",
    "./live": "./src/GitDbLive.ts",
    "./schemas": "./src/GitDbSchemas.ts",
    "./store": "./src/Store.ts"
  }
}
```

No export path MAY point at a removed file or a file under `src/internals/`.

### 8.2 Root Barrel Exports

`src/index.ts` MUST preserve the current root import experience. It MUST export:

```ts
export * from "./GitDbErrors.ts";
export type { PointerSyncResult, SyncResult } from "./GitDbSchemas.ts";
export { GitDbFilesystem, GitDbInMemory, GitDbLive } from "./GitDbLive.ts";
export * as Document from "./Document.ts";
export * as Event from "./Event.ts";
export * as GitDb from "./GitDbLive.ts";
export * as Schemas from "./GitDbSchemas.ts";
export * as Store from "./Store.ts";
```

The root barrel MAY also export additional top-level values from these same public modules when
needed for backwards compatibility, but it MUST NOT export internals.

### 8.3 Public Subpath Expectations

The following imports MUST typecheck for consumers:

```ts
import { Event, GitDbFilesystem, Store } from "@cycle/git-db";
import { InvalidPathError, type GitDbError } from "@cycle/git-db/errors";
import { GitDbInMemory } from "@cycle/git-db/live";
import { StoreService, type StoreServiceShape } from "@cycle/git-db/store";
import { SyncResult } from "@cycle/git-db/schemas";
```

Consumers MUST NOT import from:

```text
@cycle/git-db/src/...
@cycle/git-db/domain
@cycle/git-db/store/...
@cycle/git-db/schemas/...
@cycle/git-db/errors/...
@cycle/git-db/pointer
@cycle/git-db/snapshot
@cycle/git-db/sync
@cycle/git-db/transaction
```

## 9. Core Domain and Schema Contract

`GitDbSchemas.ts` MUST own the schema-first contracts for:

- `Change`
- `ChangeSet`
- `CommitOptions`
- `DivergenceMode`
- `Entry`
- `HistoryOptions`
- `MovePointerOptions`
- `PointerSyncResult`
- `PointerSyncStatus`
- `ReadOptions`
- `Snapshot`
- `SyncMode`
- `SyncOptions`
- `SyncResult`
- `Options`
- `Store`
- `SafeSegment`
- `DatabaseName`
- `RemoteName`
- `StorePath`
- `MutationPath`

Schema-derived types MUST be exported beside their schemas. The refactor MUST remove duplicate
domain and schema definitions rather than maintaining separate `domain/` and `schemas/` barrels.

Schemas that mirror `@cycle/git` object IDs, tree entries, pointer names, namespaces, or identities
MUST reuse `@cycle/git` exported schemas instead of redefining them.

## 10. Error Contract

`GitDbErrors.ts` MUST export these recoverable error classes:

- `DocumentNotFoundError`
- `InvalidIdentifierError`
- `InvalidJsonDocumentError`
- `InvalidNamespaceError`
- `InvalidPathError`
- `InvalidPointerNameError`
- `PointerConflictError`
- `PointerNotFoundError`
- `RepositoryIdentityConflictError`
- `SnapshotNotFoundError`
- `StoreNotFoundError`
- `SyncConflictError`
- `TransactionInactiveError`

Each class MUST extend `Schema.TaggedErrorClass` and use a stable tag in the form:

```text
@cycle/git-db/<ErrorName>
```

`GitDbErrors.ts` MUST also export:

```ts
export type GitDbError = ...
```

The `GitDbError` union MUST include GitDB package errors plus the typed Git errors returned by
`@cycle/git` for adapter, fetch, and push failures.

Implementation code MUST use targeted recovery with typed errors where practical. When raising a
yieldable tagged error inside `Effect.gen`, code MUST use:

```ts
return yield* new SomeGitDbError(...)
```

## 11. Runtime and Layer Contract

### 11.1 Store Service

`Store.ts` MUST define `StoreService` as a `Context.Service` and MUST expose
`StoreServiceShape`. The shape MUST preserve the current operations:

- `begin`
- `config`
- `currentSnapshotForPointer`
- `deriveRepositoryIdentity`
- `diff`
- `ensureRepositoryIdentity`
- `get`
- `history`
- `list`
- `localPointers`
- `pointer`
- `pointerRef`
- `refPrefix`
- `remotePointerRef`
- `remoteRefPrefix`
- `resolveSnapshotId`
- `snapshot`
- `sync`

The implementation MUST continue to return typed `Effect` values with `GitDbError` in the error
channel where GitDB failures are recoverable.

### 11.2 Live Layers

`GitDbLive.ts` MUST expose:

- `cli(options?)`
- `filesystem(options?)`
- `layer`
- `GitDbLive`
- `GitDbFilesystem`
- `GitDbInMemory(options?)`

`GitDbLive` and `layer` MUST remain aliases for the CLI-backed live layer unless a later
specification changes the default runtime backend.

`GitDbInMemory` MUST remain suitable for deterministic package and consumer tests. It MUST NOT
require a real `.git` directory.

### 11.3 Internal Git Adapter

The store implementation MUST continue to receive Git behavior through `@cycle/git` services.
It MUST NOT read `.git` files directly or call `git` subprocesses outside the `@cycle/git`
adapter boundary.

## 12. Storage and Behavior Invariants

The refactor MUST preserve these invariants:

- Existing event files are immutable.
- `Event.append` rejects duplicate event paths in the transaction base.
- Event payload JSON is canonicalized with stable key ordering.
- Raw transaction `put` encodes JSON with stable key ordering and a trailing newline for non-byte,
  non-string values.
- Event reads are sorted by lexical path.
- `Event.introduced` reports event paths introduced or changed by a snapshot diff.
- Transactions become inactive after commit or abort.
- Pointer moves honor expected-snapshot checks.
- Sync statuses and divergence behavior remain compatible with existing tests and merge scenarios.
- Store configuration still defaults to namespace `refs/gitdb`, database `default`, and pointer
  `main` unless callers supply options.

## 13. Consumer Migration Requirements

The implementation MUST update all affected consumers to import from stable exports. Known
consumers include:

- `packages/database`
- `packages/usecases`
- `packages/desktop`
- `packages/ui` tests that enforce architecture boundaries
- `packages/git-db` tests and scripts

Package-local tests and scripts SHOULD import through `../src/index.ts` or public subpath files.
They SHOULD NOT import from removed grouping directories.

Downstream code MAY continue to import module namespaces from the root package:

```ts
import { Event as GitDbEvent, GitDbFilesystem, Store as GitDbStore } from "@cycle/git-db";
```

Downstream code that needs a specific public module MAY use the new package subpaths:

```ts
import { StoreService } from "@cycle/git-db/store";
import { InvalidPathError } from "@cycle/git-db/errors";
```

## 14. Documentation Requirements

The implementation MUST update `packages/git-db/README.md` and
`packages/git-db/ARCHITECTURE.md` so their source layout, public module list, and example imports
match this specification.

`SCALABILITY_EXPERIMENT.md` SHOULD remain focused on storage layout and benchmark analysis. It
SHOULD NOT be rewritten for this structural refactor unless import examples or source references
become stale.

## 15. Reference Migration Algorithm

A conforming implementation SHOULD migrate in this order:

1. Create the new public root files.
2. Move or consolidate schema/domain exports into `GitDbSchemas.ts`.
3. Move or consolidate error exports into `GitDbErrors.ts`.
4. Move live layer composition into `GitDbLive.ts`.
5. Move public modules out of `store/` into root files.
6. Move implementation-only JSON, path, tree, and byte helpers into `internals/`.
7. Update imports inside `@cycle/git-db`.
8. Update `src/index.ts` and `package.json` exports.
9. Update package tests and scripts to use public entrypoints where possible.
10. Update downstream package imports.
11. Remove the old grouping directories.
12. Run validation commands.

The implementation SHOULD avoid behavior changes during file moves. If a behavior fix is required
to make validation pass, it MUST be called out separately in the implementation summary.

## 16. Validation Matrix

The refactor is complete only when these checks pass:

| Area | Required validation |
| ---- | ------------------- |
| Package typecheck | `pnpm --filter @cycle/git-db typecheck` |
| Package tests | `pnpm --filter @cycle/git-db test` |
| Merge scenarios | `pnpm --filter @cycle/git-db test:merge-scenarios` |
| Consumer database | `pnpm --filter @cycle/database typecheck` and `pnpm --filter @cycle/database test` |
| Consumer usecases | `pnpm --filter @cycle/usecases typecheck` and `pnpm --filter @cycle/usecases test` |
| Consumer desktop | `pnpm --filter @cycle/desktop typecheck` and `pnpm --filter @cycle/desktop test` |
| Consumer UI | `pnpm --filter @cycle/ui typecheck` and `pnpm --filter @cycle/ui test` |
| Export smoke | A test or typecheck fixture imports every subpath listed in section 8.1 |
| Architecture boundary | Existing UI or workspace architecture tests still reject forbidden dependencies |

If a command is unavailable in the workspace, the implementer MUST document the exact failure and
run the nearest available validation command.

## 17. Definition of Done

The implementation is done when:

1. `packages/git-db/src` matches the final structure in section 7.
2. `package.json` exports match section 8.1 and point only to existing public files.
3. `src/index.ts` preserves the current root import shape from section 8.2.
4. No source or test file imports from removed `domain/`, `errors/`, `schemas/`, or `store/`
   directories.
5. All GitDB tagged errors remain recoverable typed errors.
6. Existing GitDB behavior is preserved by tests.
7. Documentation reflects the new structure and public API.
8. The validation matrix has passed or any unavailable checks are explicitly reported.
