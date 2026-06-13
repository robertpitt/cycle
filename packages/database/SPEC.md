# Cycle Database Specification

Status: Draft implementation specification

Version: 0.1.0

Package: `@cycle/database`

## 1. Purpose

`@cycle/database` is the repository data access package for Cycle. It replaces
`@cycle/ticket-db` with an app-wide in-memory SQLite read model that is hydrated from one or more
repository-scoped GitDB databases.

GitDB remains the durable source of truth. SQLite is a derived, rebuildable, in-memory projection
used for relational reads, filtering, pagination, full-text search, aggregate views, repository
history, and ticket history. All user-visible writes MUST be committed to GitDB first and then
resynchronized into SQLite before the write operation returns successfully.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for callers and conformance tests to reason about it.

## 3. Problem Statement

`@cycle/ticket-db` exposes ticket domain operations directly over GitDB collections. That model is
durable and local-first, but read-heavy application workflows must still work through event replay,
tree indexes, and snapshot history rather than through a relational query model.

Cycle needs a database package that lets the application treat repository work data like a normal
ticketing database while preserving GitDB as the only durable repository storage layer. The
application needs fast list views, search, filters, comments, ticket history, and commit-log
timeline pages across all open repositories. At the same time, writes must remain Git-backed so
history, sync, and offline collaboration keep the same durability model.

## 4. Goals

`@cycle/database` MUST:

1. Provide a new public API, not a `@cycle/ticket-db` compatibility wrapper.
2. Replace `@cycle/ticket-db` as the Cycle ticket domain and repository read/write package.
3. Maintain one app-wide in-memory SQLite database containing projections for multiple
   repositories.
4. Use `@cycle/git-db` as the durable source of truth for repository ticket data.
5. Watch and materialize the GitDB ref `refs/gitdb/cycle/main` for each opened repository.
6. Serve read queries from the latest fully materialized SQLite snapshot for each repository.
7. Continue serving the previous fully materialized snapshot while background resync is running.
8. Write ticket mutations to GitDB first, then resync the resulting delta into SQLite before
   returning success.
9. Materialize ticketing tables, record/comment tables, search tables, commit graph tables,
   history tables, and warning/status tables.
10. Support relational access patterns expected by a ticketing application: search, filtering,
    pagination, detail fetches, comments, linked records, repository timeline, and per-ticket
    history.
11. Use Effect's SQLite integration for the in-memory SQL layer.
12. Drop only invalid source objects during materialization and expose warnings without rejecting
    the entire snapshot.

## 5. Non-Goals

`@cycle/database` v0.1 MUST NOT:

1. Store repository ticket content durably outside the repository's GitDB database.
2. Treat SQLite as a write source of truth.
3. Mutate normal Git branches, the worktree, the Git index, or `HEAD`.
4. Implement a hosted multi-tenant database service.
5. Require network access for local reads, writes, or search.
6. Automatically merge divergent GitDB histories.
7. Replace `@cycle/git-db` object, tree, commit, ref, fetch, or push responsibilities.
8. Materialize draft sessions into the primary committed-ticket read model before drafts are
   committed.
9. Guarantee that invalid third-party or manually edited GitDB objects appear in query results.

## 6. System Overview

### 6.1 Layer Position

Cycle storage layers are:

```text
Level 1: @cycle/git-db
  Git-backed documents, collections, snapshots, refs, history, diffs, fetch, push

Level 2: @cycle/database
  app-wide SQLite read model, ticket domain writes, GitDB-to-SQLite projection, search, history

Level 3+: adapters and applications
  desktop UI, API, CLI, repository manager, sync scheduler, agent workflows
```

### 6.2 Main Components

`@cycle/database` has these responsibility boundaries:

- Repository registry: tracks opened repositories, their GitDB store configuration, active
  materialized snapshot, sync status, and warning counts.
- GitDB source adapter: reads and writes repository data through `@cycle/git-db`.
- SQLite runtime: owns one app-wide in-memory SQLite database and schema migrations.
- Projector: converts GitDB snapshots and diffs into relational tables.
- Sync scheduler: polls `refs/gitdb/cycle/main`, serializes per-repository sync work, and applies
  batch upserts/deletes.
- Ticket command service: validates and serializes ticket writes into GitDB transactions.
- Query service: serves relational ticket, search, record, history, and aggregate queries.
- Warning store: records invalid source objects skipped during materialization.
- Status surface: exposes repository sync status, active snapshot IDs, last sync times, and failures.

### 6.3 External Dependencies

Core runtime dependencies are:

- `effect` for services, layers, schemas, concurrency, logging, clocks, and tests.
- `@cycle/git-db` for durable Git-backed storage.
- Effect SQLite, specifically the Node SQLite Effect SQL package used by the application runtime.
- A caller-provided identity capability for authorship and provenance.
- A caller-provided ID generator for distributed-safe ticket, draft, record, and execution IDs.

The implementation MAY use GitDB's filesystem backend, CLI backend, or in-memory backend according
to the composition root. The database package MUST depend on GitDB contracts rather than normal Git
working tree files.

## 7. Repository Contract

### 7.1 App-Wide Database

One `DatabaseService` instance MUST manage one app-wide in-memory SQLite database. The SQLite
database MAY contain rows for zero or more repositories.

Every repository-scoped table MUST include a stable `repository_id` column. `repository_id` is an
app-local identifier chosen by the repository manager. It MUST be stable for the lifetime of the
opened repository registration and SHOULD be stable across app restarts if the app-level repository
registry persists it.

### 7.2 GitDB Store Identity

For each repository, the standard GitDB identity is:

```text
namespace: refs/gitdb
database: cycle
defaultPointer: main
watched ref: refs/gitdb/cycle/main
```

The implementation MUST poll the local ref `refs/gitdb/cycle/main` for each opened repository.
Missing refs MUST be treated as an empty repository database until the first write creates the ref.

### 7.3 Event Store Boundary

The package MUST read and write the Cycle GitDB event model only. Committed domain state is
represented by immutable event files under the GitDB event namespace, and SQLite state MUST be
rebuilt by folding those events.

The package MUST NOT read or write the removed collection document model:

- `collections/issues`
- `collections/records`
- `collections/drafts`
- `collections/users`
- `collections/labels`
- `collections/views`
- `collections/templates`
- `metadata/repository.json`

There is no in-package compatibility or migration path for the removed collection model.

### 7.4 Draft Boundary

Drafts remain GitDB-backed until committed. The primary SQLite read model MUST include committed
tickets and committed linked records only.

The package MAY expose draft command/query methods backed directly by GitDB. Committing a draft
MUST write the resulting issue and linked records to GitDB and then resync the GitDB delta into the
SQLite committed-ticket projection before returning success.

## 8. Core Domain Model

### 8.1 Repository

A repository row represents an opened local repository.

Required fields:

- `repository_id`
- `display_name`
- `worktree_path`
- `git_dir`
- `watched_ref`
- `active_snapshot_id`
- `active_generation`
- `sync_status`
- `last_sync_started_at`
- `last_sync_completed_at`
- `last_sync_error`
- `warning_count`

### 8.2 Ticket

A ticket is the primary committed work item. It is sourced from an issue document in GitDB.

Required materialized fields:

- `repository_id`
- `ticket_id`
- `snapshot_id`
- `document_path`
- `title`
- `body`
- `body_format`
- `type`
- `status`
- `priority`
- `assignee`
- `parent_id`
- `repository_key`
- `created_at`
- `updated_at`
- `created_by_name`
- `created_by_email`
- `created_by_type`
- `labels_json`
- `frontmatter_json`
- `schema_version`

The implementation MUST preserve unknown frontmatter fields in `frontmatter_json` when reading,
updating, and reserializing a ticket.

### 8.3 Linked Record

A linked record is an immutable or append-oriented activity item associated with a ticket.

Required materialized fields:

- `repository_id`
- `record_id`
- `ticket_id`
- `record_type`
- `created_at`
- `created_date`
- `created_by_name`
- `created_by_email`
- `created_by_type`
- `payload_json`
- `schema_version`

Comment records MUST be queryable as comments. A comment's display body is derived from
implementation-defined payload fields, but the extractor MUST be documented and covered by tests.

### 8.4 Commit

A commit row represents a GitDB snapshot commit reachable from `refs/gitdb/cycle/main`.

Required materialized fields:

- `repository_id`
- `snapshot_id`
- `root_tree_id`
- `author_name`
- `author_email`
- `authored_at`
- `committer_name`
- `committer_email`
- `committed_at`
- `message`
- `sequence`

Commit parent relationships MUST be stored in a separate `commit_parents` table so the implementation
can represent a commit graph rather than only a linear list.

### 8.5 Commit Change

A commit change describes a materialized domain object affected by a commit.

Required fields:

- `repository_id`
- `snapshot_id`
- `change_type`: `added`, `modified`, or `deleted`
- `object_type`: `ticket`, `record`, `draft`, `unknown`, or an extension type
- `object_id`
- `ticket_id`
- `path`

The repository history page MUST be backed by commits and commit changes. The ticket history page
MUST filter commit changes by `ticket_id`.

### 8.6 Materialization Warning

A warning records a source object that could not be materialized.

Required fields:

- `repository_id`
- `snapshot_id`
- `path`
- `object_type`
- `object_id`
- `reason`
- `message`
- `created_at`

Warnings MUST NOT contain full ticket bodies, full comment bodies, secrets, tokens, or credentials.

## 9. SQLite Schema Contract

### 9.1 Required Tables

The SQLite schema MUST include tables equivalent to:

- `repositories`
- `projection_state`
- `tickets`
- `ticket_labels`
- `ticket_external_links`
- `records`
- `comments`
- `commits`
- `commit_parents`
- `commit_changes`
- `materialization_warnings`
- `search_documents`
- `search_fts`

The exact SQL column names MAY differ if the public API and tests expose equivalent behavior.

### 9.2 Search

The implementation MUST use SQLite full-text search for v0.1 search. The FTS scope MUST include:

- ticket title
- ticket body
- committed comment text

Search results MUST be repository-scoped by default and MAY support cross-repository search when
the caller provides multiple repository IDs or omits the repository filter.

Search MUST return ticket-oriented results. A comment match MUST surface the owning ticket and MAY
include matched comment metadata or snippets.

### 9.3 Read-Only Projection Rule

Application reads MUST use SQLite. Application writes MUST NOT mutate SQLite directly as the source
of truth.

SQLite mutations are allowed only inside projector-controlled sync transactions that materialize
GitDB state.

## 10. Public API Contract

### 10.1 Service Shape

The public API SHOULD expose one primary Effect service, `DatabaseService`, with cohesive method
groups. The exact TypeScript shape is implementation-defined, but it MUST support the operations in
this section.

Repository operations:

- `openRepository(input)`
- `closeRepository(repositoryId)`
- `syncRepository(repositoryId, options?)`
- `repositoryStatus(repositoryId)`
- `listRepositories()`

Ticket read operations:

- `getTicket(repositoryId, ticketId, options?)`
- `listTickets(query)`
- `searchTickets(query)`
- `ticketRecords(repositoryId, ticketId, query?)`
- `ticketComments(repositoryId, ticketId, query?)`
- `ticketHistory(repositoryId, ticketId, query?)`

History operations:

- `repositoryHistory(repositoryId, query?)`
- `commitGraph(repositoryId, query?)`
- `commitChanges(repositoryId, snapshotId, query?)`

Ticket write operations:

- `createTicket(repositoryId, input)`
- `updateTicket(repositoryId, ticketId, patch)`
- `transitionTicket(repositoryId, ticketId, input)`
- `addComment(repositoryId, ticketId, input)`
- `addRecord(repositoryId, ticketId, input)`

Draft operations MAY be exposed in the same service or a secondary draft service, but they MUST use
GitDB as their backing store until commit.

### 10.2 Query Rules

List and search APIs MUST support:

- repository filtering
- status filtering
- priority filtering
- type filtering
- assignee filtering
- parent filtering
- label filtering
- updated time ranges
- created time ranges
- deterministic ordering
- cursor pagination
- configurable page size with a documented maximum

Pagination cursors MUST be opaque to callers. A cursor MUST encode enough information to continue
from the same active materialized snapshot and ordering without skipping or duplicating rows.

### 10.3 Write Return Rule

A write method MUST return success only after:

1. Input validation succeeds.
2. The GitDB transaction commits successfully.
3. The watched ref resolves to the new snapshot.
4. SQLite has resynced from the previous active snapshot to the new snapshot.
5. The affected ticket or record is visible through the read model.

If GitDB commit succeeds but SQLite resync fails for the object written by the operation, the method
MUST return a consistency failure that includes the committed snapshot ID and enough context for the
caller to retry sync or report the issue.

## 11. Sync and Materialization

### 11.1 Polling

For each opened repository, the sync scheduler MUST poll `refs/gitdb/cycle/main`.

The default polling interval SHOULD be 1000 milliseconds. Implementations MAY make the interval
configurable. Polling MUST be disabled when a repository is closed.

### 11.2 Snapshot States

Each repository has these projection states:

- `unopened`: repository is not registered.
- `empty`: repository is open but `refs/gitdb/cycle/main` does not exist.
- `ready`: SQLite is fully materialized for `active_snapshot_id`.
- `syncing`: a newer snapshot is being materialized.
- `degraded`: the latest sync completed with skipped-object warnings.
- `failed`: the latest sync failed before a complete materialized snapshot could be activated.

Read APIs MUST serve `ready` or `degraded` data from the previous `active_snapshot_id` while a
repository is `syncing`.

### 11.3 Incremental Sync

When the watched ref changes from `old_snapshot_id` to `new_snapshot_id`, the projector SHOULD use
GitDB diff/history APIs to compute changed paths and then apply batch upserts/deletes for affected
domain tables.

The projector MUST support a full rebuild fallback when:

- there is no previous active snapshot;
- the previous active snapshot is unavailable;
- required diff data is unavailable;
- schema migration requires a rebuild;
- incremental materialization detects an invariant violation that cannot be localized.

The normal incremental path MUST:

1. Resolve the new snapshot.
2. Record any new commits and parent edges reachable since the previous active snapshot.
3. Compute changed GitDB paths between the previous and new snapshots.
4. Group changed paths by domain object.
5. Decode changed issues and linked records.
6. Upsert valid tickets, labels, external links, records, comments, search documents, and commit
   changes in batches.
7. Delete rows for removed domain objects.
8. Record warnings for invalid objects.
9. Atomically mark the repository's active snapshot as `new_snapshot_id`.

### 11.4 Invalid Objects

If a single issue, record, comment, draft, or unknown object cannot be parsed or validated, the
projector MUST skip that object, record a warning, and continue materializing the rest of the
snapshot.

Skipping an invalid issue MUST also suppress dependent comments and records from ticket-oriented
query results when the owning ticket is not materialized.

Snapshot activation MUST NOT be rejected solely because one or more source objects were skipped.
The repository status SHOULD become `degraded` when warnings exist for the active snapshot.

### 11.5 Concurrency

Sync work MUST be serialized per repository. A repository MUST NOT run two materialization jobs at
the same time.

Writes MUST be serialized with sync for the same repository. If a background sync is running, a write
MUST either wait for it or safely supersede it by materializing the newest committed snapshot after
the write.

Concurrent reads MUST observe a complete materialized snapshot. They MUST NOT observe partial
projector writes.

## 12. Write Workflow

### 12.1 General Write Algorithm

```text
write(repository_id, command):
  acquire repository write lock
  active_snapshot = projection_state.active_snapshot_id
  gitdb_tx = begin GitDB transaction at refs/gitdb/cycle/main
  current_domain_state = read required current state from active SQLite
  validate command against domain rules
  append immutable domain event files
  commit gitdb_tx with author, committer, and message
  new_snapshot = committed snapshot id
  resync repository from active_snapshot to new_snapshot
  verify affected rows are visible in SQLite
  release repository write lock
  return domain result
```

The implementation MUST validate command inputs before writing GitDB objects. It MUST reject known
unsafe secret-bearing payload keys such as token, secret, password, API key, or private key unless a
future explicit secret-storage extension is added.

### 12.2 Ticket Commands

Ticket commands MUST preserve these existing domain behaviors unless a later spec revision changes
them:

- tickets are stored as Markdown documents with structured frontmatter;
- unknown frontmatter fields are preserved;
- creating a ticket writes provenance and initial status-change records;
- changing status writes a status-change record;
- adding a user-visible comment or record updates ticket activity;
- protected planning sections cannot be changed during active implementation;
- final `done` approval requires a human actor by default.

### 12.3 Draft Commit

Committing a draft MUST:

1. Read the draft from GitDB.
2. Validate the contained issue and records.
3. Write the issue and linked records to GitDB in one transaction.
4. Mark the draft committed in GitDB.
5. Resync the new snapshot into SQLite.
6. Return only after the committed ticket is visible through SQLite reads.

## 13. History and Commit Graph

### 13.1 Repository History

The repository history API MUST return a timeline of GitDB commits for a repository. Each entry
SHOULD include:

- snapshot ID
- parent IDs
- author
- timestamp
- message
- changed object counts
- changed ticket IDs
- warning count for that snapshot

The API MUST support pagination and filtering by actor, ticket ID, object type, record type, and
time range.

### 13.2 Ticket History

The ticket history API MUST return commits relevant to one ticket. A commit is relevant when it
changes:

- the ticket document;
- a linked record for the ticket;
- a comment for the ticket;
- a status-change record for the ticket;
- an execution/review/import/conflict record for the ticket.

Ticket history entries SHOULD include the materialized before/after ticket summary when available.

### 13.3 Commit Graph

The commit graph API MUST expose commits and parent edges. It MUST NOT assume the history is linear,
even though the initial GitDB write path is expected to produce one-parent commits.

## 14. Failure Model

### 14.1 Failure Categories

The package MUST expose typed failures for:

- repository not open;
- repository GitDB store unavailable;
- watched ref unavailable or invalid;
- GitDB read/write failure;
- GitDB pointer conflict;
- SQLite schema or query failure;
- materialization failure;
- consistency failure after write;
- validation failure;
- workflow failure;
- stale or invalid pagination cursor.

### 14.2 Background Sync Failure

If background sync fails before activating a new snapshot, the repository MUST keep serving the
previous active snapshot and mark status `failed`.

If background sync completes with skipped objects, the repository MUST activate the new snapshot and
mark status `degraded`.

### 14.3 Write Sync Failure

If a write commits to GitDB but the required post-write SQLite resync fails, the write method MUST
return a consistency failure. The failure MUST include:

- repository ID;
- committed snapshot ID;
- previous active snapshot ID;
- command type;
- affected ticket ID or record ID when known;
- retryability classification.

The implementation MUST NOT attempt to hide this state by returning success before the row is
visible.

## 15. Observability

The package MUST emit structured logs for:

- repository open and close;
- initial hydrate start and completion;
- ref change detection;
- incremental sync start and completion;
- full rebuild fallback;
- skipped objects and warnings;
- write command start and completion;
- post-write consistency failures.

Repository status MUST be queryable without a debugger. Status results MUST include active snapshot,
sync status, warning count, last sync timestamps, and the latest failure summary.

The implementation SHOULD expose metrics or counters for:

- repositories open;
- tickets materialized;
- records materialized;
- comments materialized;
- search documents materialized;
- sync duration;
- write duration;
- warning count by reason.

## 16. Security and Safety

The SQLite database is in-memory and rebuildable. It MUST NOT be treated as durable storage.

The package MUST NOT log full ticket bodies, comment bodies, record payloads, secrets, or credentials
by default.

The package MUST reject write payloads containing obvious secret-bearing keys unless an explicit
future secure-secret extension defines safe handling.

The package MUST keep repository ticket content in the repository GitDB database. It MUST NOT write
repository ticket content to app-level config files, external caches, or telemetry.

## 17. Test and Validation Matrix

Conformance tests MUST cover:

1. Opening multiple repositories into one app-wide SQLite database.
2. Initial hydration from `refs/gitdb/cycle/main`.
3. Empty repository behavior when the watched ref does not exist.
4. Incremental sync after issue create, update, status transition, comment add, and record add.
5. Write methods returning only after SQLite queries can see the written object.
6. Serving the previous active snapshot during background sync.
7. Search over title, body, and comments.
8. List filtering by status, priority, type, assignee, parent, label, and time range.
9. Cursor pagination without duplicates or skipped rows.
10. Repository history timeline from commit log.
11. Ticket history filtered to relevant commits.
12. Commit graph parent-edge materialization.
13. Invalid issue object skipped with warning while other tickets remain queryable.
14. Invalid comment skipped with warning while the ticket remains queryable.
15. Draft commit writes to GitDB and appears in SQLite only after commit.
16. GitDB pointer conflict mapped to a typed database failure.
17. Full rebuild fallback when incremental diff is unavailable.
18. Package shutdown closes polling fibers and SQLite resources.

## 18. Implementation Checklist

An implementation is complete when:

1. `packages/database` builds as an Effect package in the Cycle workspace.
2. The package exposes `DatabaseService` and test/live layers.
3. The app-wide in-memory SQLite schema is created through Effect SQLite.
4. Multiple repositories can be opened and queried from one SQLite database.
5. `refs/gitdb/cycle/main` polling updates repository status and triggers sync.
6. GitDB writes resync SQLite before returning success.
7. Ticket list, detail, comments, search, repository history, ticket history, and commit graph APIs
   are implemented.
8. Materialization warnings are persisted in SQLite and visible through status APIs.
9. Tests prove SQLite is rebuildable from GitDB and never required as durable storage.
