# Cycle Application Specification

Status: Draft product and system specification

Version: 0.1.0

## 1. Purpose

Cycle is a local-first, Git-backed issue and agent execution application. It provides a
Linear-inspired workflow for creating, planning, executing, reviewing, and completing work items
inside a repository without requiring a hosted issue tracker.

Cycle uses each repository's `.git` directory as the durable source of truth for repository-scoped
Cycle data. When a repository has a remote, Cycle can explicitly fetch and push Cycle database refs
in the background so tickets and agent execution metadata can sync between machines.

The product optimizes for humans and agents collaborating on code work. A user can ask an agent to
draft a ticket from local code context, refine the plan, mark the ticket ready, run an agent in an
isolated worktree, review the result, and approve the ticket as done.

## 2. Normative Language

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174.

Implementation-defined means the application team may choose the behavior, but it MUST document the
choice and expose enough information for users, tests, and future implementations to reason about
the behavior.

## 3. Problem Statement

Modern agent-assisted development often happens inside chat threads that are detached from the
repository's durable work history. Plans, prompts, implementation attempts, review comments, test
results, and final code references can become fragmented across tools.

Hosted ticket systems solve some workflow problems but introduce a remote service dependency. They
are not naturally local-first, they do not live with the repository, and they do not provide a
repository-native storage model for agent-generated plans and execution records.

Cycle defines a local-first work management system where repository work metadata is versioned,
syncable, inspectable, and available offline. Git commit history is a first-class product feature
for understanding how a ticket, plan, or execution record changed over time.

## 4. Goals

- Cycle MUST work for solo developers using only a local Git repository.
- Cycle MUST support teams that sync Cycle data through explicit Git ref fetch and push operations.
- Cycle MUST allow public/open-source repositories to publish ticket data with the same effective
  exposure level as the repository.
- Cycle MUST store each repository's ticket data in that repository's `.git` directory.
- Cycle MUST support an app-level local workspace containing zero or more repositories.
- Cycle MUST provide a Linear-inspired issue workflow with list and board views.
- Cycle MUST support agent-driven issue drafting, issue expansion, issue splitting, implementation,
  and review.
- Cycle MUST represent implementation work with linked execution records, diff summaries, test
  results, review notes, final reports, and code references.
- Cycle MUST preserve human approval as the default final gate before work is marked done.
- Cycle MUST support isolated Git worktrees for agent implementation jobs.
- Cycle MUST treat Git commit history as the authoritative history for committed Cycle changes.

## 5. Non-Goals

- Cycle does not require Linear, GitHub Issues, Jira, or any other external task manager.
- Cycle does not define the low-level GitDB object, tree, blob, ref, or index layout. That belongs
  in the GitDB storage specification.
- Cycle does not require normal Git branches to contain ticket Markdown files.
- Cycle does not rely on normal `git push` or `git pull` to sync Cycle data.
- Cycle does not make the normal Git working tree, Git index, or `HEAD` the storage mechanism for
  ticket state.
- Cycle does not automatically push implementation branches unless the user or a workflow extension
  explicitly requests that behavior.
- Cycle v1 does not require two-way synchronization with external ticket systems.
- Cycle v1 does not require enterprise organizations, hosted accounts, server-side permissions, or
  multi-tenant administration.

## 6. System Overview

### 6.1 Main Components

Cycle consists of these product-level components:

- App shell: owns onboarding, app-level profile settings, repository list, theme preference, and
  repository switching.
- Repository manager: opens, initializes, validates, and syncs repository-scoped Cycle databases.
- Issue system: owns issue documents, frontmatter fields, workflow states, linked records,
  references, indexes, and history views.
- Draft manager: owns durable uncommitted Cycle drafts inside a Cycle-controlled draft namespace.
- Agent manager: detects local CLI agents, invokes provider adapters, streams output, records
  execution artifacts, and normalizes failures.
- Worktree manager: creates and tracks isolated Git worktrees for implementation jobs that can
  modify files.
- Sync manager: explicitly fetches and pushes Cycle refs for each repository and surfaces sync
  status.
- History viewer: renders committed Cycle history and diffs for tickets and related records.

### 6.2 Storage Boundary

Each repository MUST own its own Cycle database in its own `.git` directory. A Cycle database MUST be
repository-scoped, not global to the app.

The app MAY keep global app settings in the user's local app configuration directory. App-level
settings MAY include:

- user display name
- user email
- added repository paths
- theme preference
- detected or manually configured agent providers
- onboarding completion state

The app MUST NOT persist repository ticket content, ticket indexes, execution records, comments, or
history outside the repository's `.git` directory. Implementations MAY use an in-memory SQLite
database or equivalent in-memory index for UI performance, but that index MUST be rebuildable from
the repository's Cycle database and MUST NOT be the source of truth.

### 6.3 External Dependencies

Cycle depends on:

- a local filesystem
- Git repositories or folders that can be initialized as Git repositories
- Git operations capable of reading and writing Cycle database refs
- local CLI agent providers for agent workflows
- optional Git remotes for sync
- optional external task managers for read-only import extensions

## 7. Core Domain Model

### 7.1 Local Workspace

A Local Workspace is the default app-level container for repositories.

Cycle v1 MUST provide one default Local Workspace. Additional workspaces, organizations, accounts, or
enterprise concepts MAY be added later as extensions.

### 7.2 Repository

A Repository is a local folder with a `.git` directory, or a folder that the user allows Cycle to
initialize with `git init`.

Repository records in app-level config SHOULD include:

- stable app-local repository ID
- display name
- local path
- last opened timestamp
- last successful Cycle sync timestamp
- current sync status
- initialization status

Repository-scoped Cycle state MUST be stored in the repository's `.git` directory.

### 7.3 Issue

An Issue is the primary work item in Cycle.

Each issue MUST be represented primarily as a Markdown document with frontmatter. The Markdown body
is the human-readable issue content and plan. The frontmatter is the structured metadata used by the
application.

The issue ID MUST be distributed-safe and generated locally without coordination. It MUST NOT be
derived from a Git blob ID because issue blob IDs change whenever the issue is edited. The exact ID
format is implementation-defined, but it MUST be stable, safe for repository storage paths, and
collision-resistant across offline writers.

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

Issue `type` MUST support at least:

- `issue`
- `epic`

An Epic is an issue whose purpose is grouping child issues. Epics MUST use the same issue document
model as other issues. Child relationships MAY be represented in frontmatter, Markdown references,
or linked records, but the UI MUST be able to show the relationship.

### 7.4 Issue Body Template

Cycle MUST provide a default issue template with these sections:

- Problem
- Context
- Acceptance Criteria
- Implementation Plan
- Risks
- Test Plan
- Agent Notes

Repositories MAY override default workflow and template behavior with `CYCLE_WORKFLOW.md`.

### 7.5 Linked Records

Comments, agent logs, execution attempts, reviews, status changes, import metadata, and other
activity-like data MUST be stored as separate records linked to the issue. They MUST NOT be required
to live inside the issue Markdown body.

Linked records MUST have stable identifiers and MUST reference the issue ID they belong to. Their
exact storage format is implementation-defined, but they MUST be stored in the repository's Cycle
database and committed through the same Cycle transaction model as issues.

### 7.6 References

Issue Markdown and frontmatter MAY contain references to other Cycle issues.

Cycle MUST support local issue references within the same repository. Cycle SHOULD leave room for
external repository references similar to GitHub-style issue references.

The exact Markdown reference syntax is implementation-defined, but references SHOULD be parseable
without requiring network access.

### 7.7 Indexes

Cycle MUST persist repository indexes in the repository's Cycle database. Persistent indexes MUST NOT
be stored in app-local config or an external cache.

Cycle SHOULD maintain indexes for:

- status
- assignee
- labels
- repository
- priority
- parent or epic
- updated date
- external source

Implementations MAY build in-memory query indexes for UI performance, but those indexes MUST be
derived from committed or draft Cycle database state.

### 7.8 Execution Record

An Execution Record represents one agent or human implementation attempt.

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

Execution records MUST be linked from the issue detail view.

### 7.9 Provenance

Cycle MUST distinguish human-created, agent-created, imported, and agent-modified records.

Provenance SHOULD include:

- actor type
- actor name
- actor email when available
- agent provider when applicable
- model or provider metadata when available
- source prompt or summarized source request when safe to store
- assumptions made by the agent
- timestamp

Secrets and credentials MUST NOT be stored in provenance records.

## 8. Workflow States

### 8.1 Default Issue States

Cycle MUST support these default issue states:

- `Backlog`
- `Todo`
- `Ready`
- `In Progress`
- `Needs Review`
- `In Review`
- `Done`
- `Canceled`

Repositories MAY customize display names or additional states through workflow configuration, but
the default state semantics MUST remain available for core workflows and tests.

### 8.2 State Semantics

`Backlog` means the issue exists but is not yet committed to near-term work.

`Todo` means the issue is accepted as a work item but not yet signed off for agent implementation.

`Ready` means planning is complete, required sign-offs are present, and the issue can be picked up by
an implementation agent.

`In Progress` means a human or agent is actively drafting, planning, implementing, or reviewing the
issue.

`Needs Review` means human attention is required because an agent asked a question, execution was
blocked, a conflict occurred, tests failed, a provider errored, or a draft/review needs acceptance.

`In Review` means implementation has produced reviewable output and awaits human approval or a
review agent result.

`Done` means a human has accepted the completed work.

`Canceled` means work is intentionally abandoned.

### 8.3 Human Approval

Humans MUST be the final approval authority for marking an issue `Done` in the default workflow.
Review agents MAY produce feedback or recommendations, but they MUST NOT be the default final
approver.

## 9. Repository Lifecycle

### 9.1 Onboarding

On first launch, Cycle MUST show onboarding before the main app.

Onboarding MUST collect:

- user display name
- user email
- theme preference

Onboarding MUST detect local agent providers and ensure at least one supported provider exists or is
manually configured before agent workflows are available. If no provider exists, Cycle MAY still
allow manual issue management but MUST surface that agent actions are unavailable.

After onboarding completes, Cycle MUST show the main app. If no repositories are configured, the
sidebar MUST show no repositories and the main content MUST offer an action to add the first
repository.

### 9.2 Adding A Repository

When the user adds a folder:

- If the folder has no `.git` directory, Cycle MUST ask whether to initialize it as a Git repository.
- If the folder has a `.git` directory but no Cycle database, Cycle MUST ask whether to initialize
  the Cycle database.
- If the folder has a valid Cycle database, Cycle MUST add it to the Local Workspace.
- If the folder has corrupted or unsupported Cycle metadata, Cycle MUST surface a recoverable error
  and MUST NOT overwrite data without explicit confirmation.

Cycle MAY run `git init` for empty or non-empty folders only after explicit user confirmation.

### 9.3 Initializing A Cycle Database

When initializing a Cycle database in an existing Git repository, Cycle MUST create the required
repository-scoped Cycle database state and commit the initialization as a Cycle transaction.

If the repository has a remote and sync is enabled, Cycle SHOULD explicitly push the initialized
Cycle refs after the initialization commit. The initialization MUST NOT depend on normal branch push
behavior.

## 10. Drafting And Commit Rules

### 10.1 Draft Namespace

Cycle MUST support durable uncommitted draft sessions. Drafts MUST be stored in a Cycle-owned draft
namespace inside the repository's `.git` directory, not in the normal Git index.

Cycle MUST support multiple concurrent draft sessions per repository. Two agents drafting two
separate tickets in parallel SHOULD produce two independent draft sessions and two independent final
Cycle commits.

### 10.2 Draft Creation Flow

The user SHOULD be able to open a quick input, paste a report, write an issue request, or ask an
agent to plan work.

Cycle MUST create a draft issue immediately in the draft namespace. During drafting, the issue MAY
be updated by the agent, by feedback/QA stages, or by the user.

The draft MUST NOT become committed ticket history until the drafting workflow completes and Cycle
creates the final commit.

### 10.3 Draft Commit

Completing a draft issue MUST produce one Cycle commit containing:

- issue Markdown
- issue frontmatter
- initial linked records
- drafting execution report when an agent was used
- relevant provenance
- links to parent or child issues when applicable

The commit message SHOULD be human readable, for example:

```text
Robert Pitt created issue <issue-id>: <title>
```

### 10.4 Manual Edits

Manual issue edits MUST use an explicit commit/save action in the issue edit area. Cycle MUST NOT
commit every keystroke or field change.

Each committed manual edit SHOULD produce one human-readable Cycle commit.

### 10.5 Standard Commit Messages

Cycle SHOULD use standardized, human-readable commit messages for common actions, such as:

- created issue
- updated issue
- marked issue ready
- started implementation
- added execution report
- moved issue to review
- marked issue done
- resolved issue conflict

The exact commit message templates are implementation-defined.

## 11. Planning And Execution Rules

### 11.1 Planning

Tickets MAY skip agent planning and go directly to execution when a user has already provided a
sufficient plan.

The `Ready` state means the plan and required sign-offs are complete. Implementation agents SHOULD
only start work on issues in `Ready` unless the user explicitly overrides the workflow.

### 11.2 Plan Immutability

Once implementation starts, the accepted plan MUST become immutable while the issue remains `In
Progress`.

Cycle MUST reject changes to the accepted plan during active implementation. To change the plan, the
user MUST stop or block the execution, transition the issue to a reviewable state such as `Needs
Review`, and commit the plan change before implementation resumes.

The exact boundary between immutable plan sections and editable note sections is
implementation-defined, but the default template SHOULD treat Acceptance Criteria, Implementation
Plan, Risks, and Test Plan as protected during implementation.

### 11.3 Worktrees

Any agent job that can modify repository files MUST run in an isolated Git worktree. Cycle MUST
record the worktree path and branch name in the execution record.

Cycle SHOULD allow drafting jobs to run without a dedicated implementation worktree when they only
read repository context and write Cycle draft data.

Cycle SHOULD create one isolated worktree per implementation execution attempt. Reusing a stopped or
blocked worktree is implementation-defined and MUST be visible in the execution record.

### 11.4 Completion Artifacts

An implementation execution MUST record:

- diff summary
- test results
- review notes when available
- final agent report
- linked execution record

Cycle SHOULD also record branch names, worktree paths, and commit references when available.

When implementation completes successfully, Cycle SHOULD move the issue to `In Review`, not `Done`.

## 12. Agent Provider Contract

### 12.1 Provider Model

Cycle v1 agents are local CLI-driven providers. Cycle MUST define an agent provider interface that
can support multiple providers such as Codex, Claude Code, and OpenCode.

### 12.2 Job Types

Agent providers MUST be able to declare support for these job types:

- `draft_issue`
- `expand_issue`
- `split_issue`
- `implement_issue`
- `review_implementation`

### 12.3 Minimum Provider Capabilities

An agent provider SHOULD expose:

- provider name
- executable path
- version check
- supported job types
- supported working-directory mode
- command invocation contract
- streamed output support
- exit status
- artifact capture behavior

The exact CLI prompt and structured-output format is implementation-defined per provider.

### 12.4 Agent Questions And Failures

If an agent asks a question, cannot proceed, fails, times out, hits a merge/worktree problem, or
reports blocked state, Cycle MUST move the issue to `Needs Review` and record a linked execution or
review record.

Cycle MUST preserve enough context for the user to understand why attention is required.

## 13. Workflow Configuration

### 13.1 Repository Workflow File

Cycle MAY support a repository-level `CYCLE_WORKFLOW.md` file. This file can override default issue
templates, planning instructions, agent permissions, review requirements, and project conventions.

The location and precedence of `CYCLE_WORKFLOW.md` is implementation-defined. The default SHOULD be
the repository worktree root so it can be versioned with source code.

### 13.2 Workflow Scope

Workflow rules MAY apply globally to the repository, by issue type, by label, or by path/module. The
matching model is implementation-defined.

### 13.3 Agent Safety Policy

Workflow configuration SHOULD describe what agent executions are allowed to do, including:

- create worktrees
- edit files
- install packages
- run test commands
- run shell commands
- access network resources
- create commits

The default workflow SHOULD instruct agents to read repository documentation such as `README.md` and
project agent instructions before planning or implementation.

## 14. Views And User Experience

### 14.1 Main App Layout

After onboarding, Cycle MUST show a Local Workspace app shell with a repository sidebar and main
content area.

When no repositories are configured, the main content MUST show an empty state that lets the user
add a repository.

When a repository is added, the sidebar SHOULD show it as a collapsible item with repository views.

### 14.2 Repository Views

Cycle MUST provide issue views for a repository. The issue list SHOULD group by status by default in
a Linear-inspired layout.

Cycle SHOULD support a list view and a board/Kanban view toggle.

Cycle MAY support grouping by assignee, priority, label, epic, repository, or updated date.

### 14.3 Issue Detail

The issue detail view SHOULD include:

- issue title
- status
- priority
- labels
- assignee
- Markdown body
- linked issues and epics
- execution records
- branch, worktree, and commit metadata
- comments or activity records
- history timeline
- agent actions

UI forms SHOULD own frontmatter editing. The Markdown editor SHOULD own body content editing.

### 14.4 History

Cycle MUST expose committed issue history as a first-class feature. Users SHOULD be able to view
changes to an issue over time and inspect diffs between committed versions.

## 15. Sync And Conflict Behavior

### 15.1 Explicit Cycle Ref Sync

Cycle sync MUST use explicit fetch and push operations for Cycle database refs. Normal `git push`
and `git pull` MUST NOT be assumed to sync Cycle data.

### 15.2 Background Sync

For repositories with remotes, Cycle SHOULD:

- fetch Cycle refs periodically while the repository is active
- push local Cycle refs after each committed Cycle transaction
- sync when switching between repositories when the last sync is stale
- expose a manual Local Sync action in the repository area
- back off after sync failures
- surface sync status in the UI

The default automatic sync interval SHOULD be no more frequent than once per minute unless the user
manually requests sync.

### 15.3 No Remote Mode

Repositories without remotes MUST remain fully usable locally. Cycle MUST surface that sync is
disabled or unavailable, but no remote MUST NOT block issue creation, editing, drafting, execution,
or history.

### 15.4 Conflicts

Cycle SHOULD auto-merge issue Markdown and frontmatter when it can do so safely.

If Cycle cannot safely reconcile divergent edits, it MUST move the affected issue or repository sync
state to `Needs Review` and preserve both versions for review. Cycle SHOULD avoid exposing low-level
Git conflict resolution as the primary user workflow.

## 16. External Ticket Imports

Cycle MAY support external task manager imports. Imported tickets MUST become local Cycle issues or
linked local records before agent planning or execution proceeds.

External integrations SHOULD be read-only in v1. The spec MUST leave room for future two-way sync of
status, comments, plans, and links, but Cycle v1 MUST NOT require it.

Imported records MUST preserve external source metadata and links. External source content SHOULD be
treated as untrusted input until normalized.

## 17. Failure Model And Recovery

Cycle MUST distinguish these failure classes:

- repository initialization failure
- repository validation failure
- Cycle database initialization failure
- draft persistence failure
- commit failure
- sync fetch failure
- sync push failure
- conflict or divergence requiring review
- agent provider unavailable
- agent provider error
- agent timeout
- agent question or blocked state
- worktree creation failure
- test failure
- implementation review failure

Failures that affect a specific issue SHOULD move the issue to `Needs Review` when human attention
is required.

Failures that affect repository health or sync SHOULD be visible in repository-level status.

Cycle MUST preserve durable committed data across app restart. Durable draft sessions SHOULD survive
app restart because they are stored in the repository's Cycle draft namespace.

## 18. Security And Operational Safety

Cycle ticket content and metadata have the same effective security level as the Git repository that
stores them. If the repository is public and Cycle refs are pushed to a public remote, ticket content
and metadata should be considered public.

Cycle and agents MUST NOT store secrets, credentials, private tokens, or raw sensitive payloads in
issue documents, provenance records, execution records, logs, or commit messages.

Agent command execution is a trust boundary. Cycle MUST make agent provider availability and
execution state visible to the user. Workflow configuration SHOULD define allowed command behavior.

Cycle MUST NOT overwrite repository or Cycle database state during initialization, sync, draft
commit, or conflict handling without an explicit user action or a documented safe automatic policy.

## 19. Observability

Cycle SHOULD expose user-visible status for:

- repository initialization
- Cycle database health
- active draft sessions
- active agent executions
- worktree creation
- last sync time
- sync in progress
- sync failure and backoff
- conflicts requiring review

Cycle SHOULD record structured internal logs for:

- repository open and initialization
- draft creation and commit
- issue status transitions
- agent provider detection
- agent execution start and completion
- worktree lifecycle
- sync fetch and push
- conflict detection

Logs MUST redact secrets and credentials.

## 20. Reference Workflows

### 20.1 First Launch

```text
open app
if onboarding incomplete:
  collect name, email, theme
  detect local agent providers
  store app-level settings
show Local Workspace
if no repositories:
  show add-repository empty state
```

### 20.2 Add Repository

```text
user selects folder
if no .git:
  ask user to initialize Git
  if accepted: run git init
  else: stop
if no Cycle database:
  ask user to initialize Cycle database
  if accepted: initialize and commit Cycle database
  else: stop
add repository to Local Workspace config
open repository issue view
```

### 20.3 Agent Draft Issue

```text
user opens quick input
user enters request or report
create draft session in Cycle draft namespace
run draft_issue provider job
write draft issue markdown and linked draft records
run feedback or QA stage when configured
when complete:
  commit issue markdown, frontmatter, linked records, and provenance
  remove or mark draft session complete
  push Cycle refs if sync is enabled
```

### 20.4 Agent Implement Issue

```text
user marks issue Ready
user starts implementation
create isolated worktree and branch
move issue to In Progress
protect accepted plan fields
run implement_issue provider job
record output, diff summary, tests, report, and commit refs
if success:
  move issue to In Review
else:
  move issue to Needs Review
commit execution record and status transition
push Cycle refs if sync is enabled
```

## 21. Validation Matrix

| Area              | Requirement                                                               | Validation                   |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------- |
| Onboarding        | Name, email, theme, and agent detection are handled before full agent use | Onboarding tests             |
| App config        | Global identity and repo list are stored outside repo data                | Config tests                 |
| Repo storage      | Repository ticket data is stored in that repo's `.git` database           | Repository integration tests |
| Empty state       | No repositories shows add-repository UI                                   | UI tests                     |
| Initialization    | Missing Git and missing Cycle DB paths prompt before init                 | Repository lifecycle tests   |
| Issue model       | Issues are Markdown documents with required frontmatter                   | Schema/parser tests          |
| IDs               | Issue IDs are locally generated and collision-resistant                   | ID generation tests          |
| Drafts            | Multiple durable draft sessions can exist per repo                        | Draft manager tests          |
| Commits           | Completed drafts and explicit edits create human-readable Cycle commits   | Commit/history tests         |
| History           | Issue diffs can be viewed across committed versions                       | History tests                |
| Plan immutability | Accepted plan cannot change during active implementation                  | Workflow tests               |
| Worktrees         | File-mutating agent jobs use isolated worktrees                           | Agent/worktree tests         |
| Agent failures    | Agent questions or failures move issue to Needs Review                    | Agent lifecycle tests        |
| Sync              | Cycle refs fetch/push explicitly and surface status                       | Sync integration tests       |
| Conflicts         | Unsafe merges move affected issue to Needs Review                         | Conflict tests               |
| Security          | Secrets are redacted from logs/provenance                                 | Redaction tests              |

## 22. Definition Of Done

Cycle v1 conforms to this specification when:

- onboarding creates an app-level profile with name, email, theme, and agent detection state
- users can add local folders and initialize Git or Cycle databases after confirmation
- each repository stores its own Cycle data in its own `.git` directory
- issue creation produces Markdown documents with required frontmatter
- multiple draft tickets can be created concurrently and committed independently
- issue edits require explicit commit/save action
- committed issue history can be inspected through the app
- issues move through the default workflow states
- implementation agents run in isolated worktrees
- execution records capture diffs, tests, review notes, reports, and code references
- agent failures, questions, and blocked states move tickets to `Needs Review`
- repositories with remotes can explicitly fetch and push Cycle refs
- repositories without remotes remain fully usable offline
- persistent ticket data, indexes, records, and history are not stored outside the repository's Git
  database

## 23. Implementation-Defined Areas

The implementation MUST document local choices for:

- exact issue ID format
- Markdown frontmatter schema versioning
- linked record storage formats
- draft namespace layout
- Cycle ref names and sync refspecs
- `CYCLE_WORKFLOW.md` location and precedence
- agent provider CLI invocation formats
- structured versus parsed agent output
- worktree location and cleanup behavior
- safe auto-merge rules for issue Markdown and frontmatter
- in-memory index schema and rebuild behavior
- external ticket import adapters

## 24. Open Questions

- Should `CYCLE_WORKFLOW.md` live in the normal repository worktree, inside the Cycle database, or
  both?
- Should workflow configuration use Markdown only, frontmatter plus Markdown, or a separate
  structured file?
- Should stopped or blocked implementation attempts be resumable in the same worktree by default?
- Which agent provider output format should be considered the preferred normalized contract?
