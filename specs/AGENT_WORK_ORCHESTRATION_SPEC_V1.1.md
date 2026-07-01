# Agent Work Orchestration Specification

Status: Draft implementation specification
Version: 1.1
Date: 2026-06-21
Target repository: Cycle

## 1. Purpose

This specification defines Cycle's local-first agent work orchestration system. It turns Cycle from
"ticket management plus chat" into a ticket-centered local runtime where humans assign, mention,
pause, resume, cancel, and review AI agents that can work from repository context and ticket
history.

The core product model is:

1. Tickets, comments, status transitions, branch references, and handover notes remain the
   human-visible durable source of truth.
2. Agent jobs, queue state, workflow state, pause state, local delegates, worktree state, leases,
   provider sessions, and operator diagnostics are local runtime state.
3. Local runtime state MUST NOT be committed to GitDB and MUST NOT sync to another user's machine.
4. Agent writes that are useful to humans MUST flow through Cycle usecases so they appear in the
   normal ticket timeline.
5. Full implementation work MUST happen in isolated Git worktrees and MUST be handed back as a
   normal Git branch plus a ticket handover comment.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

Implementation-defined means the implementation may choose the internal mechanism, storage engine,
or package location, but it MUST preserve the externally observable contract described in this
specification and MUST document the chosen behavior when it affects operators or tests.

## 3. Current Implementation Baseline

This section records repository facts that V1.1 must account for.

1. Ticket `type` and `status` exist as normalized top-level ticket fields, but they are currently
   stringly typed. `CreateIssueInput.type` is optional and missing type currently defaults to
   `issue`.
2. SQLite projection already indexes ticket `type` and `status`, so the V1.1 ticket-type work is a
   contract, validation, migration, and UI/API change rather than a major read-model rewrite.
3. The usecase transition graph currently includes `ready`, `needs-review`, and `in-review`, but
   does not allow the agent pickup transition `todo -> in-progress`.
4. Comments are durable linked records with `recordType: "comment"` and a payload body that is
   materialized into comment projections.
5. The existing agent provider contract is provider-neutral at the `AgentService` interface, but
   `AgentProviderId` and the provider catalog are Codex-only today.
6. Codex runtime modes are `read-only`, `workspace-write`, and `full-access`; these are provider
   runtime modes, not Cycle authority modes.
7. The current MCP tool context is broad and API-forwarding. It has no job ID, authority mode,
   repository scope, ticket scope, worktree path, or tool allowlist.
8. The desktop app persists agent chat threads, chat events, and provider session bindings locally,
   but it has no durable background job store, delegate store, pause store, worktree store,
   branch-association store, scheduler, or local event hub.
9. Active provider turns are in-memory runtime handles containing objects such as AbortControllers,
   provider clients, and pending approvals. A V1.1 workflow MUST NOT treat those handles as durable
   serializable workflow state.
10. `@cycle/git` has safe Git command wrappers and repository metadata operations, but no source
    branch/worktree lifecycle service.
11. Existing application and repository settings contain provider preferences and repository UI
    preferences, but no agent work pause, concurrency, delegate, job, or per-repository agent
    policy settings.
12. The UI has no Agents settings section, no repository Agent Work settings, no agent activity
    indicator, no ticket-local delegate panel, and no create-ticket type picker.

## 4. Problem Statement

Cycle has a GitDB-backed ticket domain, local projections, MCP tooling, a local agent chat surface,
provider detection, and Codex app-server integration. These parts are useful, but they do not yet
form a durable ticket work system.

The missing primitives are:

- required ticket type and an explicit type registry for agent context and branch naming;
- a local event hub emitted after successful usecase/API writes;
- local-only agent delegates that do not mutate synced human assignees;
- durable local agent jobs with leases, checkpoints, retries, pause, resume, cancel, and restart
  reconciliation;
- a scheduler that applies provider, pause, duplicate, concurrency, and worktree gates;
- a workflow runtime boundary over Effect's unstable workflow APIs;
- job-scoped MCP/tool authority rather than broad API access;
- source worktree and branch lifecycle management;
- agent settings and operator activity surfaces;
- explicit failure, observability, and validation contracts.

Without these primitives, agents remain manually-invoked chat sessions. Cycle needs agents to be
assignable local workers that react to approved tickets and structured mentions, run under explicit
authority, update tickets through Cycle usecases, and hand implementation work back for human
review.

## 5. Goals

Cycle V1.1 MUST:

1. Treat `todo` as the canonical approved-for-agent-work ticket status.
2. Require a canonical ticket type for every newly created ticket through contracts, HTTP, MCP,
   desktop UI, and plan-apply flows.
3. Preserve legacy tickets with missing, `issue`, `initiative`, or unknown type values without
   rewriting GitDB history.
4. Add local-only agent delegates that assign a ticket to a local agent profile without changing
   the synced human assignee.
5. Enqueue implementation jobs when a delegated ticket enters `todo`, subject to scheduler gates.
6. Enqueue mention jobs from structured `cycle-agent:<agentId>` references in successful comments.
7. Keep queue state, workflow state, pause state, delegates, settings, worktree state, leases,
   provider sessions, and raw provider diagnostics local-only.
8. Emit local events after successful ticket, comment, status, type, delegate, job, pause,
   settings, worktree, and branch changes.
9. Introduce a Cycle-owned workflow runtime boundary over Effect's unstable workflow APIs.
10. Persist durable local job records, status history, checkpoints, retry state, leases, and
    activity records across app restart.
11. Apply deterministic idempotency for duplicate assignment and mention triggers.
12. Enforce explicit Cycle authority modes for every job.
13. Restrict agent MCP/tool access by job-scoped authority, repository, ticket, and worktree.
14. Require implementation work to run in an isolated source worktree, not the primary user
    worktree.
15. Have Cycle, not the provider, own final branch naming, branch association, Git commit
    finalization, ticket transition, and handover comment creation.
16. Move completed implementation tickets to `needs-review`, never directly to `done`.
17. Add Agents settings, repository Agent Work settings, a shell activity surface, and ticket detail
    controls for local delegates and jobs.
18. Make provider, workflow, MCP, Git, and scheduler failures visible locally and summarize
    human-useful failures in the ticket timeline where appropriate.

## 6. Non-Goals

V1.1 MUST NOT require:

1. Hosted or multi-tenant agent execution.
2. Remote workflow runners.
3. Multi-device synchronization of local agent queue state.
4. Triggering background agents on another user's machine from synced GitDB ticket state.
5. Pull request creation, remote branch push, or hosted code review integration.
6. A general-purpose event-sourcing rewrite of Cycle.
7. Moving local chat threads, agent jobs, workflow executions, queue state, or worktree records into
   GitDB.
8. Agent co-author trailers in Git commits.
9. Immediate hard-kill of active provider processes when a pause is requested.
10. Non-Codex execution support as a required V1.1 provider implementation.

Remote runners, hosted collaboration, branch push, pull request creation, agent co-authorship, and
additional executable providers MAY be specified later.

## 7. System Overview

V1.1 introduces a local agent-work runtime beside the existing ticket domain:

```text
Usecase/API Boundary
  successful ticket/comment/status/type writes
        |
        v
Local Event Hub
  durable local event log + in-process subscribers
        |
        v
Agent Scheduler
  trigger filters + pause/provider/concurrency/worktree gates
        |
        v
Workflow Runtime
  Cycle adapter over effect/unstable/workflow
        |
        v
Agent Provider Adapter + Job-Scoped MCP + Worktree Service
        |
        v
Ticket Timeline + Git Branch + Local Job State
```

Responsibility boundaries:

- `@cycle/database` owns repository ticket reads/writes and projection. It MUST NOT publish local
  orchestration events directly and MUST NOT store local job state.
- `@cycle/usecases` owns ticket-domain validation, transition policy, actor policy, and normalized
  write failures.
- The API/runtime boundary owns emission of local events after successful usecase writes.
- The local agent-work runtime owns scheduler state, jobs, leases, checkpoints, local delegates,
  pause state, branch associations, and worktree records.
- The provider adapter executes turns and returns normalized events/results. It MUST NOT own ticket
  transitions, branch publication, final commit creation, or worktree cleanup policy.
- The worktree service owns normal source repository worktrees and branches. It MUST NOT mutate
  GitDB refs or ticket data except through Cycle usecases.
- The renderer owns presentation and user commands. It MUST NOT run scheduler decisions directly.

In V1.1 the scheduler SHOULD run in the desktop main/API runtime process. Exactly one local
scheduler instance per application profile SHOULD own job leases at a time. If multiple local
processes are possible, durable leases MUST prevent concurrent execution of the same job.

## 8. Core Domain Model

### 8.1 Ticket Type

Ticket type is a required structured field for every newly created ticket.

Stored type IDs MUST be normalized stable IDs, not display labels. The initial canonical registry
MUST define:

| ID        | Display label | Default branch segment |
| --------- | ------------- | ---------------------- |
| `epic`    | `Epic`        | `epic`                 |
| `feature` | `Feature`     | `feature`              |
| `bug`     | `Bug`         | `bug`                  |
| `task`    | `Task`        | `task`                 |

New writes MUST reject missing, empty, display-label-only, or unknown type IDs.

Legacy behavior:

- `issue` MUST remain readable as a legacy alias for `task`.
- `initiative` MUST remain readable as a legacy alias for `epic`.
- Missing legacy type SHOULD materialize as fallback `task` with a materialization warning until an
  explicit append-only migration writes a canonical type.
- Unknown legacy type values MUST remain readable when already present in GitDB history. New writes
  with unknown type values MUST fail unless the type registry explicitly defines them.

The type registry MUST be extensible. Repository-synced custom type definitions are not required in
V1.1; a V1.1 implementation MAY use an application-level registry. If custom types are added later,
their IDs MUST use the same normalization and branch-segment rules.

### 8.2 Ticket Status

The canonical agent-addressable workflow is:

```text
backlog -> todo -> in-progress -> needs-review -> in-review -> done
```

Additional status:

- `canceled` is terminal or manually restorable according to existing ticket policies.
- `ready` MAY remain readable and usable for legacy/manual workflows, but the agent scheduler MUST
  NOT treat `ready` as approved-for-work.

V1.1 transition policy MUST allow:

- `backlog -> todo`
- `todo -> in-progress`
- `in-progress -> needs-review`
- `needs-review -> in-review`
- `in-review -> done`
- regression transitions needed for human review loops, including `needs-review -> todo` and
  `in-review -> in-progress`

Agent actors MUST NOT transition tickets to `done`. `done` MUST require a human actor through the
normal usecase path. Human override behavior outside the normal graph MAY exist only through an
explicit force/admin pathway and MUST be auditable.

### 8.3 Agent

An agent is a local assignable worker profile.

Required fields:

- `agentId`: stable local ID.
- `displayName`: human-readable name.
- `providerId`: provider registry ID.
- `enabled`: boolean.
- `capabilities`: derived from provider catalog/detection.
- `defaultModel`: optional provider model ID.
- `defaultAuthorityMode`: optional default for manual agent commands.
- `metadata`: JSON extension object.

V1.1 only requires Codex as an executable provider. Provider IDs and job records MUST still be
modeled as registry-defined strings rather than hard-coded product assumptions. A provider registry
MAY contain future or disabled providers for settings display, but the scheduler MUST refuse jobs
whose provider is missing, disabled, or lacks required capabilities.

### 8.4 Local Agent Delegate

A local agent delegate is the local-only assignment of a ticket to an agent.

Required fields:

- `repositoryId`
- `ticketId`
- `agentId`
- `providerId`
- `model`
- `enabled`
- `assignedBy`
- `createdAt`
- `updatedAt`
- `assignmentVersion`
- `notes`

Agent delegates MUST NOT modify the synced human assignee and MUST NOT be written to GitDB.

Assigning a delegate to a ticket that is already in `todo` MUST evaluate that ticket for pickup
immediately. Removing or disabling a delegate MUST prevent future automatic pickup, but it SHOULD
NOT cancel a running job unless the user explicitly cancels that job.

### 8.5 Authority Mode

Authority mode is Cycle policy. It is distinct from provider runtime mode.

Every job MUST have exactly one authority mode:

- `ticket-context`: read ticket/repository context; use a read-only code sandbox; add comments and
  create backlog follow-up tickets through job-scoped Cycle tools.
- `disposable-worktree`: create a temporary worktree for validation, reproduction, inspection,
  tests, and throwaway edits; comment or create backlog follow-up tickets; no durable
  implementation branch by default.
- `implementation-worktree`: create or reuse a ticket implementation worktree; permit code edits
  in that worktree; let Cycle finalize commit/branch, transition the ticket to `needs-review`, and
  write handover comments.

Authority mode MUST map to all of:

- provider runtime mode and sandbox;
- provider command/file approval policy;
- MCP tool allowlist;
- repository and ticket scope;
- workspace `cwd`;
- permitted ticket mutations;
- worktree lifecycle policy.

Default mapping for Codex V1.1:

| Authority mode            | Codex runtime mode | Codex sandbox     | Approval policy |
| ------------------------- | ------------------ | ----------------- | --------------- |
| `ticket-context`          | `read-only`        | `read-only`       | `untrusted`     |
| `disposable-worktree`     | `workspace-write`  | `workspace-write` | `on-request`    |
| `implementation-worktree` | `workspace-write`  | `workspace-write` | `on-request`    |

`full-access` / `danger-full-access` MUST NOT be the default for background jobs. It MAY be
enabled only through explicit local configuration and MUST be visible in settings and job detail.

### 8.6 Agent Work Job

An agent work job is a durable local unit of background work.

Required fields:

- `schemaVersion`
- `jobId`
- `executionId`
- `logicalJobKey`
- `dedupeKey`
- `repositoryId`
- `ticketId`
- `trigger`
- `agentId`
- `providerId`
- `model`
- `authorityMode`
- `status`
- `currentGate`
- `attempt`
- `maxAttempts`
- `requestedBy`
- `workflowId`
- `providerSessionId`
- `worktreeId`
- `branchAssociationId`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `lastHeartbeatAt`
- `lastProviderEventAt`
- `lastError`
- `metadata`

`trigger` MUST identify the source:

- `assignment-pickup`
- `agent-mention`
- `follow-up-implementation`
- `manual-command`
- `retry`
- `resume`

For assignment pickup, the logical job key SHOULD derive from `repositoryId`, `ticketId`,
`agentId`, and `assignmentVersion`.

For mentions, the logical job key SHOULD derive from `repositoryId`, `ticketId`, `commentId`, and
the mentioned `agentId`.

For follow-up implementation, the logical job key SHOULD derive from `repositoryId`, `ticketId`,
`commentId` or command ID, `agentId`, and target branch association.

Duplicate start requests with the same non-terminal logical job key MUST return the existing job
instead of creating another active job.

### 8.7 Job Status

Jobs MUST support these statuses:

- `queued`
- `starting`
- `running`
- `waiting-for-input`
- `suspending`
- `suspended`
- `resuming`
- `retry-wait`
- `cancelling`
- `completed`
- `failed`
- `cancelled`

Terminal statuses are `completed`, `failed`, and `cancelled`.

Concurrency-counting statuses are `starting`, `running`, `waiting-for-input`, `suspending`,
`resuming`, and `cancelling`.

`queued`, `retry-wait`, and `suspended` MUST NOT count against concurrency limits.

Every status change MUST append a status-history record and emit a local event.

### 8.8 Worktree Record

A worktree record is local runtime state for a source repository worktree.

Required fields:

- `worktreeId`
- `repositoryId`
- `jobId`
- `mode`: `disposable` or `implementation`
- `path`
- `baseRef`
- `baseSha`
- `branchName`
- `branchRef`
- `status`
- `createdAt`
- `updatedAt`
- `cleanedAt`
- `retentionReason`
- `lastError`

Worktree paths are implementation-defined, but they MUST be outside GitDB storage and MUST NOT be
the primary user worktree.

### 8.9 Branch Association

A branch association links a ticket to a local implementation branch.

Required fields:

- `branchAssociationId`
- `repositoryId`
- `ticketId`
- `jobId`
- `branchName`
- `branchRef`
- `baseSha`
- `headSha`
- `createdAt`
- `updatedAt`
- `status`: `active`, `superseded`, `failed`, or `abandoned`
- `handoverCommentId`

Branch association is local runtime state. Human-visible branch references MUST be written to the
ticket timeline through comments and MAY also be represented by a future linked record type such as
`branch-reference`.

## 9. Configuration and Local Storage

### 9.1 Storage Boundary

Agent work state is local application state and MUST NOT be committed to GitDB.

The implementation SHOULD split storage as follows:

- App config JSON MAY store low-churn defaults such as preferred provider, default model, and
  enabled provider preferences.
- A local SQLite runtime store MUST store jobs, job history, local events, delegates, pause scopes,
  leases, checkpoints, worktree records, branch associations, provider session bindings, and
  operator-visible errors.

The existing chat tables MAY remain in their current store. They MUST NOT become the canonical job
store for background agent work.

### 9.2 Global Agent Settings

Global settings MUST include:

- `paused`: default `false`
- `maxConcurrentJobs`: default `1`
- `defaultProviderId`: default `codex` when available
- `defaultModel`
- `enabledProviders`
- `defaultMentionAuthorityMode`: default `ticket-context`
- `allowDisposableWorktreeForMentions`: default `true`
- `allowFullAccessJobs`: default `false`
- `perAgentOverrides`

Invalid settings MUST be rejected at the API boundary. Missing settings during migration MUST be
initialized with defaults without losing existing app config sections.

### 9.3 Repository Agent Settings

Repository settings MUST include:

- `repositoryId`
- `paused`: default `false`
- `maxConcurrentJobs`: default `1`
- `agentWorkDisabled`: default `false`
- `providerId`
- `model`
- `perAgentOverrides`
- `updatedAt`

Repository settings inherit global defaults unless explicitly overridden.

### 9.4 Pause Scopes

Pause state MUST be persisted locally with at least these scopes:

- `global`
- `repository:<repositoryId>`

Pause state MUST survive app restart. Pause changes MUST emit local events.

### 9.5 Local API Surface

V1.1 SHOULD expose local API operations equivalent to:

- `GET /v1/agent-settings`
- `PATCH /v1/agent-settings`
- `GET /v1/repositories/:repositoryId/agent-settings`
- `PATCH /v1/repositories/:repositoryId/agent-settings`
- `GET /v1/repositories/:repositoryId/issues/:ticketId/agent-delegate`
- `PUT /v1/repositories/:repositoryId/issues/:ticketId/agent-delegate`
- `DELETE /v1/repositories/:repositoryId/issues/:ticketId/agent-delegate`
- `GET /v1/agent-jobs`
- `GET /v1/agent-jobs/:jobId`
- `POST /v1/agent-jobs/:jobId/resume`
- `POST /v1/agent-jobs/:jobId/cancel`
- `GET /v1/agent-activity`

All endpoints are local application endpoints. They MUST NOT imply remote execution or remote
collaboration.

Activity MAY initially be exposed by polling with a sequence cursor. If a WebSocket or SSE stream
is used, agent-work events MUST be namespaced separately from chat events.

## 10. Ticket Model and Migration

### 10.1 Required Type Enforcement

The contracts, usecases, HTTP API, MCP tools, desktop create flow, templates, and plan-apply flow
MUST reject creation of new tickets without a canonical type ID.

The old default `type: "issue"` MUST NOT be used for new tickets.

### 10.2 Legacy Read Compatibility

Projection rebuild MUST continue to read tickets with:

- no type;
- `type: "issue"`;
- `type: "initiative"`;
- unknown legacy type values.

Legacy warnings MUST be exposed through materialization warnings or an equivalent diagnostics
surface. Legacy fallback MUST be visibly distinguishable from explicit canonical type in
diagnostics.

### 10.3 Append-Only Migration

GitDB history MUST NOT be rewritten in place. Any durable type migration MUST append normal ticket
update events.

Migration commands SHOULD be idempotent and SHOULD report:

- unchanged tickets;
- migrated tickets;
- skipped tickets;
- invalid tickets;
- errors.

### 10.4 Type and Status Change Paths

New type changes SHOULD be performed through a dedicated type-change usecase or through validated
frontmatter updates that enforce the type registry.

Status changes MUST continue to use transition usecases. Generic frontmatter updates MUST NOT be
able to bypass actor policy for `done` or scheduler-required statuses.

### 10.5 Comments

Comments used for orchestration MUST use canonical payload shape:

```json
{ "body": "comment markdown" }
```

Comment creation MUST reject empty body text.

`IssueTransitionInput.reason` or equivalent transition reason SHOULD be preserved in generated
status-change linked records so agent transitions are auditable.

## 11. Local Event Hub

### 11.1 Purpose

The local event hub is the shared state-change stream for local orchestration. It provides durable
local append, replay, and in-process publication after successful state changes.

The event hub MUST support:

- monotonic local sequence numbers;
- stable event IDs;
- schema version per event type;
- durable local append;
- replay from sequence;
- filtering by event type and repository ID;
- idempotent consumer processing;
- in-process publish/subscribe for live consumers.

### 11.2 Event Record

Each event MUST include:

- `sequence`
- `eventId`
- `eventType`
- `eventVersion`
- `occurredAt`
- `repositoryId`
- `ticketId`
- `jobId`
- `actor`
- `source`
- `dedupeKey`
- `payload`

Events MUST be JSON-serializable. Consumers MUST ignore event types or versions they do not
understand.

### 11.3 Emission Boundary

Usecases, API handlers, and runtime services MUST emit events only after the corresponding command
has succeeded.

Examples:

- `ticket.created` is emitted after the ticket exists.
- `ticket.status_changed` is emitted after the transition succeeds.
- `ticket.comment_added` is emitted after the comment linked record is durable.
- `local.agent_delegate_changed` is emitted after delegate state is updated.
- `local.agent_job_status_changed` is emitted after job state is updated.

The database package MUST remain storage/query infrastructure and MUST NOT own event publication.

### 11.4 Initial Event Types

The event hub MUST define at least:

- `ticket.created`
- `ticket.updated`
- `ticket.status_changed`
- `ticket.comment_added`
- `ticket.type_changed`
- `local.agent_delegate_changed`
- `local.agent_job_created`
- `local.agent_job_status_changed`
- `local.agent_pause_changed`
- `local.agent_settings_changed`
- `local.workflow_checkpointed`
- `local.worktree_created`
- `local.worktree_cleaned`
- `git.branch_created`
- `git.branch_updated`

## 12. Workflow Runtime

### 12.1 Effect Workflow Boundary

Cycle SHOULD use Effect's unstable workflow primitives from `effect/unstable/workflow` behind a
Cycle-owned adapter package or module boundary, such as `@cycle/agent-workflows`.

Because the Effect workflow API is unstable, product code, renderer code, usecases, provider
adapters, and MCP tools MUST NOT import `effect/unstable/workflow` directly. A static boundary test
SHOULD enforce this.

The Cycle workflow abstraction MUST expose Cycle-language operations:

- `startJob`
- `getJob`
- `listJobs`
- `pauseScope`
- `resumeScope`
- `resumeJob`
- `cancelJob`
- `recordCheckpoint`
- `recordActivity`
- `scheduleWakeup`
- `acquireLease`
- `heartbeatLease`
- `releaseLease`
- `reconcileStaleJobs`

It MUST NOT expose Effect workflow internals as public product API.

### 12.2 Serializable Payloads

Workflow payloads, results, checkpoints, and persisted activity MUST be Effect Schema encoded or
equivalent JSON-serializable values.

They MUST NOT contain:

- closures;
- file handles;
- process handles;
- AbortControllers;
- provider clients;
- native app-server sessions;
- live streams;
- non-serializable class instances;
- secrets or bearer tokens.

Provider sessions and process handles MAY be represented by serializable IDs and recovered through
runtime registries.

### 12.3 Leases

The scheduler MUST acquire a durable lease before executing a job. No two workers MAY own the same
job lease concurrently.

Default lease behavior:

- lease duration: 60 seconds;
- heartbeat interval: at most 20 seconds;
- stale lease threshold: one full lease duration after the last heartbeat.

On restart, jobs in concurrency-counting statuses with stale leases MUST be reconciled from their
last checkpoint.

### 12.4 Checkpoints

The workflow MUST checkpoint before and after non-idempotent operations, including:

- ticket status transition;
- worktree creation;
- provider turn start;
- Cycle MCP write;
- Git commit creation;
- branch update;
- handover comment creation;
- worktree cleanup.

Each checkpoint MUST identify whether the next step is safe to retry automatically.

### 12.5 Restart Reconciliation

On process restart:

- `queued`, `retry-wait`, and `suspended` jobs MUST be recoverable.
- `starting`, `running`, `waiting-for-input`, `suspending`, `resuming`, and `cancelling` jobs with
  stale leases MUST be reconciled.
- Cycle MUST NOT assume an active provider turn survived restart.
- Cycle MAY resume a provider session/thread when the provider supports it, but it MUST either
  retry from a safe checkpoint or fail with remediation if exact recovery is not possible.

## 13. Scheduler

### 13.1 Scheduling Gates

Before starting or resuming a job, the scheduler MUST apply these gates in order:

1. global pause;
2. repository pause;
3. repository agent-work disabled;
4. provider available;
5. provider enabled;
6. agent enabled;
7. provider capability supports authority mode;
8. job-scoped MCP capability available when needed;
9. global concurrency;
10. repository concurrency;
11. per-agent concurrency;
12. duplicate active job guard;
13. worktree availability for worktree jobs;
14. ticket state still valid for the trigger.

If a gate blocks a job, the job MUST remain durable and operator-visible unless the gate is a
terminal validation failure.

### 13.2 Concurrency Defaults

Default global max concurrent jobs MUST be `1`.

Default per-repository max concurrent jobs MUST be `1`.

Per-agent overrides MUST inherit global and repository defaults unless explicitly set.

### 13.3 Duplicate Guards

The scheduler MUST prevent:

- more than one non-terminal assignment implementation job for the same repository/ticket/agent and
  assignment version;
- more than one non-terminal mention job for the same repository/ticket/comment/agent;
- more than one non-terminal implementation worktree job targeting the same branch association.

### 13.4 Retry Policy

Retry MUST be capped and visible.

Default retry policy:

- `maxAttempts`: 3 including the initial attempt;
- initial delay: 5 seconds;
- multiplier: 2;
- max delay: 5 minutes;
- no infinite retry.

Automatic retry MUST occur only before non-idempotent external effects or after a checkpoint marks
the next step retry-safe.

`retry-wait` jobs MUST display the next attempt time and last error.

### 13.5 Pause, Resume, and Cancel

Pause MUST prevent new starts immediately.

If a job is running when pause is requested, the job SHOULD complete the current provider turn or
safe tool step, checkpoint, and transition through `suspending` to `suspended`.

Resume MUST reevaluate queued, retry-wait, and suspended jobs against all gates. Resume MUST NOT
bypass provider availability, duplicate guards, or concurrency limits.

Cancel MUST be durable and idempotent:

- queued and retry-wait jobs MUST transition to `cancelled` immediately;
- suspended jobs MUST transition to `cancelled` without provider execution;
- running jobs MUST transition to `cancelling`, request provider abort when supported, and then
  transition to `cancelled` at the next safe checkpoint;
- if provider abort is unsupported, cancellation remains pending and operator-visible until a safe
  checkpoint.

## 14. Job Triggers and Workflows

### 14.1 Assignment Pickup

Trigger conditions:

- ticket status is `todo`;
- local agent delegate is active;
- repository and global queues are not paused;
- scheduler gates pass;
- no duplicate non-terminal implementation job owns the same ticket/delegate.

Assignment pickup MUST use `implementation-worktree` authority.

Before the first provider turn begins, Cycle MUST transition the ticket from `todo` to
`in-progress` through the usecase layer with agent actor metadata. If the transition fails, the job
MUST fail before creating an implementation worktree.

### 14.2 Structured Agent Mention

A successful comment containing a structured `cycle-agent:<agentId>` reference MUST enqueue a
mention job for that agent.

Plain display text such as `@Codex` MUST NOT be the V1.1 enqueue contract. The UI MAY render a
friendly label, but the stored/parsed reference MUST remain machine-readable.

Mention jobs default to `ticket-context` authority.

If the user's comment asks the agent to validate, reproduce, inspect, or run tests, the scheduler
MAY escalate to `disposable-worktree` authority when settings allow it and provider capabilities
support it.

If the user's comment explicitly asks for follow-up implementation on an existing branch, the
scheduler MAY enqueue a follow-up implementation job targeting that branch association.

### 14.3 Agent-Created Follow-Up Tickets

Agents MAY create follow-up tickets through job-scoped Cycle tools.

By default, follow-up tickets MUST be created in `backlog`.

If the triggering human instruction explicitly authorizes immediate work, an agent MAY create a
follow-up ticket in `todo` or enqueue additional work within the current authority and settings.
When unsure, the agent MUST default to `backlog`.

### 14.4 Implementation Completion

On successful implementation, Cycle MUST:

1. verify all file changes are confined to the assigned implementation worktree;
2. create a Git commit from the worktree diff using the local user's configured Git identity;
3. create or update the associated `cycle/{type}/{ticket}-{slug}` branch;
4. record branch association state locally;
5. clean up the worktree unless retention is enabled;
6. transition the ticket from `in-progress` to `needs-review`;
7. add a handover comment with branch, commit SHA or SHAs, summary, validation commands, results,
   risks, and tester notes;
8. mark the job `completed`.

Providers MUST NOT be trusted as the source of truth for final branch, commit, or test claims.
Cycle MUST verify local Git and filesystem state before writing completion state.

### 14.5 Implementation Failure

If implementation fails, Cycle SHOULD add a human-useful ticket comment when it has useful context,
including:

- failure summary;
- commands run;
- partial findings;
- branch or commit references if any exist;
- recommended next step.

Failure MUST preserve local job diagnostics. Failure MUST NOT transition the ticket to `done`.

If the ticket was moved to `in-progress` before failure, V1.1 MAY leave it `in-progress` for human
triage or MAY move it back to `todo` only through explicit, documented policy. The policy MUST be
operator-visible.

## 15. Worktree and Branch Lifecycle

### 15.1 Worktree Service

Cycle MUST introduce a WorktreeService boundary over normal source repository Git commands.

The service MUST NOT live in `@cycle/database` and MUST NOT mutate GitDB refs. Package placement is
implementation-defined, but the boundary MUST be distinct from ticket storage and provider
execution.

Required operations:

- `createDisposableWorktree`
- `createImplementationWorktree`
- `inspectWorktree`
- `diffWorktree`
- `commitWorktree`
- `createOrUpdateBranch`
- `cleanupWorktree`
- `retainWorktree`

### 15.2 Disposable Worktrees

Disposable worktrees MAY be used for mention validation, reproduction, tests, and throwaway
inspection.

Disposable worktrees MUST NOT create or update durable implementation branches by default.

Disposable worktrees MUST be cleaned up after job completion unless retention is explicitly enabled
for debugging.

### 15.3 Implementation Worktrees

Implementation jobs MUST use source worktrees and MUST NOT modify the primary user worktree.

First implementation run SHOULD base the worktree on repository HEAD at job start.

Follow-up implementation SHOULD base the worktree on the associated ticket branch unless the human
selects another target.

### 15.4 Branch Naming

The default implementation branch pattern MUST be:

```text
cycle/{type-segment}/{ticket-id}-{slug}
```

Examples:

```text
cycle/feature/CYC-123-agent-activity-panel
cycle/bug/CYC-456-fix-comment-mention-trigger
cycle/task/CYC-789-add-local-agent-settings
```

`type-segment` MUST derive from the canonical ticket type registry. Legacy `issue` MUST use
`task`; legacy `initiative` MUST use `epic`; missing or unknown legacy types SHOULD use `task` and
emit diagnostics.

If the desired branch name already exists and is associated with the same ticket, Cycle MAY update
that branch.

If the desired branch name exists and is not associated with the same ticket, Cycle MUST generate a
non-conflicting branch name or fail with a clear local error.

### 15.5 Commit Ownership

Cycle MUST own final commit creation for V1.1 implementation jobs.

Commits MUST use the local user's configured Git identity.

Cycle MUST NOT add agent `Co-Authored-By` trailers in V1.1.

If a provider creates commits in the worktree despite instructions, Cycle MUST verify them and
either reject the job with a clear error or normalize the final branch according to an explicit
implementation-defined policy.

### 15.6 Cleanup and Retention

After successful branch publication, the implementation worktree MUST be cleaned up unless retention
is explicitly enabled.

If cleanup fails after branch/commit creation, Cycle SHOULD complete the implementation job with a
warning when handoff artifacts are durable. It MUST preserve branch and commit references and record
cleanup failure locally.

Retention policy for failed or cancelled worktrees MUST be local, configurable, and visible in job
detail.

## 16. Provider and MCP Contracts

### 16.1 Provider Contract

Providers SHOULD continue to implement the existing `AgentService` shape:

- `capabilities`
- `createSession`
- `resumeSession`
- `run`
- `stream`
- `respondToApproval`
- `respondToUserInput`
- `abortTurn`
- `close`

Provider capabilities MUST state whether the provider supports:

- streaming;
- structured output;
- MCP attachments;
- command execution;
- file changes;
- workspace write mode;
- session resume;
- abort/interrupt;
- approval interactions;
- user-input interactions;
- usage reporting;
- model selection.

The scheduler MUST NOT start a job on a provider that lacks capabilities required by the authority
mode.

### 16.2 Provider Request Metadata

Every provider turn for a job MUST include metadata with:

- `jobId`
- `repositoryId`
- `ticketId`
- `authorityMode`
- `worktreePath`
- `branchName`
- `triggerType`
- `triggerCommentId`
- `agentId`

Provider-specific app-server protocol details MUST remain inside provider adapters. Product code
MUST consume normalized Cycle provider events and results.

### 16.3 Job-Scoped MCP

Agent MCP credentials SHOULD be short-lived job-scoped tokens rather than the desktop static API
token.

MCP tool context MUST include:

- `jobId`
- `authorityMode`
- `repositoryId`
- `ticketId`
- `worktreePath`
- `allowedTools`
- `makeRequestId`
- `actor`

MCP annotations MUST NOT be treated as authorization. The server MUST enforce the tool allowlist
before forwarding to REST handlers or usecases.

### 16.4 Tool Allowlists

`ticket-context` MAY allow:

- repository list/get for the scoped repository;
- issue get/list/search/history for scoped repositories;
- comment add for the scoped ticket;
- issue create for backlog follow-up tickets;
- automation/read-only evaluation.

`ticket-context` MUST NOT allow:

- file mutation;
- command execution;
- status transition;
- arbitrary issue update;
- branch/worktree operations.

`disposable-worktree` MAY allow command/file activity inside the disposable worktree and the same
ticket/comment/follow-up tools as `ticket-context`.

`implementation-worktree` MAY allow command/file activity inside the implementation worktree.
Final commit, branch update, status transition, and handover comment SHOULD be performed by Cycle
workflow code after provider completion, not directly by provider tool calls.

### 16.5 Agent Actor Metadata

Agent-authored ticket writes MUST carry trusted local actor metadata:

```json
{
  "type": "agent",
  "name": "Codex",
  "provider": "codex",
  "jobId": "agent_job_..."
}
```

The usecase layer MUST enforce actor-sensitive policies, including rejection of agent transitions
to `done`.

## 17. Prompt and Context Assembly

Cycle MUST assemble agent job context outside user-controlled text.

Context SHOULD include:

- repository ID and path;
- ticket ID, title, body, type, status, priority, labels, assignee, and parent;
- relevant comments and linked records;
- triggering event/comment/instruction;
- local job ID and authority mode;
- allowed tools;
- worktree path and branch context when applicable;
- explicit completion contract.

Ticket comments, titles, descriptions, and user instructions MUST be treated as untrusted content.
Prompts MUST separate system/developer instructions, authority rules, and allowed tools from
ticket/user content.

Secrets, API tokens, MCP bearer tokens, environment values, and credential-bearing provider payloads
MUST NOT be included in prompts, ticket comments, or logs.

## 18. UI Requirements

### 18.1 Application Settings

Application Settings MUST add an Agents section.

It MUST expose:

- global pause/resume;
- preferred provider;
- enabled providers;
- default model when supported;
- global max concurrent jobs;
- default mention authority behavior;
- disposable worktree behavior;
- full-access background job toggle, disabled by default;
- per-agent overrides.

### 18.2 Repository Settings

Repository Settings MUST add an Agent Work section.

It MUST expose:

- repository pause/resume;
- repository max concurrent jobs;
- provider/model override;
- disable agent work for repository;
- active/queued/suspended/failed counts;
- provider health;
- last orchestration error.

### 18.3 App Shell Activity

The app shell SHOULD include an agent activity indicator.

The activity surface SHOULD list:

- running jobs;
- queued jobs;
- retry-wait jobs;
- suspended jobs;
- waiting-for-input jobs;
- failed jobs;
- agent/provider/model;
- repository/ticket;
- current gate;
- branch/worktree when known;
- pause/resume/cancel actions when supported.

The indicator MUST communicate paused and failed states without relying only on animation.

### 18.4 Ticket Detail

Ticket detail UI SHOULD show:

- local agent delegate;
- controls to assign/unassign a local agent;
- latest job status for the ticket;
- current gate or failure reason;
- current branch association;
- current worktree retention state when applicable;
- last handover comment;
- controls to ask/mention an agent;
- resume/cancel controls for relevant local jobs.

Local delegate and job state MUST be visually distinct from synced ticket fields.

### 18.5 Ticket Create

Ticket create UI MUST require canonical type.

The create form MUST NOT submit until type is selected or defaulted by an explicit template that
uses a canonical type ID.

### 18.6 Mentions

Agent mention UI SHOULD render friendly names while storing or inserting structured
`cycle-agent:<agentId>` references.

Plain display text MAY be accepted for visual display, but MUST NOT be the durable trigger contract
for V1.1.

## 19. Observability

### 19.1 Job Status Events

Every job status event MUST include:

- local sequence;
- timestamp;
- job ID;
- workflow ID;
- repository ID;
- ticket ID;
- agent ID;
- provider ID;
- model;
- authority mode;
- status;
- current gate;
- attempt;
- branch;
- worktree path;
- provider session ID;
- last provider event summary;
- last error.

### 19.2 Operator Surfaces

Operator views SHOULD answer these questions without requiring logs:

- What is running?
- What is queued or blocked?
- What changed recently?
- What action is available?

Ticket timelines SHOULD contain human-useful summaries, not raw provider logs.

Raw provider event history SHOULD remain local, compact, and redacted.

### 19.3 Logging and Redaction

Logs MUST include enough context to correlate:

- event sequence;
- job ID;
- workflow ID;
- repository ID;
- ticket ID;
- provider/session/turn IDs;
- worktree ID;
- branch association ID;
- failure code.

Logs and stored metadata MUST redact secrets and provider credentials.

## 20. Failure Model

The scheduler and workflow runtime MUST distinguish at least:

- invalid ticket type;
- invalid ticket status for trigger;
- provider missing;
- provider disabled;
- unsupported provider capability;
- global paused;
- repository paused;
- concurrency limited;
- duplicate active job;
- MCP unavailable;
- MCP unauthorized by job authority;
- provider authentication failure;
- provider rate limit;
- provider turn failed;
- provider timeout;
- user input required;
- cancellation requested;
- worktree creation failed;
- worktree dirty or unavailable;
- provider wrote outside worktree;
- branch collision;
- Git commit failed;
- branch update failed;
- status transition failed;
- handover comment failed;
- cleanup failed;
- stale lease;
- restart recovery failed.

Terminal failures MUST include remediation text suitable for UI display.

If an implementation job produced a branch or commit before a later failure, Cycle MUST preserve and
surface those references.

## 21. Security and Safety

Background agent work MUST remain local-only and loopback-bound in V1.1.

The system MUST NOT infer local agent delegates from synced GitDB ticket state.

Agents MUST NOT edit GitDB files directly. Ticket mutations MUST go through Cycle usecases or
trusted internal services.

Background implementation jobs MUST NOT modify the primary user worktree.

Provider command/file approval requests MUST be checked against job authority. Requests to operate
outside the assigned worktree MUST be denied even if the provider asks for approval.

Cycle MUST verify final filesystem and Git state itself before writing handover comments or
completion state.

## 22. Reference Algorithms

### 22.1 Assignment Pickup

```text
on event ticket.status_changed or local.agent_delegate_changed:
  ticket = loadTicket(repositoryId, ticketId)
  delegate = loadActiveDelegate(repositoryId, ticketId)
  if ticket.status != "todo": return
  if delegate == null: return

  logicalKey = assignmentKey(repositoryId, ticketId, delegate.agentId, delegate.assignmentVersion)
  existing = findNonTerminalJob(logicalKey)
  if existing != null: return existing

  job = createJob(
    trigger = "assignment-pickup",
    authorityMode = "implementation-worktree",
    logicalJobKey = logicalKey
  )
  emit local.agent_job_created
  scheduler.evaluate(job)
```

### 22.2 Start Implementation Job

```text
startImplementation(job):
  acquireLease(job)
  assertSchedulerGates(job)
  checkpoint("before-status-transition", retrySafe = true)

  transitionTicket(job.ticketId, "in-progress", actor = agentActor(job))
  checkpoint("after-status-transition", retrySafe = false)

  worktree = createImplementationWorktree(job)
  checkpoint("after-worktree-created", retrySafe = true)

  result = runProviderTurn(job, cwd = worktree.path, authority = "implementation-worktree")
  checkpoint("after-provider-turn", retrySafe = false)

  verifyWorktreeScope(worktree)
  commit = commitWorktree(worktree, identity = localGitIdentity)
  branch = createOrUpdateBranch(job, commit)
  checkpoint("after-branch-updated", retrySafe = true)

  cleanupResult = cleanupWorktree(worktree)
  transitionTicket(job.ticketId, "needs-review", actor = agentActor(job))
  addHandoverComment(job, branch, commit, result, cleanupResult)
  completeJob(job)
```

### 22.3 Mention Trigger

```text
on event ticket.comment_added:
  mentions = parseStructuredAgentMentions(comment.body)
  for mention in mentions:
    logicalKey = mentionKey(repositoryId, ticketId, commentId, mention.agentId)
    if findNonTerminalJob(logicalKey) exists: continue
    authority = chooseMentionAuthority(comment.body, settings, providerCapabilities)
    createJob(trigger = "agent-mention", authorityMode = authority)
```

## 23. Implementation Phases

### Phase 1: Contracts and Local State

1. Add canonical ticket type schemas and make create type required.
2. Add legacy type alias/warning behavior.
3. Update transition policy for `todo -> in-progress` and agent actor restrictions.
4. Add local runtime store schemas for events, jobs, status history, delegates, pause scopes,
   leases, checkpoints, worktrees, and branch associations.
5. Add global/repository agent settings contracts and defaults.
6. Add local API endpoints for settings, delegates, jobs, and activity.

### Phase 2: Event Hub and Scheduler

1. Emit local events after successful usecase/API writes.
2. Implement event replay and idempotent scheduler consumers.
3. Implement scheduler gates, default concurrency, pause/resume/cancel, duplicate guards, and retry
   policy.
4. Add workflow runtime adapter boundary and static import tests for `effect/unstable/workflow`.

### Phase 3: Mention Jobs

1. Add structured `cycle-agent:<agentId>` mention parsing/storage.
2. Add job-scoped MCP tokens/context and tool allowlists.
3. Run `ticket-context` mention jobs.
4. Allow disposable worktree mention validation when settings and capabilities permit.
5. Add activity UI for queued/running/waiting/failed jobs.

### Phase 4: Implementation Jobs

1. Add WorktreeService.
2. Add assignment pickup from local delegate plus `todo`.
3. Add implementation worktree creation.
4. Add provider execution in implementation worktree.
5. Add Cycle-owned commit and branch publication.
6. Add branch associations, cleanup, `needs-review` transition, and handover comments.

### Phase 5: Hardening and Extensions

1. Add restart reconciliation tests for stale leases and provider sessions.
2. Add retention policy for failed jobs, logs, and worktrees.
3. Add richer provider capability handling and optional non-Codex provider registry entries.
4. Prepare external-runner seams without enabling remote execution.

## 24. Validation Matrix

Conformance tests MUST cover:

| Area             | Required validation                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Type contracts   | Create without type fails through contracts, HTTP, MCP, desktop, and plan-apply.                                                |
| Legacy types     | `issue`, `initiative`, missing type, and unknown legacy types remain readable with warnings/fallbacks.                          |
| Status graph     | `todo -> in-progress` works for authorized implementation jobs.                                                                 |
| Actor policy     | Agent `done` transition fails; human review completion succeeds.                                                                |
| Event boundary   | Successful writes emit events; failed writes emit none.                                                                         |
| Idempotency      | Duplicate assignment/mention triggers create one non-terminal job.                                                              |
| Persistence      | Queued, retry-wait, suspended, failed, delegates, pause scopes, and settings survive restart.                                   |
| Leases           | Stale running jobs reconcile from checkpoints after restart.                                                                    |
| Pause/resume     | Global pause blocks all repositories; repository pause blocks only one repository; resume reevaluates gates.                    |
| Cancel           | Queued, suspended, and running cancellation are idempotent and durable.                                                         |
| Concurrency      | Default global and repository concurrency of `1` prevents simultaneous starts.                                                  |
| Provider gates   | Missing/disabled/unsupported provider leaves visible gate and does not drop the job.                                            |
| Authority        | `ticket-context` cannot update status, run commands, or edit files.                                                             |
| MCP tokens       | Wrong job, stale token, wrong authority, and disallowed tool calls fail.                                                        |
| Worktree safety  | Implementation jobs do not modify the primary worktree.                                                                         |
| Branching        | Branch naming derives from canonical type and handles collisions.                                                               |
| Commit ownership | Cycle creates final commit with local user identity and no agent co-author trailer.                                             |
| Completion       | Successful implementation creates branch, cleans/records worktree, moves ticket to `needs-review`, and writes handover comment. |
| Failure          | Branch collision, commit failure, status transition failure, provider failure, timeout, and cleanup failure are visible.        |
| Observability    | Job status events include required IDs, gate, provider, branch, worktree, attempt, and error fields.                            |
| UI state         | Activity indicator and ticket detail recover state after renderer reload.                                                       |

## 25. Acceptance Criteria

V1.1 is acceptable when:

1. New tickets cannot be created without canonical type through all primary create paths.
2. Legacy tickets remain readable and produce diagnostics rather than being dropped.
3. A local agent delegate can be assigned to a ticket without writing delegate state to GitDB.
4. A delegated `todo` ticket enqueues exactly one local implementation job.
5. A synced ticket from another user does not trigger local agent work without this user's local
   delegate or structured local mention trigger.
6. Structured `cycle-agent:<agentId>` comments enqueue mention jobs after successful comment writes.
7. Global and repository pause states block new starts and survive restart.
8. Running jobs suspend only after a provider turn or safe checkpoint.
9. Cancel is durable and idempotent.
10. Default global and repository concurrency are both one.
11. Workflow payloads, checkpoints, and results are serializable and do not contain runtime handles.
12. Duplicate trigger processing is idempotent.
13. Agent MCP access is job-scoped and authority-limited.
14. Implementation work runs in an isolated worktree, not the primary user worktree.
15. Cycle creates the final commit and branch using the local user's Git identity.
16. Successful implementation moves the ticket to `needs-review`.
17. Successful implementation adds a handover comment with branch, commits, summary, tests, and
    tester notes.
18. Failed jobs remain visible with remediation and preserve branch/commit references when created.
19. The app exposes Agents settings, repository Agent Work settings, a shell activity surface, and
    ticket delegate/job controls.
20. Static tests confirm unstable workflow imports are isolated behind the Cycle workflow boundary.

## 26. Deferred Decisions

These decisions are intentionally deferred and MUST NOT block V1.1:

1. Exact remote-runner lease protocol.
2. Hosted collaboration or multi-device queue synchronization.
3. Pull request creation and branch push behavior.
4. Synced repository-defined custom type registries.
5. Non-Codex executable provider implementations.
6. Long-term retention defaults for raw provider event logs beyond a local configurable policy.
