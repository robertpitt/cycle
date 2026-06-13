# Cycle Agent Product PRD

Status: Draft product requirements document

Version: 0.2.0

Date: 2026-06-13

Scope: Product requirements for exposing agents in Cycle Desktop, local API, CLI, MCP surfaces, and
the `@cycle/agents` package. This document does not define final database migrations, transport
schemas, provider command formats, or UI component implementation details.

## 1. Purpose

Cycle should make agents first-class collaborators in a local-first, Git-backed ticket system.
Agents should be visible where humans already work: global conversation, issue detail, comments,
planning, review, implementation, and follow-up creation.

The product goal is not to hide agents behind one-off chat prompts. Cycle should give agents a
durable, auditable way to participate in repository work while preserving human control, repository
ownership, and the GitDB storage model.

Agents in Cycle MUST be able to:

- discuss work in a global chat surface across one or more tagged repositories
- run through `@cycle/agents`, the shared interface for supported local agent harnesses
- draft, expand, clarify, split, and review issues
- receive delegated issue work requests from humans
- respond when mentioned in comments
- implement approved issues in isolated worktrees
- create epics, subtickets, follow-up issues, review notes, execution records, and comments

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when they appear in all capitals.

`Implementation-defined` means the implementation may choose the behavior, but it MUST document the
choice and expose enough information for users, tests, and future implementers to reason about it.

## 3. Source Grounding

This PRD is grounded in:

- `README.md`, which defines Cycle as a local-first, Git-backed ticket system for humans and agents.
- `CYCLE_SPEC.md`, which defines agent drafting, execution records, worktrees, provenance, workflow
  states, provider contracts, human approval, and failure behavior.
- `DESKTOP_PRD.md`, which defines the desktop experience and requires agent delegation metadata and
  execution records to appear in the same issue workflow as human-authored work.
- `LINEAR_FEATURES_PRD.md`, which requires human ownership by default and separate agent delegation.
- `packages/mcp/SPEC.md`, which defines a curated agent-facing MCP tool surface over the local REST
  API.
- Current code, which already includes local agent provider detection for Codex, Claude Code, and
  OpenCode, plus issue, comment, draft, relation, initiative, saved view, and automation usecases.
- The emerging requirement that local agent provider behavior be centralized behind
  `@cycle/agents` instead of being duplicated across desktop, CLI, MCP, or ticket workflow code.

## 4. Product Problem

Agent-assisted development often starts in a detached chat window and ends with lost context:
prompts, plans, assumptions, failures, test results, and final recommendations are separated from
the issue that motivated the work.

Cycle already treats issue history as repository infrastructure. Agents need to use that same
infrastructure rather than operating from transient conversations. The missing product layer is the
way agents are exposed to users: as selectable, mentionable, requestable, auditable collaborators
who can move between conversation, planning, ticket creation, implementation, review, and follow-up
work without becoming part of the ticket system's assignee internals.

## 5. Product Principles

- Agent-visible by default: agent actions SHOULD appear in the same issue, comment, activity, and
  history surfaces that humans use.
- Human accountable by default: humans MUST remain the final approval authority for marking
  agent-produced work done in the default workflow.
- Repository-native outcomes: durable ticket, comment, plan, review, and execution outcomes MUST
  be stored in the relevant repository's Cycle data.
- Global conversation, local durability: global chat MAY coordinate across repositories, but it
  MUST NOT become the durable source of truth for repository work.
- Human-like interaction: agents SHOULD be selectable, mentionable, requestable, and visible through
  avatars, names, statuses, comments, delegation affordances, and work queues, while issue
  assignees remain humans in v1.
- Clear provenance: agents MUST always be distinguishable from humans in persisted records, audit
  trails, and execution history.
- Explicit capability boundaries: Cycle MUST show which agents can draft, review, implement, use
  worktrees, or access repository context.
- Harness abstraction boundary: Cycle product surfaces MUST interact with supported local agent
  tools through `@cycle/agents` rather than hard-coding individual provider command behavior.

## 6. Goals

Cycle Agent v1 MUST:

1. Provide a global agent chat window that can be opened, closed, and used from anywhere in the
   desktop app.
2. Define `@cycle/agents` as the common package interface for supported local agent harnesses.
3. Let users switch the active chat agent between configured harness-backed agent profiles.
4. Let users tag one or more repositories as chat context.
5. Let agents coordinate planning and ticket creation across tagged repositories.
6. Let humans request or delegate issue work to agents for drafting, review, response, splitting,
   epic creation, or implementation while preserving human assignee ownership.
7. Let comments mention humans and agents, and turn an agent mention into a trackable response
   request.
8. Let agents create draft issues, expand existing issues, split issues into subtickets, and build
   epics with child issues.
9. Let agents implement approved issues in isolated Git worktrees.
10. Record agent questions, blockers, output streams, diffs, test results, review notes, final
   reports, and follow-up suggestions as linked records.
11. Preserve agent actions as inspectable Cycle history and syncable repository data when they
    affect repository work.

## 7. Non-Goals

Cycle Agent v1 MUST NOT:

1. Require a hosted Cycle backend, hosted account system, or remote agent service.
2. Require Linear, GitHub Issues, Jira, Slack, or another external work tracker.
3. Treat a global chat transcript as the source of truth for issue state.
4. Store durable repository ticket content only in app-local configuration.
5. Allow agents to mark default-workflow issues `Done` without human approval.
6. Silently execute file-mutating work without an explicit human action or repository workflow
   policy allowing it.
7. Hide provider identity, model/provider metadata, or execution provenance from users.
8. Require full multi-agent autonomous orchestration in v1.
9. Require real-time multiplayer presence, hosted notifications, or organization administration.
10. Require two-way synchronization with external issue trackers.
11. Make agents primary issue assignees in v1.
12. Expose provider-specific CLI contracts directly from issue, comment, chat, or workflow code
    instead of routing through `@cycle/agents`.

## 8. Actors And Concepts

### 8.1 Human

A Human is a person using Cycle. Humans can create, edit, assign, approve, reject, comment, and
start or stop agent work. Humans are the default final approvers.

### 8.2 Agent

An Agent is an automated collaborator backed by an agent profile and a local harness exposed by
`@cycle/agents`. Agents can participate in conversation, comments, issue planning, review, and
implementation according to their capabilities and repository policy.

Agents SHOULD feel similar to humans in the product surface: they have display names, avatars or
initials, availability, profile details, delegation affordances, mention targets, and work queues.
Persisted records MUST still mark their actor type as `agent`.

### 8.3 Agent Provider

An Agent Provider is the local tool or runtime that executes agent work. Cycle currently detects
provider executables for Codex, Claude Code, and OpenCode. Product surfaces MUST NOT invoke
providers directly; providers are exposed through harnesses registered by `@cycle/agents`.

Providers declare capabilities such as:

- `chat`
- `draft_issue`
- `expand_issue`
- `split_issue`
- `plan_epic`
- `comment_response`
- `review_issue`
- `review_implementation`
- `implement_issue`

### 8.4 `@cycle/agents` Package

`@cycle/agents` is the shared Cycle package that provides a provider-neutral interface for local
agent harnesses. It is the boundary between Cycle product workflows and concrete local tools such
as Codex CLI, Claude Code, OpenCode, or future supported harnesses.

`@cycle/agents` MUST provide:

- harness discovery and health metadata
- capability discovery for each supported job type
- provider-neutral configuration schema metadata for app settings
- queue-compatible execution request contracts
- cancellation and status inspection contracts when a harness supports them
- normalized output, result, and failure categories
- MCP attachment or launch metadata when a harness can operate with Cycle MCP in scope

`@cycle/agents` MUST NOT own ticket assignment, ticket workflow transitions, repository storage,
durable Cycle records, or UI state. Those responsibilities remain in the existing Cycle product and
repository domains.

### 8.5 Agent Harness

An Agent Harness is an adapter inside `@cycle/agents` for a concrete local agent tool. A harness
knows how to detect, configure, launch, stream, cancel, and normalize results for that tool while
presenting a common Cycle-facing interface.

Codex CLI is the required first harness for v1. Claude Code, OpenCode, and other local harnesses
MAY be added after the shared interface is stable.

### 8.6 Agent Profile

An Agent Profile is the user-facing identity for an agent. A profile MAY map one-to-one to a
harness, or it MAY represent a configured persona backed by a harness.

Agent profiles SHOULD include:

- stable agent ID
- display name
- provider ID
- harness ID
- executable or provider status
- capability list
- enabled/disabled state
- default repository permissions
- avatar color or image
- optional description

### 8.7 Global Agent Chat

The Global Agent Chat is an app-wide conversation window that can be opened and closed from any
Cycle screen. It supports general conversation, repository context tagging, ticket drafting,
planning, and multi-repository coordination.

### 8.8 Repository Context Set

A Repository Context Set is the ordered set of repositories tagged into a conversation or agent
task. The user SHOULD be able to add or remove repositories before sending a request.

### 8.9 Agent Delegation

Agent Delegation is a request for an agent to perform work on an issue without necessarily making
the agent an issue assignee.

In v1, Cycle MUST preserve a human issue assignee and show agent delegation separately. Future
repository workflow policy MAY allow agents to appear in assignment-like views, but the UI MUST
still distinguish human accountability from automated execution.

### 8.10 Mention Request

A Mention Request is created when a comment tags an agent or human for a response. For agents, the
request can become an agent task after capability and permission checks.

### 8.11 Agent Task

An Agent Task is the lifecycle object for a unit of agent work, such as drafting, replying,
reviewing, splitting, planning an epic, or implementing an issue.

### 8.12 Execution Record

An Execution Record is a linked record that captures an agent or human work attempt. Execution
records for agents SHOULD include provider, job type, stream summary, status, worktree path,
branch, commit references, diff summary, test results, final report, failure reason, and provenance.

## 9. Feature Requirements

### 9.1 Agent Identity And Directory

P0 requirements:

- Cycle MUST show configured and detected agents in onboarding and settings.
- Cycle MUST show provider and harness health for each supported local agent tool.
- Cycle MUST let users enable or disable available harness-backed agent profiles.
- Cycle MUST expose agent profiles wherever delegation or mention selection includes agents.
- Agent profiles MUST show enough metadata for a user to understand which harness will run.
- Disabled or unavailable agents MUST NOT be selectable for new execution tasks.

P1 requirements:

- Users SHOULD be able to rename agent display labels without changing the underlying harness or
  provider.
- Users SHOULD be able to set default agent preferences per repository.
- Cycle SHOULD show an agent's recent activity, delegated work, and failed tasks.

Acceptance criteria:

- A user can distinguish Codex, Claude Code, and OpenCode when more than one is installed.
- A missing provider appears as unavailable without blocking non-agent issue workflows.
- Delegation menus and mention autocomplete show humans and agents with distinct visual treatment.

### 9.2 Global Agent Chat Window

P0 requirements:

- The desktop app MUST provide a global chat window that can be opened and closed from any main
  workspace view.
- The chat window MUST preserve the user's current app context when opened or closed.
- The chat composer MUST include an agent selector.
- Switching agents MUST affect future messages only; previous messages MUST retain their original
  actor metadata.
- The composer MUST support tagging one or more repositories as context.
- The chat MUST show which repositories are currently included before a message is sent.
- The chat MUST support suggested actions returned by the agent, including create draft issue,
  update issue, split issue, create epic, add comment, request review, and start implementation.
- Suggested actions that mutate repository data MUST require explicit human confirmation by
  default.

P1 requirements:

- The chat SHOULD support issue, comment, saved view, and history references in addition to
  repository tags.
- The chat SHOULD support a compact collapsed state that shows active tasks or unread responses.
- The chat SHOULD let users fork a chat result into a repository-scoped issue draft.
- The chat SHOULD show source/context chips for repositories, issues, and comments used in the
  response.

Acceptance criteria:

- A user can open chat, select an agent, tag two repositories, ask for a coordinated plan, and
  receive proposed per-repository issue drafts.
- Closing and reopening the chat does not lose pending suggested actions in the current app session.
- A user can remove a repository from the context set before sending a follow-up.

### 9.3 Multi-Repository Planning

P0 requirements:

- A global chat request MAY include multiple repositories.
- Agents MUST treat each tagged repository as a separate storage and sync boundary.
- When an agent proposes cross-repository work, Cycle MUST present a plan that names the affected
  repositories and proposed issues for each repository.
- Creating tickets from a cross-repository plan MUST commit each issue to the correct repository's
  Cycle data.
- If the plan needs a parent epic, Cycle SHOULD ask the human to choose a primary repository for
  the epic or create separate per-repository epics.
- Cross-repository issue links MUST be explicit references, not hidden chat-only relationships.

P1 requirements:

- Cycle SHOULD provide a cross-repository planning preview before any issues are created.
- Cycle SHOULD detect when a requested cross-repository plan includes repositories that are not
  open, not initialized, unavailable, or out of sync.
- Cycle SHOULD allow partial acceptance of a cross-repository plan.

Acceptance criteria:

- If three tagged repositories are included and only two are ready, Cycle blocks or excludes the
  unavailable repository with a clear reason.
- Accepting a multi-repo plan creates issues only in selected repositories.
- Each created issue contains enough context to stand alone inside its repository.

### 9.4 Human Assignment And Agent Delegation

P0 requirements:

- Users MUST be able to delegate an issue to an agent for a specific job type.
- Supported v1 delegation job types MUST include draft, expand, split, plan epic, comment response,
  review, and implementation.
- Delegation MUST create a trackable Agent Task linked to the issue.
- Cycle MUST NOT set an agent as the issue assignee in v1.
- Agent delegation MUST preserve the human issue assignee by default.
- Issue views MUST show active, blocked, failed, and completed agent delegations.
- A delegated implementation task MUST require the issue to be `Ready` unless the user explicitly
  overrides the workflow.

P1 requirements:

- Issue lists SHOULD support filtering and grouping by agent delegation state.
- Saved views SHOULD include default queues for "Delegated to agents", "Needs agent response",
  "Agent blocked", and "Ready for review".
- Bulk delegation MAY be supported for review or planning tasks after single-issue delegation is
  stable.

Acceptance criteria:

- A human can delegate an issue to an agent for review without changing the human assignee.
- The issue detail shows who delegated the task, which agent is responsible, and the current task
  state.
- A failed delegation leaves the issue in a human-actionable state with failure context.

### 9.5 Comment Mentions And Responses

P0 requirements:

- Comments MUST support mention autocomplete for humans and agents.
- Mentioning an agent in a comment SHOULD create a Mention Request linked to the comment and issue.
- Agent mention requests MUST show the requested action as "respond" unless the comment explicitly
  requests another supported job type.
- Agent responses MUST be written as comments or linked records on the issue.
- If an agent needs more information, it MUST respond with a question and the issue SHOULD move to
  `Needs Review` when human attention is required.
- Agents MUST NOT modify source files in response to a comment mention unless the user explicitly
  starts an implementation task or repository policy allows the specific action.

P1 requirements:

- Comment mentions SHOULD support requesting a response from a specific agent from the mention
  menu.
- Humans SHOULD receive in-app notification indicators when mentioned by an agent.
- Agents SHOULD be able to cite issue context and relevant repository references in their replies.

Acceptance criteria:

- A user can comment `@Codex please check whether this needs a migration`, and Cycle creates a
  response task rather than immediately starting implementation.
- The agent reply appears in the issue activity with agent provenance.
- If the provider is unavailable, the mention request remains visible with an unavailable-provider
  status.

### 9.6 Drafting, Expansion, And Clarification

P0 requirements:

- Agents MUST be able to draft a new issue from global chat or repository context.
- Agent-created issue drafts MUST remain drafts until a human accepts them.
- Agents MUST be able to expand an existing issue by proposing changes to the Markdown body and
  frontmatter.
- Agent issue expansion MUST present a preview before committing changes.
- Agents SHOULD identify missing acceptance criteria, risks, test plan gaps, and ambiguous scope.
- Agents MAY ask clarifying questions instead of producing a draft.

P1 requirements:

- Agents SHOULD support repository-specific templates when drafting issues.
- Agents SHOULD run a lightweight review pass on their own draft before presenting it.
- Users SHOULD be able to request changes to an agent draft and keep the same draft session.

Acceptance criteria:

- A drafted issue includes problem, context, acceptance criteria, implementation plan, risks, test
  plan, and agent notes when enough information is available.
- Accepting a draft creates a committed Cycle issue with provenance and a drafting execution record.
- Rejecting a draft does not create committed ticket history.

### 9.7 Splitting Issues, Epics, And Subtickets

P0 requirements:

- Agents MUST be able to propose splitting an issue into subtickets.
- Agents MUST be able to propose converting a large issue into an epic with child issues.
- Proposed child issues MUST include repository, title, body, labels, priority, parent, and
  acceptance criteria where available.
- Split and epic proposals MUST be reviewable before any issue is created or updated.
- Accepted child issues MUST be linked to the parent issue or epic.

P1 requirements:

- Agents SHOULD detect dependencies between proposed child issues and create blocking relations
  when accepted.
- Agents SHOULD preserve original issue context and explain why each split exists.
- Agents SHOULD support partial acceptance, allowing a user to accept some subtickets and discard
  others.

Acceptance criteria:

- A user can ask an agent to break an issue into subtickets and approve only selected items.
- Accepted subtickets are created in the right repository with parent links.
- The original issue receives a linked record summarizing the split decision.

### 9.8 Implementation And Worktree Execution

P0 requirements:

- Agent implementation MUST require an explicit human start action.
- File-mutating implementation MUST run in an isolated Git worktree.
- Cycle MUST record worktree path, branch name, harness, provider, start time, completion time,
  status, and final report in an execution record.
- Cycle MUST stream or periodically append meaningful agent output into linked execution records.
- Successful implementation SHOULD move the issue to `In Review`, not `Done`.
- Failed, blocked, timed-out, or question-producing implementation MUST leave the issue in `Needs
  Review` or another human-actionable review state.
- Cycle MUST capture diff summary and test results when available.

P1 requirements:

- Users SHOULD be able to cancel a running implementation task.
- Users SHOULD be able to retry a failed task with the same or a different agent.
- Users SHOULD be able to create follow-up issues from agent final reports or review comments.
- Cycle SHOULD warn before starting implementation if the accepted plan is missing or stale.

Acceptance criteria:

- Starting implementation on a non-ready issue is blocked unless the user explicitly overrides.
- A completed implementation shows diff summary, tests, branch/worktree details, and final report.
- Human approval is required before the issue is marked `Done`.

### 9.9 Agent Review

P0 requirements:

- Humans MUST be able to request agent review of an issue or implementation output.
- Agent review MUST create a review task and linked review record.
- Agent review MUST NOT be the default final approval gate.
- Review records SHOULD include findings, severity, affected files or issue sections, confidence,
  and recommended next action.
- Agent review MAY create proposed comments or follow-up issue drafts.

P1 requirements:

- Review agents SHOULD be able to compare current output against accepted plan and acceptance
  criteria.
- Review agents SHOULD distinguish blocking findings from suggestions.
- Users SHOULD be able to mark review findings as accepted, dismissed, or converted to follow-up.

Acceptance criteria:

- A user can request an agent review after implementation and see findings in issue activity.
- A review with blocking findings keeps the issue out of `Done`.
- Dismissing or accepting findings is recorded as human activity.

### 9.10 Agent Work Queues And Notifications

P0 requirements:

- Cycle MUST expose active and blocked agent tasks in issue detail.
- Cycle SHOULD expose a workspace-level view of active agent tasks.
- Agent questions and blocked states MUST be visible without inspecting logs.
- Users MUST be able to navigate from an agent task to its issue, comment, execution record, or
  chat context.

P1 requirements:

- Cycle SHOULD provide saved views for agent-blocked issues, agent-in-progress issues, and issues
  waiting for human review.
- Cycle SHOULD show collapsed global chat indicators for unread agent responses or active tasks.
- Cycle MAY provide local desktop notifications for completed or blocked tasks.

Acceptance criteria:

- A blocked agent task is discoverable from the issue and from a workspace-level queue.
- Clicking a blocked task opens the relevant issue or chat context.

### 9.11 `@cycle/agents` Configuration And Provider Health

P0 requirements:

- `@cycle/agents` MUST be the product-facing interface for local agent harness discovery,
  capability discovery, configuration metadata, launch metadata, health status, and normalized
  failure categories.
- Cycle MUST detect supported local provider executables through `@cycle/agents`.
- `@cycle/agents` MUST include a Codex CLI harness for the first implementation pass.
- Cycle MUST show provider and harness availability during onboarding and settings.
- App-level settings MUST let users configure which harness-backed agents are available.
- App-level settings SHOULD let users configure default options for each enabled agent profile
  using schema metadata exposed by `@cycle/agents`.
- Cycle MUST allow issue management without available providers.
- Agent actions MUST be disabled or explain unavailable state when no capable provider is enabled.
- Provider failures MUST be normalized into user-facing failure categories.
- Provider-specific CLI arguments, prompts, process details, and result parsing MUST NOT leak into
  ticket domain code or issue assignment logic.

P1 requirements:

- Cycle SHOULD support provider health checks beyond executable detection, including version and
  basic invocation checks.
- Cycle SHOULD show provider capabilities and unsupported job types.
- Cycle SHOULD let repositories define default preferred agents for drafting, review, and
  implementation.
- `@cycle/agents` SHOULD support additional local harnesses after the Codex CLI harness contract is
  stable.

Acceptance criteria:

- If Codex is available and Claude Code is missing, only Codex can be selected for compatible jobs.
- A provider that fails a health check is visible as degraded and cannot silently start new work.
- Adding a new supported harness does not require changing issue, comment, or workflow domain
  logic.

### 9.12 MCP, CLI, And External Agent Access

P0 requirements:

- Cycle-started local agent work MUST use `@cycle/agents` harness contracts.
- The first implementation pass MUST support Codex CLI running with Cycle MCP in scope.
- External agents using MCP MUST interact with Cycle through the local REST API, not by mounting
  GitDB directly.
- MCP tool calls MUST require explicit repository and issue context.
- MCP write tools MUST produce the same usecase, history, and provenance behavior as desktop
  actions.
- CLI and MCP surfaces SHOULD expose issue read, update, transition, comments, history, and
  relations before broader agent orchestration.

P1 requirements:

- MCP SHOULD expose agent-specific tools only after the corresponding usecases and safety policies
  exist.
- MCP SHOULD include source metadata so Cycle can record `mcp` as the request source.
- CLI MAY expose agent task inspection and cancellation commands.

Acceptance criteria:

- An MCP client can add a comment or transition an issue and the result appears in desktop history.
- MCP cannot infer repository context implicitly for a write operation.

## 10. Domain Requirements

This section describes product-level domain requirements. Final schemas belong in implementation
specifications.

### 10.1 Agent Profile

Agent profiles SHOULD include:

- `id`
- `type: "agent"`
- `displayName`
- `harnessId`
- `harnessName`
- `providerId`
- `providerName`
- `status: "available" | "missing" | "degraded" | "disabled"`
- `capabilities`
- `defaultOptions`
- `configurationSource`
- `createdAt`
- `updatedAt`
- `lastSeenAt`
- `metadata`

### 10.2 Agent Harness

Agent harness metadata SHOULD include:

- `id`
- `packageName: "@cycle/agents"`
- `packageVersion`
- `providerId`
- `providerName`
- `displayName`
- `executableName`
- `executablePath`
- `status: "available" | "missing" | "degraded" | "disabled"`
- `capabilities`
- `supportedJobTypes`
- `supportsMcp`
- `supportsStreaming`
- `supportsCancellation`
- `configurationSchema`
- `health`
- `lastCheckedAt`
- `metadata`

Harness metadata MAY be app-local, but any repository-visible agent output MUST preserve enough
`agentId`, `harnessId`, and `providerId` provenance for later audit.

### 10.3 Global Conversation

Global conversations SHOULD include:

- `id`
- `title`
- `createdAt`
- `updatedAt`
- `createdBy`
- `participants`
- `activeAgentId`
- `taggedRepositoryIds`
- `referencedIssueIds`
- `messages`
- `suggestedActions`
- `retention`

Global conversation storage is implementation-defined, but durable repository outcomes MUST be
committed to repository-scoped Cycle data.

### 10.4 Conversation Message

Conversation messages SHOULD include:

- `id`
- `conversationId`
- `createdAt`
- `actor`
- `body`
- `repositoryContext`
- `issueReferences`
- `attachments`
- `sourceSummary`
- `redactionStatus`

Messages MUST distinguish human and agent actors.

### 10.5 Agent Task

Agent tasks SHOULD include:

- `id`
- `repositoryIds`
- `issueId`
- `commentId`
- `conversationId`
- `agentId`
- `harnessId`
- `providerId`
- `jobType`
- `status`
- `queueId`
- `requestedAction`
- `requestedBy`
- `requestedAt`
- `startedAt`
- `completedAt`
- `approvalRequired`
- `failure`
- `resultRecordIds`

### 10.6 Mention Request

Mention requests SHOULD include:

- `id`
- `repositoryId`
- `issueId`
- `commentId`
- `targetActorId`
- `targetActorType`
- `requestedAction`
- `status`
- `createdAt`
- `resolvedAt`
- `resultRecordId`

### 10.7 Execution Record

Execution records SHOULD extend existing linked record behavior with:

- `executionId`
- `agentTaskId`
- `jobType`
- `agentId`
- `harnessId`
- `agentPackageVersion`
- `providerName`
- `providerVersion`
- `startedAt`
- `completedAt`
- `status`
- `worktreePath`
- `branchName`
- `commitReferences`
- `diffSummary`
- `testResults`
- `commandsRun`
- `reviewNotes`
- `finalReport`
- `failureReason`
- `provenance`

### 10.8 Suggested Action

Suggested actions SHOULD include:

- `id`
- `conversationId` or `agentTaskId`
- `actionType`
- `repositoryId`
- `issueId`
- `preview`
- `status: "proposed" | "accepted" | "rejected" | "applied" | "failed"`
- `requiresConfirmation`
- `createdBy`
- `createdAt`

Suggested actions MUST be idempotent or safely reject duplicate application.

## 11. State Models

### 11.1 Agent Task States

Agent tasks MUST support at least:

- `requested`
- `queued`
- `running`
- `waiting-for-human`
- `blocked`
- `failed`
- `completed`
- `canceled`

Transitions:

- `requested` MAY transition to `queued`, `running`, `canceled`, or `failed`.
- `queued` MAY transition to `running`, `canceled`, or `failed`.
- `running` MAY transition to `waiting-for-human`, `blocked`, `failed`, `completed`, or `canceled`.
- `waiting-for-human` MAY transition to `queued`, `running`, `completed`, or `canceled`.
- `blocked` MAY transition to `queued`, `running`, `failed`, or `canceled`.
- `failed`, `completed`, and `canceled` are terminal for that task attempt.

Retrying a terminal task MUST create a new task attempt or clearly preserve attempt history.

### 11.2 Suggested Action States

Suggested actions MUST support:

- `proposed`
- `accepted`
- `rejected`
- `applied`
- `failed`

Only humans SHOULD accept suggested actions by default.

### 11.3 Issue Workflow Interaction

Agent task state SHOULD influence issue status:

- Drafting does not require issue status changes until a draft is accepted.
- Implementation SHOULD start from `Ready`.
- Active implementation SHOULD move the issue to `In Progress`.
- Successful implementation SHOULD move the issue to `In Review`.
- Agent questions, blocked states, provider failures, worktree failures, or test failures SHOULD
  move the issue to `Needs Review`.
- Humans MUST approve before `Done`.

## 12. Storage And Sync Requirements

- Repository ticket content, comments, linked records, execution records, review records, and
  accepted agent output MUST be stored in the relevant repository's Cycle data.
- App-local state MAY store enabled providers, agent profile preferences, global chat UI state,
  local-only conversation drafts, harness configuration, local queue state, and transient task UI
  state.
- App-local state MUST NOT be the only durable copy of repository issue content.
- Agent harness configuration MUST NOT be embedded directly into issue documents, issue assignee
  fields, or workflow state.
- If a global chat produces repository work, the accepted result MUST be committed to each target
  repository before it is treated as durable work.
- Cross-repository plans MUST degrade gracefully when some repositories are unavailable or out of
  sync.
- Sync conflicts involving agent-created records MUST follow the same conflict and `Needs Review`
  behavior as human-created records.

## 13. Permissions, Safety, And Human Control

- Agents MUST run within explicit repository context.
- Agents MUST NOT receive hidden repository context that the user did not tag or that workflow
  policy does not allow.
- Agent command execution through `@cycle/agents` is a trust boundary and MUST be visible to the
  user.
- File-mutating work MUST use isolated worktrees.
- Destructive, externally visible, or source-mutating actions MUST require explicit human action by
  default.
- Agents MUST NOT store secrets, credentials, private tokens, or raw sensitive payloads in issue
  documents, comments, provenance, logs, or execution records.
- Provider output SHOULD be redacted before persistence when secret-like values are detected.
- Repository workflow configuration SHOULD define whether agents can install packages, run tests,
  access network resources, create commits, or push branches.
- A human MUST be able to cancel running agent work when the provider supports cancellation.

## 14. Observability And Audit

Cycle MUST make agent activity inspectable through:

- issue activity records
- execution records
- comments
- history commits
- repository status
- active task queue
- harness and provider health state
- global chat pending actions

Structured logs SHOULD include:

- task ID
- harness ID
- provider ID
- `@cycle/agents` package version when available
- repository ID
- issue ID
- job type
- started/completed timestamps
- failure class
- worktree path where applicable
- request source

Logs and persisted records MUST redact secrets.

## 15. Failure Handling

Cycle MUST distinguish these agent failure classes:

- harness unavailable
- invalid harness configuration
- provider unavailable
- provider degraded
- unsupported job type
- invalid repository context
- missing issue context
- permission denied by workflow policy
- user cancellation
- timeout
- provider error
- provider asked a question
- worktree creation failure
- command/test failure
- sync conflict
- output parsing failure
- suggested action application failure

Failures tied to an issue SHOULD create a linked record with a human-readable summary. Failures
that require human action SHOULD move the issue or task to a visible review state.

## 16. Delivery Sequence

### P0: First Agent Collaboration Loop

- `@cycle/agents` package with a shared harness interface and Codex CLI harness.
- Agent directory plus harness and provider health in settings.
- Global chat window with agent selector and repository tagging.
- Agent suggested actions for draft issue and add comment.
- Agent delegation for draft, review, comment response, split, and plan epic.
- Mention requests for agent comments.
- Linked records for agent task results and failures.
- Issue detail surfaces for active, blocked, failed, and completed agent tasks.

### P1: Implementation And Review Loop

- Human plan acceptance before implementation.
- Isolated worktree creation and cleanup.
- Streaming execution output into execution records.
- Diff summary, test result, command capture, and final report.
- Agent review records and follow-up issue creation.
- Workspace-level agent task queue and saved views.
- Additional local harness adapters after the Codex CLI contract is stable.

### P2: Coordination And Automation Polish

- Rich cross-repository planning previews.
- Partial acceptance of multi-repository issue plans.
- Agent-specific saved views, notifications, and retry controls.
- Harness and provider capability configuration through `@cycle/agents`.
- MCP tools for agent task orchestration after usecase safety policies exist.

## 17. Acceptance Criteria

The agent product surface is ready for v1 validation when:

- A user can open global chat, select an agent, tag repositories, and receive proposed issue drafts.
- A user can configure available harness-backed agents and defaults in app-level settings.
- A user can accept a proposed issue draft and see it committed to the correct repository.
- A user can delegate an existing issue to an agent for review without losing human ownership.
- A comment can mention an agent and produce a visible response task.
- Agent responses appear as issue comments or linked records with agent provenance.
- A large issue can be converted into an epic/subticket proposal and partially accepted.
- An implementation task can run in an isolated worktree and produce an execution record.
- Successful implementation moves to review, not done.
- Agent questions, blockers, and failures are visible from issue detail and an agent task queue.
- Provider unavailable states disable actions without blocking ordinary issue management.

## 18. Validation Matrix

| Area | Requirement | Validation |
| --- | --- | --- |
| Agent package | Local harnesses are exposed through `@cycle/agents` | Package contract tests |
| Provider detection | Available and missing providers are visible | Desktop settings/onboarding tests |
| Agent identity | Agents appear in delegation and mention pickers | UI and contract tests |
| Global chat | User can switch agents and tag repositories | Desktop interaction tests |
| Suggested actions | Mutating actions require confirmation | Usecase/UI tests |
| Repository storage | Accepted issue/comment output writes to repo Cycle data | Database integration tests |
| Multi-repo planning | Per-repo tickets land in correct repositories | Integration tests |
| Delegation | Agent tasks link to issues without erasing human owner | Usecase tests |
| Mentions | Agent comment mentions create response tasks | Comment workflow tests |
| Drafting | Agent drafts require human acceptance | Draft workflow tests |
| Splitting | Accepted subtickets link to parent/epic | Issue relation tests |
| Implementation | File-mutating work uses worktrees | Worktree integration tests |
| Review | Agent review does not mark work done | Workflow policy tests |
| Failures | Blocks and questions move to reviewable states | Agent lifecycle tests |
| Audit | Agent records include provenance and redact secrets | History/redaction tests |
| MCP | Agent-facing tools require repository and issue context | MCP tests |

## 19. Draft Assumptions And Open Questions

Assumptions in this draft:

- Agents are separate delegates by default, while humans remain accountable owners.
- Global chat history is app-local or session-local, and durable repository outcomes are committed
  into repository-scoped Cycle data.
- Cross-repository epics require either a human-selected primary repository or separate per-repo
  epics for v1.
- `@cycle/agents` is the product-facing boundary for local harnesses.
- Codex CLI is the first supported harness for v1; additional harnesses follow after the interface
  is stable.

Open questions:

1. Should a future version ever allow an agent to be the primary issue assignee, or should agent
   work always remain a separate delegation field?
2. Should global chat transcripts persist across app restarts, and if so, what is the redaction and
   retention policy?
3. Should cross-repository plans eventually have a durable workspace-level object, or should Cycle
   continue representing them as linked per-repository issues?
4. Which local harnesses beyond Codex CLI should be considered certified v1-compatible versus
   experimental?
