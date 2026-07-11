# Cycle Pages Specification

Status: Draft

Version: 0.1.0

Conformance target: Cycle repository storage, contracts, database projection, use cases, local API,
MCP, desktop, and UI packages

Related work: `UKN-B9NZJ` (`cycle://` protocol links)

## 1. Purpose

This specification defines **Pages**, a repository-scoped area in Cycle for durable Markdown
documents that humans and agents can create, read, edit, organize, comment on, archive, restore,
reference, and share.

Pages MUST use Cycle's Git-backed event store as source of truth. They MUST present a user-facing
hierarchy that behaves like a directory of Markdown files without exposing the internal Git-store
layout. Pages, tickets, and future commentable resources MUST share resource-reference, comment,
actor-provenance, revision, API, and MCP concepts where their behavior is equivalent.

This specification also extends the canonical `cycle://` protocol to Pages and defines the migration
away from legacy Markdown reference schemes such as `cycle-issue:`.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document are
to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means the implementation may choose the exact internal mechanism or UI
presentation, but it MUST document the choice in code or tests and MUST preserve the observable
requirements in this specification.

## 3. Problem Statement

Cycle tickets are suitable for scoped work tracking, but users and agents also need durable,
repository-local documents that can hold longer-lived knowledge such as architecture notes,
operating procedures, product documentation, research, plans, and team-specific references.

Storing this information only in chat, ticket bodies, or untracked workspace files causes several
problems:

- long-lived knowledge is coupled to a transient conversation or work item;
- humans and agents do not share one durable editing and commenting surface;
- links differ between tickets, chat, and Markdown rendering;
- repository knowledge cannot be organized into a navigable hierarchy;
- agent-created documents lack a first-class audit, revision, and access contract;
- large content is likely to be injected into prompts instead of fetched intentionally;
- ad hoc filesystem storage bypasses Git-store durability, sync, and event projection.

Pages solves these problems without becoming a general filesystem, wiki server, or collaborative
text-editing engine.

## 4. Goals

The Pages implementation MUST:

1. Scope every page to exactly one Cycle repository.
2. Treat Markdown plus schema-backed frontmatter as the canonical page content model.
3. Persist page changes as append-only, sharded events in the repository Git store.
4. Project those events into a fast read model without creating a mutable current-page file in the
   Git store.
5. Expose a user-facing hierarchy equivalent to directories containing `.md` files.
6. Support create, read, explicit-save edit, move/rename, archive, restore, history, comment list,
   and comment add workflows.
7. Preserve stable page identity when a page is renamed or moved.
8. Prevent stale writers from silently overwriting a newer page revision.
9. Treat humans and agents as first-class attributed actors.
10. Give agents complete Page read and mutation capabilities through MCP, subject to existing
    repository and tool authority.
11. Generalize comments around a typed Cycle resource reference so tickets and Pages use one
    commentable-resource contract.
12. Generate and resolve canonical `cycle://` links for repositories, tickets, and Pages.
13. Continue reading legacy Cycle Markdown links while new writes generate only canonical links.
14. Provide deterministic validation, failure mapping, observability, and conformance tests.

## 5. Non-Goals

The v0.1 implementation MUST NOT require:

1. Full-text Page search or comment search.
2. A per-page or per-ticket byte-size limit.
3. Permanent deletion of Pages.
4. Real-time collaborative editing, operational transforms, or CRDTs.
5. Automatic merge or conflict resolution for concurrent Page edits.
6. Page attachments, arbitrary binary files, or a general repository file browser.
7. Per-page ACLs or permissions distinct from repository and tool authority.
8. Comment editing, deletion, reactions, or threaded replies unless the equivalent behavior first
   exists for tickets through the shared comment abstraction.
9. Multiple parents, aliases, symbolic links, mounts, or a page appearing at multiple paths.
10. Automatically embedding complete Page bodies into every ticket or chat prompt that links them.
11. Exposing the internal Git-store event layout as a user-editable directory.
12. A mutable current-state Page document in the Git-store tree.
13. Background rewriting of every persisted legacy Cycle link in one migration commit.
14. Hosted accounts, cross-account routing, or repository-independent Pages.

## 6. System Overview

### 6.1 Components and Ownership

| Component          | Required responsibility                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `@cycle/contracts` | Own Page, hierarchy, comment-target, resource-reference, request, response, and typed failure schemas.                                    |
| `@cycle/git-store` | Preserve generic Git object, transaction, ref, history, and append-only event behavior; support the canonical Page event shard rule.      |
| `@cycle/database`  | Own Page event creation/folding, repository materialization, SQLite projection, hierarchy queries, revision checks, and generic comments. |
| `@cycle/usecases`  | Own Page workflow validation and policy contracts consumed by HTTP and MCP.                                                               |
| `@cycle/api`       | Expose schema-first HTTP endpoints, MCP tools/resources, auth mapping, and transport errors.                                              |
| `@cycle/ui`        | Own presentation-first Page tree, viewer, editor, breadcrumb, archive state, history, comments, and conflict components.                  |
| `@cycle/desktop`   | Compose services, own Page navigation, query/mutation state, and internal/external `cycle://` routing.                                    |

The implementation SHOULD extend these existing packages rather than create an `@cycle/pages`
facade. Symbols MUST be imported from their canonical owning package and MUST NOT be re-exported by
another package solely for convenience.

### 6.2 Source of Truth and Read Path

The authoritative write and read flow is:

```text
human or agent
  -> use case / policy
  -> append Page or Comment event in one Git-store transaction
  -> advance refs/gitdb/cycle/main
  -> fold introduced events
  -> atomically publish the next SQLite projection generation
  -> serve reads from SQLite
```

Application reads MUST use the active SQLite projection. SQLite MUST NOT become an independent
write source. Repository rebuild MUST be capable of reconstructing all Page and Comment state from
Git-store history.

### 6.3 External Dependencies

Pages depends on the existing:

- repository identity and `refs/gitdb/cycle/main` contracts;
- Git-store transaction, snapshot, history, diff, and sync behavior;
- actor identity service;
- database projection-generation model;
- use-case runner and HTTP authorization middleware;
- MCP REST client and allowed-tool authority;
- Markdown editor, renderer, and reference handling;
- desktop workspace router and custom-protocol integration.

Pages MUST NOT perform raw `process.env`, filesystem, Git command, HTTP, or Electron operations in
domain logic.

### 6.4 Configuration

Pages introduces no user, environment, or repository configuration in v0.1. Page ID format, event
sharding, path validation, schema version, URI grammar, and lifecycle behavior are protocol
constants and MUST NOT be runtime-configurable. Future configuration MUST use the existing
schema-backed `Config` and `ConfigProvider` boundaries and MUST define precedence, validation, and
reload behavior before release.

## 7. Core Domain Model

### 7.1 Page ID

`PageId` is a UUIDv7 string generated once during creation.

A Page ID MUST:

- be stable for the lifetime of the Page;
- be unique within a repository;
- remain unchanged across title edits, path changes, archive, and restore;
- be stored in Page frontmatter and Page events;
- be the identity used by APIs, comments, history, and `cycle://` links;
- remain primarily machine-facing; the UI SHOULD present title and path instead.

The implementation MUST NOT derive Page identity from its title, path, Git blob ID, or current
snapshot ID.

### 7.2 Page Path

`PagePath` is the repository-relative user-facing location of the Markdown document. Examples:

```text
index.md
payments/index.md
payments/refunds.md
payments/providers/stripe.md
```

A Page path MUST:

- be non-empty and relative;
- use `/` as its separator;
- end in the lowercase literal `.md`;
- contain no empty, `.`, or `..` segment;
- contain no backslash, NUL, ASCII control character, or leading `/`;
- be Unicode NFC-normalized before validation and comparison;
- contain no segment longer than 256 Unicode code points;
- be unique across all active and archived Pages in the repository.

Path comparison is case-sensitive. Implementations MUST NOT silently lowercase a supplied path.
Clients SHOULD warn users when a path differs from another path only by case.

Archived Pages retain and reserve their paths because permanent deletion does not exist. A create
or move operation MUST fail rather than reuse an archived Page path.

### 7.3 User-Facing Directory Model

Directories are derived from Page path segments and are not independently persisted aggregates.

- `payments/index.md` is the optional cover Page for directory `payments/`.
- `payments/refunds.md` is a child entry of `payments/`.
- `payments.md` and `payments/index.md` are distinct Pages.
- Only `payments/index.md` is the cover selected when opening the `payments/` directory.
- A directory MAY exist without an `index.md` cover when it has descendants.
- An empty directory cannot exist because directories are derived from Pages.

Archiving a Page MUST archive only that Page. It MUST NOT archive or reparent descendants. If the
Page is an `index.md` cover, the directory remains visible while active descendants exist and is
shown without an active cover.

### 7.4 Page Frontmatter

Page frontmatter MUST contain:

| Field           | Type               | Rule                                                 |
| --------------- | ------------------ | ---------------------------------------------------- |
| `id`            | `PageId`           | Immutable stable identity.                           |
| `title`         | non-empty string   | User-facing title; independent of Markdown headings. |
| `schemaVersion` | literal `1`        | Encoded Page schema version.                         |
| `createdAt`     | ISO-8601 timestamp | Set on create and immutable.                         |
| `createdBy`     | `Actor`            | Set on create and immutable.                         |
| `updatedAt`     | ISO-8601 timestamp | Timestamp of the last Page-state mutation.           |
| `updatedBy`     | `Actor`            | Actor responsible for the last Page-state mutation.  |

Archived Pages MUST additionally contain:

| Field        | Type               | Rule                         |
| ------------ | ------------------ | ---------------------------- |
| `archivedAt` | ISO-8601 timestamp | Present only while archived. |
| `archivedBy` | `Actor`            | Present only while archived. |

Frontmatter MAY contain extension fields. Unknown extension fields MUST be preserved through read,
edit, move, archive, restore, event folding, and reserialization. Public schemas MUST reject unsafe
object keys such as `__proto__`, `prototype`, and `constructor` at untrusted boundaries.

The path and repository ID MUST NOT be duplicated inside serialized frontmatter. They are location
and scope fields on the public Page document and event state.

### 7.5 Page Document

The canonical public `PageDocument` schema MUST be equivalent to:

```ts
type PageDocument = {
  readonly body: string;
  readonly bodyFormat: "markdown";
  readonly frontmatter: PageFrontmatter;
  readonly id: PageId;
  readonly path: PagePath;
  readonly repositoryId: string;
  readonly revisionId: string;
};
```

`revisionId` is the Git snapshot ID of the most recent event that changed Page aggregate state. A
Comment event MUST NOT change the Page revision ID.

### 7.6 Actor

Pages MUST use the existing `Actor` schema with `human`, `agent`, and `import` actor types. Create,
edit, move, archive, restore, and comment events MUST have attributable actors. Agent mutations MUST
retain provider/provenance data through the existing actor and agent-provenance contracts.

### 7.7 Cycle Resource Reference

The canonical cross-resource target MUST be equivalent to:

```ts
type CycleResourceRef =
  | { readonly repositoryId: string; readonly resourceKind: "ticket"; readonly resourceId: string }
  | { readonly repositoryId: string; readonly resourceKind: "page"; readonly resourceId: PageId };
```

The union MUST be extensible in its owning schema module. A future resource kind MUST define stable
identity, repository scope, existence checks, URI grammar, and authorization behavior before it is
added.

### 7.8 Comment

The generic `CommentDocument` MUST be equivalent to:

```ts
type CommentDocument = {
  readonly body: string;
  readonly bodyFormat: "markdown";
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly id: string;
  readonly repositoryId: string;
  readonly schemaVersion: 1;
  readonly target: CycleResourceRef;
};
```

Comments are append-only in v0.1. The shared comment API MUST support list and add for ticket and
Page targets. Page-specific and ticket-specific transport routes MAY delegate to this shared
contract, but storage and use-case implementations MUST NOT duplicate comment policy by target
kind.

Legacy ticket comments represented as `record.add` events MUST materialize as equivalent generic
comments targeting the owning ticket. Existing ticket comment endpoints and MCP tools MUST remain
compatible.

### 7.9 Invariants

At every materialized snapshot:

1. A Page ID identifies at most one Page aggregate.
2. A Page path identifies at most one Page, including archived Pages.
3. Page identity and creation metadata never change.
4. Active Pages have no archive fields.
5. Archived Pages have both `archivedAt` and `archivedBy`.
6. Every Page event targets the Page aggregate whose ID appears in the event state.
7. Every Page comment targets an existing Page in the same repository.
8. A stale expected revision never produces a Page mutation.
9. The user-facing path never determines the internal event path.
10. A Page can be reconstructed without reading a mutable current-state Page file.

## 8. Markdown and Frontmatter Contract

### 8.1 Canonical Serialization

When a Page is exposed as a Markdown file, exported, copied as source, or passed through a
Markdown-document boundary, it MUST use YAML frontmatter followed by the body:

```markdown
---
id: 0198f6d4-90a2-7a2a-9f0f-04d232812d31
title: Payments
schemaVersion: 1
createdAt: 2026-07-11T10:00:00.000Z
createdBy:
  name: Robert
  type: human
updatedAt: 2026-07-11T10:00:00.000Z
updatedBy:
  name: Robert
  type: human
---

# Payments

Page content begins here.
```

The serializer MUST:

- emit exactly one opening and closing frontmatter delimiter;
- emit UTF-8 text;
- use `\n` line endings in canonical output;
- emit required keys in the order shown by Section 7.4, followed by archive fields and then
  preserved extension keys in deterministic lexical order;
- preserve Markdown body text except for canonical line-ending normalization;
- avoid adding or rewriting an H1 based on the title.

The parser MUST reject missing or duplicate required fields, invalid UUIDv7 IDs, invalid actor
shapes, invalid timestamps, unsupported schema versions, duplicate YAML keys, aliases, executable
tags, and unsafe object keys.

### 8.2 Title and Body

Frontmatter `title` is the source of truth for navigation and Page metadata. The first Markdown H1,
if present, is body content and MAY differ from the title. The UI MAY offer to keep them aligned but
MUST NOT mutate either automatically.

Empty bodies are valid. Empty or whitespace-only titles are invalid.

### 8.3 Size Behavior

This specification defines no Page or ticket byte-size limit. Implementations MUST still use
bounded request parsing and resource controls at transport boundaries, but no conformance behavior
may reject a Page solely because it exceeds an arbitrary Page-specific size threshold introduced by
this specification.

## 9. Git-Store Contract

### 9.1 No Current-Page File

The Git store MUST NOT maintain a mutable file such as `pages/<user-path>` or
`collections/pages/<id>.md` as Page source of truth or as a required read path.

User-facing Markdown paths are projected domain data. Git-store event paths are internal storage
addresses. Moving `payments/index.md` to `platform/payments.md` changes Page aggregate state and the
root Git tree in a new commit, but it does not change Page identity or require relocating earlier
events.

### 9.2 Event Layout

Page events MUST use this layout:

```text
collections/events/page/<shard>/<page-id>/<event-id>.json
```

The shard MUST be the first two lowercase hexadecimal characters of SHA-256 over the UTF-8 Page ID
string. The same algorithm MUST be implemented once in the Git-store event-path owner and covered
by compatibility vectors.

The Page aggregate type literal is `page`. Page events MUST use the existing safe event-segment,
canonical stable-JSON, append-conflict, and introduced-event contracts.

The implementation MAY read an explicitly documented legacy unsharded Page event layout if one is
ever released, but v0.1 writes MUST use only the canonical sharded layout.

### 9.3 Page Events

The required event operations are:

| Operation      | Required payload                | Behavior                                                              |
| -------------- | ------------------------------- | --------------------------------------------------------------------- |
| `page.create`  | complete initial Page state     | Creates a new active Page .                                            |
| `page.replace` | complete replacement Page state | Explicitly saves body, title, path, or extension-frontmatter changes. |
| `page.archive` | optional reason                 | Adds archive metadata using event actor and timestamp.                |
| `page.restore` | optional reason                 | Removes archive metadata and returns the Page to active state.        |

The event envelope MUST derive aggregate ID, actor, timestamp, event ID, and snapshot from the same
existing sources as ticket events. Payloads SHOULD NOT duplicate envelope-owned values unless the
state schema requires them for deterministic reconstruction.

`page.replace` MUST preserve immutable identity and creation fields. The replacement state MUST be
schema-decoded before append and again during materialization.

There is no `page.delete` event.

### 9.4 Atomic Writes

Every successful Page mutation MUST:

1. resolve repository and actor;
2. validate input and current Page state;
3. compare the supplied expected revision when required;
4. append exactly one Page lifecycle event in a Git-store transaction;
5. include any actor-profile event required by existing identity policy in the same transaction;
6. create one Git commit and advance the pointer ref atomically;
7. synchronize the projection until the new Page state is visible;
8. return the resulting Page document and revision ID.

Failure before ref advancement MUST leave the prior snapshot authoritative. Objects written before
a failed ref update MAY remain unreachable and are governed by Git-store cleanup behavior.

### 9.5 Append-Only Enforcement

Page event files MUST never be modified or removed. Materialization MUST classify a modified or
deleted Page event as an append-only violation, retain the last valid projection generation, and
emit a materialization warning with repository ID, snapshot ID, event path, Page ID, and a safe
reason. Logs and warnings MUST NOT contain the full Page body.

### 9.6 Commit Metadata

Page commits MUST use the current actor as Git author and committer unless an existing import policy
explicitly supplies imported provenance. Default commit messages SHOULD identify the operation,
Page title, Page path where useful, and actor without including Page body content.

## 10. Projection and Hierarchy Contract

### 10.1 Required Projection Data

The SQLite projection MUST contain equivalent Page data for:

- repository ID;
- Page ID;
- path and path segments;
- title;
- Markdown body;
- normalized frontmatter JSON;
- created and updated actor/timestamps;
- archive actor/timestamp;
- schema version;
- last Page revision snapshot ID.

The exact table and column names are implementation-defined. A dedicated `pages` table is
RECOMMENDED.

Generic comments MUST store equivalent `resource_kind` and `resource_id` target fields. A migration
MAY retain nullable legacy `ticket_id` columns for compatibility, but new generic comment queries
MUST operate through `CycleResourceRef`.

### 10.2 Materialization

Full rebuild MUST fold all Page events in commit-topological order using the same snapshot ordering
rules as tickets. Incremental sync MUST fold only introduced events when safe and fall back to full
rebuild when append-only or ancestry assumptions fail.

An invalid Page event MUST produce a warning and MUST NOT expose partially decoded Page state. If a
Page's create event is invalid, later events for that Page MUST be suppressed until a valid state can
be deterministically reconstructed.

Projection publication MUST be atomic. Readers MUST observe either the previous complete generation
or the next complete generation, never a partially updated hierarchy.

### 10.3 Hierarchy Derivation

Hierarchy queries MUST derive folders from normalized path segments. They MUST support:

- listing the repository root;
- listing one immediate directory level;
- recursively listing a subtree;
- resolving the optional `index.md` cover for a directory;
- resolving an exact Page path;
- excluding archived Pages by default;
- explicitly including or selecting archived Pages.

Directory ordering MUST be deterministic. The default order SHOULD list directories before Pages
and then compare display names using a documented locale-independent ordering.

Full-text search, snippets, relevance ranking, and comment matching are out of scope.

### 10.4 History

Page history MUST be derived from commits and commit changes affecting the Page aggregate. History
entries MUST expose snapshot ID, parents, actor, timestamp, operation, commit message, and Page path
at that revision. A revision read MUST reconstruct the Page as of a supplied reachable snapshot.

History MUST continue across moves because it is keyed by Page ID, not user-facing path.

## 11. Runtime Workflows and State Machine

### 11.1 States

A Page has two lifecycle states:

```text
absent --create--> active --archive--> archived --restore--> active
                         |                  |
                         +---- no delete ---+
```

`absent` is not a persisted Page state. `active` and `archived` are derived from archive fields.

### 11.2 Create

Create input MUST include repository ID, title, Page path, Markdown body, and MCP approval metadata
where invoked through MCP. Body MAY be empty.

Creation MUST fail if:

- repository scope is invalid or unavailable;
- title or path is invalid;
- the path is already reserved by an active or archived Page;
- the generated ID conflicts after bounded regeneration attempts;
- frontmatter or actor data is invalid;
- the Git-store transaction or projection publication fails.

Create is non-idempotent unless a future explicit idempotency key contract is added. Clients MUST
NOT automatically retry an ambiguously completed create request.

### 11.3 Read and List

Get-by-ID MUST return active or archived state when the caller explicitly permits archived Pages.
Ordinary list and hierarchy operations MUST exclude archived Pages by default.

Resolve-by-path MUST use the normalized exact path and MUST NOT guess extensions, case, or index
resolution. Directory-cover resolution is a separate hierarchy operation that explicitly appends
`index.md` to the directory path.

### 11.4 Explicit Save and Move

The UI MUST use explicit Save. It MUST NOT persist Page edits through autosave in v0.1.

Update input MUST include:

- Page ID;
- expected Page revision ID;
- a complete replacement body when body changes;
- a complete replacement title when title changes;
- a complete replacement path when moving or renaming;
- optional frontmatter extension patch;
- optional commit message.

One save MUST produce one `page.replace` event and one Git commit regardless of whether it changes
body, title, path, or several fields together.

Moving a Page MUST NOT rewrite descendants. Moving an `index.md` cover therefore moves only that
Page; moving a complete directory subtree requires an explicit higher-level batch feature and is out
of scope.

Editing an archived Page MUST fail. The Page MUST be restored before it can be edited or moved.

### 11.5 Optimistic Concurrency

The expected revision is Page-specific: it is compared with the snapshot ID of the last event that
changed that Page. Unrelated repository commits MUST NOT make an editor stale.

On mismatch, the system MUST return a typed revision conflict containing:

- repository ID;
- Page ID;
- expected revision ID;
- actual revision ID;
- safe current metadata sufficient to offer reload or comparison.

The conflict response MUST NOT mutate state. The server MUST NOT auto-merge, choose a winner, or
silently overwrite. The UI MUST preserve the user's unsaved text and offer at least reload-current
and copy-unsaved-content actions. A compare view MAY be provided.

### 11.6 Archive

Archive requires an active Page and its expected revision ID. It MUST add `archivedAt` and
`archivedBy` without changing identity, path, body, title, or creation metadata.

Archiving affects only the target Page. Descendants remain active and keep their paths. Comments
remain durable and readable when the archived Page is explicitly opened.

Repeated archive of an already archived Page MUST return a typed invalid-state error and MUST NOT
append another event.

### 11.7 Restore

Restore requires an archived Page and its expected revision ID. It MUST remove archive metadata.
Because archived paths remain reserved, ordinary restore cannot encounter a path reused by another
Page.

Repeated restore of an active Page MUST return a typed invalid-state error and MUST NOT append an
event.

### 11.8 Comments

Adding a comment MUST:

1. validate the `CycleResourceRef` and repository scope;
2. require the target Page or ticket to exist;
3. reject an empty or whitespace-only Markdown body;
4. append one generic `comment.add` event with actor provenance;
5. produce one Git commit;
6. project and return the visible comment.

Adding a Page comment MUST NOT change the Page revision ID and MUST NOT cause an open Page editor to
conflict. Comment activity timestamps MAY be projected separately from Page content `updatedAt`.

Comments MAY be added to archived Pages if repository write authority permits it. The UI MUST make
the archived state visible while composing.

### 11.9 Retry and Cancellation

Read operations MAY use the existing bounded retry policy for transient projection or transport
failures. Mutation retries MUST stop when completion is ambiguous unless the event identity makes
the retry provably idempotent.

A ref compare-and-swap conflict MAY be reconciled and retried at most three times when the Page's
actual revision still equals the supplied expected revision. If the Page revision changed, the
operation MUST immediately return `PageRevisionConflict`. Exhausting three unrelated-ref retries
MUST return a typed storage conflict for operator-visible recovery.

Cancellation before ref advancement MUST abort the transaction. Cancellation after ref advancement
MUST report an indeterminate or committed result and trigger reconciliation; it MUST NOT claim that
the mutation was rolled back.

## 12. Application Service and Use-Case Contracts

### 12.1 Database Service

The database owner MUST expose capabilities equivalent to:

```ts
createPage(repositoryId, input, options?)
getPage(repositoryId, pageId, options?)
resolvePagePath(repositoryId, path, options?)
listPages(repositoryId, query?)
listPageHierarchy(repositoryId, query?)
updatePage(repositoryId, pageId, input, options?)
archivePage(repositoryId, pageId, input, options?)
restorePage(repositoryId, pageId, input, options?)
pageHistory(repositoryId, pageId, query?)
pageRevision(repositoryId, pageId, snapshotId)
listComments(target, query?)
addComment(target, input, options?)
```

Existing ticket comment methods MAY remain as compatibility wrappers but SHOULD delegate to the
generic comment capabilities.

### 12.2 Use Cases

`@cycle/contracts` MUST own schema-backed use-case definitions for:

- `PageCreate`;
- `PageGet`;
- `PageList`;
- `PageHierarchyList`;
- `PageUpdate`;
- `PageArchive`;
- `PageRestore`;
- `PageHistoryList`;
- `PageRevisionGet`;
- `CommentList`;
- `CommentAdd`.

Compatibility ticket comment use cases MAY remain, but the canonical implementation SHOULD use
`CommentList` and `CommentAdd` with a ticket target.

Every use case MUST declare repository scope, side-effect class, idempotency posture, version,
input schema, success schema, and typed failure schema.

## 13. HTTP API Contract

### 13.1 Required Routes

The local v1 API MUST expose equivalent routes:

| Method  | Route                                                                | Purpose                            |
| ------- | -------------------------------------------------------------------- | ---------------------------------- |
| `GET`   | `/v1/repositories/:repositoryId/pages`                               | List Pages or one hierarchy scope. |
| `POST`  | `/v1/repositories/:repositoryId/pages`                               | Create a Page.                     |
| `GET`   | `/v1/repositories/:repositoryId/pages/:pageId`                       | Get a Page.                        |
| `PATCH` | `/v1/repositories/:repositoryId/pages/:pageId`                       | Explicitly save or move a Page.    |
| `POST`  | `/v1/repositories/:repositoryId/pages/:pageId/archive`               | Archive a Page.                    |
| `POST`  | `/v1/repositories/:repositoryId/pages/:pageId/restore`               | Restore a Page.                    |
| `GET`   | `/v1/repositories/:repositoryId/pages/:pageId/history`               | List Page history.                 |
| `GET`   | `/v1/repositories/:repositoryId/pages/:pageId/revisions/:snapshotId` | Read one revision.                 |
| `GET`   | `/v1/repositories/:repositoryId/pages/:pageId/comments`              | List Page comments.                |
| `POST`  | `/v1/repositories/:repositoryId/pages/:pageId/comments`              | Add a Page comment.                |

The list endpoint MUST accept schema-backed cursor, limit, directory, recursive, and archived
filters. It MUST NOT accept a search query in v0.1.

### 13.2 Envelopes and Validation

Routes MUST use the existing resource and collection envelope conventions, request IDs,
authorization middleware, repository-scoping middleware, typed schema decoding, and normalized API
error envelope.

Mutation success MUST be returned only after the new projection state is visible. Page create MUST
return `201`. Update, archive, restore, and comment add MUST return the resulting resource using the
existing API status conventions.

### 13.3 Error Mapping

The transport MUST distinguish at least:

| Failure                                               | HTTP behavior                                   |
| ----------------------------------------------------- | ----------------------------------------------- |
| invalid Page ID, path, frontmatter, or payload        | `400`                                           |
| unauthorized repository/tool access                   | `401` or `403` according to existing middleware |
| repository, Page, revision, or comment target missing | `404`                                           |
| Page path already reserved                            | `409`                                           |
| stale expected revision                               | `409`                                           |
| invalid active/archived transition                    | `409`                                           |
| projection temporarily unavailable or sync failure    | existing typed `5xx` mapping                    |

Error bodies MUST include stable machine-readable codes and request IDs. They MUST NOT include full
Page or comment bodies.

## 14. MCP Contract

### 14.1 Required Tools

MCP MUST expose:

- `cycle_page_list`;
- `cycle_page_get`;
- `cycle_page_create`;
- `cycle_page_update`;
- `cycle_page_archive`;
- `cycle_page_restore`;
- `cycle_page_history`;
- `cycle_page_revision_get`;
- `cycle_page_comments_list`;
- `cycle_page_comment_add`.

Page list MUST support directory traversal but MUST NOT advertise search. Tool inputs and outputs
MUST reuse canonical contract schemas and call the REST/use-case path rather than database services
directly.

### 14.2 Human Approval Flag

Every Page MCP mutation input MUST contain a required Boolean `humanApproved` field.

- An agent MUST send `true` only when a human explicitly approved that mutation.
- An agent MAY send `false` when acting under existing repository/tool authority without explicit
  approval.
- The flag is intent and audit metadata, not authentication or authorization.
- The server MUST NOT grant capability because the value is `true`.
- The server MUST NOT reject an otherwise authorized mutation solely because the value is `false`.
- The value MUST be recorded with safe mutation provenance so history or diagnostics can establish
  what the agent asserted.

No approval token, evidence string, approval workflow, or cryptographic proof is required in v0.1.

### 14.3 Agent Authority

Agents are first-class Page actors. An agent with repository scope and an allowed Page tool MAY use
the complete Page tool set, including archive and restore. Existing MCP `allowedTools`, repository
context, authority mode, actor identity, and HTTP authorization MUST remain authoritative.

Tools MUST NOT infer a mutation repository or Page target from ambient prose when explicit input is
required. Ticket context MAY supply a repository default only where the existing MCP authority
contract permits it; the resolved repository ID MUST be present in the REST request.

### 14.4 MCP Resources

MCP MUST expose read-only resources equivalent to:

```text
cycle://repository/<repositoryId>/pages/<pageId>
cycle://repository/<repositoryId>/pages/<pageId>/comments
cycle://repository/<repositoryId>/pages/<pageId>/history
```

Resources MUST use the same API client, authorization, failure redaction, and canonical Page schemas
as tools. Clients that support only tools MUST still be able to use the full Page feature.

## 15. Canonical `cycle://` Reference Contract

### 15.1 Required Forms

The canonical resource forms are:

```text
cycle://repository/<repositoryId>
cycle://repository/<repositoryId>/tickets/<ticketId>
cycle://repository/<repositoryId>/pages/<pageId>
```

The Page target maps to a typed target equivalent to:

```ts
{
  kind: ("page", repositoryId, pageId);
}
```

and to a workspace route equivalent to:

```text
/repositories/:repositoryId/pages/:pageId
```

Comment and history resource suffixes are valid MCP resource identifiers but MUST NOT be treated as
primary desktop navigation targets unless their route mappings are explicitly implemented.

### 15.2 Parser and Serializer

One shared protocol module MUST own parsing and serialization. It MUST have no Electron, React, DOM,
HTTP, local-storage, or shell dependency.

The parser MUST:

- accept only the `cycle:` scheme;
- treat `repository`, `tickets`, and `pages` as case-sensitive lowercase literals;
- reject empty or extra segments;
- reject query strings, fragments, credentials, ports, and opaque URL forms;
- percent-decode each identifier exactly once;
- reject decoded identifiers containing `/`, backslash, NUL, ASCII control characters, or more
  than 256 Unicode code points;
- distinguish malformed input from a well-formed unsupported target;
- reject unknown target kinds rather than guessing.

The serializer MUST emit canonical lowercase keywords and percent-encode identifier segments using
URI-component encoding.

### 15.3 Markdown References

New editor insertions, autocomplete results, API responses, MCP output, copied links, chat content,
ticket content, comments, and Page content MUST generate canonical `cycle://` URLs for repository,
ticket, and Page targets. Target kinds whose canonical grammar is not yet defined retain their
existing compatibility form.

Markdown links SHOULD retain human-readable labels:

```markdown
[Payments](cycle://repository/repo_123/pages/0198f6d4-90a2-7a2a-9f0f-04d232812d31)
[#UKN-B9NZJ](cycle://repository/repo_123/tickets/UKN-B9NZJ)
```

The persisted Page link MUST target Page ID, not Page path.

### 15.4 Legacy Migration

The reader/parser layer MUST continue accepting the released legacy schemes required by existing
content, including `cycle-issue:`, `cycle-repository:`, `cycle-commit:`, `cycle-user:`, and
`cycle-agent:` where currently supported.

Migration MUST follow these rules:

1. All new generated repository, ticket, and Page links use `cycle://`.
2. A legacy issue or commit link that omits repository scope may resolve only when an explicit
   repository context is available.
3. Context-free parsing MUST NOT guess a repository.
4. Saving an edited Markdown document MAY canonicalize resolvable legacy links in that document.
5. The implementation MUST NOT create a repository-wide rewrite commit solely to migrate links in
   v0.1.
6. Unresolvable legacy links remain rendered as legacy references with visible unresolved behavior;
   they MUST NOT be silently corrupted or removed.
7. Compatibility parsers MUST be tested separately from canonical serializers.

The canonical grammar for agent, user, commit, and chat-thread targets MAY be added by a follow-up
extension. Until defined, the new serializer MUST NOT invent `cycle://` forms for them.

### 15.5 Internal and External Activation

Rendered `cycle://` links MUST be intercepted before browser or generic external navigation.
Internal activation MUST use the shared parser and workspace router. It MUST NOT call generic
`openExternal` handling.

Cycle Desktop MUST extend the protocol-event behavior defined by `UKN-B9NZJ` so Page links received
at cold start or by an already-running instance are queued, delivered, resolved, and navigated
exactly once under the same readiness and security rules as repository and ticket links.

Missing, archived, unauthorized, malformed, and unsupported Page links MUST produce a visible,
testable fallback. An archived Page link SHOULD open the archived Page when the actor may read it and
MUST make its archived state prominent.

## 16. Agent and Prompt Context

Page links in tickets, comments, or chat MUST be represented to agents as canonical URI plus safe
metadata such as title and path when already available.

The agent context assembler MUST NOT automatically inject the complete body of every linked Page.
Agents SHOULD fetch Page content intentionally through MCP. This keeps prompt assembly bounded and
ensures access checks occur at read time.

When a task explicitly identifies one Page as primary context, the workflow MAY preload that Page
through the same authorized use case used by MCP. Preloaded context MUST include repository ID,
Page ID, revision ID, and canonical URI so subsequent updates can provide optimistic concurrency.

## 17. Desktop and UI Requirements

### 17.1 Pages Area

Each open repository MUST expose a Pages area containing:

- a derived directory tree;
- active Pages by default;
- directory cover behavior for `index.md`;
- Page create controls scoped to the selected directory;
- Page viewer and Markdown editor;
- breadcrumbs derived from path;
- explicit Save and unsaved-change indication;
- comments and history access;
- archive and restore actions;
- an archived-Pages surface or filter;
- copy-link behavior using canonical `cycle://` URLs.

### 17.2 Editing

The editor MUST operate on Markdown source and MAY provide preview or rich editing using the existing
Markdown components. It MUST preserve source fidelity required by Section 8.

Navigating away, closing the Page, switching repositories, or following a protocol link while edits
are unsaved MUST require an explicit discard, save, or cancel choice. A failed save MUST retain the
local unsaved buffer.

### 17.3 Hierarchy Presentation

The tree MUST derive folders from Page paths and MUST NOT imply that those folders are Git-store
directories. Creating a Page under a folder MUST create the necessary implicit hierarchy without a
separate folder write.

Selecting a directory with an active `index.md` MUST open its cover. Selecting a directory without
a cover MUST show a directory listing or empty cover state. Archived covers MUST not open through
ordinary active navigation.

### 17.4 Reference Suggestions

Markdown tag/autocomplete surfaces in Pages, tickets, comments, and chat SHOULD include Page
suggestions by title and path. This is reference discovery, not full-text Page search. Suggestions
MUST insert a canonical Page URI.

## 18. Failure Model and Recovery

### 18.1 Failure Classes

The implementation MUST expose typed failures equivalent to:

- `PageNotFound`;
- `PagePathInvalid`;
- `PagePathConflict`;
- `PageRevisionNotFound`;
- `PageRevisionConflict`;
- `PageInvalidState`;
- `PageDocumentInvalid`;
- `CommentTargetNotFound`;
- `CommentTargetUnsupported`;
- existing repository, storage, projection, authorization, and protocol failures.

### 18.2 Recovery Rules

- Validation failure: append nothing; return field-level safe context.
- Stale revision: append nothing; preserve editor buffer; require user or agent reconciliation.
- Ref compare-and-swap conflict: reconcile repository head, then re-evaluate the Page-specific
  expected revision; never force-update.
- Projection failure after commit: retain Git-store commit, mark repository degraded, and retry or
  rebuild projection through existing bounded reconciliation.
- Invalid historical event: warn, retain last complete projection generation, and never mutate the
  event automatically.
- Remote non-fast-forward sync: use existing Git-store conflict behavior; do not auto-merge.
- Missing Page link: route to a safe Pages fallback and show a visible not-found state.
- Renderer unavailable during external protocol activation: retain the event until readiness using
  existing bounded queue behavior.

No retry loop may be unbounded or silent.

## 19. Observability

Structured Page operation logs SHOULD include:

- request ID;
- repository ID;
- Page ID;
- operation;
- actor type and safe actor identifier;
- prior and resulting revision ID where available;
- old and new path for moves;
- `humanApproved` for MCP mutations;
- duration;
- outcome and normalized failure tag.

Logs MUST NOT contain complete Page or comment bodies, YAML payloads, secrets, credentials, or
authorization tokens.

The repository status surface MUST count Page materialization warnings. Development diagnostics
SHOULD expose Page events folded, Pages projected, comments projected, hierarchy nodes derived, and
projection duration without introducing a mandatory production metrics backend.

Protocol diagnostics MUST extend the existing event fields with `targetKind: "page"` and `pageId`.

## 20. Security and Operational Safety

1. Markdown, YAML, Page paths, comments, MCP inputs, and `cycle://` URLs are untrusted input.
2. Markdown rendering MUST use the existing sanitized renderer and MUST NOT execute raw scripts.
3. Page paths MUST never be joined to a host filesystem path for domain reads or writes.
4. YAML parsing MUST disable executable tags, aliases, and prototype-polluting keys.
5. `cycle://` parsing MUST never open files, execute commands, fetch a network URL, or invoke shell
   APIs.
6. `cycle:` MUST NOT be added to the generic external URL allowlist.
7. Page and comment APIs MUST enforce repository scope before revealing existence or content.
8. MCP `humanApproved` is not trusted authority and MUST NOT bypass allowed-tool or repository
   checks.
9. Error messages, warnings, logs, and telemetry MUST redact content bodies and sensitive actor
   fields.
10. Extension frontmatter MUST be schema-bounded as JSON/YAML data and MUST NOT be treated as hooks,
    prompts, commands, or configuration.

## 21. Reference Algorithms

### 21.1 Compute Page Event Path

```text
function pageEventPath(pageId, eventId):
  require valid UUIDv7 pageId
  require safe eventId
  digest = SHA256(UTF8(pageId))
  shard = lowercaseHex(digest)[0:2]
  return "collections/events/page/" + shard + "/" + pageId + "/" + eventId + ".json"
```

### 21.2 Explicit Save

```text
function updatePage(repositoryId, pageId, input, actor):
  repository = requireRepository(repositoryId)
  current = requirePage(repositoryId, pageId)
  require current is active
  require input.expectedRevisionId == current.revisionId

  replacement = applyValidatedReplacement(current, input)
  require replacement.id == current.id
  require replacement.createdAt == current.createdAt
  require replacement.createdBy == current.createdBy
  require pathAvailable(repositoryId, replacement.path, exceptPageId = pageId)

  transaction = beginRepositoryTransaction(repository, actor)
  append page.replace(pageId, replacement)
  snapshot = commit(transaction)
  synchronizeProjectionUntilVisible(snapshot.id, pageId)
  return projectedPage(pageId)
```

### 21.3 Build Directory Tree

```text
function buildTree(pages, includeArchived):
  root = emptyDirectory("")
  for page in pages sorted by path:
    if page is archived and not includeArchived:
      continue
    segments = split(page.path, "/")
    directory = ensureDirectories(root, segments without last)
    if last segment == "index.md":
      directory.cover = page
    else:
      directory.pages.append(page)
  sort every directory deterministically
  return root
```

### 21.4 Add Generic Comment

```text
function addComment(target, body, actor):
  require target.resourceKind in supportedCommentTargets
  require target.repositoryId is authorized
  require target exists in target.repositoryId
  require trim(body) is not empty

  comment = makeComment(target, body, actor)
  transaction = beginRepositoryTransaction(target.repositoryId, actor)
  append comment.add(comment.id, comment)
  snapshot = commit(transaction)
  synchronizeProjectionUntilVisible(snapshot.id, comment.id)
  return projectedComment(comment.id)
```

## 22. Validation Matrix

### 22.1 Contracts and Serialization

- UUIDv7 Page IDs decode; other IDs fail.
- Required frontmatter round-trips deterministically.
- Unknown safe extension frontmatter survives every lifecycle operation.
- Duplicate YAML keys, unsafe keys, aliases, tags, invalid timestamps, and unsupported versions
  fail.
- Body Markdown round-trips with only documented line-ending normalization.
- Title remains independent from the first H1.

### 22.2 Paths and Hierarchy

- Valid root, nested, and `index.md` paths decode.
- Absolute, empty, traversal, backslash, control-character, non-`.md`, and overlong-segment paths
  fail.
- Duplicate active and archived paths fail.
- `folder/index.md` becomes the cover for `folder/`.
- `folder.md` and `folder/index.md` remain distinct.
- Directories derive correctly without persisted folder objects.
- Archiving a cover leaves active descendants visible.
- Moving a cover does not move descendants.

### 22.3 Event Storage and Projection

- Fixed UUID/event vectors produce the specified SHA-256 shard path.
- Create, replace, archive, restore, and comment events use canonical stable JSON.
- Duplicate event append fails without advancing the ref.
- Modified or removed Page events produce append-only warnings.
- Full rebuild and incremental projection produce identical Page, hierarchy, comment, and revision
  results.
- Projection publication is atomic under injected failures.
- No current-state Page Markdown file is required or written.

### 22.4 Lifecycle and Concurrency

- Create returns an active Page with revision ID.
- One explicit save creates one Page event and one commit.
- Body, title, and path can change atomically.
- A move preserves Page ID and history.
- Unrelated repository commits do not cause Page revision conflicts.
- A stale Page revision fails without mutation.
- Archived Pages cannot be edited.
- Archive affects only the target Page.
- Restore clears archive metadata.
- Repeated archive and restore fail without events.
- There is no permanent-delete operation in service, HTTP, MCP, or UI contracts.

### 22.5 Comments

- Ticket and Page targets use the same comment implementation.
- Missing, cross-repository, or unsupported targets fail.
- Empty comments fail.
- Page comments do not change Page revision.
- Legacy ticket record comments materialize through the generic comment read contract.
- Comment list pagination is stable and deterministic.

### 22.6 HTTP and MCP

- Every route schema rejects excess or malformed input according to existing API policy.
- Every successful mutation is visible in the returned projection.
- API failures map to the required stable code and status.
- All required Page tools call REST/use cases rather than database internals.
- Every MCP mutation requires `humanApproved`.
- Both approval values preserve existing authorization behavior and are audited accurately.
- Disallowed tools and repository scopes remain denied even when `humanApproved` is `true`.
- Page MCP resources enforce the same authorization and redaction as tools.

### 22.7 Protocol and UI

- Canonical repository, ticket, and Page URIs parse and serialize.
- Percent-encoded identifiers decode exactly once.
- Wrong schemes, unsafe identifiers, extra segments, queries, fragments, credentials, ports, and
  unknown targets fail closed.
- New Markdown insertions generate only `cycle://` links.
- Legacy references continue resolving when sufficient repository context exists.
- Context-free legacy issue links do not guess a repository.
- Internal Page links never pass through generic external opening.
- Cold-start and already-running external Page links navigate exactly once.
- Missing and archived Page links produce visible states.
- Unsaved editor content survives save and revision-conflict failures.

### 22.8 Security and Operations

- Markdown and YAML injection cases remain inert.
- Page paths cannot escape into filesystem operations.
- Logs and warnings omit bodies and secrets.
- Projection failure after commit is recoverable by reconciliation.
- Remote non-fast-forward behavior remains unchanged and never force-updates.

## 23. Definition of Done

Pages v0.1 is complete when:

1. Canonical schemas exist for Page identity, paths, frontmatter, documents, hierarchy, resource
   references, generic comments, requests, successes, and failures.
2. Page events are sharded, append-only, transactionally committed, and fully reconstructible.
3. SQLite supports Page detail, hierarchy, archive state, history, revisions, and generic comments.
4. Create, explicit save/move, archive, restore, history, and comments conform to the state machine
   and revision contract.
5. HTTP endpoints and MCP tools/resources expose the full required Page surface.
6. MCP mutations require and audit the simple `humanApproved` Boolean without treating it as
   authority.
7. The desktop Pages area supports hierarchy, covers, Markdown editing, explicit save, conflicts,
   comments, history, archive, restore, and canonical link copying.
8. `cycle://` supports Page targets internally and through desktop protocol activation.
9. New repository, ticket, and Page references no longer generate legacy forms such as
   `cycle-issue:`, while compatible reads remain available.
10. Automated tests cover the validation matrix and packaged desktop QA covers supported operating
    system protocol registration.
11. Package dependency and export architecture tests pass.
12. Existing ticket, comment, Git-store, sync, API, MCP, Markdown, and desktop navigation tests remain
    green.

## 24. Optional Extensions

The following require later specifications or explicit extensions:

- full-text Page and comment search;
- labels, saved Page views, favorites, and alternative organization perspectives;
- recursive directory move/archive operations;
- Page templates;
- attachments and embedded repository assets;
- comment editing, deletion, reactions, and threads;
- multi-parent Pages or aliases;
- automatic linked-Page summaries for agent context;
- canonical `cycle://` grammars for chat threads, users, agents, commits, boards, and saved views;
- hosted or cross-account Page access;
- configurable document-size policy;
- real-time collaborative editing or automatic merge.
