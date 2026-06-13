# Cycle Inbox PRD

Status: Draft product requirements document

Version: 0.1.0

Date: 2026-06-13

Scope: Product and data-layer requirements for a Cycle inbox derived from GitDB snapshot and event
history. This document focuses on `packages/git-db` and `packages/database`, with expected consumers
in future usecase, API, CLI, MCP, and desktop layers.

## 1. Purpose

Cycle should provide an inbox that helps users notice work that needs their attention without
committing per-user inbox files into repositories.

The inbox MUST be derived from repository-scoped Cycle events, snapshots, ticket metadata, comments,
and mention-like tags. GitDB remains the durable source of truth for repository work, but it MUST
NOT store inbox items, inbox rules, inbox cursors, read state, archive state, snooze state, or any
other inbox-specific object. Inbox contents and inbox item state are app-local database state.

The primary product goal is a fast, local-first attention queue that answers:

- What changed since I last looked?
- Which tickets, comments, or records mention me?
- Which incoming changes are assigned to me or match my notification rules?
- Which items have I already read, archived, or deferred locally?

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when they appear in all capitals.

`Implementation-defined` means the implementation may choose the behavior, but it MUST document the
choice and expose enough information for users, tests, and future implementers to reason about it.

## 3. Source Grounding

This PRD is grounded in:

- `packages/git-db/README.md`, which defines GitDB as an append-only event store over Git objects.
- `packages/git-db/ARCHITECTURE.md`, which states that GitDB owns snapshots, refs, diffs, sync, and
  event helpers, and does not understand tickets, labels, users, or SQLite projections.
- `packages/database/SPEC.md`, which defines SQLite as a derived projection over GitDB event files
  and states that generated projections are not committed by GitDB.
- `packages/database/src/services/DatabaseService.ts`, which currently writes ticket, record, user,
  label, saved view, template, and draft changes as immutable GitDB events.
- `packages/database/src/store/Projection.ts`, which currently materializes tickets, comments,
  records, users, labels, saved views, templates, commits, commit changes, warnings, and search.
- `DESKTOP_PRD.md`, which requires local-first repository work, fast reads, and durable repository
  ticket state through GitDB.
- The product requirement that inbox contents SHOULD be derived from `@tags` and incoming document
  changes between snapshots rather than represented by committed inbox files.

## 4. Product Problem

Cycle can store and project repository work, but users still need a focused attention surface.
Generic issue lists answer "what exists"; an inbox answers "what needs my attention now."

A naive implementation would write per-user inbox entries into repositories, for example under an
`inbox/<user>/...` path. That would introduce several problems:

- inbox read/archive state would become shared repository history even when it is personal UI state;
- repository commits would grow with user-specific notification churn;
- every user could create merge conflicts or sync noise in other users' inboxes;
- GitDB would need to understand inbox domain semantics that belong above the storage layer;
- deleting or rewriting inbox files would violate the append-only event model.

Cycle already has the primitives needed to avoid that: GitDB snapshots, introduced event files,
commit history, event payloads, ticket records, comments, users, labels, and app-local projections.

## 5. Product Principles

- Derived by default: inbox contents SHOULD be computed from committed repository events and
  snapshots.
- No repository inbox commits: Cycle MUST NOT commit inbox files, inbox folders, inbox indexes,
  inbox rules, read state, archive state, snooze state, or notification cursors into GitDB.
- Personal state stays personal: read, archive, snooze, and last-seen state MUST be app-local and
  user-specific.
- Repository truth stays durable: the tickets, comments, assignments, labels, and records that
  generate inbox signals MUST remain in GitDB.
- Event-level precision: the inbox SHOULD track the event or snapshot that caused an item, not only
  the latest ticket state.
- Rebuildable projection: generated inbox rows MUST be rebuildable from GitDB events. Personal
  state MAY be preserved only while the app-local database still exists.
- Local-first operation: inbox reads and state changes MUST work without network access after a
  repository is opened and projected.
- Storage boundary clarity: `@cycle/git-db` MUST remain generic; `@cycle/database` owns inbox
  derivation and query behavior.

## 6. Goals

Cycle Inbox v1 MUST:

1. Provide an inbox model derived from GitDB event history and database projection state.
2. Avoid committing any inbox-specific content or state to repositories.
3. Detect user mentions from ticket bodies, ticket metadata where applicable, and comment records.
4. Detect assignment changes and optionally label/rule matches as inbox signals.
5. Distinguish incoming changes from changes authored by the recipient where actor identity is
   available.
6. Preserve enough metadata to explain why an item is in a user's inbox.
7. Support read, unread, archived, and optionally snoozed local state.
8. Support deterministic ordering and pagination across one or more repositories.
9. Survive projection rebuilds without duplicating inbox items.
10. Keep `@cycle/git-db` unchanged except for optional generic read helpers if future performance
    work proves they are needed.
11. Make inbox behavior testable through database projection tests using deterministic GitDB event
    histories.

Cycle Inbox v1 SHOULD:

1. Support cross-repository inbox queries.
2. Expose unread counts by repository and reason.
3. Provide a "mark read through snapshot" or "mark read through item" operation for efficient bulk
   clearing.
4. Surface unresolved mentions separately from resolved user inbox items when useful for repository
   health or author feedback.
5. Reuse existing user profiles, aliases, labels, saved views, records, comments, and commit
   history projections where possible.

## 7. Non-Goals

Cycle Inbox v1 MUST NOT:

1. Store per-user inbox documents under GitDB paths such as `collections/inbox`,
   `collections/users/<id>/inbox`, or repository worktree files.
2. Treat inbox contents, inbox rules, or inbox read/archive state as repository source truth.
3. Require a hosted notification service, account system, websocket server, or remote push service.
4. Require network access for local inbox reads or local read/archive operations.
5. Require real-time multiplayer notification delivery.
6. Replace issue lists, saved views, search, comments, or history pages.
7. Require all possible notification rules from external tools such as Linear, GitHub, Slack, or
   Jira.
8. Make GitDB aware of users, mentions, inbox recipients, inbox rules, cursors, or notification
   state.
9. Send email, desktop notifications, or external messages in v1.
10. Guarantee notifications for content that cannot be parsed or materialized.

## 8. Actors And Concepts

### 8.1 Human User

A Human User is a person using Cycle. A human can receive inbox items, mark them read, archive them,
snooze them, and configure local inbox preferences.

Human identity SHOULD be based on the current Cycle profile and projected `UserProfileDocument`
rows. Email is the strongest stable identifier where available.

### 8.2 Agent

An Agent is an automated collaborator. Agents MAY author events and MAY be mentioned. Agent inboxes
are optional for v1, but mention parsing and recipient resolution SHOULD avoid assuming that all
recipients are humans.

### 8.3 Repository

A Repository is a local Git repository opened in Cycle with a GitDB database at
`refs/gitdb/cycle/main`.

Inbox derivation is repository-scoped at projection time and MAY be queried across repositories at
read time.

### 8.4 Snapshot

A Snapshot is a GitDB commit reachable from the repository's Cycle pointer. Snapshots provide:

- stable ID
- parent IDs
- author and committer identity
- creation time
- commit message
- changed event paths via diff or introduced-event helpers

### 8.5 Event

An Event is an immutable JSON payload stored under:

```text
collections/events/<aggregate-type>/<aggregate-id>/<event-id>.json
```

Existing event operations that can generate inbox signals include:

- `ticket.create`
- `ticket.replace`
- `ticket.update`
- `ticket.archive`
- `ticket.delete`
- `ticket.restore`
- `record.add`
- `user.upsert`
- `label.upsert`
- `view.upsert`
- `template.upsert`

Inbox derivation MUST ignore unsupported event operations unless a future local projection extension
declares a signal extractor for them. Such extensions MUST NOT require GitDB inbox writes.

### 8.6 Inbox Signal

An Inbox Signal is the projection-time fact that a specific event or snapshot may require one or
more recipients' attention.

Required fields:

- `repository_id`
- `snapshot_id`
- `event_path`
- `aggregate_type`
- `aggregate_id`
- `ticket_id`
- `record_id`, when applicable
- `reason`
- `actor_name`
- `actor_email`, when available
- `created_at`
- `summary_source`, an implementation-defined compact source for display text

Inbox Signals are derived and rebuildable. They are not user-visible until resolved to recipients.

### 8.7 Inbox Item

An Inbox Item is a user-specific row derived from an Inbox Signal after recipient resolution.

Required fields:

- `repository_id`
- `user_id`
- `item_id`
- `snapshot_id`
- `sequence`
- `event_path`
- `ticket_id`
- `record_id`, when applicable
- `reason`
- `actor_name`
- `actor_email`, when available
- `created_at`
- `title`
- `body_excerpt`, optional and redacted
- `metadata_json`, optional and redacted

The `item_id` MUST be deterministic. It SHOULD be derived from:

```text
repository_id + user_id + event_path + ticket_id + record_id + reason
```

Implementations MAY hash this tuple for compact storage, but the derivation MUST be stable across
projection rebuilds.

### 8.8 Inbox Item State

Inbox Item State is mutable personal state over a derived inbox item.

Required fields:

- `repository_id`
- `user_id`
- `item_id`
- `status`: `unread`, `read`, `archived`, or `snoozed`
- `updated_at`

Optional fields:

- `read_at`
- `archived_at`
- `snoozed_until`
- `last_seen_snapshot_id`

Inbox Item State MUST be stored in app-local database state. It MUST NOT be stored as repository
GitDB event files, repository GitDB metadata, repository worktree files, or synced repository
configuration.

### 8.9 Mention Tag

A Mention Tag is textual syntax that references a user, agent, group, or label-like routing target.

The v1 mention syntax is implementation-defined, but it SHOULD support:

- `@user`
- `@user.name`
- `@user-name`
- `@user@example.com`

The parser SHOULD ignore mentions inside fenced code blocks and inline code in Markdown bodies and
comments. The exact Markdown parser is implementation-defined, but tests MUST cover code and prose
cases.

### 8.10 Inbox Rule

An Inbox Rule determines whether a derived signal creates an item for a user.

Inbox rules are app-local state. Cycle Inbox MUST NOT persist rules to GitDB, and resetting the
app-local database MAY reset local rule configuration unless a separate app-local settings surface
explicitly owns those preferences.

Core v1 rules are:

- direct mention
- new assignment
- comment on a ticket assigned to the user
- comment on a ticket created by the user

Optional rules are:

- matching labels
- matching saved views
- parent or child ticket changes
- relation changes on watched tickets
- status transitions into review-like states

## 9. System Overview

### 9.1 Layer Position

Cycle inbox layers are:

```text
Level 1: @cycle/git-db
  generic events, snapshots, diffs, history, refs, sync

Level 2: @cycle/database
  event folding, inbox signal derivation, SQLite inbox projection, local inbox state

Level 3: @cycle/usecases
  user-facing inbox commands, workflow policy, request validation

Level 4: adapters and applications
  desktop UI, API, CLI, MCP, automation
```

`@cycle/git-db` MUST NOT import or expose inbox domain types.

`@cycle/database` MUST own the first implementation of inbox derivation because it already owns
GitDB-to-SQLite materialization and has access to tickets, comments, users, labels, commit changes,
and active snapshots.

### 9.2 Main Components

Cycle Inbox has these responsibility boundaries:

- GitDB event source: provides immutable events, snapshots, history, and diffs.
- Database materializer: folds events and extracts inbox signals from introduced events.
- Recipient resolver: maps mention tags and metadata rules to user or agent IDs.
- Inbox projection store: stores derived user-specific inbox rows and app-local item state.
- Query service: lists inbox items, summaries, counts, and status-specific views.
- State command service: marks items read, unread, archived, or snoozed locally.
- Usecase/API layer: validates user-facing requests and maps errors to transport-specific outputs.
- Desktop UI: renders inbox lists, counts, filters, item detail links, and bulk actions.

### 9.3 External Dependencies

Core runtime dependencies are:

- `@cycle/git-db` for event and snapshot reads.
- `@cycle/database` projection infrastructure.
- Effect services for identity, time, errors, layers, and tests.
- SQLite or equivalent app-local projection storage.

Cycle Inbox v1 SHOULD NOT require external network services.

## 10. Data And Storage Contract

### 10.1 Repository Storage

Repository-scoped GitDB data remains the only durable source of truth for tickets, comments,
records, users, labels, and saved views. It is not a source of truth for inbox membership or inbox
item state.

Cycle Inbox MUST NOT write repository paths whose primary purpose is inbox state, including:

```text
collections/inbox/**
collections/notifications/**
collections/users/*/inbox/**
inbox/**
notifications/**
```

Cycle Inbox MUST NOT append repository events whose primary purpose is inbox membership,
notification delivery, subscriptions, read state, archive state, snooze state, cursors, or local
inbox preferences. If a future collaborative workflow needs durable repository state, such as a
review request, that state MUST be specified as a workflow object outside the inbox model and MUST
not be used to persist personal inbox state.

### 10.2 Projection Storage

`@cycle/database` SHOULD store derived inbox rows in the existing app-level projection database.

The projection schema SHOULD include tables equivalent to:

```text
inbox_items
  repository_id TEXT NOT NULL
  user_id TEXT NOT NULL
  item_id TEXT NOT NULL
  snapshot_id TEXT NOT NULL
  sequence INTEGER NOT NULL
  event_path TEXT NOT NULL
  ticket_id TEXT NOT NULL
  record_id TEXT
  reason TEXT NOT NULL
  actor_name TEXT
  actor_email TEXT
  created_at TEXT NOT NULL
  title TEXT NOT NULL
  body_excerpt TEXT
  metadata_json TEXT
  PRIMARY KEY (repository_id, user_id, item_id)

inbox_item_state
  repository_id TEXT NOT NULL
  user_id TEXT NOT NULL
  item_id TEXT NOT NULL
  status TEXT NOT NULL
  read_at TEXT
  archived_at TEXT
  snoozed_until TEXT
  updated_at TEXT NOT NULL
  PRIMARY KEY (repository_id, user_id, item_id)
```

Implementations MAY split `inbox_items` into `inbox_signals` and `inbox_recipients` if that makes
recipient resolution or diagnostics easier.

### 10.3 Rebuild Semantics

Derived inbox rows MUST be rebuildable from GitDB events and projected user/ticket state. Local
inbox item state is intentionally not rebuildable from GitDB.

On full projection rebuild:

1. Recompute inbox items for the active snapshot.
2. Preserve matching `inbox_item_state` rows by deterministic `item_id`.
3. Ignore or garbage-collect state rows whose item no longer exists according to an
   implementation-defined retention policy.
4. Avoid creating duplicate items for the same event, recipient, ticket, record, and reason.
5. If the app-local database has been reset and no `inbox_item_state` rows remain, all recomputed
   visible inbox items MUST default to `unread`.

### 10.4 Local State Durability

Read/archive/snooze state SHOULD survive ordinary application restart because it is stored in the
app-local database. In the current repository shape, the app-level database path is
`~/.cycle/cycle.db`, so storing local inbox state there is the intended v1 behavior.

If the app-local database is deleted, reset, or rebuilt without preserving local tables, Cycle MUST
recompute inbox items from repository events and treat every visible item as `unread`. This is
expected behavior, not data corruption.

## 11. Derivation Rules

### 11.1 Incoming Definition

An Inbox Item is incoming for a user when:

1. the event is introduced by a snapshot reachable from the watched Cycle pointer;
2. the event creates an inbox signal for that user;
3. the event actor is not the same user, when actor identity is available; and
4. the target ticket is visible in the committed-ticket projection.

If actor identity is unavailable, the implementation MAY treat the event as incoming and SHOULD
include an `actor_unknown` flag in metadata.

### 11.2 Ticket Create

`ticket.create` SHOULD generate inbox signals for:

- directly mentioned users in title or body;
- the initial assignee, when the assignee is not the actor;
- users matching implementation-defined repository inbox rules.

`ticket.create` MUST NOT generate inbox items for archived or deleted tickets.

### 11.3 Ticket Update

`ticket.update` SHOULD generate inbox signals when the update introduces:

- a new mention in body or title;
- a new assignee;
- a new label watched by the user;
- a status transition watched by the user;
- a relation involving a ticket watched by the user.

Mention detection for updates SHOULD compare the before and after projected ticket fields so a
pre-existing mention does not notify repeatedly on unrelated edits.

### 11.4 Ticket Replace

`ticket.replace` SHOULD be treated as a potentially broad update.

The implementation SHOULD compare the previous folded ticket state to the replacement value and
apply the same signal rules as `ticket.update`.

### 11.5 Record Add

`record.add` SHOULD generate inbox signals when:

- the record is a comment and the comment body mentions a user;
- the record is a comment on a ticket assigned to the user;
- the record is a comment on a ticket created by the user;
- the record type is a review, implementation result, blocker, relation change, or other
  implementation-defined attention-bearing record.

User-visible records SHOULD update inbox eligibility. Non-user-visible records SHOULD NOT generate
inbox items unless a future workflow explicitly opts in.

### 11.6 Archive, Delete, And Restore

`ticket.archive` and `ticket.delete` SHOULD remove active inbox visibility for the ticket unless the
user explicitly queries archived inbox history.

`ticket.restore` MAY regenerate visibility for unresolved unread items associated with that ticket.
It MUST NOT duplicate already archived personal state.

### 11.7 User And Alias Changes

`user.upsert` MAY affect recipient resolution for future events.

For v1, implementations SHOULD NOT retroactively create inbox items for old unresolved mentions
solely because a user alias was added later, unless an explicit rebuild policy enables that
behavior.

## 12. Recipient Resolution

### 12.1 User Identifiers

Recipient resolution SHOULD normalize user IDs in the same spirit as existing database user profile
normalization:

- trim whitespace;
- lowercase email-style IDs;
- use email as the canonical human user ID when available;
- preserve enough original mention text for diagnostics.

### 12.2 Mention Matching

Mention tags SHOULD resolve against:

- user email;
- user aliases;
- normalized display name;
- implementation-defined handle fields if added to `UserProfileDocument`;
- agent profile IDs if agent inboxes are enabled.

If multiple users match the same mention, the implementation MUST NOT arbitrarily notify all of
them without a deterministic rule. It SHOULD mark the mention as ambiguous and surface a warning or
diagnostic.

### 12.3 Unknown Mentions

Unknown mentions SHOULD be recorded as unresolved signals for diagnostics but MUST NOT produce
user-specific inbox items.

Warnings MUST NOT include full ticket bodies, full comment bodies, secrets, tokens, credentials, or
private key material.

## 13. Public API Requirements

### 13.1 Database Service

`@cycle/database` SHOULD expose inbox operations directly or through a cohesive method group.

Recommended operations:

```ts
listInbox(query): Effect<InboxPage, DatabaseFailure>
inboxSummary(query): Effect<InboxSummary, DatabaseFailure>
markInboxRead(input): Effect<InboxMutationResult, DatabaseFailure>
markInboxUnread(input): Effect<InboxMutationResult, DatabaseFailure>
archiveInboxItems(input): Effect<InboxMutationResult, DatabaseFailure>
snoozeInboxItems(input): Effect<InboxMutationResult, DatabaseFailure>
```

`listInbox` SHOULD support:

- `userId`
- `repositoryIds`
- `status`
- `reason`
- `ticketId`
- `createdAfter`
- `createdBefore`
- `cursor`
- `limit`

Pagination cursors MUST be deterministic and MUST avoid skipping or duplicating rows when the active
projection snapshot is unchanged.

### 13.2 Inbox Page

An `InboxPage` SHOULD contain:

- `entries`
- `nextCursor`
- `activeSnapshotIds`, keyed by repository ID or represented by an equivalent generation marker

Each entry SHOULD include:

- repository ID
- ticket ID
- record ID when applicable
- item ID
- reason
- status
- title
- excerpt
- actor
- created time
- snapshot ID
- link metadata needed to open the target ticket or record

### 13.3 Inbox Summary

An `InboxSummary` SHOULD contain:

- unread count
- read count when requested
- archived count when requested
- count by repository
- count by reason
- latest item timestamp
- projection status per repository

### 13.4 State Mutations

Inbox state mutations MUST be local and idempotent.

Marking an already-read item read MUST succeed without creating duplicate state. Archiving an
already-archived item MUST succeed without changing repository data.

If an item ID is unknown, the operation SHOULD report a validation failure unless the request
explicitly allows missing items for bulk reconciliation.

## 14. Runtime Workflows

### 14.1 Sync And Materialization

On repository sync:

```text
sync(repository):
  current_snapshot = read refs/gitdb/cycle/main
  previous_snapshot = projection active snapshot
  materialize tickets, records, users, labels, commits, commit changes
  derive inbox signals from introduced events and folded before/after state
  resolve recipients
  upsert inbox items
  preserve local item state
  activate projection snapshot
```

The implementation MAY initially derive inbox items during the existing full-rebuild path. It SHOULD
be designed so future incremental materialization can process only events introduced between the
previous active snapshot and the new snapshot.

### 14.2 Inbox Read

```text
listInbox(query):
  validate user_id and query
  read active projection state
  join inbox_items with inbox_item_state
  default missing state to unread
  filter by repositories, status, reason, ticket, and time
  order by created_at desc, sequence desc, item_id asc
  return page and cursor
```

### 14.3 Mark Read

```text
markInboxRead(user_id, item_ids):
  validate user_id
  begin local projection transaction
  for each item_id:
    verify item exists for user unless missing is allowed
    upsert state status = read, read_at = now, updated_at = now
  complete local projection transaction
  return mutation result
```

### 14.4 Archive

```text
archiveInboxItems(user_id, item_ids):
  validate user_id
  begin local projection transaction
  for each item_id:
    verify item exists for user unless missing is allowed
    upsert state status = archived, archived_at = now, updated_at = now
  complete local projection transaction
  return mutation result
```

### 14.5 Mark Read Through Snapshot Or Sequence

Bulk clearing SHOULD support a read-through operation:

```text
markInboxReadThrough(user_id, repository_id, sequence):
  set all visible unread items for user and repository
  with sequence <= input sequence
  to read
```

This operation is optional for v1 but SHOULD be added before large inbox volumes are expected.

## 15. State Model

An inbox item has derived existence and local state.

Derived existence states:

- `active`: source ticket and event are visible in the current projection.
- `source_archived`: source ticket is archived.
- `source_deleted`: source ticket is deleted.
- `orphaned`: local state exists but the derived item no longer exists after rebuild.

Local item states:

- `unread`: default state when no state row exists.
- `read`: user has marked the item read.
- `archived`: user has removed the item from normal inbox views.
- `snoozed`: user has deferred the item until a future time.

Default inbox views MUST show `active` items with local status `unread` or `snoozed` when the snooze
time has elapsed. Default views SHOULD hide `archived`, `source_archived`, and `source_deleted`
items.

## 16. Failure Model And Recovery

### 16.1 Invalid Events

If an event cannot be parsed, the materializer MUST skip the invalid object, record a
materialization warning, and continue processing other events.

Inbox derivation MUST NOT prevent repository projection activation solely because an inbox signal
cannot be extracted.

### 16.2 Diff Unavailable

If incremental diff data is unavailable, the implementation MUST fall back to a full rebuild.

The deterministic `item_id` contract MUST prevent duplicate inbox items after rebuild.

### 16.3 Ambiguous Or Unknown Recipient

Ambiguous or unknown mentions MUST NOT crash materialization. They SHOULD create diagnostics or
warnings and SHOULD NOT create user-specific inbox items unless a deterministic resolution policy is
configured.

### 16.4 Projection State Loss

If app-local projection state is deleted or reset, derived inbox items MUST be rebuildable from
GitDB and all visible inbox items MUST return to `unread`.

The product MUST communicate that personal inbox state is local, not shared repository truth.
Resetting the app-local database resets inbox read/archive/snooze state.

### 16.5 Concurrency

Inbox derivation MUST run inside the same repository materialization serialization guarantees as
other database projection writes.

Inbox state mutations MUST be local transactions. They MUST NOT race with projection activation in a
way that exposes partially written rows.

## 17. Observability

Inbox materialization SHOULD emit structured logs or trace annotations with:

- repository ID
- previous snapshot ID
- new snapshot ID
- number of introduced events inspected
- number of signals extracted
- number of user-specific inbox items upserted
- number of unresolved mentions
- number of ambiguous mentions
- number of derivation warnings

Logs MUST NOT include full ticket bodies, full comment bodies, secrets, tokens, credentials, or
private keys.

Repository status MAY include inbox warning counts in the future, but inbox warnings SHOULD NOT
replace existing materialization warnings.

## 18. Security And Privacy

Cycle Inbox MUST preserve the local-first trust boundary:

- no inbox data leaves the local machine unless a future adapter explicitly sends it;
- personal read/archive/snooze state MUST NOT be committed to repositories;
- mention parsing MUST treat ticket bodies and comments as untrusted user input;
- logs and warnings MUST redact sensitive fields and avoid storing full bodies;
- inbox query APIs MUST require a concrete user identity from the caller or runtime context.

If future multi-user or hosted features are added, this PRD MUST be revised to define authorization,
shared state, server storage, and notification delivery semantics.

## 19. Desktop Product Requirements

Desktop v1 SHOULD expose:

- a global inbox entry point with unread count;
- repository-scoped inbox filters;
- item rows showing reason, actor, ticket title, repository, timestamp, and status;
- direct navigation from an inbox item to the target ticket or comment;
- bulk mark-read and archive actions;
- empty, loading, degraded, and failed states;
- explanation text or tooltip for why an item appeared, such as "mentioned you" or "assigned to
  you."

Desktop v1 MUST NOT require network access to open or manage the inbox for already-opened
repositories.

## 20. Validation Matrix

P0 database tests MUST cover:

- direct mention in a new ticket creates one unread inbox item for the mentioned user;
- direct mention in a new comment creates one unread inbox item for the mentioned user;
- unrelated ticket update does not re-notify an existing mention;
- assignment to a different user creates an inbox item for the new assignee;
- self-authored events do not create incoming inbox items when actor identity is known;
- mark-read is idempotent and does not mutate GitDB;
- archive is idempotent and does not mutate GitDB;
- full projection rebuild does not duplicate inbox items;
- unknown mention does not crash materialization;
- invalid event records a warning and does not block other inbox items.

P1 tests SHOULD cover:

- ambiguous mention resolution;
- mention parsing ignores fenced code and inline code;
- cross-repository inbox pagination;
- unread summary counts by repository and reason;
- read-through sequence bulk action;
- source ticket archive/delete hides active inbox items by default;
- local state survives ordinary application restart when using durable app-local SQLite;
- resetting the app-local database recomputes visible inbox items as unread.

P2 tests MAY cover:

- label-based inbox rules;
- saved-view-based inbox rules;
- agent mention inboxes;
- snooze behavior.

## 21. Implementation Phases

### 21.1 Phase 0: Data-Layer Contract

- Define inbox domain types in `@cycle/database`.
- Define projection tables for `inbox_items` and `inbox_item_state`.
- Implement deterministic item ID derivation.
- Add mention parsing helpers with tests.
- Add projection methods for list, summary, mark read, and archive.

### 21.2 Phase 1: Event-Derived Inbox

- Derive inbox items from `ticket.create`, `ticket.update`, `ticket.replace`, and `record.add`.
- Resolve users from projected user profiles.
- Add direct mention and assignee rules.
- Add full-rebuild-safe tests.
- Ensure no GitDB inbox paths or inbox-specific GitDB events are written.

### 21.3 Phase 2: Product Surface

- Add usecase/API operations over database inbox methods.
- Add desktop inbox navigation, list, unread count, filters, and bulk actions.
- Add degraded-state messaging when repository projection warnings affect inbox derivation.

### 21.4 Phase 3: Advanced Rules

- Add label, saved view, relation, review, and watched-ticket rules.
- Add snooze and read-through operations.
- Add optional diagnostics for unresolved mentions.

## 22. Open Questions

1. Should mention syntax include team/group tags such as `@frontend`, or should those be treated as
   labels/rules instead of users?
2. Should `@tags` in ticket labels count as mentions, or should mentions only come from title,
   body, and comments?
3. Should self-authored mentions create inbox items for the author when the mention is explicit, or
   should all self-authored events be suppressed by default?
4. Should unknown mentions surface in repository warnings, a separate diagnostics table, or only
   debug logs?
5. Should agent mentions create inbox items immediately, or should they become agent work requests
   only after explicit human approval?
