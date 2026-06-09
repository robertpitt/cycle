# Cycle TicketDB Specification

Status: Draft implementation specification

Version: 0.1.0

Package: `@cycle/ticket-db`

## 1. Purpose

TicketDB is the Level 2 Cycle database package. It defines the repository-scoped ticket domain,
workflow rules, document schemas, use cases, indexes, history APIs, and deterministic test providers
used by Cycle issue management.

TicketDB is built on top of Level 1 `@cycle/git-db`. It MUST treat GitDB as the storage capability
that owns Git objects, trees, commits, refs, pointer transactions, history, diffs, and explicit
sync. TicketDB MUST NOT implement its own Git object storage, mutate normal source-control branches,
or use the repository working tree as the source of truth for ticket state.

The package exists so application, desktop, CLI, agent, and sync adapters can use Cycle tickets
through stable domain services rather than directly reading and writing low-level GitDB collections.

## 2. Normative Language

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174.

Implementation-defined means the package or application team may choose the behavior, but it MUST
document the choice and expose enough information for callers, tests, and future implementations to
reason about the behavior.

## 3. Problem Statement

Cycle stores repository work metadata inside each repository's `.git` directory. Level 1 GitDB
provides durable, local-first, Git-backed JSON collections and snapshots, but it does not know what a
ticket is, how Cycle issue states work, which records must be linked to an issue, how drafts become
committed issues, or how domain-level conflicts should be reported.

Without a TicketDB layer, UI and agent code would need to construct collection names, frontmatter,
indexes, commit messages, workflow transitions, linked records, and conflict behavior manually. That
would leak storage details into adapters and make it difficult to maintain deterministic tests,
schema migrations, history views, and future package compatibility.

TicketDB standardizes the domain contract that sits between product adapters and GitDB storage.

## 4. Goals

TicketDB MUST:

1. Provide an Effect v4 package that follows the repository architecture rules in `AGENTS.md`.
2. Define service contracts with `Context.Service` class syntax.
3. Expose public use cases whose Effect requirement types make TicketDB and lower-level
   dependencies visible.
4. Store repository ticket data only through `@cycle/git-db` in the repository-scoped GitDB
   database.
5. Represent issues as Markdown documents with structured frontmatter.
6. Represent comments, status changes, execution records, reviews, imports, and provenance as
   linked records separate from the issue Markdown body.
7. Support durable draft sessions in a Cycle-owned draft namespace backed by GitDB.
8. Maintain persistent query indexes in GitDB snapshots.
9. Provide history, diff, and audit APIs over committed GitDB snapshots.
10. Enforce default Cycle workflow states and human final approval for `Done`.
11. Expose domain-specific errors that wrap or normalize GitDB storage failures.
12. Provide deterministic test providers and test-safe layer composition.

## 5. Non-Goals

TicketDB v0.1 MUST NOT:

1. Define the low-level GitDB tree, blob, commit, ref, object codec, or sync storage layout.
2. Run agent providers or shell commands.
3. Create, delete, or clean implementation worktrees.
4. Render UI views.
5. Own app-level settings such as user profile, theme preference, repository list, or agent provider
   detection.
6. Automatically push or fetch remote GitDB refs after every write.
7. Perform unsafe automatic merge of divergent issue edits.
8. Store repository ticket data outside the repository's GitDB database.
9. Read `process.env`, use wall-clock time directly, or generate random IDs through hidden globals
   in core logic.
10. Synchronize with external ticket systems as a core v0.1 requirement.

Adapters MAY layer these behaviors above TicketDB when they preserve the storage and dependency
boundaries defined here.

## 6. System Overview

### 6.1 Layer Position

Cycle storage layers are:

```text
Level 0: Git object model
  blobs, trees, commits, refs, fetch, push

Level 1: @cycle/git-db
  stores, collections, documents, snapshots, pointers, transactions, indexes, history, diffs, sync

Level 2: @cycle/ticket-db
  issues, linked records, drafts, workflow transitions, domain indexes, history views, conflicts

Level 3+: adapters and applications
  desktop UI, CLI, agent orchestration, worktree management, repository manager, sync scheduler
```

Inner TicketDB domain logic MUST require capabilities. Outer adapters and composition roots MUST
provide GitDB, identity, clock, ID generation, workflow config, and optional sync services.

### 6.2 Main Components

TicketDB has these components:

- Schema modules: one persisted schema class or schema constant per file, with the associated type
  export in the same file when needed.
- Domain modules: value constructors, identifiers, body section rules, normalization helpers, and
  invariants.
- Error modules: typed domain, validation, workflow, conflict, and storage failures.
- Service contracts: `TicketDbService`, `TicketIdentity`, `TicketIdGenerator`, and
  `WorkflowPolicy`.
- Provider modules: live GitDB-backed providers and deterministic test providers colocated with
  their service contracts.
- Store implementation modules: GitDB collection, transaction, index, history, draft, and linked
  record behavior behind the public `TicketDbService` provider.
- Adapter boundary modules: helper functions for HTTP, CLI, desktop, or agent adapters to normalize
  input and map errors, without owning product-specific UI or process startup.
- Composition modules: package-level layer assembly for production and tests.

### 6.3 External Dependencies

TicketDB core depends on:

- `effect` for typed Effects, schemas, clocks, context services, layers, logs, and tests.
- `@cycle/git-db` for repository-scoped durable storage.
- A caller-provided identity capability for commit authorship and provenance.
- A caller-provided ID generation capability for distributed-safe identifiers.
- Effect time capabilities for timestamps.

TicketDB core MUST NOT depend directly on:

- Git CLI commands.
- Node filesystem APIs.
- process environment variables.
- normal Git working tree state.
- agent provider CLIs.
- UI framework packages.

## 7. Package Architecture

### 7.1 Recommended Source Layout

```txt
packages/ticket-db/
  package.json
  tsconfig.json
  SPEC.md
  src/
    domain/
      IssueBody.ts
      IssueDocument.ts
      Types.ts

    schemas/
      Actor.ts
      ActorType.ts
      AgentProvenance.ts
      DraftId.ts
      DraftSession.ts
      DraftStatus.ts
      ExecutionId.ts
      ExecutionRecordPayload.ts
      ExecutionStatus.ts
      ExternalLink.ts
      IssueDocument.ts
      IssueFrontmatter.ts
      IssueId.ts
      IssuePriority.ts
      IssueStatus.ts
      IssueType.ts
      LinkedRecord.ts
      RecordId.ts
      RecordType.ts

    errors/
      DraftNotCommittableError.ts
      DraftNotFoundError.ts
      IssueNotFoundError.ts
      PlanImmutabilityError.ts
      StorageConflictError.ts
      StorageError.ts
      TicketDbFailure.ts
      ValidationError.ts
      WorkflowError.ts
      mapGitDbError.ts

    services/
      TicketDbService.ts
      TicketIdGenerator.ts
      TicketIdentity.ts
      WorkflowPolicy.ts

    store/
      TicketDbStore.ts

    index.ts

  test/
    effect-vitest.ts
    ticket-db.test.ts
```

The exact filenames MAY change, but each module MUST have one clear role. Domain modules MUST NOT
import live providers, adapters, or composition roots.

Each schema file SHOULD export one schema class or schema constant and the directly associated type
when the schema is not itself a class. Service files SHOULD colocate one service contract with its
live/default/test layer.

### 7.2 Public Barrel Shape

The public entrypoint MUST NOT preserve compatibility namespace exports. It SHOULD export the
package surface as direct named exports:

```ts
export {
  TicketDbLive,
  TicketDbInMemory,
  TicketDbService,
  TicketDbTest,
} from "./services/TicketDbService.ts";
export { TicketIdentity, TicketIdentityTest } from "./services/TicketIdentity.ts";
export { TicketIdGenerator, TicketIdGeneratorLive } from "./services/TicketIdGenerator.ts";
export { WorkflowPolicy, WorkflowPolicyDefault } from "./services/WorkflowPolicy.ts";
export { ValidationError } from "./errors/ValidationError.ts";
export * from "./schemas/IssueDocument.ts";
```

### 7.3 Dependency Direction

Dependencies MUST flow in this direction:

```text
domain/schemas
  -> errors
  -> services
  -> store implementation
  -> service provider layers
  -> adapter helpers
  -> composition roots
```

`store` implementation modules MAY depend on `@cycle/git-db` service contracts. Adapters SHOULD
depend on TicketDB service contracts, not on GitDB collection handles directly.

## 8. Repository and Storage Contract

### 8.1 GitDB Store Identity

TicketDB MUST use a GitDB store opened for the target repository's `.git` directory.

The standard TicketDB GitDB options are:

```txt
namespace: refs/gitdb
database: cycle
defaultPointer: main
```

The canonical local TicketDB pointer is therefore:

```txt
refs/gitdb/cycle/main
```

Applications MAY choose a different pointer for workspace-specific views, tests, experiments, or
branch previews. Pointer names MUST remain GitDB-safe pointer names.

### 8.2 Collection Names

TicketDB MUST write through these GitDB collections:

| Collection   | Purpose                                                                                           | Required              |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------- |
| `issues`     | committed issue documents encoded as canonical TicketDB issue JSON                                | yes                   |
| `records`    | linked records for comments, execution attempts, status changes, reviews, imports, and provenance | yes                   |
| `drafts`     | durable draft sessions and draft issue content                                                    | yes                   |
| `workflow`   | repository-scoped TicketDB workflow settings derived from defaults or repository config           | no                    |
| `migrations` | applied TicketDB schema/data migration records                                                    | no for v0.1, reserved |

TicketDB MUST NOT require consumers to know the collection names in order to use public use cases.

### 8.3 Issue Document Encoding

An issue MUST be represented at the domain boundary as:

```ts
type IssueDocument = {
  readonly id: IssueId;
  readonly frontmatter: IssueFrontmatter;
  readonly body: string;
  readonly bodyFormat: "markdown";
  readonly schemaVersion: string;
};
```

The GitDB `issues` collection stores this as JSON. The Markdown body and frontmatter are separate
JSON fields so callers can edit structured metadata without parsing raw Markdown text.

TicketDB SHOULD provide codec helpers to render an issue to frontmatter Markdown for export,
debugging, or interoperability. The canonical durable representation for v0.1 is the JSON document
inside GitDB, not a normal working-tree Markdown file.

### 8.4 Linked Record Encoding

Each linked record MUST be stored as one JSON document in the `records` collection.

The standard record ID format is:

```txt
{issueId}_{recordType}_{recordId}
```

`recordId` MUST be generated independently from issue ID and MUST be collision-resistant across
offline writers. The full document ID MUST be a GitDB safe segment.

### 8.5 Draft Encoding

Each draft session MUST be stored as one JSON document in the `drafts` collection. Draft documents
MAY embed draft issue content and draft linked records, or reference separate draft record entries,
as long as the draft can be committed atomically into the committed `issues` and `records`
collections.

Drafts MUST survive process restart when the GitDB pointer remains reachable.

### 8.6 Persistent Indexes

TicketDB MUST configure GitDB collection indexes consistently for every writer.

The `issues` collection MUST index:

- `status`
- `priority`
- `type`
- `assignee`
- `parent`
- `updatedDate`

The `issues` collection SHOULD index:

- `labels`
- `createdBy`
- `repository`
- `externalSource`

The `records` collection MUST index:

- `issueId`
- `recordType`
- `createdDate`

The `drafts` collection MUST index:

- `status`
- `createdBy`
- `updatedDate`

Index keys MUST be normalized as GitDB safe segments. Human display values such as `Needs Review`
MUST be converted to stable keys such as `needs-review`.

## 9. Core Domain Model

### 9.1 Issue ID

An `IssueId` is a stable, distributed-safe identifier generated locally without coordination.

Issue IDs MUST:

- be safe for GitDB document IDs.
- be collision-resistant across offline writers.
- remain stable for the lifetime of the issue.
- not be derived from Git blob, tree, or commit object IDs.
- not contain user-provided raw title text.

The v0.1 implementation SHOULD use a prefixed UUIDv7 or ULID-style value such as:

```txt
iss_01JZ0000000000000000000000
```

The exact generator is implementation-defined, but it MUST be supplied through a `TicketIdGenerator`
service and MUST be replaceable in tests.

### 9.2 Issue Frontmatter

Issue frontmatter MUST include:

- `id`
- `title`
- `type`
- `status`
- `priority`
- `createdAt`
- `updatedAt`
- `createdBy`

Issue frontmatter SHOULD include:

- `assignee`
- `labels`
- `parent`
- `children`
- `externalLinks`
- `agentProvenance`
- `planAcceptedAt`
- `planAcceptedBy`
- `repository`

Unknown frontmatter fields MUST NOT be dropped during read-modify-write operations unless a schema
migration explicitly removes them.

### 9.3 Issue Type

TicketDB MUST support these issue types:

- `issue`
- `epic`

Additional issue types MAY be added by workflow configuration. Unknown issue types from stored data
MUST be preserved and surfaced as validation warnings unless they break required workflow behavior.

### 9.4 Issue Status

TicketDB MUST support these default statuses:

- `backlog`
- `todo`
- `ready`
- `in-progress`
- `needs-review`
- `in-review`
- `done`
- `canceled`

Status display names SHOULD be:

- `Backlog`
- `Todo`
- `Ready`
- `In Progress`
- `Needs Review`
- `In Review`
- `Done`
- `Canceled`

Stored status keys MUST use stable normalized keys, not display names.

### 9.5 Priority

TicketDB MUST support a stable priority model. The default priorities are:

- `none`
- `low`
- `medium`
- `high`
- `urgent`

Adapters MAY render different display names, icons, or orderings, but storage MUST use stable keys.

### 9.6 Actor

An actor identifies the human, agent, importer, or system component responsible for a record.

```ts
type Actor = {
  readonly type: "human" | "agent" | "importer" | "system";
  readonly name: string;
  readonly email?: string;
  readonly provider?: string;
};
```

Actor emails MAY be absent. Secrets, credentials, and private tokens MUST NOT be stored in actor
fields.

### 9.7 Provenance

Provenance SHOULD include:

- actor type
- actor name
- actor email when available
- agent provider when applicable
- model or provider metadata when available
- source prompt or summarized source request when safe to store
- assumptions made by the agent
- timestamp

TicketDB MUST provide redaction hooks or validation helpers that reject known secret-bearing fields
before persistence. Raw environment variables, access tokens, API keys, and credentials MUST NOT be
persisted in provenance.

### 9.8 Linked Record

A linked record MUST include:

- `id`
- `issueId`
- `recordType`
- `createdAt`
- `createdBy`
- `schemaVersion`

Required record types are:

- `comment`
- `status-change`
- `execution`
- `review`
- `import`
- `provenance`
- `conflict`

Record-type-specific payloads MUST be schema validated before persistence.

### 9.9 Execution Record

Execution records represent implementation, review, or planning attempts performed by humans or
agents.

Execution records SHOULD include:

- execution ID
- issue ID
- job type
- provider name
- provider version when available
- startedAt
- completedAt
- status
- worktree path
- branch name
- commit references
- diff summary
- test results
- review notes
- final agent report
- failure reason when relevant

TicketDB stores execution metadata. It MUST NOT create worktrees, run agents, or inspect source-code
diffs directly except through caller-provided normalized payloads.

## 10. Service Contracts

### 10.1 TicketDbService

The package MUST expose a primary service:

```ts
export class TicketDbService extends Context.Service<
  TicketDbService,
  {
    readonly createIssue: (
      input: CreateIssueInput,
    ) => Effect.Effect<IssueDocument, TicketDbFailure>;
    readonly getIssue: (
      id: IssueId,
      options?: ReadOptions,
    ) => Effect.Effect<IssueDocument | null, TicketDbFailure>;
    readonly updateIssue: (
      id: IssueId,
      patch: UpdateIssueInput,
    ) => Effect.Effect<IssueDocument, TicketDbFailure>;
    readonly transitionIssue: (
      input: TransitionIssueInput,
    ) => Effect.Effect<IssueDocument, TicketDbFailure>;
    readonly listIssues: (query?: IssueQuery) => Effect.Effect<IssuePage, TicketDbFailure>;
    readonly addRecord: (
      input: AddLinkedRecordInput,
    ) => Effect.Effect<LinkedRecord, TicketDbFailure>;
    readonly recordsForIssue: (
      issueId: IssueId,
      query?: RecordQuery,
    ) => Effect.Effect<ReadonlyArray<LinkedRecord>, TicketDbFailure>;
    readonly createDraft: (input: CreateDraftInput) => Effect.Effect<DraftSession, TicketDbFailure>;
    readonly updateDraft: (input: UpdateDraftInput) => Effect.Effect<DraftSession, TicketDbFailure>;
    readonly commitDraft: (draftId: DraftId) => Effect.Effect<IssueDocument, TicketDbFailure>;
    readonly issueHistory: (
      id: IssueId,
      options?: HistoryOptions,
    ) => Effect.Effect<IssueHistory, TicketDbFailure>;
  }
>()("@cycle/ticket-db/TicketDbService") {}
```

The exact TypeScript names MAY change, but the public service MUST cover these behaviors.

### 10.2 Identity Service

TicketDB MUST NOT read Git config, app config, or environment variables directly for actor identity.
It MUST require a service equivalent to:

```ts
export class TicketIdentity extends Context.Service<
  TicketIdentity,
  {
    readonly currentActor: Effect.Effect<Actor, TicketDbFailure>;
  }
>()("@cycle/ticket-db/TicketIdentity") {}
```

The app or adapter composition root owns the live provider.

### 10.3 Ticket ID Generator

TicketDB MUST require an ID generation service for issue, draft, record, and execution identifiers.
The test provider MUST be deterministic.

### 10.4 Workflow Policy

TicketDB MUST expose workflow policy as a capability. The default provider MUST implement Cycle's
default workflow. Repository-specific workflow configuration MAY provide an override provider.

Workflow policy MUST answer at least:

- allowed statuses.
- allowed status transitions.
- required fields for `Ready`.
- whether a human actor is required for `Done`.
- which issue body sections are protected while implementation is active.
- default issue body template.

## 11. Provider Layers

### 11.1 Live Provider

`TicketDbLive` MUST implement TicketDB services using `@cycle/git-db`.

The live provider MUST require:

- `@cycle/git-db` store service.
- Ticket identity service.
- Ticket ID generator.
- Workflow policy.
- Effect clock capability.

The live provider MUST NOT construct a GitDB live layer internally unless it is a package-level
composition helper explicitly named as such. Applications SHOULD compose GitDB and TicketDB in their
composition roots.

### 11.2 Test and In-Memory Providers

TicketDB MUST provide deterministic test layers:

- `TicketDbTest`: GitDB-backed layer using `GitDbInMemory`, deterministic identity, deterministic
  IDs, and the default workflow policy.
- `TicketDbInMemory`: alias for the test-safe GitDB-in-memory composition layer.

Conformance tests MUST run against the GitDB-backed provider.

### 11.3 Noop Providers

Noop providers MAY exist for optional observability or hook capabilities. Noop providers MUST NOT
hide required persistence, identity, ID generation, validation, or workflow behavior.

## 12. Runtime Workflows

### 12.1 Initialize TicketDB

Opening a TicketDB-backed repository MUST NOT create a snapshot by itself. Initialization is an
explicit use case.

Initialization SHOULD:

1. Open the GitDB store.
2. Check whether the `cycle/main` pointer exists.
3. If missing and initialization is requested, create one GitDB transaction.
4. Write collection metadata for core collections.
5. Write default workflow metadata when needed.
6. Commit a human-readable initialization snapshot.

Initialization MUST NOT mutate the normal Git working tree, Git index, `HEAD`, or branches.

### 12.2 Create Issue

Creating an issue MUST:

1. Validate and normalize external input before the use case receives it, or validate unknown input
   inside the use case when called directly.
2. Generate a new issue ID through `TicketIdGenerator`.
3. Read the current actor from `TicketIdentity`.
4. Read the current time from Effect clock capabilities.
5. Apply the default body template when no body is provided.
6. Validate required frontmatter.
7. Begin one GitDB transaction.
8. Put the issue document into `issues`.
9. Put initial provenance and status-change records into `records`.
10. Commit the transaction with a standardized message.

The commit message SHOULD follow:

```text
{actorName} created issue {issueId}: {title}
```

### 12.3 Update Issue

Updating an issue MUST:

1. Read the current issue.
2. Reject updates to missing issues.
3. Apply schema validation and workflow policy.
4. Preserve unknown frontmatter fields.
5. Update `updatedAt`.
6. Write issue and relevant linked records in one GitDB transaction.
7. Commit with a standardized message.

Manual edits MUST be explicit operations. TicketDB MUST NOT expose a core workflow that commits each
keystroke.

### 12.4 Transition Issue Status

Status transitions MUST be mediated by `WorkflowPolicy`.

Transitioning to `done` MUST require a human actor in the default workflow. Agent actors MAY add
review records or recommendations, but they MUST NOT be accepted as the default final approver.

If a transition fails policy validation, TicketDB MUST return a typed workflow error and MUST NOT
write a partial status-change record.

### 12.5 Create Draft

Creating a draft MUST:

1. Generate a draft ID.
2. Capture actor, timestamp, and source request metadata.
3. Store a draft document in `drafts`.
4. Commit the draft transaction.

Drafts MAY reference an issue ID before the issue is committed, but that issue ID MUST remain stable
if the draft is later committed.

### 12.6 Update Draft

Updating a draft MUST:

1. Read the draft.
2. Reject updates to committed, abandoned, or missing drafts.
3. Apply schema validation to draft issue content and draft records.
4. Commit one GitDB transaction.

Multiple concurrent draft sessions MUST be independent documents.

### 12.7 Commit Draft

Committing a draft issue MUST:

1. Read the draft.
2. Validate that it is committable.
3. Begin one GitDB transaction.
4. Write the final issue document to `issues`.
5. Write initial linked records to `records`.
6. Mark the draft as committed or delete it according to documented draft retention policy.
7. Commit the transaction.

The issue document and linked records MUST become visible atomically in the same GitDB snapshot.

### 12.8 Add Linked Record

Adding a linked record MUST:

1. Validate that the target issue exists unless the record type explicitly supports orphan import
   staging.
2. Validate the record payload.
3. Generate a record ID.
4. Write the record in one GitDB transaction.
5. Update issue `updatedAt` when the record is user-visible activity.

### 12.9 Read History

Issue history MUST be derived from GitDB snapshot history and path-level diffs.

TicketDB MAY maintain linked activity records for domain audit readability, but committed GitDB
snapshot history remains the authoritative history for stored state.

### 12.10 Query Issues

Issue queries MUST use persistent GitDB indexes when the query can be answered by a supported index.
Queries MAY fall back to deterministic collection scans for v0.1 when index coverage is absent.

Pagination MUST be deterministic for a fixed read source. Historical paginated reads MUST resolve
the source snapshot once and continue paging against the same snapshot.

## 13. Workflow Rules

### 13.1 Default Transition Policy

The default workflow SHOULD allow:

| From           | To                                                      |
| -------------- | ------------------------------------------------------- |
| `backlog`      | `todo`, `ready`, `canceled`                             |
| `todo`         | `backlog`, `ready`, `canceled`                          |
| `ready`        | `in-progress`, `todo`, `canceled`                       |
| `in-progress`  | `needs-review`, `in-review`, `canceled`                 |
| `needs-review` | `todo`, `ready`, `in-progress`, `in-review`, `canceled` |
| `in-review`    | `needs-review`, `done`, `in-progress`, `canceled`       |
| `done`         | `in-review`                                             |
| `canceled`     | `backlog`, `todo`                                       |

This transition table is the v0.1 default. Repository workflow configuration MAY refine it, but core
tests MUST validate the default behavior.

### 13.2 Ready Requirements

An issue SHOULD be allowed to enter `ready` only when:

- title is non-empty.
- acceptance criteria are present.
- implementation plan is present or the caller explicitly marks planning as not required.
- required sign-off fields are present when the workflow policy requires them.

### 13.3 Plan Immutability

When an issue is `in-progress`, the accepted plan sections MUST be protected by default:

- Acceptance Criteria
- Implementation Plan
- Risks
- Test Plan

The exact Markdown section parser is implementation-defined, but the default implementation MUST
detect these headings in the default issue template. Attempts to modify protected sections during
active implementation MUST fail with a workflow error unless the caller first transitions the issue
to `needs-review` or another policy-approved editable state.

### 13.4 Needs Review on Blocking Failures

TicketDB MUST provide helper use cases to record blocking execution failures. When a caller records
an agent question, provider error, timeout, worktree problem, conflict, or failed test requiring
human attention, the issue SHOULD move to `needs-review` in the same transaction as the linked
record.

## 14. Conflict Model

### 14.1 Storage Conflicts

GitDB pointer conflicts MUST be mapped to a TicketDB storage conflict error that includes:

- pointer name.
- expected snapshot ID or null.
- actual snapshot ID or null.
- operation name.
- issue ID or draft ID when known.

TicketDB MUST NOT silently retry writes after a pointer conflict if the retry could overwrite or
mask another writer's domain change.

### 14.2 Domain Conflicts

TicketDB SHOULD detect unsafe domain conflicts when comparing divergent issue versions. Unsafe
conflicts include:

- same frontmatter field changed differently on both sides.
- protected plan section changed on one side while implementation state changed on the other.
- issue deleted or canceled on one side while updated on the other.
- parent/child relationships changed incompatibly.

Safe auto-merge behavior is optional in v0.1. If implemented, it MUST be explicit, bounded to known
field-level rules, and tested.

### 14.3 Conflict Records

When a domain conflict is recorded, TicketDB MUST preserve enough information for review:

- affected issue ID.
- local snapshot ID.
- incoming snapshot ID when available.
- merge base snapshot ID when available.
- field or section names involved.
- human-readable summary.

Conflict records MUST NOT expose raw secrets.

## 15. Error and Failure Model

TicketDB MUST distinguish:

- validation failure.
- issue not found.
- draft not found.
- linked record not found.
- workflow policy failure.
- plan immutability failure.
- storage conflict.
- sync conflict reported through GitDB.
- GitDB storage failure.
- unsupported schema version.
- migration required.
- redaction or unsafe content failure.

Errors SHOULD be implemented as tagged errors. GitDB errors MAY be attached as causes but SHOULD be
normalized before crossing the TicketDB public API.

Application code MUST NOT use `try` / `catch` inside `Effect.gen` for normal error handling. Live
providers MUST use Effect APIs to catch and normalize lower-level failures.

## 16. Configuration and Workflow Files

TicketDB v0.1 MAY read normalized workflow configuration supplied by the repository manager or app
adapter. It SHOULD NOT read `CYCLE_WORKFLOW.md` directly from the working tree in core use cases.

If a future TicketDB provider parses `CYCLE_WORKFLOW.md`, that parser MUST be an adapter or provider
boundary and MUST:

- validate untrusted content.
- distinguish parse errors from workflow policy errors.
- document precedence between defaults, repository file, and app overrides.
- avoid storing secrets from the workflow file in TicketDB records.

Default workflow behavior MUST be available when no repository workflow file exists.

## 17. Observability

TicketDB SHOULD annotate logs and spans at use-case and provider boundaries.

Recommended fields:

- package: `@cycle/ticket-db`
- operation name.
- issue ID.
- draft ID.
- record ID.
- record type.
- status transition.
- actor type.
- GitDB pointer.
- snapshot ID.
- error category.

Logs MUST NOT include secrets, credentials, private tokens, raw sensitive payloads, or full agent
prompts unless the caller explicitly supplies a redacted summary field.

Pointer conflicts, workflow rejections, migration failures, and unsupported schema versions MUST be
visible without requiring low-level Git inspection.

## 18. Security and Operational Safety

TicketDB data has the same effective exposure level as the Git repository and remote GitDB refs that
store it. If Cycle refs are pushed to a public remote, ticket content should be considered public.

TicketDB MUST:

- validate all issue IDs, record IDs, draft IDs, index keys, and status keys before passing them to
  GitDB.
- reject or redact known secret-bearing fields.
- avoid shell command execution.
- avoid direct filesystem mutation in core domain and use case modules.
- avoid storing raw credentials in issue documents, records, provenance, commit messages, or logs.
- expose destructive actions such as issue deletion, draft abandonment, and conflict resolution as
  explicit use cases.

TicketDB SHOULD prefer soft-delete or status transitions over physical issue deletion for v0.1.

## 19. Reference Algorithms

### 19.1 Create Issue

```text
function createIssue(input):
  actor = TicketIdentity.currentActor()
  now = Clock.currentTime()
  issueId = TicketIdGenerator.issueId()

  body = input.body ?? WorkflowPolicy.defaultIssueBody(input)
  frontmatter = normalizeFrontmatter(input.frontmatter, {
    id: issueId,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    status: input.status ?? "backlog",
    type: input.type ?? "issue"
  })

  validateIssue(frontmatter, body)

  tx = GitDb.begin("main")
  tx.collection("issues", issueIndexes).put(issueId, {
    id: issueId,
    frontmatter,
    body,
    bodyFormat: "markdown",
    schemaVersion: CURRENT_SCHEMA
  })
  tx.collection("records", recordIndexes).put(newRecordId(), initialProvenanceRecord(issueId))
  tx.collection("records", recordIndexes).put(newRecordId(), initialStatusRecord(issueId))
  snapshot = tx.commit(message = actor.name + " created issue " + issueId + ": " + title)

  return issueFromSnapshot(issueId, snapshot)
```

### 19.2 Commit Draft

```text
function commitDraft(draftId):
  draft = drafts.get(draftId)
  if draft is missing: fail DraftNotFound
  if draft.status is not "open" or "ready": fail DraftNotCommittable

  validateIssue(draft.issue.frontmatter, draft.issue.body)
  validateRecords(draft.records)

  tx = GitDb.begin("main")
  tx.collection("issues", issueIndexes).put(draft.issue.id, draft.issue)
  for record in draft.records:
    tx.collection("records", recordIndexes).put(record.id, record)
  tx.collection("drafts", draftIndexes).put(draftId, markCommitted(draft))
  snapshot = tx.commit(message = commitMessageForDraft(draft))

  return issueFromSnapshot(draft.issue.id, snapshot)
```

### 19.3 Transition Issue

```text
function transitionIssue(issueId, targetStatus, reason):
  issue = issues.get(issueId)
  if issue is missing: fail IssueNotFound

  actor = TicketIdentity.currentActor()
  policy = WorkflowPolicy.current()
  policy.assertTransitionAllowed(issue.status, targetStatus, actor, issue)

  now = Clock.currentTime()
  updated = issue with status = targetStatus, updatedAt = now
  record = statusChangeRecord(issueId, issue.status, targetStatus, actor, reason, now)

  tx = GitDb.begin("main")
  tx.collection("issues", issueIndexes).put(issueId, updated)
  tx.collection("records", recordIndexes).put(record.id, record)
  tx.commit(message = actor.name + " moved issue " + issueId + " to " + targetStatus)

  return updated
```

## 20. Testing Standard

TicketDB tests MUST follow the Effect application architecture standard:

- Tests returning Effects MUST use `it.effect`.
- Pure synchronous tests MUST use regular `it`.
- Tests MUST use `assert` from `@effect/vitest`, not Vitest `expect`.
- Tests MUST NOT use `Effect.runSync`.
- Time-dependent tests MUST use `TestClock`.

### 20.1 Required Test Suites

The package MUST include deterministic tests for:

- issue ID generation through a replaceable service.
- issue creation with required frontmatter and default body template.
- issue creation writes issue and initial linked records atomically.
- issue list and query behavior through persistent indexes.
- issue update preserves unknown frontmatter fields.
- status transitions allowed by default workflow.
- status transitions rejected by default workflow.
- human-only final transition to `done`.
- plan immutability during `in-progress`.
- draft creation, update, and commit.
- linked record creation and indexing by issue ID.
- history and diff views for issue edits.
- GitDB pointer conflict mapping.
- validation failure categories.
- secret redaction or rejection rules.

### 20.2 Provider Conformance

The GitDB-backed live/test provider MUST pass the full TicketDB conformance suite. Any in-memory
TicketDB provider SHOULD pass the same public service behavior tests except those explicitly marked
as GitDB history, diff, or pointer semantics.

### 20.3 Layer Graph Tests

The package MUST include a bootstrap test that verifies the test composition layer can construct:

```text
GitDbInMemory
  + deterministic TicketIdentity
  + deterministic TicketIdGenerator
  + default WorkflowPolicy
  -> TicketDbTest
```

## 21. Validation Matrix

| Area                  | Requirement                                                         | Validation                       |
| --------------------- | ------------------------------------------------------------------- | -------------------------------- |
| Architecture          | Service contracts use `Context.Service` class syntax                | Static review and typecheck      |
| Dependency visibility | Public use cases expose unresolved services in Effect requirements  | Typecheck and API review         |
| Storage boundary      | Ticket data writes only through GitDB collections                   | Provider tests and import review |
| Collection layout     | `issues`, `records`, and `drafts` collections exist and are indexed | Storage conformance tests        |
| Issue model           | Issues have required frontmatter and Markdown body                  | Schema tests                     |
| ID model              | IDs are safe, stable, generated through service capability          | Unit tests                       |
| Atomic writes         | Issue plus linked records commit in one GitDB transaction           | Snapshot tests                   |
| Drafts                | Draft sessions survive restart and commit atomically                | Draft workflow tests             |
| Workflow              | Default states and transitions are enforced                         | Workflow tests                   |
| Approval              | Default `done` transition requires human actor                      | Workflow tests                   |
| Plan protection       | Protected sections cannot change during active implementation       | Body diff tests                  |
| Indexes               | Query APIs use consistent persistent indexes                        | Query tests                      |
| History               | Issue history derives from GitDB snapshots                          | History tests                    |
| Conflicts             | Pointer conflicts map to TicketDB errors                            | Conflict tests                   |
| Security              | Secrets are rejected or redacted                                    | Redaction tests                  |
| Observability         | Errors include operation and domain IDs                             | Error/log tests                  |

## 22. Implementation Plan

Implementation SHOULD proceed in this order:

1. Create `@cycle/ticket-db` package metadata, TypeScript config, Vitest config, and public barrel.
2. Define domain schemas for issue IDs, actors, frontmatter, bodies, statuses, priorities, linked
   records, drafts, and execution records.
3. Define typed error modules and GitDB error mapping.
4. Define service contracts for TicketDB, identity, ID generation, and workflow policy.
5. Implement default workflow policy and deterministic test identity/ID layers.
6. Implement issue and record codecs, including Markdown body section parsing for protected default
   sections.
7. Implement GitDB-backed issue, record, and draft stores with consistent index definitions.
8. Implement core use cases: create issue, get issue, list/query issues, update issue, transition
   issue, add record.
9. Implement draft use cases: create draft, update draft, commit draft.
10. Implement history and diff APIs using GitDB history/diff.
11. Add conformance tests against `GitDbInMemory`.
12. Add package-level layer graph tests.
13. Add README examples after the public API stabilizes.

## 23. Definition of Done

TicketDB v0.1 conforms to this specification when:

- `@cycle/ticket-db` exposes Effect service contracts and layers.
- issue, record, and draft documents are persisted through `@cycle/git-db`.
- issue creation, update, transition, draft commit, and linked record writes are atomic GitDB
  transactions.
- default workflow states and transition rules are enforced.
- human approval is required for the default `done` transition.
- persistent indexes support the required query surfaces.
- history APIs expose committed issue changes from GitDB snapshots.
- tests can replace identity, ID generation, time, and GitDB storage with deterministic providers.
- storage and workflow failures are represented as typed TicketDB errors.
- core logic contains no hidden direct filesystem, process, network, time, random, or Git CLI
  dependencies.

## 24. Implementation-Defined Areas

The implementation MUST document local choices for:

- exact ID generator algorithm and prefixes.
- schema version string format.
- physical retention policy for committed drafts.
- safe auto-merge rules, if any.
- unknown workflow status behavior beyond the default statuses.
- Markdown section parser behavior for non-default templates.
- issue deletion semantics.
- migration strategy for future schema versions.
- whether workflow configuration is read by TicketDB providers or supplied by higher-level
  repository adapters.

## 25. Open Questions

These questions do not block v0.1 package scaffolding, but they SHOULD be resolved before declaring
TicketDB stable:

1. Should committed drafts be retained forever as draft documents marked `committed`, or deleted
   after their issue and linked records are committed?
2. Should issue deletion exist in v0.1, or should all removal behavior be modeled as `canceled` plus
   optional archival metadata?
3. Should safe issue auto-merge live in TicketDB v0.1, or should divergent edits initially surface
   only as conflict records for human review?
4. Should repository workflow configuration be parsed inside `@cycle/ticket-db` or by a higher-level
   repository manager package that provides a `WorkflowPolicy` layer?
