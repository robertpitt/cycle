# Ticket Agent Implementation Workflow Specification

**Status:** Draft v1.0

**Audience:** Desktop, API, backend, agent runtime, worktree, provider-adapter, and Cycle MCP maintainers

**Scope:** Manual **Start Agent** execution for a repository ticket

**Normative language:** The terms **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described by RFC 2119 and RFC 8174.

## 1. Purpose

This specification defines the complete workflow used when a person selects **Start Agent** on a repository ticket. The workflow MUST deliver an implementation-ready agent, not merely a chat containing a ticket prompt.

At the point the provider begins work:

1. the initiating desktop user MUST be resolved to a stable Cycle user profile and assigned to the ticket;
2. Cycle MUST have created or reused the ticket's implementation worktree and branch;
3. the durable Cycle thread and task MUST be attached to that worktree;
4. the ticket MUST be in `in-progress`;
5. the selected provider session MUST start or resume in the worktree directory;
6. the provider MUST have autonomous implementation permissions, including file writes, commands, tests, and required network access;
7. the job-scoped Cycle MCP server MUST be available from the first provider turn; and
8. the agent MUST be instructed to implement the ticket, not to create its own worktree or reconstruct workflow state.

This specification also defines continuity across provider turns and review cycles, failure compensation, blocker reporting, handover, and eventual worktree cleanup.

## 2. Relationship to Existing Specifications

This specification refines the ticket-implementation portions of:

- `AGENT_WORK_ORCHESTRATION_SPEC_V1.1.md`;
- `AGENT_WORK_RUNTIME_BOUNDARIES_SPEC.md`;
- `CLAUDE_CODE_MULTI_PROVIDER_AGENTS_SPEC.md`; and
- `AGENT_CHAT_RESUME_RECONCILIATION_SPEC.md`.

Where those documents conflict with this specification for a user-initiated **Start Agent** action, this specification is authoritative. In particular:

- manual Start Agent MUST assign the initiating human user to the ticket;
- ticket transition to `in-progress` occurs only after environment and durable task preparation succeeds;
- ticket worktrees are retained through review and until the ticket becomes terminal;
- the same Cycle thread, provider session, provider, and worktree are reused for review feedback; and
- Cycle, not the provider, owns worktree lifecycle and final handover operations.

This document does not change unrelated scheduled-agent, board automation, or read-only conversational workflows.

## 3. Problem Statement

The current implementation has two competing startup paths:

1. the desktop ticket action starts a generic chat over the chat WebSocket and places lifecycle instructions in the prompt; and
2. the backend exposes a durable ticket-agent task path that can prepare a worktree and submit scheduled work.

The generic chat path can create a Cycle conversation without a durable implementation task, implementation authority, stable actor identity, or prepared worktree. It can therefore produce an empty or inactive chat, a provider running read-only, or an agent that tries to assign the ticket and create a worktree itself. Generic chat creation also risks omitting origin/runtime metadata required by the lower runtime.

Separately, retries can reuse an idempotency key with changed task input. That can leave a visible chat while task creation fails with `The idempotency key was already used with different task input.`

Finally, provider continuity can be broken when a follow-up message creates a new provider context, omits the previous transcript, changes working directory, or does not restore the job-scoped MCP configuration. A command such as “close them all” then appears disconnected from the preceding ticket analysis.

The root architectural issue is that provider prompts are being asked to compensate for missing workflow orchestration. Prompts MUST NOT be the source of truth for identity, ticket state, worktree creation, permissions, task identity, or provider-session continuity.

## 4. Goals

The implementation MUST:

1. provide one canonical frontend-to-backend Start Agent command;
2. validate all startup capabilities before mutating the ticket;
3. atomically approximate the cross-system startup workflow through a durable, compensating saga;
4. create or reuse exactly one active implementation context per ticket assignment generation;
5. preserve the Cycle thread, provider-native session, provider selection, and worktree across turns and review feedback;
6. give the implementation provider autonomous write-capable execution in the prepared worktree;
7. make Cycle responsible for ticket assignment, status transitions, worktree lifecycle, final verification, commit, branch publication, push, and handover;
8. make duplicate clicks and transport retries idempotent;
9. keep a blocked implementation visible, recoverable, and attached to its original context;
10. retain the worktree while the ticket is `in-progress`, `needs-review`, or `in-review`; and
11. clean up safely only after the ticket becomes `done` or `canceled`.

## 5. Non-Goals

This version does not:

- create a pull request;
- introduce a ticket-level `blocked` status;
- allow the provider to create, attach, remove, or relocate Git worktrees;
- replace general-purpose read-only Agent Chat;
- redesign every scheduled or automated agent pickup flow;
- permit changing provider or worktree during a review cycle;
- infer a user assignee from a display name alone; or
- guarantee a single database transaction across Git, GitDB, the relational database, and provider processes.

## 6. Required Invariants

The following invariants MUST hold:

### 6.1 Canonical command

The desktop **Start Agent** action MUST call the durable ticket-assignment endpoint. It MUST NOT create a generic WebSocket chat first, and it MUST NOT invoke a second task-creation path after the durable endpoint succeeds.

### 6.2 One implementation context

For a repository ticket and assignment generation, there MUST be at most one non-terminal implementation context. The context owns:

- one durable Cycle thread;
- one selected provider and model policy;
- one provider-session binding per provider;
- one worktree association;
- one branch association; and
- one ordered sequence of implementation executions.

An execution may complete or become blocked without destroying the longer-lived implementation context.

### 6.3 Cycle-owned lifecycle

Only Cycle orchestration services MAY:

- resolve and write the human assignee;
- transition workflow status as part of startup or handover;
- create or remove the implementation worktree;
- select or change the attached worktree;
- finalize the implementation commit;
- publish or push the implementation branch; and
- perform terminal cleanup.

The provider MUST NOT execute `git worktree add`, `git worktree remove`, or equivalent lifecycle commands. The provider MAY use ordinary Git inspection and implementation commands inside the attached worktree, subject to the finalization policy in Section 14.

### 6.4 Worktree-rooted execution

Every implementation turn MUST use the persisted worktree path as its effective working directory. A provider turn MUST fail closed if the worktree cannot be resolved, does not match the persisted association, or is no longer ready.

The primary repository working tree MUST NOT be used as an implicit fallback.

### 6.5 Durable continuity

Every message in an implementation context MUST append to the same Cycle thread. The provider adapter MUST resume the persisted provider-native session when possible. If native resume is unavailable, the adapter MUST reconstruct the turn from the durable Cycle transcript without changing the Cycle thread, provider, worktree, authority, or MCP scope.

### 6.6 No read-only degradation

An implementation task MUST NOT start with conversation-read or repository-read authority. If the selected provider cannot supply the required autonomous implementation capability, startup MUST fail before ticket mutation rather than silently degrading to read-only execution.

### 6.7 Review retention

Moving a ticket to `needs-review` or `in-review` MUST retain the worktree, Cycle thread, provider-session binding, and branch association. Moving the ticket back to `in-progress` MUST resume that same context.

## 7. Domain Model

The schemas in this section MUST be defined in the canonical shared contract package using Effect Schema. API, desktop, backend, scheduler, and provider code MUST import those schemas from their owning package rather than defining parallel TypeScript-only shapes.

### 7.1 TicketImplementationContext

```ts
class TicketImplementationContext extends Schema.Class<TicketImplementationContext>(
  "TicketImplementationContext",
)({
  id: TicketImplementationContextId,
  repositoryId: RepositoryId,
  ticketId: TicketId,
  assignmentGeneration: Schema.Int,
  threadId: AgentThreadId,
  provider: AgentProvider,
  model: Schema.optional(AgentModel),
  worktreeId: WorktreeId,
  worktreePath: Schema.String,
  branchName: Schema.String,
  assignedUserId: UserProfileId,
  state: Schema.Literals(
    "preparing",
    "active",
    "blocked",
    "in-review",
    "terminal-cleanup",
    "closed",
    "startup-failed",
  ),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}
```

`worktreePath` is stored for observability and validation. `worktreeId` is the authoritative relationship. Runtime code MUST resolve the current canonical path from the worktree service and compare it with persisted state before execution.

### 7.2 TicketImplementationExecution

Each initial run, explicit retry, or review-feedback run is a separate execution within the same context.

```ts
class TicketImplementationExecution extends Schema.Class<TicketImplementationExecution>(
  "TicketImplementationExecution",
)({
  id: AgentTaskId,
  contextId: TicketImplementationContextId,
  ordinal: Schema.Int,
  trigger: Schema.Literals("initial-assignment", "review-feedback", "retry"),
  status: Schema.Literals(
    "queued",
    "preparing",
    "running",
    "waiting_for_input",
    "blocked",
    "cancelling",
    "completed",
    "failed",
    "cancelled",
  ),
  idempotencyKey: Schema.String,
  inputDigest: Schema.String,
  blockedReason: Schema.optional(Schema.String),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}
```

`blocked` is a non-running, non-terminal execution state. It MUST release scheduler concurrency. It MAY resume only through an explicit retry, a new user message that addresses the blocker, or a review-feedback action. Resumption MUST retain the same implementation context and MUST create a new ordered execution linked to the blocked execution.

`failed` is reserved for an unrecoverable orchestration or integrity failure where continuing in the existing execution is unsafe. A failed execution does not by itself close the implementation context.

### 7.3 StartupAttempt

Startup is a durable saga with persisted checkpoints:

```ts
const StartupCheckpoint = Schema.Literals(
  "received",
  "preflight-valid",
  "worktree-ready",
  "context-prepared",
  "ticket-assigned",
  "ticket-in-progress",
  "task-released",
  "compensating",
  "accepted",
  "failed",
);
```

The attempt MUST record previous assignee and previous ticket status before mutation, whether the worktree was newly created or reused, the prepared thread/task IDs, error classification, and completed compensation steps.

### 7.4 ProviderSessionBinding

The existing durable binding between Cycle thread and provider-native session remains authoritative. The binding MUST additionally retain or validate:

- implementation context ID;
- provider;
- provider-native session ID;
- worktree ID and canonical cwd;
- authority profile;
- MCP configuration digest; and
- last successfully appended Cycle message sequence.

A mismatch in provider, context, or worktree MUST be treated as an integrity error. It MUST NOT create a new session silently.

### 7.5 Worktree retention

Ticket implementation contexts MUST use a cleanup policy equivalent to:

```ts
{
  _tag: "retain_until",
  condition: "ticket-terminal",
  terminalStatuses: ["done", "canceled"]
}
```

The existing `delete_after_handover` default MUST NOT apply to this workflow.

## 8. Responsibility Boundaries

| Responsibility                |                           Desktop |                       API | Backend orchestration | Worktree service |           Provider adapter |                       Cycle MCP |
| ----------------------------- | --------------------------------: | ------------------------: | --------------------: | ---------------: | -------------------------: | ------------------------------: |
| Capture user intent           |                              Owns |                 Validates |              Receives |                — |                          — |                               — |
| Resolve stable current user   | Sends authenticated actor context | Establishes request actor | Resolves user profile |                — |                          — |      Read-only identity context |
| Idempotency                   |              Generates command ID |                 Validates |  Owns semantic dedupe |                — |                          — |                               — |
| Ticket assignment/status      |                                 — |             Thin boundary |                  Owns |                — |                          — | MUST NOT own startup transition |
| Worktree create/reuse/cleanup |                                 — |                         — |           Coordinates |             Owns |               MUST NOT own |                    MUST NOT own |
| Durable thread/task           |                         Navigates |          Encodes response |                  Owns |                — |       Binds native session |                               — |
| Provider cwd and permissions  |                          Displays |                         — |        Selects policy |    Supplies path |                   Enforces |                               — |
| Implementation/edit/test      |                                 — |                         — |            Supervises |                — |             Owns execution |    Provides scoped ticket tools |
| Commit/push/handover          |                          Displays |                         — |                  Owns |        Finalizes | Supplies structured result | Publishes comment when directed |

HTTP and WebSocket handlers MUST remain thin. The startup saga, compensation, execution supervision, and finalization MUST live below transport in backend services.

## 9. Public API Contract

### 9.1 Start or reuse ticket implementation

The canonical command is:

```http
POST /v1/repositories/:repositoryId/issues/:issueId/agent-tasks
```

Request:

```ts
class StartTicketImplementationRequest extends Schema.Class<StartTicketImplementationRequest>(
  "StartTicketImplementationRequest",
)({
  commandId: Schema.UUID,
  provider: AgentProvider,
  model: Schema.optional(AgentModel),
  agentProfileId: Schema.optional(AgentProfileId),
  instructions: Schema.optional(Schema.String),
}) {}
```

The authenticated/local request context supplies the actor. The request MUST NOT accept an arbitrary `assignedUserId` from the desktop.

Accepted response:

```ts
class StartTicketImplementationAccepted extends Schema.Class<StartTicketImplementationAccepted>(
  "StartTicketImplementationAccepted",
)({
  contextId: TicketImplementationContextId,
  threadId: AgentThreadId,
  taskId: AgentTaskId,
  repositoryId: RepositoryId,
  ticketId: TicketId,
  worktreeId: WorktreeId,
  worktreePath: Schema.String,
  branchName: Schema.String,
  provider: AgentProvider,
  status: Schema.Literals("queued", "preparing", "running"),
  reused: Schema.Boolean,
}) {}
```

The endpoint MUST return success only after the startup saga reaches `task-released`. A `202 Accepted` response means:

- preflight passed;
- the worktree is ready;
- the durable context and held task exist;
- the current user is assigned;
- the ticket is `in-progress`; and
- the task is eligible for scheduler claim.

The provider process need not have emitted its first token before the response.

### 9.2 Actor identity

The API request context MUST include a typed actor identity, not only `requestId`. The API boundary MUST authenticate the local desktop request and resolve its actor metadata to exactly one stable `UserProfileId`.

Resolution MUST use a stable provider/user identity link when available. Email MAY be used as a normalized lookup input but MUST NOT be persisted as the assignee. Display name alone MUST NOT be accepted as an unambiguous identity.

No match or multiple matches MUST fail preflight with a typed `CurrentUserResolutionError`. The desktop SHOULD direct the user to complete or select their profile. No worktree, chat, task, assignment, or status mutation may exist after this failure.

### 9.3 Idempotency

The desktop MUST generate a fresh `commandId` for a new user intent and reuse it only when retrying the exact same HTTP command after an unknown transport result.

The backend MUST persist:

- command ID;
- canonical encoded request;
- input digest;
- resolved ticket and actor;
- resulting context/task/thread IDs; and
- final command result.

Reusing a command ID with different canonical input MUST return a typed `IdempotencyConflict` without creating a chat or task.

Independently of command ID, if the ticket already has a non-terminal implementation context, the endpoint MUST return that context with `reused: true` when provider and worktree continuity are compatible. It MUST NOT create a second thread. A request attempting to change provider, model policy, or worktree while the context is active MUST return a typed conflict explaining that the existing context must be resumed.

If another user invokes Start Agent while an active context belongs to the original initiating user, the backend MUST return the existing context without changing its assignee only when the caller is authorized to observe and resume it. Reassignment or takeover MUST be an explicit future command; it MUST NOT be an incidental consequence of an idempotent Start Agent retry.

Task idempotency keys MUST be derived from immutable execution identity, for example `ticket-implementation:<contextId>:<ordinal>`, and MUST NOT be reused with mutable prompt text. Mutable instructions are stored as messages or execution input associated with that immutable execution.

### 9.4 Errors

The endpoint MUST expose typed errors with stable machine codes, including:

- `CURRENT_USER_NOT_RESOLVED`;
- `TICKET_NOT_IMPLEMENTABLE`;
- `REPOSITORY_NOT_READY`;
- `WORKTREE_PREPARATION_FAILED`;
- `PROVIDER_CAPABILITY_UNAVAILABLE`;
- `MCP_CONFIGURATION_FAILED`;
- `ACTIVE_IMPLEMENTATION_CONFLICT`;
- `IDEMPOTENCY_CONFLICT`;
- `TICKET_MUTATION_FAILED`;
- `STARTUP_COMPENSATION_FAILED`; and
- `STARTUP_INTERNAL_ERROR`.

The desktop MUST render the actionable message and retryability. It MUST NOT navigate to an empty thread when startup fails.

### 9.5 Follow-up and review-feedback input

Messages sent in the linked Chat MUST resolve the Cycle thread to its implementation context before task submission. They MUST use the existing append-input/chat transport with a context-aware backend operation; they MUST NOT invoke generic task creation.

For a context in `active`, a message is appended to the same thread and delivered to the current execution or a new ordered execution as appropriate. For a context in `blocked`, an explicit Retry/Resume action or a message addressing the blocker MUST create a new `retry` execution linked to the blocked execution.

For a context in `in-review`, the first new implementation-directed user message MUST create a `review-feedback` execution and transition the ticket back to `in-progress` before that execution becomes claimable. The transition and execution release MUST use the same held-task and compensation pattern as initial startup, except that the existing context, thread, provider binding, worktree, and assignee are reused.

Moving a ticket from review to `in-progress` without submitting feedback MUST reactivate the context but MUST NOT start an empty provider execution. The next Chat message starts the review-feedback execution.

## 10. Startup Saga

### 10.1 Phase A: receive and deduplicate

The backend MUST decode the request, resolve any existing command result, and check for an active implementation context. Duplicate requests MUST converge on one result.

### 10.2 Phase B: read-only preflight

Before any mutation, the backend MUST validate:

1. the repository and ticket exist and belong together;
2. the ticket is not `done` or `canceled`;
3. the current desktop actor resolves to a stable user profile;
4. the selected provider/model/agent profile is valid;
5. the provider supports autonomous implementation execution;
6. the Cycle MCP configuration can be constructed for the job;
7. the repository root is registered, present, and writable;
8. Git can resolve the base revision and create the required branch/worktree;
9. the scheduler accepts new implementation work; and
10. no incompatible active context exists.

Preflight MUST explicitly test required write capability. Checking that a path exists is insufficient.

### 10.3 Phase C: prepare worktree

The backend requests the worktree service to create or reuse the ticket implementation worktree. The worktree service MUST:

- use a deterministic context association, not an agent-generated path;
- create or resolve the implementation branch;
- avoid the primary working tree;
- return only after worktree status is `ready`;
- persist ownership and cleanup policy; and
- verify the resulting path and Git metadata.

If an existing ready worktree is attached to the active context, it MUST be reused. A different unmanaged path with a similar name MUST NOT be adopted automatically.

### 10.4 Phase D: persist held context and task

The backend MUST durably create the implementation context, Cycle thread, initial ticket message, worktree/thread association, provider selection, provider-session binding placeholder, and initial task in a held `preparing` state.

The thread and task MUST persist `kind = ticket-implementation`, repository/ticket origin, implementation context ID, `runtimeMode = implementation-worktree`, implementation authority, worktree ID/path, provider, and model policy. Transport adapters MUST carry these fields through unchanged; they MUST NOT reconstruct an `AgentChatCreateInput` that drops origin or runtime metadata.

The held task MUST NOT be claimable. This prevents provider execution before ticket assignment and status mutation complete.

The initial thread content MUST include a structured snapshot of the ticket and the implementation assignment. It MUST NOT tell the provider to find the repository, assign a user, transition the ticket, or create a worktree.

### 10.5 Phase E: mutate ticket

The backend MUST assign the initiating stable `UserProfileId` to the ticket and then transition the ticket to `in-progress`. Because the current ticket contract has a single assignee field, this replaces a different previous assignee; the previous value is retained in the saga for compensation. Both mutations MUST use optimistic concurrency or an equivalent expected-version check.

If the ticket is already assigned to that user or already `in-progress`, the operation is idempotently satisfied. The backend MUST preserve the previous values for compensation.

### 10.6 Phase F: release and accept

After the ticket mutations succeed, the backend MUST:

- mark the context `active`;
- release the task to `queued`;
- publish task/thread/worktree events;
- persist `task-released` and `accepted`; and
- return the accepted response.

The desktop MUST then navigate to the returned `threadId` in Chat. It MUST use the server-returned ID rather than a locally fabricated thread ID.

### 10.7 Required ordering

The normative order is:

```text
validate
  -> prepare/reuse worktree
  -> persist held context + thread + task
  -> assign current user
  -> transition ticket to in-progress
  -> release task
  -> redirect to returned thread
```

Changing this order requires a revision to this specification.

## 11. Compensation and Recovery

Git and provider resources cannot participate in the database transaction, so every mutation MUST be replayable and compensatable.

### 11.1 Failure before ticket mutation

If startup fails after creating a new worktree but before assignment begins, the backend MUST:

- cancel the held task;
- mark the context `startup-failed`;
- archive or suppress the empty thread from normal Chat navigation;
- remove the newly created worktree and branch when safe;
- retain pre-existing reused resources; and
- persist the final typed error.

### 11.2 Assignment or transition failure

If assignment succeeds but transition fails, the backend MUST attempt to restore the previous assignee using an expected-version check. It MUST then cancel the held task and clean up newly created resources.

If restoration or cleanup cannot be proven safe, the startup attempt MUST become `STARTUP_COMPENSATION_FAILED`, retain the affected resources, and emit a reconciliation alert. The system MUST NOT hide partial state.

### 11.3 Failure after task release

Once the ticket is assigned and `in-progress`, failure to claim the task, start the provider, restore the provider session, attach MCP, or execute the implementation MUST NOT roll the ticket back automatically.

Instead, the backend MUST:

- move the execution to `blocked`;
- move the implementation context to `blocked`;
- retain the worktree, thread, provider binding, and ticket assignee;
- add one deduplicated blocker comment on the agent's behalf to the ticket; and
- expose Retry/Resume in Chat.

The ticket remains `in-progress`.

### 11.4 Blocker comment

A blocker comment MUST identify:

- that the comment was generated by the implementation workflow;
- the failed stage and stable error code;
- the provider and execution ID;
- worktree path and branch;
- whether files changed;
- commands/tests already run and their outcomes;
- whether any commit or push occurred; and
- the exact human or system action required to resume.

Retries of the same failure MUST update or deduplicate the comment using context/execution/failure identity. They MUST NOT spam the ticket.

### 11.5 Reconciliation

A reconciliation process MUST inspect non-terminal startup attempts and contexts after process restart. It MUST be able to:

- finish safe pending checkpoints;
- compensate unreleased attempts;
- requeue released tasks;
- detect missing or mismatched worktrees;
- validate ticket assignment/status against the saga record; and
- mark ambiguous cases for operator intervention without destructive cleanup.

### 11.6 Timeouts, stale claims, and cancellation

Startup checkpoint deadlines, provider-start deadlines, execution heartbeat timeouts, and bounded automatic retry counts MUST be read through typed `Config`; they MUST NOT be hardcoded in transport handlers.

If a held startup attempt times out, the backend MUST compensate it as a pre-release failure. If a released task exhausts provider-start retries or loses its execution lease without a safe automatic resume, it MUST become blocked under Section 11.3.

Scheduler claims and provider callbacks MUST use fencing tokens or an equivalent generation check so a stale worker cannot append output, finalize, or transition a ticket after its lease has been replaced.

Canceling only the current agent execution MUST set that execution to `cancelled`, retain the implementation context and worktree, keep the ticket `in-progress`, and leave the context resumable. Canceling the ticket by moving it to `canceled` invokes terminal cleanup under Section 15. These are distinct user intents.

## 12. Provider Execution Environment

### 12.1 Authority profile

Ticket implementation uses the Cycle authority profile `implementation-worktree`. That profile MUST map to an autonomous provider execution policy with:

- read/write access to every file in the assigned worktree;
- permission to create, modify, and remove files inside the worktree;
- permission to run build, test, formatting, package-manager, and Git commands;
- network access required for dependency installation, documentation, and repository operations;
- no interactive approval prompts during normal implementation; and
- sufficient temporary/cache write access for Git and toolchains.

This MUST NOT map to a read-only provider sandbox.

“Full access” in this workflow means autonomous implementation capability in the prepared workspace. Cycle MUST still enforce the worktree as the job's workspace boundary, keep secrets scoped and redacted, and reserve worktree lifecycle operations for Cycle. If an adapter can only offer unrestricted host access to satisfy autonomous operation, that fact MUST be explicit in provider capability/configuration and MUST NOT weaken the logical cwd, worktree ownership, or audit requirements.

### 12.2 Capability gate

Provider adapters MUST advertise capabilities for:

- persistent or reconstructable session continuity;
- explicit cwd selection;
- autonomous file and command execution;
- required network behavior;
- MCP server attachment; and
- structured completion/blocker output.

Startup MUST fail preflight if any REQUIRED capability is absent. The runtime MUST verify the effective provider policy again immediately before starting each turn.

### 12.3 Working directory

Every provider start and resume call MUST set cwd from the canonical persisted worktree association. Cwd MUST NOT be inferred from the API process, desktop process, primary repository, prompt text, or previous shell state.

The runtime MUST include context ID, task ID, worktree ID, and cwd in structured logs for every turn.

### 12.4 Provider continuity

The provider selected at initial assignment is fixed for the lifetime of the implementation context. Each follow-up MUST:

1. append the user message to the durable Cycle thread;
2. acquire the same context and worktree lease;
3. restore the same provider-session binding;
4. restore the same job-scoped MCP configuration;
5. set the same canonical cwd and authority profile; and
6. resume the provider-native session.

If native resume fails with a known “session missing” condition, the adapter MAY create a replacement native session only after recording the old binding and reconstructing the full relevant Cycle transcript. The Cycle thread, provider selection, implementation context, and worktree MUST remain unchanged. Silent replacement on an arbitrary provider error is prohibited.

### 12.5 Transcript ordering

Cycle is the durable transcript source of truth. Messages MUST have stable sequence numbers. A provider turn MUST receive all messages after its last acknowledged sequence, plus any required compacted history. A follow-up MUST NOT be submitted using only its latest text.

## 13. Cycle MCP Contract

### 13.1 Availability

Preflight MUST validate that a job-scoped Cycle MCP configuration can be constructed for the proposed repository, ticket, actor, provider, and worktree policy. The exact configuration MUST be materialized after the implementation context and execution IDs exist, persisted with the held task, and attached before the first provider turn. It MUST be restored on every resume. MCP availability MUST NOT depend on the provider discovering or configuring it from the prompt.

### 13.2 Scope

The MCP context MUST include:

- implementation context and execution IDs;
- repository and ticket IDs;
- stable initiating user ID;
- worktree ID and canonical path;
- branch name;
- provider/thread identity; and
- a tool allowlist appropriate to implementation.

The agent MUST be able to read the assigned ticket, comments, project/repository context, and relevant ticket relationships. It MUST be able to add progress and blocker information when allowed by the workflow.

The MCP tool surface MUST NOT expose worktree lifecycle operations to the provider. Startup assignment and initial status transition MUST remain workflow operations rather than prompt-driven MCP calls. Final handover mutation MUST be invoked by the Cycle finalization workflow, not improvised by the provider.

### 13.3 Mutation attribution

All provider-initiated MCP mutations MUST carry implementation context, execution, provider, and actor attribution. The MCP server MUST validate that referenced tickets and repositories fall within the job scope.

## 14. Implementation and Handover

### 14.1 Provider task

The provider is responsible for implementation inside the prepared worktree: inspecting code, editing files, running tests, and reporting structured results. It MUST respect existing uncommitted work discovered in that worktree and MUST surface conflicts rather than discarding user changes.

The system prompt MUST state that:

- the ticket, repository, branch, worktree, and cwd are already resolved;
- Cycle already owns ticket assignment and workflow transitions;
- the agent MUST NOT create or remove worktrees;
- the agent MUST implement and verify the ticket;
- the agent MUST return structured completion or blocker evidence; and
- Cycle will perform final commit/push/status/comment operations.

### 14.2 Structured completion result

On success, the provider MUST return a schema-validated result containing at least:

- summary of the implemented behavior;
- files changed;
- commands and tests run with exit outcomes;
- remaining risks or unverified areas;
- migration or operational notes;
- suggested commit summary; and
- explicit readiness for handover.

Free-form prose MAY accompany this result but MUST NOT replace it.

### 14.3 Cycle verification and finalization

Cycle MUST, through the backend/worktree handover service:

1. reacquire and verify the worktree association;
2. ensure changes are confined to the attached implementation worktree;
3. inspect Git status and reject unsafe conflicts;
4. run or validate configured final checks;
5. create the final implementation commit when changes exist;
6. update/publish the associated branch;
7. push the branch according to required push policy;
8. add a detailed handover comment; and
9. transition the ticket to `needs-review`.

The workflow MUST NOT create a pull request in this version.

The ticket MUST transition to `needs-review` only after required commit and push operations succeed. A failure in finalization MUST move the execution/context to `blocked`, leave the ticket `in-progress`, retain the worktree, and publish a blocker comment.

Finalization MUST use durable, idempotent checkpoints for verification, commit, branch publication, push, handover comment, and ticket transition. A retry MUST detect an already-created commit or push and MUST deduplicate the handover comment. Partial finalization MUST never create duplicate commits solely because the process restarted.

### 14.4 Handover comment

The handover comment MUST contain:

- implementation summary;
- branch name and commit identifier;
- push result and remote branch when applicable;
- files or functional areas changed;
- tests/checks run and results;
- known limitations, risks, and follow-up work;
- review instructions; and
- the implementation context/thread reference.

The handover comment MUST be persisted or deduplicated before the status transition is considered complete.

### 14.5 Review feedback

While the ticket is `needs-review` or `in-review`, the context and worktree remain retained. If a user sends feedback from the linked Chat or moves the ticket back to `in-progress` with feedback:

- the existing Cycle thread MUST be used;
- the existing provider and provider-native session MUST be resumed;
- the existing worktree and branch MUST be reused;
- the feedback MUST be appended after prior messages;
- a new `review-feedback` execution MUST be created with a new immutable idempotency key; and
- Cycle MUST repeat verification, commit/push, handover comment, and `needs-review` transition after the follow-up succeeds.

Review feedback MUST NOT create a second implementation context.

## 15. Terminal Cleanup

### 15.1 Trigger

The worktree MUST remain attached while the ticket is `in-progress`, `needs-review`, or `in-review`. Cleanup begins only when a user or authorized workflow moves the ticket to `done` or `canceled`.

### 15.2 Safe cleanup

On a terminal ticket transition, Cycle MUST:

1. prevent new executions for the context;
2. cancel or drain an active execution;
3. inspect the worktree for unpublished or uncommitted changes;
4. retain and warn instead of deleting if changes are not durably preserved;
5. remove the worktree and release its leases when safe;
6. retain the branch and pushed commit according to repository policy;
7. close provider-native runtime resources;
8. mark the implementation context `closed`; and
9. archive the Cycle thread while preserving it as readable history.

Moving a ticket to terminal state MUST NOT destroy unpublished work. A retained-on-cleanup-failure worktree requires an operator-visible reason and retry action.

## 16. Desktop Requirements

### 16.1 Start Agent action

The ticket panel MUST replace the generic `startIssueAgentChat`/chat-WebSocket path with the durable `createIssueAgentTask` command.

The dialog MAY continue to collect agent profile, provider, model, and optional instructions. On submit it MUST:

1. generate one command UUID;
2. disable duplicate submits while the request is unresolved;
3. retry an unknown transport result with the same command ID and identical payload;
4. render preflight/startup failure in the dialog;
5. navigate only after an accepted response; and
6. navigate to the server-returned Cycle thread.

The prompt builder MUST remove instructions asking the agent to resolve the repository, assign the current user, move the ticket to `in-progress`, create a worktree, commit/push, or transition to review. Those are orchestration responsibilities.

### 16.2 Chat view

The linked Chat MUST display:

- ticket and repository identity;
- execution status;
- provider/model;
- implementation authority;
- worktree path and branch;
- startup or resume activity;
- blocker code and required action;
- handover state; and
- retry/resume controls when blocked.

An accepted but not-yet-claimed task SHOULD appear as queued/preparing rather than inactive. An empty thread without task state is an integrity error and SHOULD offer a repair action rather than a normal message composer.

### 16.3 Existing context

When Start Agent returns `reused: true`, the desktop MUST open the existing thread. It SHOULD explain that the ticket already has an active implementation context. It MUST NOT clear transcript state or overwrite provider/worktree metadata.

## 17. Backend Service Design

The implementation SHOULD introduce or consolidate a focused service such as `TicketImplementationWorkflow` with Effect-based operations:

```ts
interface TicketImplementationWorkflowShape {
  readonly start: (
    input: StartTicketImplementationCommand,
  ) => Effect.Effect<StartTicketImplementationAccepted, StartTicketImplementationError>;

  readonly submitFeedback: (
    input: SubmitTicketImplementationFeedback,
  ) => Effect.Effect<TicketImplementationExecution, FeedbackSubmissionError>;

  readonly finalize: (
    input: FinalizeTicketImplementation,
  ) => Effect.Effect<ImplementationHandover, FinalizationError>;

  readonly reconcile: Effect.Effect<void, ReconciliationError>;

  readonly handleTicketTerminal: (
    event: TicketTerminalEvent,
  ) => Effect.Effect<void, TerminalCleanupError>;
}
```

Multi-step functions SHOULD use `Effect.fn` and `Effect.gen`. Recoverable boundary failures MUST use tagged schema errors. Git, database, provider, and network boundaries MUST map thrown/rejected failures into typed domain errors.

Focused layers MUST provide identity resolution, ticket commands, worktree service, durable thread/task store, scheduler, provider capability registry, MCP configuration, and event publication. Resources and leases MUST use scoped acquisition/finalization.

Transport handlers MUST decode contracts and call this service. They MUST NOT duplicate saga ordering or perform Git operations.

## 18. State Transitions

### 18.1 Context state

```text
preparing
  -> active
  -> blocked -> active
  -> in-review -> active
  -> terminal-cleanup -> closed

preparing -> startup-failed
active | blocked | in-review -> terminal-cleanup
```

### 18.2 Execution state

```text
preparing -> queued -> running
running -> waiting_for_input -> running
running | preparing | queued -> blocked
blocked -> cancelled
running -> completed
running | preparing | queued -> cancelling -> cancelled
running -> failed
```

A resume after `blocked` MUST create a new execution record linked to the blocked execution so that attempts and idempotency remain auditable.

### 18.3 Ticket relationship

| Workflow event           | Ticket status  | Context state                    | Worktree         |
| ------------------------ | -------------- | -------------------------------- | ---------------- |
| Preflight/preparation    | unchanged      | `preparing`                      | create/reuse     |
| Startup accepted         | `in-progress`  | `active`                         | retained         |
| Provider/runtime blocked | `in-progress`  | `blocked`                        | retained         |
| Handover succeeds        | `needs-review` | `in-review`                      | retained         |
| Review resumes           | `in-progress`  | `active`                         | reused           |
| User marks done/canceled | terminal       | `terminal-cleanup` then `closed` | remove when safe |

No agent execution may invent a ticket status outside the repository's configured workflow.

## 19. Observability and Audit

Every startup, execution, provider turn, MCP mutation, handover, and cleanup log/event MUST include where applicable:

- request and command IDs;
- startup attempt ID and checkpoint;
- implementation context ID;
- execution/task ID and ordinal;
- repository and ticket IDs;
- stable user ID;
- Cycle thread and provider-session IDs;
- provider/model;
- worktree ID/path and branch;
- authority profile;
- idempotency key/input digest;
- error code and retryability; and
- compensation or reconciliation outcome.

Metrics MUST include:

- startup success/failure by checkpoint;
- preflight failure reason;
- worktree preparation duration;
- accepted-to-provider-start latency;
- idempotent reuse and conflict counts;
- provider resume versus transcript-reconstruction counts;
- blocked executions by stage/provider;
- handover/finalization failures;
- retained worktrees by ticket state; and
- terminal cleanup failures.

Logs MUST NOT contain secrets, provider tokens, or unredacted sensitive environment values.

## 20. Security and Safety

1. Actor headers MUST be authenticated by the local API boundary and resolved server-side. Raw client-supplied identity MUST NOT directly change ticket assignees.
2. Provider credentials and MCP secrets MUST be scoped to the execution and redacted from transcript/logs.
3. The canonical worktree path MUST be validated against the worktree registry before every provider turn and finalization.
4. The runtime MUST reject path traversal, symlink escape where enforceable, and mismatched worktree ownership.
5. Autonomous execution MUST be explicit in policy and audit records. It MUST NOT be granted to generic read-only conversations by association.
6. Destructive cleanup MUST require proof that the target is a Cycle-owned worktree and that unpublished work will not be lost.
7. Provider instructions MUST NOT be treated as an authorization boundary; enforcement belongs in services, capability gates, and runtime configuration.

## 21. Migration and Compatibility

### 21.1 Frontend cutover

The desktop MUST cut over the Start Agent button in one release so it no longer creates generic ticket chats. The obsolete ticket-specific generic prompt builder and mutation SHOULD be removed after callers are migrated.

General Agent Chat remains supported for conversational use.

### 21.2 Existing ticket chats

Existing ticket-related chats without an implementation context MUST NOT be silently upgraded on message send. The UI MAY offer **Prepare implementation workspace**. Accepting that action runs the canonical startup saga and either attaches the existing Cycle thread if it is safe and provider-compatible or creates a canonical context and links the legacy chat for history.

### 21.3 Existing active contexts

Migration MUST detect duplicate active tasks/threads per ticket. It MUST choose a canonical context only using durable evidence such as active worktree association, provider binding, and execution history. Ambiguous duplicates MUST be surfaced for manual reconciliation, not merged automatically.

### 21.4 Status schema

Public and internal agent-task status contracts MUST add or normalize `preparing` and `blocked`. API clients MUST tolerate the new values before the backend emits them.

### 21.5 Worktree policy

The ticket-implementation workflow MUST opt into `retain_until ticket-terminal` without changing cleanup semantics for unrelated worktree consumers.

### 21.6 Rollout and rollback

The backend contracts, actor resolution, workflow saga, provider capability gates, and reconciliation MUST be deployed before enabling the desktop cutover. A temporary feature gate MAY control availability of Start Agent during rollout, but both enabled variants MUST resolve to the same durable endpoint.

Rollback MUST disable Start Agent or revert the complete compatible stack. It MUST NOT restore the generic ticket-chat startup as an implementation fallback. Existing accepted contexts MUST remain resumable and reconcilable during rollback.

## 22. Test Requirements

### 22.1 Contract tests

Tests MUST verify:

- request/response and typed error encoding/decoding;
- new `preparing` and `blocked` status compatibility;
- stable user identity resolution failures;
- idempotency digest behavior; and
- provider capability schema behavior.

### 22.2 Startup integration tests

Tests MUST cover:

1. successful start from `todo`, `backlog`, and equivalent startable states;
2. existing assignee replaced with the initiating current user according to command policy;
3. existing `in-progress` ticket handled idempotently;
4. worktree created before ticket mutation;
5. existing context/worktree reused;
6. duplicate click returns the same task/thread;
7. identical transport retry returns the same result;
8. same command ID with changed input returns `IDEMPOTENCY_CONFLICT` and no chat;
9. identity/preflight failure creates no resources;
10. worktree failure leaves ticket unchanged;
11. ticket mutation failure compensates task/thread/worktree;
12. compensation failure retains evidence and emits reconciliation state; and
13. response is withheld until task release.

### 22.3 Runtime tests

For every supported implementation provider, tests MUST prove:

- cwd equals the prepared worktree path on start and resume;
- file creation and modification succeeds;
- Git and test tools can write temp/cache/ref data as required;
- normal implementation actions do not request interactive approval;
- required network access follows policy;
- Cycle MCP is available on the first and subsequent turns;
- the provider cannot trigger Cycle worktree lifecycle operations through MCP;
- a follow-up sees preceding transcript context; and
- provider-native resume failure reconstructs context without creating a new Cycle thread.

### 22.4 Failure tests

Tests MUST inject failures at every startup checkpoint and after task release. Post-release provider/MCP failures MUST leave the ticket `in-progress`, move the job/context to `blocked`, retain the worktree, and publish exactly one blocker comment per failure identity.

### 22.5 Handover tests

Tests MUST prove:

- Cycle verifies and commits work;
- required push happens before `needs-review`;
- no PR is created;
- the detailed handover comment is published;
- the worktree survives `needs-review` and `in-review`;
- review feedback uses the same thread/provider/session/worktree;
- another commit/push/handover cycle succeeds; and
- terminal ticket transition safely removes the worktree while preserving transcript and branch history.

### 22.6 End-to-end desktop test

An automated desktop test MUST start an agent from a ticket and assert:

1. the button calls only the durable endpoint;
2. the current user becomes assignee;
3. the ticket becomes `in-progress` only after preparation;
4. Chat opens the returned thread;
5. the task is queued/preparing/running rather than empty/inactive;
6. the agent writes a sentinel file in the attached worktree;
7. a follow-up question references earlier context correctly; and
8. completion produces a pushed branch, handover comment, and `needs-review` ticket while retaining the worktree.

## 23. Acceptance Criteria

The feature is complete only when all of the following are true:

1. **Start Agent** no longer uses generic chat startup.
2. A successful response guarantees stable assignee, ready worktree, durable context/task, `in-progress` status, and released task.
3. The implementation provider starts in the returned worktree with autonomous write/command/network capability and Cycle MCP attached.
4. The provider is never asked or allowed to create its own worktree.
5. Duplicate submits cannot create empty chats or conflicting tasks.
6. Follow-up messages and review feedback reuse the same Cycle thread, provider, provider session when available, and worktree.
7. Post-start failures leave the ticket `in-progress`, mark the job/context blocked, retain resources, and add a useful deduplicated ticket comment.
8. Cycle performs final verification, commit, branch update/push, detailed handover, and transition to `needs-review` without creating a PR.
9. The worktree is retained throughout review and removed safely only after `done` or `canceled`.
10. Contract, integration, provider-parity, failure-injection, handover, and desktop end-to-end tests pass.

## 24. Expected Change Surface

The following map is normative for ownership and illustrative rather than exhaustive for individual helper files:

| Area                       | Current touchpoints                                                                                                                                                            | Required direction                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop ticket action      | `packages/desktop/src/renderer/components/ViewIssuePanel.tsx`, `packages/desktop/src/renderer/mutations/agentTasks.ts`                                                         | Submit only the durable startup command, manage command UUID retry semantics, and navigate to the returned thread.                                                                                        |
| Desktop API client/prompt  | `packages/desktop/src/renderer/lib/cycleApiClient.ts`                                                                                                                          | Replace ticket-specific generic chat startup; remove provider instructions for assignment, transition, worktree creation, and finalization.                                                               |
| Shared contracts           | `packages/contracts/src/schemas/agents/*`, ticket API request/response schemas                                                                                                 | Own context, execution, startup, typed error, blocked status, command, and response schemas.                                                                                                              |
| HTTP contract/handler      | `packages/api/src/http/endpoints/v1.ts`, `packages/api/src/http/handlers/v1/agentTasks.ts`, `packages/api/src/http/runtime/CycleApiRuntime.ts`, `packages/api/src/CycleApi.ts` | Decode the canonical command, propagate typed actor context, invoke one workflow service, and return typed outcomes.                                                                                      |
| Request identity           | `packages/api/src/http/middleware/CycleRequestContextMiddleware.ts` and desktop actor headers/auth wiring                                                                      | Resolve authenticated desktop actor metadata to a stable `UserProfileId` before startup mutation.                                                                                                         |
| Backend orchestration      | `packages/backend/src/BackendApi.ts`                                                                                                                                           | Extract the current `assignTicketToAgent` sequence into a focused Effect service implementing the durable startup saga, compensation, feedback, finalization, and cleanup.                                |
| Durable tasks/use cases    | `packages/usecases/src/AgentTasks.ts` and agent runtime task stores                                                                                                            | Add held preparation/release, context linkage, immutable execution idempotency, blocked state, and reconciliation.                                                                                        |
| Worktree lifecycle         | `packages/git-worktrees/src/WorktreeLifecycle.ts`, `WorktreeSchemas.ts`, `WorktreeConfig.ts`, `WorktreeReconciler.ts`                                                          | Support ticket-terminal retention, canonical context acquisition, safe terminal cleanup, and reconciliation evidence.                                                                                     |
| Authority/provider mapping | `packages/contracts/src/schemas/agents/AgentWorkAuthorityMode.ts`, `packages/agents/src/AgentCommon.ts`, `packages/agents/src/providers/*`                                     | Map implementation authority to autonomous worktree execution, enforce cwd, advertise capability gates, and preserve native sessions.                                                                     |
| Generic chat boundary      | `packages/api/src/http/handlers/v1/chat/ws.ts`, `packages/agent-chat/src/AgentChat.ts`                                                                                         | Preserve origin/runtime metadata for generic chat generally, but do not use this boundary to start ticket implementation work. Context-aware follow-ups must resolve the existing implementation context. |
| Cycle MCP                  | `packages/api/src/mcp/tools/registry.ts` and MCP job-context wiring                                                                                                            | Attach job-scoped ticket/repository/worktree/current-user context on every turn and prohibit provider-owned worktree lifecycle.                                                                           |

The focused workflow service SHOULD live in its owning package as a single primary service file with internal helpers under `src/internal`, consistent with repository package guidance. `BackendApi.ts` SHOULD compose its layer rather than remain the owner of the workflow implementation.

## 25. Implementation Sequence

The recommended implementation order is:

1. add shared contracts, typed errors, actor context, and normalized task statuses;
2. implement stable current-user resolution;
3. introduce the durable startup saga and checkpoint store;
4. correct worktree retention and finalization policies;
5. implement provider capability gating, autonomous implementation policy, canonical cwd enforcement, and MCP restoration;
6. implement context/execution continuity and blocked-state recovery;
7. cut the desktop Start Agent action over to the durable endpoint;
8. remove lifecycle instructions from the provider prompt;
9. implement review-feedback reuse and terminal cleanup listeners;
10. add reconciliation and observability; and
11. complete provider-parity and desktop end-to-end tests before removing legacy ticket-chat code.

Each step MUST preserve the canonical service ownership described above. Temporary compatibility code MUST NOT introduce a third startup path.
