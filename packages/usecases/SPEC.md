# @cycle/usecases Specification

Status: Draft implementation specification

Version: 0.1.0

Package: `@cycle/usecases`

## 1. Purpose

`@cycle/usecases` is the controller and domain workflow package for Cycle. It provides the single
Effect-first entrypoint for application, API, RPC, CLI, and CI callers to execute Cycle workflows
without duplicating business logic in transport or UI layers.

The package sits above `@cycle/database`. `@cycle/database` owns durable storage, projection,
materialization, and low-level persistence invariants. `@cycle/usecases` owns user-facing workflow
contracts, domain policy, command orchestration, validation beyond storage shape, and adapter-neutral
success and failure semantics.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for callers and conformance tests to reason about it.

## 3. Problem Statement

Cycle currently has transport and application code that can call `@cycle/database` directly. That
forces storage-facing services to contain workflow policy such as status transition rules, commit
message policy, human approval gates, relation rules, and domain-specific command behavior. As more
entrypoints are added, such as an HTTP API, RPC bridge, desktop app, CLI automation, and CI checks,
duplicating or bypassing those rules would make Cycle harder to reason about and easier to break.

Cycle needs a stable controller layer where every caller runs the same command contracts through the
same Effect runtime model. The result should let transports stay thin, keep storage lean, and make
workflow behavior testable without requiring Electron, an API server, or a CLI process.

## 4. Goals

`@cycle/usecases` MUST:

1. Become the sole domain workflow API used by `@cycle/rpc`, future API packages, CLI/CI entrypoints,
   desktop backend code, and other adapter layers.
2. Expose an Effect v4-first API whose core operation is `run(useCase)`.
3. Maintain the canonical operation contracts for Cycle workflows, including input schemas, success
   schemas, failure schemas, and operation metadata.
4. Build on the domain document and query types exported by `@cycle/database` instead of redefining
   repository, ticket, record, view, label, user, template, initiative, history, and search models.
5. Move user-facing workflow policy out of `@cycle/database` and into `@cycle/usecases`.
6. Cover repository open, close, status, sync, push, warnings, history, ticket, draft, record,
   comment, relation, user, label, saved view, template, initiative, search, and automation
   evaluation workflows.
7. Provide adapter-neutral contracts that RPC, HTTP, IPC, CLI, and CI layers can derive from or map
   to without reimplementing validation or policy.
8. Return typed, serializable, redacted failures that adapters can map to transport-specific error
   responses or process exit codes.
9. Provide deterministic test layers and fakes so usecase behavior can be validated without a real
   Git remote, Electron app, or network service.
10. Preserve local-first behavior by delegating durable state to repository-scoped GitDB data through
    `@cycle/database`.

## 5. Non-Goals

`@cycle/usecases` v0.1 MUST NOT:

1. Implement a transport protocol, HTTP server, RPC bridge, Electron IPC handler, CLI parser, or CI
   runner binary.
2. Own durable repository storage, SQLite projection schema, Git object storage, GitDB ref layout, or
   materialization logic.
3. Provide agent planning, issue splitting, implementation execution, review-agent, worktree, or
   provider orchestration workflows.
4. Execute arbitrary shell commands or manage long-running agent processes.
5. Replace `@cycle/database` domain types with a second incompatible type system.
6. Require network access for local reads, writes, search, history, or automation evaluation.
7. Require legacy RPC method names to be the canonical internal operation names.
8. Hide post-commit consistency failures by returning success before required projected rows are
   visible.

## 6. System Overview

### 6.1 Layer Position

Cycle runtime layers are:

```text
Level 1: @cycle/git and @cycle/git-db
  Git repository inspection, Git objects, GitDB documents, refs, fetch, push, history, diffs

Level 2: @cycle/database
  repository registry, GitDB-backed persistence, SQLite projection, read model, materialization

Level 3: @cycle/usecases
  command contracts, workflow policy, validation, orchestration, automation evaluation

Level 4: adapters and applications
  desktop backend, renderer bridge, RPC, HTTP API, CLI, CI, test harnesses
```

Adapters MUST call `@cycle/usecases` for domain workflows. They MUST NOT call `@cycle/database`
directly for user-facing Cycle operations except during composition, migration shims, or narrowly
documented test setup.

### 6.2 Main Components

`@cycle/usecases` has these responsibility boundaries:

- Contract registry: declares all public usecase names, categories, input schemas, success schemas,
  failure schemas, compatibility aliases, idempotency posture, and side-effect metadata.
- Usecase runner: validates inputs, resolves the handler, supplies request context, runs the handler
  as an Effect, maps failures, and emits observability events.
- Workflow policy service: owns ticket state rules, human approval gates, relation constraints,
  protected-section checks, commit message policy, default workflow semantics, and repository
  workflow configuration evaluation.
- Persistence gateway: wraps the subset of `@cycle/database` needed by usecases and provides a
  stable boundary for tests and future database API simplification.
- Repository orchestration service: opens repositories, synchronizes projections, pushes Cycle refs,
  exposes repository status, and serializes repository-scoped side effects.
- Automation evaluator: provides deterministic machine-readable checks for CLI and CI callers.
- Compatibility mapper: maps legacy RPC names or transport-specific route names to canonical
  usecase contracts without making those aliases the core model.
- Observability surface: emits structured logs, metrics, and trace annotations for usecase
  executions.

### 6.3 External Dependencies

Core runtime dependencies are:

- `effect` for `Effect`, `Context.Service`, `Layer`, `Schema`, scoped resources, concurrency,
  interruption, logging, clocks, and tests.
- `@cycle/database` for domain document/query types and persistence/projection access.
- `@cycle/git-db` types where repository sync or push results are surfaced.
- Caller-provided identity, clock, ID generation, repository registry, and remote-sync capabilities
  through Effect services or gateway implementations.

`@cycle/usecases` SHOULD avoid direct dependencies on Electron, React, HTTP frameworks, Node process
arguments, or transport-specific serialization libraries.

## 7. Core Domain Model

### 7.1 Domain Type Source

`@cycle/database` remains the source for persisted domain document and query types, including:

- `TicketDocument`
- `TicketDraftDocument`
- `LinkedRecord`
- `RepositoryStatus`
- `MaterializationWarning`
- `TicketQuery`
- `SearchTicketsQuery`
- `HistoryPage`
- `TicketRevisionDiff`
- `UserProfileDocument`
- `LabelDefinitionDocument`
- `SavedViewDocument`
- `IssueTemplateDocument`
- `InitiativeProgress`

`@cycle/usecases` MAY re-export these types for adapter ergonomics, but it MUST NOT fork their
meaning or introduce conflicting document shapes.

### 7.2 Usecase

A Usecase is an immutable command object that can be interpreted by the usecase runner.

Required fields:

- `name`: canonical stable usecase name.
- `input`: payload decoded by the contract's input schema.
- `meta`: optional request metadata.

Usecase metadata SHOULD include:

- `requestId`
- `actor`
- `source`: `desktop`, `rpc`, `api`, `cli`, `ci`, `test`, or an extension value
- `idempotencyKey`
- `dryRun`
- `deadline`
- `traceContext`

The exact TypeScript representation is implementation-defined, but the public API MUST allow
callers to construct a typed usecase value and pass it to `run(useCase)`.

### 7.3 Usecase Contract

Each usecase contract MUST define:

- canonical `name`
- human-readable `description`
- `category`
- input `Schema`
- success `Schema`
- failure `Schema`
- handler success type
- side-effect classification: `read`, `write`, `sync`, `push`, or `evaluate`
- repository scope: `none`, `single`, or `multi`
- idempotency posture: `required`, `supported`, `not-supported`, or `read-only`
- compatibility aliases, if any

Contract schemas are the source of truth for transport validation. RPC, HTTP, IPC, CLI, and CI
adapters MUST derive their request validation from these contracts or prove equivalent validation in
tests.

### 7.4 Usecase Context

The runner MUST provide handlers with a request context containing:

- usecase name
- request ID
- source
- actor
- current time provider
- deadline or cancellation signal
- dry-run flag
- optional idempotency key
- logger or telemetry scope

Handlers MUST NOT read global mutable process state directly when the same value can be provided by
the Effect environment.

### 7.5 Automation Evaluation

An automation evaluation is a machine-readable report suitable for CLI and CI callers.

Required fields:

- `status`: `pass`, `warn`, or `fail`
- `repositoryId`
- `checkedAt`
- `checkedUseCase`
- `summary`
- `violations`
- `warnings`
- `checkedTicketIds`

Each violation MUST include:

- stable `code`
- `severity`: `warning`, `error`, or `fatal`
- human-readable `message`
- optional `ticketId`
- optional `field`
- optional remediation text

Automation reports MUST be deterministic for the same repository snapshot, query, workflow
configuration, and clock.

## 8. Public API Contract

### 8.1 Runner Shape

The package MUST expose one primary Effect service for executing usecases.

The exact TypeScript names are implementation-defined, but the shape MUST be equivalent to:

```ts
type UseCaseRunner = {
  readonly run: <UseCase extends CycleUseCase>(
    useCase: UseCase,
  ) => Effect.Effect<UseCaseSuccess<UseCase>, UseCaseFailure, UseCaseEnvironment<UseCase>>;
};
```

The package SHOULD also expose typed constructors for usecase values so adapters do not manually
assemble raw objects.

Example shape:

```ts
const useCase = IssueCreate({
  repository: { id: "cycle-local" },
  input: { title: "Document usecase layer" },
});

const ticket = yield * UseCaseRunner.run(useCase);
```

The runner MUST return Effects. Promise-returning helpers MAY be provided only as adapter utilities
and MUST be implemented by running the core Effect API.

### 8.2 Canonical Usecase Names

Canonical names SHOULD use stable semantic names rather than legacy transport method strings. The
following usecase contracts MUST exist for v0.1:

Repository:

- `RepositoryOpen`
- `RepositoryClose`
- `RepositoryList`
- `RepositoryStatusGet`
- `RepositoryMaterializationWarningsList`
- `RepositorySync`
- `RepositoryPush`
- `RepositoryHistoryList`

Issues and search:

- `IssueCreate`
- `IssueGet`
- `IssueList`
- `IssueSearch`
- `IssueUpdate`
- `IssueTransition`
- `IssueArchive`
- `IssueRestore`
- `IssueDelete`
- `IssueHistoryList`
- `IssueRevisionGet`
- `IssueDiff`
- `IssueRelationAdd`
- `IssueRelationRemove`

Drafts:

- `DraftCreate`
- `DraftUpdate`
- `DraftCommit`

Records and comments:

- `CommentAdd`
- `RecordAdd`
- `RecordListForIssue`

Initiatives:

- `InitiativeCreate`
- `InitiativeProgressGet`
- `InitiativeUpdateAdd`

Labels:

- `LabelList`
- `LabelUpsert`
- `LabelArchive`

Users:

- `UserGet`
- `UserList`
- `UserUpsert`

Saved views:

- `ViewCreate`
- `ViewGet`
- `ViewList`
- `ViewUpdate`
- `ViewDelete`

Templates:

- `TemplateCreate`
- `TemplateGet`
- `TemplateList`
- `TemplateUpdate`
- `TemplateArchive`

Automation and CI:

- `AutomationEvaluateRepository`
- `AutomationEvaluateIssues`
- `AutomationEvaluateQuery`

### 8.3 Compatibility Aliases

Legacy RPC method names MAY be supported as aliases by adapters or by a compatibility mapper. The
canonical usecase contract names MUST remain independent from legacy names such as
`ticket.issue.create` or `repository.sync`.

Each compatibility alias MUST map to exactly one canonical usecase. If an alias needs different
behavior from the canonical usecase, the implementation MUST define a new canonical usecase rather
than hiding behavior in the adapter.

### 8.4 Contract Versioning

Each usecase contract MUST include a version. Backward-compatible additions MAY increment a minor
contract version. Breaking changes MUST either:

- introduce a new contract name;
- keep a compatibility alias for old callers; or
- document a migration that updates every adapter and test fixture in the same release.

Unknown input fields SHOULD be rejected by default for externally reachable adapters. Internal test
constructors MAY allow extension fields only when the contract declares them.

## 9. Workflow Policy Contract

### 9.1 Ownership

`@cycle/usecases` owns user-facing workflow policy. After the migration is complete,
`@cycle/database` MUST NOT be the authoritative owner of:

- allowed ticket status transitions;
- final human approval gates;
- protected issue section rules;
- relation validation beyond storage shape;
- comment and record user-visibility rules;
- commit message policy for domain commands;
- draft commit workflow policy;
- repository sync and push orchestration policy;
- automation and CI evaluation rules.

`@cycle/database` MAY retain low-level validation required to protect storage integrity, including
safe identifier segments, parseable document shapes, missing repository errors, materialization
warnings, projection consistency, and redaction safeguards.

### 9.2 Default Issue States

The default workflow MUST preserve these semantic states:

- `backlog`
- `todo`
- `ready`
- `in-progress`
- `needs-review`
- `in-review`
- `done`

Repositories MAY customize display names and add states through workflow configuration, but the
default semantic states MUST remain available for core workflows and tests.

### 9.3 Status Transition Rules

`IssueTransition` MUST validate transitions through the workflow policy service before any storage
write occurs.

The default policy MUST enforce:

- transitioning to `done` requires an actor with `type: "human"` unless a future explicit workflow
  override is configured;
- transitioning to `ready` requires either accepted planning content or
  `planningNotRequired: true`;
- transitioning away from `done` requires a human actor;
- every successful status transition writes a linked status-change record;
- no transition may silently drop existing labels, relations, frontmatter extension fields, or body
  content;
- rejected transitions return a typed policy failure rather than a storage failure.

The exact default transition graph is implementation-defined, but it MUST be exported as data and
covered by tests.

### 9.4 Issue Update Rules

`IssueUpdate` MUST validate:

- required frontmatter remains present;
- unknown frontmatter fields are preserved;
- protected planning sections are not changed while the issue is in an active implementation state;
- obvious secret-bearing keys are rejected unless a future secure-secret extension is configured;
- the update produces a human-readable commit message.

Protected section detection MUST be deterministic. The default protected sections SHOULD be:

- Acceptance Criteria
- Implementation Plan
- Risks
- Test Plan

### 9.5 Draft Rules

Draft usecases MUST preserve the draft boundary:

- `DraftCreate` creates a durable draft without adding it to the committed-ticket read model.
- `DraftUpdate` updates only the draft document.
- `DraftCommit` validates the draft, writes the committed ticket and required linked records in one
  transaction, marks the draft committed, synchronizes the repository projection, and returns only
  after the ticket is visible through reads.

### 9.6 Relation Rules

Issue relation usecases MUST:

- reject self-relations;
- reject duplicate identical relations;
- preserve existing unrelated relations;
- normalize inverse relation behavior consistently;
- return the updated issue document only after the projected read model is consistent.

Whether inverse records are physically stored on both issues or derived at read time is
implementation-defined, but the behavior MUST be documented and tested.

### 9.7 Repository Sync and Push Rules

`RepositorySync` MUST explicitly synchronize Cycle data for a repository without assuming normal
branch `git pull`.

`RepositoryPush` MUST explicitly push Cycle refs for a repository without assuming normal branch
`git push`.

Repository push is externally visible. It MUST require an explicit usecase invocation or an explicit
workflow configuration that enables auto-push after successful writes. If auto-push is enabled, the
write usecase MUST surface push failures without rolling back the already committed local Cycle
transaction.

Repositories without remotes MUST remain usable locally. Sync and push usecases MUST return typed
failures or unavailable statuses rather than blocking local ticket workflows.

## 10. Automation and CI Contract

### 10.1 Scope

`@cycle/usecases` MUST provide automation evaluation usecases that can be called by a CLI or CI
adapter. The package MUST NOT parse command-line flags, print terminal output, upload artifacts, or
choose process exit codes.

### 10.2 Evaluation Inputs

Automation evaluation inputs MUST support:

- repository reference;
- optional ticket query;
- optional explicit ticket IDs;
- optional workflow rule selection;
- optional severity threshold;
- optional snapshot or active-generation constraint.

### 10.3 Evaluation Behavior

Automation evaluation MUST be read-only unless a future contract explicitly marks an evaluation as
mutating. It MUST evaluate the active projected repository state and return an
`AutomationEvaluation` report.

Default evaluations SHOULD include checks for:

- issues in active states with missing required plan sections;
- issues marked `ready` without accepted planning content or `planningNotRequired`;
- issues in `done` without a human approval marker;
- materialization warnings that affect queried issues;
- stale or failed repository sync status when the caller requires a fresh snapshot.

CI adapters MAY map `fail` reports to non-zero process exit codes, but that mapping belongs outside
`@cycle/usecases`.

## 11. Runtime Workflows

### 11.1 General Run Algorithm

```text
run(usecase):
  resolve contract by canonical name or compatibility alias
  create request context
  decode input with contract input schema
  reject invalid or unknown fields according to contract policy
  emit usecase.start
  if usecase is repository-scoped:
    validate repository reference
  if usecase mutates state:
    acquire repository-scoped workflow lock
  load workflow configuration required by the usecase
  read current domain state through persistence gateway
  validate workflow policy
  if dryRun:
    return planned result without committing
  execute storage and sync operations through gateway
  verify postconditions required by the contract
  emit usecase.complete
  return success value decoded by contract success schema
on typed failure:
  emit usecase.failure
  return tagged UseCaseFailure
on interruption:
  release locks and resources
  return or propagate interruption according to Effect semantics
```

### 11.2 Write Usecase Algorithm

```text
write_usecase(repository_id, command):
  acquire repository workflow lock
  status_before = repository status
  current = read required documents
  validate command schema
  validate workflow policy against current state
  commit domain mutation through persistence gateway
  sync repository projection to committed snapshot
  verify affected documents or records are query-visible
  if auto-push enabled:
    push Cycle refs and attach push result or push warning
  return domain result
```

Write usecases MUST return success only after the write has committed locally and the required read
model postconditions are satisfied.

### 11.3 Repository Open Algorithm

`RepositoryOpen` MUST:

1. Validate repository identity and path metadata supplied by the caller or repository registry.
2. Open or register the repository through the persistence gateway.
3. Perform initial sync when requested.
4. Return repository status.

Repository initialization prompts and folder selection belong to adapters or desktop services, not
to `@cycle/usecases`.

### 11.4 Search and History Workflows

Search, list, history, revision, and diff usecases are read workflows. They MUST:

- validate repository scope;
- pass query constraints through the persistence gateway;
- preserve opaque pagination cursors;
- avoid mutating repository state;
- return typed not-found or stale-cursor failures where applicable.

## 12. Concurrency, Idempotency, and Cancellation

Repository-scoped write, sync, and push usecases MUST be serialized per repository. The package MAY
delegate storage serialization to `@cycle/database`, but workflow policy validation and commit must
still be protected from conflicting concurrent mutations.

Read usecases MAY run concurrently with writes. They MUST observe complete projected snapshots and
MUST NOT observe partial post-write synchronization.

Write usecases SHOULD support idempotency keys. When a usecase declares idempotency support and a
caller supplies an idempotency key, duplicate submissions with the same key, actor, repository, and
input SHOULD return the original result or a deterministic duplicate-submission failure. Persistence
of idempotency records across process restart is implementation-defined.

Usecases MUST honor Effect interruption. If a usecase is interrupted before committing, it MUST not
commit a partial domain mutation. If interruption occurs after a local commit but before sync, the
runner MUST surface or record enough context for a later sync to reconcile the repository.

## 13. Integration Contracts

### 13.1 Persistence Gateway

The persistence gateway MUST expose the storage operations needed by usecase handlers while hiding
transport and UI concerns. It MAY be implemented with the current `DatabaseService` during
migration, but the target boundary SHOULD distinguish:

- read-model queries;
- primitive repository lifecycle operations;
- primitive durable writes;
- explicit sync and push operations;
- post-write consistency checks.

The gateway MUST map `@cycle/database` failures into `UseCaseFailure` values without losing
repository ID, snapshot ID, object ID, retryability, or operator-action context when available.

### 13.2 Adapter Contract

Adapters MUST:

- decode external requests using usecase contracts;
- construct canonical usecase values;
- call `UseCaseRunner.run`;
- map success and failure values to transport responses;
- avoid embedding workflow policy.

Adapters MAY expose different route names, method names, or command names. Those names MUST map to
canonical usecases.

### 13.3 RPC Compatibility

The existing `@cycle/rpc` method set SHOULD be migrated to a thin adapter over `@cycle/usecases`.
The RPC package MAY keep method names such as `ticket.issue.create` for compatibility, but handler
logic SHOULD become a lookup from RPC method to canonical usecase constructor.

### 13.4 CLI and CI Compatibility

A CLI package SHOULD call automation and normal domain usecases through the same runner. CLI output
format, argument parsing, shell exit codes, and CI annotations are adapter responsibilities.

The usecase package MUST provide enough structured data for a CLI/CI adapter to produce:

- JSON reports;
- human-readable summaries;
- stable non-zero exit behavior for failed evaluations;
- links or IDs for affected tickets.

## 14. Failure Model

### 14.1 Failure Categories

`@cycle/usecases` MUST expose tagged failures for:

- invalid input;
- unknown usecase;
- unsupported compatibility alias;
- repository not open;
- repository unavailable;
- not found;
- stale cursor or stale snapshot;
- policy violation;
- authorization or approval violation;
- storage failure;
- sync failure;
- push failure;
- consistency failure after local commit;
- conflict or concurrent modification;
- automation evaluation failure;
- timeout;
- interruption when represented as a value;
- unexpected defect redacted for adapter responses.

### 14.2 Failure Shape

Each failure MUST include:

- `_tag`
- `message`
- `useCase`
- `requestId`
- `retryable`
- optional `repositoryId`
- optional `ticketId`
- optional `field`
- optional `code`
- optional redacted `details`

Failures MUST be serializable without losing their tag or code. Failures MUST NOT include full ticket
bodies, comment bodies, secret values, credentials, raw environment variables, or access tokens.

### 14.3 Error Mapping

Lower-level database failures MUST be mapped as follows:

- validation failures caused by usecase input become `InvalidInputFailure`;
- workflow or policy failures become `PolicyViolationFailure`;
- repository missing failures become `RepositoryNotOpenFailure` or `NotFoundFailure`;
- materialization failures become `SyncFailure` or `StorageFailure`;
- post-write visibility failures become `ConsistencyFailure`;
- GitDB remote push failures become `PushFailure`;
- unknown lower-level failures become `StorageFailure` with redacted cause details.

## 15. Observability

The package MUST emit structured logs for:

- usecase start;
- usecase success;
- usecase failure;
- policy rejection;
- repository sync and push orchestration;
- post-write consistency checks;
- automation evaluation summaries.

Every log event SHOULD include:

- `scope: "usecases"`
- usecase name;
- request ID;
- source;
- repository ID when applicable;
- ticket ID or object ID when applicable;
- actor type;
- duration in milliseconds on completion;
- outcome.

The package SHOULD expose metrics or counters for:

- usecase executions by name and outcome;
- policy violations by code;
- write durations;
- sync durations;
- push durations;
- automation evaluation pass/warn/fail counts;
- post-write consistency failures.

## 16. Security and Safety

External adapter inputs are untrusted until decoded by usecase contract schemas. Usecase handlers
MUST NOT trust transport-layer validation alone.

The package MUST redact secrets from logs, failures, telemetry, and automation reports. It MUST reject
obvious secret-bearing payload keys such as `token`, `secret`, `password`, `apiKey`, `privateKey`,
and close variants unless a future secure-secret extension defines safe handling.

`RepositoryPush` is externally visible and MUST be represented as an explicit push side effect in
contract metadata. Adapters SHOULD surface that side effect to users or automation logs.

The package MUST NOT execute shell commands directly for agent workflows. Any future command
execution must be specified in a separate agent/worktree specification.

## 17. Migration Requirements

The migration from direct database calls to usecases SHOULD proceed in these phases:

1. Introduce `packages/usecases` with contracts, runner, failures, and a persistence gateway backed
   by the current `DatabaseService`.
2. Migrate `@cycle/rpc` handlers to construct and run canonical usecases.
3. Migrate desktop backend paths that perform domain workflows to call usecases.
4. Move workflow policy out of `@cycle/database` into usecase handlers and policy services.
5. Slim `@cycle/database` toward storage, projection, primitive writes, and read-model queries.
6. Add CLI/CI adapters that call the same usecase runner.

During migration, temporary direct calls to `@cycle/database` MUST be documented with an owner and
removal target. New user-facing workflow code MUST be added to `@cycle/usecases`, not to adapters or
storage services.

## 18. Reference Algorithms

### 18.1 Issue Transition

```text
IssueTransition(repository, issue_id, status, reason):
  ticket = read issue
  if ticket is missing:
    fail NotFound
  workflow = load workflow policy
  actor = current actor
  decision = workflow.canTransition(ticket.status, status, actor, ticket)
  if decision is rejected:
    fail PolicyViolation(decision.code, decision.message)
  updated = apply frontmatter status and updatedAt
  record = status-change linked record
  commit updated issue and record with standard message
  sync repository projection
  verify issue status is visible
  return updated issue
```

### 18.2 Automation Evaluate Query

```text
AutomationEvaluateQuery(repository, query, rules):
  status = read repository status
  page through matching issues
  warnings = materialization warnings for repository
  for each issue:
    evaluate selected rules against issue and warnings
  summarize violations by severity
  if fatal or error violations meet threshold:
    report status fail
  else if warnings exist:
    report status warn
  else:
    report status pass
  return report
```

### 18.3 RPC Alias Dispatch

```text
handle_rpc(method, payload):
  alias = rpcAliasRegistry[method]
  if alias is missing:
    return unknown method failure
  usecase = alias.construct(payload)
  result = UseCaseRunner.run(usecase)
  return map result to rpc envelope
```

## 19. Test and Validation Matrix

Conformance tests MUST cover:

1. Every contract decodes valid input and rejects invalid input with `InvalidInputFailure`.
2. Every contract success value conforms to its success schema.
3. Unknown usecase names and unsupported aliases return typed failures.
4. Adapters can map legacy RPC names to canonical usecase names without custom workflow logic.
5. `IssueCreate` writes through the persistence gateway, syncs, and returns a visible ticket.
6. `IssueUpdate` preserves unknown frontmatter fields.
7. `IssueUpdate` rejects protected-section changes during active implementation state.
8. `IssueTransition` writes a status-change record.
9. `IssueTransition` rejects `done` when the actor is not human.
10. `DraftCommit` commits a draft and returns only after the issue is query-visible.
11. Relation usecases reject self-relations and duplicates.
12. Repository open, sync, push, status, warning, and history usecases map gateway failures to typed
    failures.
13. Search and history usecases preserve pagination behavior from the read model.
14. User, label, saved view, template, and initiative usecases route through canonical contracts.
15. Automation evaluations return deterministic pass, warn, and fail reports for fixed snapshots.
16. Usecase logs include name, request ID, source, outcome, and repository ID where applicable.
17. Failures and logs redact full bodies and secret-bearing fields.
18. Repository-scoped write usecases are serialized under concurrent execution.
19. Effect interruption before commit does not create partial domain writes.
20. Post-commit sync failure returns `ConsistencyFailure` with committed snapshot context.

## 20. Implementation Checklist

An implementation is complete when:

1. `packages/usecases` builds as an Effect package in the Cycle workspace.
2. The package exports usecase constructors, contract registry, runner service, failures, live layer,
   and test layer.
3. Canonical contracts cover all existing Cycle RPC operations plus automation evaluation usecases.
4. `@cycle/rpc` delegates workflow handling to `@cycle/usecases`.
5. New API, CLI, and CI entrypoints can call the same runner without importing `@cycle/database`
   workflow methods.
6. Workflow policy tests live with `@cycle/usecases`.
7. `@cycle/database` is documented as storage/projection/read-model infrastructure rather than the
   controller layer.
8. The migration removes or documents every direct adapter-to-database workflow call.
9. The validation matrix passes in deterministic tests.
