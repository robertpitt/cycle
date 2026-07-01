# Agent Work Orchestration Specification

Status: Draft implementation specification
Date: 2026-06-21
Target repository: Cycle

## 1. Purpose

This specification defines Cycle's agent-powered ticket work system. It reorients Cycle from
"ticket management plus chat" into a local-first ticket system where humans assign, mention, pause,
resume, and review AI agents that can understand repository context, interact through ticket
comments, and complete approved ticket work in isolated Git worktrees.

The product model is:

1. Tickets remain the human-visible source of truth.
2. Agent jobs are durable local runtime work, not GitDB ticket content.
3. Agent comments, follow-up tickets, status transitions, branches, and handover notes become
   durable ticket history.
4. Local agent assignment, queue state, pause state, workflow state, and worktree state remain
   local-only so syncing repository ticket data does not trigger another user's agents.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

Implementation-defined means the implementation may choose the internal mechanism, but it MUST
preserve the externally observable contract described in this specification.

## 3. Problem Statement

Cycle currently has a minimal ticket system, a local agent chat surface, MCP tooling, provider
detection, and a Codex-backed agent service. These pieces are useful, but the product is still
oriented around a human manually chatting with an agent rather than around a ticket system that can
delegate work to agents.

The missing product and architecture primitives are:

- a durable local job model for agent work;
- a local event hub that turns ticket/comment/status changes into background work;
- local-only agent assignment state that does not sync through GitDB;
- queue, pause, resume, and concurrency controls;
- worktree and branch lifecycle management for implementation work;
- settings for providers, defaults, per-agent overrides, and repository throttling;
- a visible activity surface for queued/running/suspended agent work;
- ticket type as required structured context for future agent prompting.

Without these primitives, agent work is either manually invoked chat or ad hoc button behavior. Cycle
needs agents to be assignable workers that pick up approved tickets, respond to mentions, perform
research or validation, make implementation branches, and communicate back through the ticket
timeline.

## 4. Goals

Cycle MUST:

1. Treat `todo` as the canonical approved-for-work ticket status.
2. Allow tickets in `todo` assigned to a local agent delegate to be picked up automatically by that
   agent, subject to pause and concurrency controls.
3. Allow structured agent mentions in ticket comments to enqueue agent response jobs.
4. Allow mention jobs to answer from repository context, create comments, create follow-up tickets,
   and perform disposable worktree validation when useful.
5. Require full implementation work to run in an isolated worktree.
6. Create or update a normal Git branch when implementation work completes.
7. Move completed implementation tickets to `needs-review`.
8. Require the agent to comment with branch, commit, work summary, test notes, and handover notes.
9. Keep agent assignment, queue state, workflow state, pause state, worktree state, and settings
   local-only and outside GitDB.
10. Persist durable ticket outcomes, such as comments, status changes, ticket creation, and branch
    references, through the existing ticket/usecase/GitDB write path.
11. Introduce required ticket type for all new tickets.
12. Add an Agents settings section with provider defaults, global defaults, per-agent overrides, and
    concurrency controls.
13. Add a visible agent activity surface showing queued, running, suspended, failed, and completed
    work.
14. Build the workflow runtime through a Cycle-owned abstraction over Effect's unstable durable
    workflow APIs.

## 5. Non-Goals

This specification MUST NOT require:

1. Hosted or multi-tenant agent execution.
2. Multi-device synchronization of local agent queue state.
3. Triggering background agents on another user's machine from synced GitDB state.
4. Remote runners in the first implementation phase.
5. Pull request creation, remote branch push, or hosted code review integration.
6. A general-purpose event-sourcing rewrite of Cycle.
7. Committing chat threads, local queues, workflow executions, or worktree state into GitDB.
8. Agent co-author trailers in Git commits.
9. Immediate interruption of active provider turns when a pause is requested.

Remote workflow runners, remote job execution, hosted collaboration, branch push, pull requests, and
agent co-authorship MAY be specified later.

## 6. Definitions

### 6.1 Ticket Type

Ticket type is a required structured field on every newly created ticket. The initial standard set
MUST be:

- `Epic`
- `Feature`
- `Bug`
- `Task`

The type registry MUST be extensible so later installations can add types such as `Hotfix`.

Ticket type MUST be available to agent prompts and branch naming. The default branch segment MUST be
the lowercase ticket type unless a type-specific branch segment override exists.

### 6.2 Canonical Work Status

`todo` is the canonical approved-for-work status. Moving a ticket from `backlog` to `todo` means a
human has approved the ticket for work.

The existing `ready` status MAY remain for compatibility and manual workflows, but agent pickup MUST
use `todo`, not `ready`.

### 6.3 Agent

An agent is a local assignable worker profile. It has:

- a stable local `agentId`;
- a display name such as `Codex` or `Claude`;
- a provider;
- default runtime settings;
- optional repository or per-agent overrides;
- capability metadata derived from the provider catalog and detection.

Agent identities are local product entities. They MUST NOT be committed into repository GitDB as
assignment state.

### 6.4 Local Agent Delegate

The local agent delegate is the local-only assignment from a ticket to an agent. It exists alongside
the normal human assignee field.

Human assignee remains synced ticket data. Agent delegate MUST be local-only and MUST NOT be written
to GitDB.

### 6.5 Agent Work Job

An agent work job is a local durable unit of background work. It is created from an event or direct
UI/API command and is executed by the workflow runtime.

Agent work jobs MUST include:

- stable local job ID;
- repository ID;
- ticket ID when applicable;
- trigger type;
- provider/agent selection;
- authority mode;
- workflow execution ID;
- status;
- created/updated timestamps;
- optional branch/worktree references;
- request metadata sufficient for audit and debugging.

### 6.6 Authority Mode

Authority mode describes what the agent may do during a job:

- `ticket-context`: read repository HEAD and Cycle ticket context; write comments and create
  follow-up tickets through Cycle tools.
- `disposable-worktree`: create a temporary worktree for validation, inspection, tests, and
  throwaway changes; no implementation branch is created from this mode by default.
- `implementation-worktree`: create or reuse a ticket branch worktree, modify code, run tests,
  commit changes, update the ticket branch, move the ticket to `needs-review`, and write handover
  comments.

Providers may map these modes onto their native runtime modes, but Cycle's scheduler and policy
MUST reason about Cycle authority modes.

## 7. System Overview

Cycle's agent work system has these components:

```text
Usecase Layer
  successful ticket/comment/status writes
        |
        v
Local Event Hub
  durable local event log + in-process PubSub
        |
        v
Agent Scheduler
  filters events, applies pause/concurrency policy, creates jobs
        |
        v
Workflow Runtime
  Cycle abstraction over effect/unstable/workflow
        |
        v
Agent Provider Services + MCP + Worktree Service
        |
        v
Ticket Timeline + Branches + Local Job State
```

The database package MUST NOT publish domain events directly. Domain events MUST be emitted from
the usecase/API/runtime boundary after the relevant write has succeeded.

## 8. Durable Workflow Runtime

### 8.1 Effect Workflow Boundary

Cycle SHOULD use Effect's unstable workflow primitives from `effect/unstable/workflow`, including
typed `Workflow`, `WorkflowEngine`, `DurableQueue`, `DurableClock`, and `DurableDeferred`, through a
Cycle-owned adapter.

Because this API is unstable, imports from `effect/unstable/workflow` MUST be isolated behind a
single internal package or module boundary, such as `@cycle/agent-workflows`. Product code,
renderer code, usecases, and provider adapters MUST NOT import the unstable workflow API directly.

The Cycle workflow abstraction MUST expose concepts in Cycle language:

- start job;
- poll job;
- pause job;
- resume job;
- cancel job;
- schedule wakeup;
- process queue item;
- record checkpoint;
- record result.

It MUST NOT expose Effect workflow implementation details as the public Cycle API.

### 8.2 Local First, Runner Later

The first implementation MUST run locally in the desktop/API process. The abstraction MUST still
preserve enough separation to allow a future external workflow runner.

Workflow payloads and results MUST be schema-encoded and serializable. They MUST NOT contain
closures, file handles, process handles, AbortControllers, provider-native sessions, or other
non-serializable runtime state.

Provider sessions and process handles MAY be represented through local runtime records keyed by
serializable IDs.

### 8.3 Execution IDs

Workflow execution IDs MUST be deterministic where duplicate processing would be harmful.

Examples:

- assignment pickup for a ticket and local agent delegate SHOULD derive from
  `repositoryId`, `ticketId`, `agentId`, and local assignment version;
- mention response SHOULD derive from `repositoryId`, `ticketId`, `commentId`, and mentioned
  `agentId`;
- follow-up implementation SHOULD derive from `repositoryId`, `ticketId`, `commentId`, and target
  branch ID.

The scheduler MUST treat duplicate start requests idempotently.

### 8.4 Suspension

When global or repository pause is requested, active jobs MUST be allowed to finish their current
provider turn or tool step. They MUST then checkpoint and enter `suspended` state before starting
another turn.

The runtime MUST NOT attempt to kill an active provider turn solely because pause was requested.

## 9. Local Event Hub

### 9.1 Purpose

The local event hub is the shared state-change stream for the local application runtime. It exists
so services can publish successful state changes once and consumers can subscribe only to the
events they care about.

The event hub MUST support:

- durable local append of events;
- in-process publish/subscribe for live consumers;
- consumer filtering by event type and repository ID;
- replay from a known event sequence or timestamp;
- idempotent consumer processing.

The event hub MAY use local SQLite or another local host store for durability. This persistence is
local runtime state and MUST NOT be implemented in `@cycle/database` as part of the repository
ticket read model.

### 9.2 Event Emission Boundary

Usecases and API/runtime services MUST emit events only after the corresponding command has
succeeded.

For example:

- `CommentAdded` is emitted after the comment write has succeeded.
- `TicketStatusChanged` is emitted after the status transition has succeeded.
- `TicketCreated` is emitted after the new ticket exists.
- `LocalAgentDelegateChanged` is emitted after local delegate state is updated.
- `AgentSettingsChanged` is emitted after local settings are updated.

The database service MUST remain storage/query infrastructure. It MUST NOT own event publication.

### 9.3 Initial Event Types

The event hub MUST define at least these event families:

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
- `local.worktree_created`
- `local.worktree_cleaned`
- `git.branch_created`
- `git.branch_updated`

Events MUST be versioned. Consumers MUST ignore event types and versions they do not understand.

## 10. Ticket Model Changes

### 10.1 Required Ticket Type

New ticket creation flows MUST require ticket type.

The contracts, usecases, API, MCP tools, and UI create flow MUST be updated so a new ticket cannot
be created without a type.

Legacy tickets that do not have a type MUST remain readable. The implementation SHOULD surface a
materialization or validation warning for missing type and SHOULD provide a migration path. Until
migration, legacy tickets MAY be treated as `Task` for branch naming and agent prompt context, but
the fallback MUST be visibly distinguishable from an explicit type in diagnostics.

### 10.2 UI Create Flow

The ticket create UI in `packages/ui` MUST include a required type control. It SHOULD use a compact
segmented control or select with the initial standard types.

The UI MUST NOT allow submission until type is selected.

### 10.3 Status Semantics

The default human flow for agent-addressable work is:

```text
backlog -> todo -> in-progress -> needs-review -> in-review -> done
```

`todo` means approved and ready for work.

`needs-review` means implementation has been handed back by an agent and needs human or tester
review.

`done` MUST remain human-controlled.

The existing `ready` status MUST NOT be used by the agent scheduler as an approved pickup state.
Existing usecase policies that treat `ready` as plan-accepted work SHOULD be revisited during
implementation.

## 11. Local Agent Assignment

### 11.1 Storage

Agent assignment MUST be local-only. It MUST be stored in the host application's local settings or
local runtime store, not in GitDB ticket frontmatter.

The local assignment record SHOULD include:

- repository ID;
- ticket ID;
- agent ID;
- assigned by local user identity;
- assigned timestamp;
- assignment version;
- active flag;
- optional preferred provider/model override;
- optional notes.

### 11.2 Behavior

Assigning a ticket to an agent MUST NOT modify the synced human assignee field.

When a ticket has an active local agent delegate and enters `todo`, the scheduler MUST enqueue an
assignment pickup job unless the repository or global agent queue is paused.

If a ticket is already in `todo` when it is assigned to an agent, the scheduler MUST evaluate it for
pickup immediately.

Removing the local agent delegate MUST prevent future automatic pickup. It SHOULD NOT cancel an
already running job unless the user explicitly cancels the job.

## 12. Job Triggers

### 12.1 Assignment Pickup

Assignment pickup is the full end-to-end work path.

Trigger conditions:

- ticket has status `todo`;
- ticket has active local agent delegate;
- repository and global agent queues are not paused;
- concurrency policy allows a new job;
- no active non-terminal implementation job already owns the same ticket.

The assignment pickup job MUST use `implementation-worktree` authority.

When the scheduler starts an assignment pickup job, Cycle SHOULD transition the ticket from `todo`
to `in-progress` before the first provider turn begins. If the transition fails, the job MUST fail
before creating an implementation worktree.

### 12.2 Agent Mention

A ticket comment containing a structured agent mention MUST enqueue a mention response job.

The trigger SHOULD use the existing `cycle-agent:<id>` reference shape rather than plain text
matching wherever possible. Plain `@name` detection MAY be supported later, but MUST NOT be required
for the first durable job implementation.

Mention response jobs default to `ticket-context` authority.

If the user's comment asks the agent to validate, test, reproduce, or inspect behavior that requires
execution, the job MAY escalate to `disposable-worktree` authority without a separate approval,
subject to provider capability and settings.

If the user's comment clearly asks for follow-up implementation work on an existing ticket branch,
the scheduler MAY enqueue a follow-up implementation job targeting that branch.

### 12.3 Agent-Created Tickets

Agents may create follow-up tickets when needed.

By default, agent-created follow-up tickets MUST be created in `backlog` so humans can review them.

If the triggering human instruction explicitly authorizes the agent to proceed, the agent MAY create
follow-up tickets in `todo` or perform additional local actions within its current authority mode.
When unsure, the agent MUST default to `backlog`.

### 12.4 Existing Branch Follow-Up

When a ticket already has an agent-created branch, a later agent invocation for that ticket SHOULD
use that branch as the base for implementation follow-up work until the branch is updated or the
human selects a different target.

The implementation MUST track ticket-to-branch association in local job/worktree state and SHOULD
also include branch references in ticket comments for durable human visibility.

## 13. Scheduler and Concurrency

### 13.1 Defaults

The default global maximum concurrent agent tasks MUST be `1`.

The default per-repository maximum concurrent agent tasks MUST be `1`.

Per-agent overrides MUST inherit global defaults unless explicitly set.

### 13.2 Scheduling Policy

The scheduler MUST apply these gates before starting a job:

1. global pause state;
2. repository pause state;
3. provider availability;
4. agent/provider enabled state;
5. global concurrency limit;
6. repository concurrency limit;
7. per-agent concurrency limit;
8. duplicate active job guard for the same ticket and authority mode;
9. worktree availability for worktree jobs.

Queued jobs SHOULD remain durable across application restart.

### 13.3 Job Statuses

Agent work jobs MUST support at least:

- `queued`
- `starting`
- `running`
- `suspending`
- `suspended`
- `resuming`
- `completed`
- `failed`
- `cancelled`

Status changes MUST be emitted to the local event hub.

## 14. Pause and Resume

### 14.1 Scope

Pause controls MUST exist at:

- global agent background work level;
- per-repository agent background work level.

Paused scope MUST prevent new jobs from starting.

### 14.2 Active Jobs

When a pause is requested while a job is active, the job MUST be allowed to complete the current
provider turn or safe tool step. It MUST then checkpoint and enter `suspended` before the next turn.

The ticket status MUST remain unchanged solely because of queue pause.

If the ticket is `in-progress`, it remains `in-progress` while the agent job is suspended.

### 14.3 Resume

Removing pause MUST cause eligible suspended jobs and queued jobs to be evaluated by the scheduler.

Suspended jobs SHOULD resume before newly queued jobs for the same repository, unless an explicit
priority policy says otherwise.

## 15. Worktree and Branch Lifecycle

### 15.1 Implementation Worktrees

Implementation work MUST use a Git worktree. The agent MUST NOT modify the primary user worktree
directly.

For a first implementation run, the worktree base SHOULD be the repository HEAD at job start.

For follow-up work on a ticket with an existing agent branch, the worktree base SHOULD be that
branch.

The worktree path is implementation-defined, but it MUST be outside GitDB and MUST be tracked in
local runtime state.

### 15.2 Disposable Worktrees

Mention jobs MAY create disposable worktrees for validation, reproduction, tests, or short-lived
inspection.

Disposable worktrees MUST be cleaned up after the job unless retention is explicitly enabled for
debugging.

Disposable worktree work MUST NOT create or update the ticket implementation branch by default.

### 15.3 Branch Naming

When implementation work completes, Cycle MUST create or update a normal Git branch in the primary
repository.

The default branch pattern MUST be:

```text
cycle/{type-segment}/{ticket-id}-{slug}
```

Examples:

```text
cycle/feature/CYC-123-agent-activity-panel
cycle/bug/CYC-456-fix-comment-mention-trigger
cycle/task/CYC-789-add-local-agent-settings
```

The type segment MUST derive from ticket type unless overridden by a type registry entry.

If the desired branch name already exists and is already associated with the same ticket, the job
MAY update that branch.

If the desired branch name exists but is not associated with the same ticket, Cycle MUST generate a
non-conflicting branch name or fail with a clear local error.

### 15.4 Commit Identity

Agent-created commits MUST use the local user's configured Git identity.

Cycle MUST NOT add `Co-Authored-By` trailers for the agent in this phase.

The ticket timeline and local job metadata SHOULD record which agent/provider produced the work.

### 15.5 Cleanup

After the implementation branch has been created or updated, the implementation worktree MUST be
cleaned up.

Further invocation on the same ticket SHOULD create a fresh worktree from the ticket branch until
that branch is updated or replaced.

If cleanup fails, the job MUST still surface branch and commit details if they were created, and it
MUST record cleanup failure in local job state.

## 16. Agent Completion Contract

When an implementation job completes successfully, Cycle MUST:

1. ensure code changes are committed using the local user's Git identity;
2. create or update the ticket branch;
3. clean up the worktree;
4. transition the ticket to `needs-review`;
5. add a ticket comment containing:
   - branch name;
   - commit SHA or SHAs;
   - concise summary of what changed;
   - validation or test commands run;
   - test results;
   - handover notes for testers;
   - known risks, limitations, or follow-up recommendations.

The agent MUST NOT transition the ticket to `done`.

If implementation fails, the agent SHOULD comment with the failure, partial findings, commands run,
and recommended next step when it has enough context to be useful.

## 17. Agent Settings

### 17.1 Application Settings

The frontend MUST add an Agents section to application settings.

The Agents settings section MUST support:

- preferred provider;
- enabled providers;
- global max concurrent tasks;
- global pause/resume;
- default model where provider supports models;
- default authority behavior for mention jobs;
- default disposable worktree behavior;
- per-agent overrides.

### 17.2 Repository Settings

Repository-scoped settings MUST support:

- pause/resume agent work for the repository;
- repository max concurrent tasks;
- optional provider override;
- optional default model override;
- optional disable-agent-work flag.

Repository settings MUST inherit application defaults unless overridden.

### 17.3 Per-Agent Overrides

Per-agent overrides SHOULD support:

- provider;
- model;
- max concurrent tasks;
- enabled/disabled state;
- default runtime mode;
- optional prompt/instruction profile;
- optional repository allowlist or denylist.

### 17.4 Persistence

Agent settings MUST be local-only. They MAY be stored in the host app config alongside existing
local settings, but they MUST NOT be committed to GitDB.

## 18. UI Requirements

### 18.1 Agent Activity Indicator

The app shell SHOULD include an agent activity icon.

The icon SHOULD pulse slowly when any agent work is running or suspending. It SHOULD indicate
paused or failed states without relying solely on animation.

Hovering or clicking the icon SHOULD show a compact activity surface listing:

- active jobs;
- queued jobs;
- suspended jobs;
- failed jobs;
- agent name/provider;
- repository;
- ticket;
- current status;
- pause/resume/cancel affordances where supported.

### 18.2 Ticket Detail

Ticket detail UI SHOULD show:

- local agent delegate;
- agent job status for the ticket;
- current ticket branch when known;
- last agent handover comment;
- controls to assign/unassign agent;
- controls to mention or ask an agent;
- controls to resume/cancel relevant local jobs where supported.

### 18.3 Ticket Create

Ticket create UI MUST require type.

The UI SHOULD present the standard type set in a compact control and SHOULD pass type through every
create pathway.

### 18.4 Agent Mentions

Markdown/tag UI SHOULD prefer structured `cycle-agent:<id>` references for agent mentions.

The UI SHOULD make agent mentions visually distinct from human mentions where possible.

## 19. MCP and Agent Context

Agents MUST interact with Cycle ticket data through Cycle-controlled tools or APIs, not by directly
editing GitDB files.

Agent context SHOULD include:

- repository ID and path;
- ticket ID, title, body, status, type, labels, priority, and human assignee;
- relevant comments and linked records;
- local agent job ID and authority mode;
- branch/worktree context when applicable;
- explicit user instruction that triggered the job.

The MCP/tool layer MUST enforce the job authority mode. For example, a `ticket-context` job can
comment and create tickets but cannot request code modification tools; an `implementation-worktree`
job can operate in its assigned worktree.

## 20. Local Persistence Model

The local runtime store SHOULD persist:

- event hub sequence and events;
- agent settings;
- local agent directory;
- local agent delegate assignments;
- agent work jobs;
- workflow execution IDs and status;
- worktree records;
- branch associations;
- pause states;
- job logs or compact activity records;
- provider session bindings needed to resume work.

This store is local application state. It MUST NOT be synced through GitDB.

Ticket comments, ticket creation, status changes, and durable human-visible branch references MUST
continue to use existing ticket/usecase writes so the ticket timeline remains the shared record.

## 21. Provider Requirements

The agent provider catalog MUST be extensible beyond Codex. The settings and UI model MUST allow
providers such as Codex and Claude to be represented even if execution support lands at different
times.

Provider capability metadata SHOULD say whether the provider supports:

- repository read context;
- MCP tools;
- command execution;
- file edits;
- worktree execution;
- abort/cancel;
- usage reporting;
- model selection;
- session resume.

The scheduler MUST NOT start a job on a provider that lacks required capability for the job
authority mode.

## 22. Failure Handling

Failures MUST be visible locally and, when useful to the human, in the ticket timeline.

The scheduler MUST distinguish:

- provider missing;
- provider unsupported capability;
- paused;
- concurrency limited;
- duplicate active job;
- worktree creation failed;
- branch collision;
- Git commit failed;
- status transition failed;
- MCP/tool failure;
- provider turn failed;
- cleanup failed.

Terminal failures SHOULD include remediation text suitable for UI display.

If an implementation job produced a branch or commit before failing a later step, Cycle MUST preserve
and surface those references.

## 23. Security and Safety

Agent background work MUST remain local-only in this phase.

The system MUST NOT infer synced agent assignment from GitDB ticket data.

Structured agent mentions MUST be deliberate references inserted or parsed as agent references. The
system SHOULD avoid accidentally triggering agents from arbitrary plain text.

Authority mode MUST be explicit in every job.

The primary user worktree MUST NOT be modified by background implementation jobs.

## 24. Observability

Cycle SHOULD provide enough local observability to debug agent work:

- event sequence ID;
- job ID;
- workflow execution ID;
- agent/provider/model;
- authority mode;
- repository/ticket;
- branch/worktree;
- status history;
- current pause/concurrency gate;
- last provider event;
- last error.

The ticket timeline SHOULD contain only human-useful summaries, not raw provider logs.

## 25. Implementation Phases

### Phase 1: Foundations

1. Add ticket type to contracts, usecases, MCP, API, database projection, and UI create flow.
2. Add local agent settings contracts and settings UI section.
3. Add local agent directory and local agent delegate state.
4. Add local event hub boundary and emit events from successful usecase/API writes.
5. Add agent activity indicator and local job list UI shell.

### Phase 2: Scheduler and Mention Jobs

1. Add durable local job store.
2. Add scheduler with pause and concurrency gates.
3. Add Effect workflow adapter boundary.
4. Enqueue structured agent mention jobs from `ticket.comment_added`.
5. Allow mention jobs to comment, create backlog follow-up tickets, and use disposable worktrees for
   validation.

### Phase 3: Assignment Pickup and Worktrees

1. Enqueue assignment pickup jobs for local agent delegate plus `todo`.
2. Add implementation worktree service.
3. Add branch naming and branch association.
4. Commit with user identity.
5. Clean up worktrees after branch creation.
6. Move completed tickets to `needs-review`.
7. Add agent handover comments.

### Phase 4: Follow-Up Work

1. Reuse existing ticket branch as base for follow-up implementation jobs.
2. Add branch update workflow.
3. Improve activity UI controls for resume/cancel.
4. Add richer provider capability handling and per-agent prompt profiles.

### Phase 5: External Runner Readiness

1. Harden serializable workflow payloads and results.
2. Split local runner implementation from workflow definitions.
3. Add runner lease protocol.
4. Add remote-safe event delivery and job claiming abstraction.

## 26. Acceptance Criteria

The implementation is conformant when:

1. A new ticket cannot be created without type through the primary UI/API/MCP create paths.
2. Assigning a local agent delegate to a `todo` ticket enqueues local agent work without writing the
   delegate to GitDB.
3. A synced ticket from another user does not trigger local agent work unless this local user has a
   matching local delegate or local mention-triggered job.
4. A structured agent mention creates a local mention job.
5. Global pause prevents new jobs and causes active jobs to suspend after the current turn.
6. Repository pause affects only that repository.
7. Default concurrency is one global task and one task per repository.
8. Implementation work runs in a worktree, not the primary worktree.
9. Starting assignment pickup moves the ticket from `todo` to `in-progress`.
10. Successful implementation creates or updates a `cycle/{type}/{ticket}-{slug}` branch.
11. Successful implementation cleans up the worktree.
12. Successful implementation moves the ticket to `needs-review`.
13. Successful implementation adds a handover comment with branch, commits, summary, tests, and
    tester notes.
14. Agent-created follow-up tickets default to `backlog` unless the triggering instruction clearly
    authorizes otherwise.
15. Agent job state is visible through the agent activity indicator and local activity surface.
