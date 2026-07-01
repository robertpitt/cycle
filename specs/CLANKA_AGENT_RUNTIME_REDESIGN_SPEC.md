# Clanka-Informed Agent Runtime Redesign Specification

Status: Draft implementation specification
Version: 0.1
Date: 2026-06-22
Target repository: Cycle

## 1. Purpose

This specification defines a breaking-change-friendly redesign of Cycle's agent service layer for
multi-agent orchestration. The redesign keeps Cycle's durable Agent Work scheduler, local job
store, ticket timeline, and worktree responsibilities, but replaces the live agent execution layer
with an orchestration runtime modeled on the strongest parts of `vendor/clanka`.

The intended end state is:

1. Cycle owns a first-class local agent orchestration service, not only a provider adapter.
2. Agent Work jobs run through a typed, observable, multi-agent runtime.
3. Parent agents can delegate to child agents and stream child output without losing ordering,
   attribution, cancellation, or completion semantics.
4. Tool access is provided through job-scoped typed toolkits and executor layers, not prompt-only
   MCP attachment policy.
5. Job logs and UI diagnostics are projections of canonical typed agent output events.
6. Provider adapters become model/provider layers under the orchestration runtime, rather than the
   primary abstraction exposed to Agent Work.

This is WIP architecture. Breaking existing `@cycle/agents` contracts is allowed when it removes
the wrong boundary or materially improves the orchestration model.

## 2. Normative Language

The keywords MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

Implementation-defined means the implementation may choose the internal mechanism, package
location, or storage engine, but it MUST preserve the externally observable contract described in
this specification and MUST document operator-visible behavior.

## 3. Context

Cycle currently has three related but separate agent surfaces:

1. `@cycle/agents` exposes a provider-neutral `AgentService` contract. It owns sessions, turns,
   streaming events, cancellation, provider capabilities, and the Codex app-server adapter.
2. `packages/api/src/agent-work` owns durable local Agent Work jobs, status history, leases,
   checkpoints, settings, delegates, and local events.
3. `packages/api/src/http/handlers/v1/agentWorkRunner.ts` bridges a running Agent Work job to a
   provider turn and converts provider events into job activity records.

This split was useful for bootstrapping. It is now the wrong center of gravity for multi-agent
work:

- the `AgentService` abstraction is provider-turn-centric, not orchestration-centric;
- provider stream events are hand-normalized but not schema-owned output events;
- Agent Work logs are derived from status history plus sampled provider activity strings;
- job authority is enforced indirectly through MCP context and prompt instructions;
- cancellation, pausing, steering, retries, child-agent output, and final completion are spread
  across multiple layers;
- the service registry chooses a single provider service, rather than an orchestrator that can
  supervise multiple agents and models.

Clanka demonstrates a stronger local architecture for the live runtime. Its most relevant choices
are:

- an `Agent` service that streams schema-tagged `AgentOutput` events;
- a single model-visible `execute(script)` tool backed by a typed script executor;
- an `AgentExecutor` boundary with local and RPC implementations;
- `Effect` services and layers for tools, model providers, auth, search, and runtime configuration;
- a `delegate` tool for subagents, with `SubagentStart`, `SubagentPart`, and `SubagentComplete`
  events;
- output buffering/muxing so parent and child agent streams remain intelligible;
- `taskComplete` as an explicit terminal signal;
- robust script preprocessing and patch parsing;
- semantic search as an executor capability;
- `Effect` streams, queues, latches, semaphores, scopes, and typed errors as runtime primitives.

Cycle SHOULD adopt these runtime ideas while preserving Cycle's product responsibilities: durable
jobs, ticket writes, worktree lifecycle, branch finalization, settings, and local-only state.

## 4. Problem Statement

Cycle needs background agents that can do real ticket work, not just provider turns. A single job
may need to:

- inspect ticket context;
- search the repository;
- ask one child agent to read implementation code;
- ask another child agent to inspect tests;
- run validation in a disposable or implementation worktree;
- summarize findings;
- create comments, branches, commits, or handover notes through Cycle-owned workflow steps;
- stream progress into a job log throughout the run;
- pause, cancel, retry, or resume safely.

The current service layer does not give Cycle a single place to model this. The provider adapter is
too low-level, and the Agent Work runner is too job-specific. Multi-agent orchestration requires a
new service boundary between durable jobs and provider/model adapters.

## 5. Goals

Cycle MUST:

1. Introduce an orchestration-first agent service layer that can supervise parent and child agents.
2. Represent live agent activity as canonical schema-tagged output events.
3. Persist or project those events into Agent Work logs without losing source agent, tool, script,
   subagent, usage, retry, or completion details.
4. Support multiple agents per job, including parent/child relationships and output attribution.
5. Provide explicit terminal completion through a typed `taskComplete` runtime signal.
6. Provide job-scoped toolkits whose capabilities are selected from Cycle authority mode,
   repository scope, ticket scope, worktree path, and allowed operations.
7. Render typed tool declarations from Effect Schemas so agents know the exact script API they can
   call.
8. Execute model-authored scripts inside a controlled executor boundary.
9. Make the executor boundary replaceable: local executor first, RPC/remote executor later.
10. Make cancellation, retry, turn timeout, steering, and child-agent interruption orchestration
    responsibilities.
11. Keep provider adapters behind model/provider layers, with Codex app-server remaining a valid
    provider path.
12. Keep Agent Work's durable scheduler, leases, checkpoints, worktree records, branch records,
    and local settings as Cycle-owned state.
13. Allow breaking changes to `@cycle/agents` contracts where the current provider-turn API blocks
    orchestration.

Cycle SHOULD:

1. Port or adapt Clanka's output event taxonomy, executor shape, toolkit rendering, subagent muxing,
   script preprocessing, and patch parsing.
2. Add semantic repository search after the typed event/executor foundation is in place.
3. Expose direct Effect AI Codex auth/model layers as an optional provider implementation after the
   orchestration boundary is stable.
4. Keep chat UI and Agent Work UI as projections over the same canonical output stream where
   possible.

## 6. Non-Goals

This specification MUST NOT require:

1. Hosted multi-tenant agent execution.
2. Remote executors in the first implementation phase.
3. Direct replacement of Cycle's durable Agent Work job store.
4. GitDB synchronization of local agent runtime state.
5. Immediate removal of Codex app-server support.
6. Pull request creation or remote branch push.
7. Full semantic search in phase 1.
8. Exact source-level copying of Clanka. Cycle may adapt the concepts to local package boundaries.

## 7. Current Baseline

### 7.1 `@cycle/agents`

The current `@cycle/agents` contract centers on `AgentService`:

- `createSession`
- `resumeSession`
- `run`
- `stream`
- `respondToApproval`
- `respondToUserInput`
- `abortTurn`
- `close`

The default registry currently maps provider ID to provider service. Codex is the only executable
provider in the default registry.

The current `AgentEvent` union is broad and provider-normalized, but it is not an Effect Schema
event protocol. It mixes UI-oriented events, provider item events, approval events, usage,
artifacts, and terminal events. It does not model parent/child agent output as a first-class
relationship.

### 7.2 Codex Adapter

The Codex adapter uses `@cycle/codex-app-server` and maps app-server notifications into
`AgentEvent` values. It owns:

- app-server client lifecycle;
- thread start/resume;
- turn start/interrupt;
- MCP warm-up;
- approval and user-input request plumbing;
- content deltas and artifact normalization;
- timeout and abort bridging.

This remains useful, but it SHOULD become one model/provider implementation under the orchestrator,
not the top-level service shape used by Agent Work.

### 7.3 Agent Work Runtime

The durable Agent Work runtime owns:

- local jobs;
- status history;
- local events;
- leases;
- checkpoints;
- settings;
- delegates;
- worktree and branch records;
- activity records.

This layer SHOULD remain durable and Cycle-owned. It SHOULD consume canonical runtime output events
from the orchestration layer and project them into user-facing job logs.

### 7.4 Agent Work Runner

The runner currently prepares a chat-style turn, invokes `service.stream`, samples provider events
into activity records, and completes or fails jobs based on terminal provider events. It is the
right place to replace provider-turn execution with orchestration-job execution.

## 8. Clanka Reference Architecture

Cycle SHOULD use the following Clanka patterns as design references.

### 8.1 Agent Output Events

Clanka defines schema-tagged runtime events such as:

- `AgentStart`
- `ReasoningStart`
- `ReasoningDelta`
- `ReasoningEnd`
- `ScriptStart`
- `ScriptDelta`
- `ScriptEnd`
- `ScriptOutput`
- `Usage`
- `ErrorRetry`
- `SubagentStart`
- `SubagentPart`
- `SubagentComplete`

Cycle SHOULD define its own equivalent `AgentRuntimeEvent` union using Effect Schema classes.

### 8.2 Agent Executor

Clanka's `AgentExecutor` exposes:

- `capabilities`
- `execute({ script, onTaskComplete, onSubagent })`
- `executeUnsafe({ tool, params })`

It has local and RPC implementations. The local executor runs scripts inside a constrained Node VM,
with a sandbox containing only tool functions, `console`, `fetch`, and runtime callbacks.

Cycle SHOULD define an executor boundary with the same responsibilities and Cycle-specific
authority controls.

### 8.3 One Model Tool: `execute(script)`

Clanka does not expose every tool directly to the model provider. It exposes one tool named
`execute`, then gives the model TypeScript declarations for functions available inside the script
environment.

Cycle SHOULD adopt this for Agent Work. It has three advantages:

1. The model can compose multiple tool calls in a single script.
2. Tool declarations are generated from schemas instead of duplicated in prompt prose.
3. Cycle can constrain execution at the executor layer rather than depending on provider-specific
   tool-call semantics.

### 8.4 Toolkit Rendering

Clanka renders Effect `Toolkit` schemas into TypeScript declarations:

```ts
declare function readFile(params: { readonly path: string }): Promise<string>;
```

Cycle SHOULD provide a similar `CycleToolkitRenderer`. Existing Cycle MCP tool schemas are already
Effect Schema-based and can be adapted into toolkit declarations.

### 8.5 Subagent Delegation

Clanka treats delegation as a normal tool call. The parent script can call `delegate`, and the
runtime emits child-agent events with source attribution. The parent does not need to manually
manage child streams.

Cycle SHOULD model subagents as orchestration children:

- each child has an `agentRunId`;
- each child has a `parentRunId`;
- child events retain child attribution;
- parent logs can show collapsed or expanded child output;
- cancellation of the parent interrupts children;
- child completion returns a typed summary to the parent script.

### 8.6 Output Muxing

Clanka buffers/muxes output so reasoning and script deltas from concurrent agents do not interleave
into unreadable logs.

Cycle SHOULD use a similar policy for UI projections:

- canonical event storage preserves exact event order;
- UI rendering may group by `agentRunId`, `scriptId`, `toolCallId`, or `subagentId`;
- live streams SHOULD avoid interleaving partial reasoning/script deltas from different agents.

### 8.7 Explicit Completion

Clanka uses `taskComplete(summary)` to terminate agent work. The final summary is carried in a
typed `AgentFinished` terminal error.

Cycle SHOULD require Agent Work runtime completion through `taskComplete` or a Cycle-owned terminal
workflow step. Inferred completion from a final assistant message SHOULD be allowed only for chat
mode or compatibility mode.

### 8.8 Script Repair and Patch Parsing

Clanka includes robust script preprocessing for common model-authored JavaScript failures and a
patch parser that supports wrapped patches, unified diffs, multi-file diffs, adds, deletes, and
renames.

Cycle SHOULD adapt these pieces for implementation-worktree jobs because patch/script brittleness
directly affects agent reliability and observability.

## 9. Proposed Architecture

Cycle SHOULD restructure the live agent stack as:

```text
Agent Work Scheduler / Chat Caller
        |
        v
Agent Orchestration Service
        |
        +--> Agent Runtime Supervisor
        |       |
        |       +--> Parent Agent Fiber
        |       +--> Child Agent Fibers
        |       +--> Event Stream / Muxer
        |       +--> Timeout / Retry / Steering / Cancellation
        |
        +--> Agent Executor
        |       |
        |       +--> Cycle Toolkits
        |       +--> Script VM
        |       +--> Worktree / Ticket / Search / MCP Services
        |
        +--> Model Provider Layer
                |
                +--> Codex app-server provider
                +--> future direct Effect AI Codex provider
                +--> future Claude/OpenCode providers
```

Durable Agent Work stays above this stack. Provider/model specifics stay below it.

## 10. Package Boundaries

Cycle SHOULD reorganize around these package responsibilities.

### 10.1 `@cycle/agents`

`@cycle/agents` SHOULD own:

- agent runtime event schemas;
- orchestration service contract;
- supervisor implementation;
- executor contract;
- toolkit contract and renderer;
- provider/model abstraction;
- common cancellation, retry, timeout, steering, and subagent primitives;
- test utilities for deterministic model streams and executors.

It SHOULD NOT own:

- Cycle ticket usecases;
- durable Agent Work job storage;
- worktree storage;
- API HTTP envelopes;
- renderer components.

### 10.2 `@cycle/api`

`@cycle/api` SHOULD own:

- Agent Work durable runtime and scheduler;
- conversion from Agent Work jobs to orchestration requests;
- Cycle-specific toolkits and tool handlers;
- ticket/comment/status usecase tools;
- job event persistence/projection;
- local HTTP endpoints for logs and activity.

### 10.3 `@cycle/desktop`

`@cycle/desktop` SHOULD own:

- UI projections over job state and runtime events;
- log dialogs;
- agent activity surface;
- controls for pause, resume, cancel, and run inspection.

## 11. Core Contracts

### 11.1 Agent Run Identity

Every orchestration run MUST have:

```ts
type AgentRunId = string;

type AgentRunRef = {
  readonly runId: AgentRunId;
  readonly parentRunId?: AgentRunId;
  readonly rootRunId: AgentRunId;
  readonly jobId?: string;
  readonly agentId: string;
  readonly providerId: AgentProviderId;
  readonly model?: string;
};
```

For Agent Work, `jobId` MUST be present on every root run event.

### 11.2 Orchestration Request

The top-level request SHOULD replace provider-turn-specific inputs for Agent Work:

```ts
type AgentOrchestrationRequest = {
  readonly root: {
    readonly agentId: string;
    readonly providerId: AgentProviderId;
    readonly model?: string;
  };
  readonly prompt: string;
  readonly system?: string;
  readonly authority: AgentAuthorityContext;
  readonly mode: "agent-work" | "chat" | "diagnostic";
  readonly metadata: JsonObject;
  readonly signal?: AbortSignal;
};
```

### 11.3 Authority Context

Cycle MUST pass explicit authority into the orchestration layer:

```ts
type AgentAuthorityContext = {
  readonly mode: "ticket-context" | "disposable-worktree" | "implementation-worktree";
  readonly repositoryId: string;
  readonly ticketId?: string;
  readonly jobId?: string;
  readonly worktreePath?: string;
  readonly branchName?: string;
  readonly allowedTools?: readonly string[];
};
```

The executor MUST enforce this context. Prompt instructions MAY explain the context, but MUST NOT
be the only control.

### 11.4 Orchestration Service

`@cycle/agents` SHOULD expose an orchestration service:

```ts
type AgentOrchestrationService = {
  readonly run: (
    request: AgentOrchestrationRequest,
  ) => Effect.Effect<Stream.Stream<AgentRuntimeEvent, AgentRuntimeTerminalError>, never>;

  readonly steer: (runId: AgentRunId, message: string) => Effect.Effect<void, AgentRuntimeError>;

  readonly cancel: (runId: AgentRunId, reason?: string) => Effect.Effect<void, AgentRuntimeError>;

  readonly inspect: (runId: AgentRunId) => Effect.Effect<AgentRunSnapshot, AgentRuntimeError>;
};
```

The service MAY expose Promise/AsyncIterable adapters for HTTP and renderer consumers, but the
core runtime SHOULD be Effect-native.

### 11.5 Runtime Supervisor

The orchestration service MUST be backed by a runtime supervisor. The supervisor is the component
that makes this a multi-agent runtime rather than a provider registry.

The supervisor MUST own:

- root and child run creation;
- the active run graph;
- parent/child cancellation propagation;
- child concurrency limits;
- output event sequencing and fan-out;
- model/provider selection for each run;
- executor construction for each run;
- retry policy for model/provider failures;
- turn timeout and timeout reset policy;
- steering queues;
- terminal completion and terminal failure propagation.

The supervisor SHOULD keep an in-memory run graph:

```ts
type AgentRunNode = {
  readonly run: AgentRunRef;
  readonly status:
    | "starting"
    | "running"
    | "waiting"
    | "cancelling"
    | "completed"
    | "failed"
    | "cancelled";
  readonly children: readonly AgentRunId[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly terminal?: AgentRunTerminalState;
};
```

For Agent Work, the run graph does not need to survive process restart. Durable recovery remains
the responsibility of Agent Work checkpoints and job status. The supervisor MUST, however, emit
enough events for the durable layer to reconstruct what happened before a crash.

The existing `AgentServiceRegistry` SHOULD be replaced or demoted. Runtime callers should resolve
one orchestration service, and the orchestration service should resolve model providers internally
per root or child run.

### 11.6 Runtime Events

Cycle MUST define schema-owned runtime events. A starting event set SHOULD be:

```ts
type AgentRuntimeEvent =
  | AgentRunStarted
  | AgentRunCompleted
  | AgentRunFailed
  | AgentRunCancelled
  | ReasoningStarted
  | ReasoningDelta
  | ReasoningEnded
  | ScriptStarted
  | ScriptDelta
  | ScriptEnded
  | ScriptOutput
  | ToolStarted
  | ToolCompleted
  | ToolFailed
  | SubagentStarted
  | SubagentEvent
  | SubagentCompleted
  | UsageReported
  | RetryScheduled
  | WarningReported;
```

Every event MUST include:

```ts
type AgentRuntimeEventBase = {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly runId: AgentRunId;
  readonly rootRunId: AgentRunId;
  readonly parentRunId?: AgentRunId;
  readonly jobId?: string;
  readonly sequence?: number;
};
```

Agent Work persistence MAY assign durable `sequence` values when storing events.

### 11.7 Terminal Completion

Agent Work runs MUST complete through an explicit terminal event:

```ts
type AgentRunCompleted = AgentRuntimeEventBase & {
  readonly type: "agent.run.completed";
  readonly summary: string;
  readonly result?: JsonObject;
};
```

The model SHOULD produce this by calling `taskComplete(summary, result?)` inside the executor
script. The runtime MAY map provider-native terminal output to completion only in chat mode.

## 12. Executor and Toolkit Design

### 12.1 Executor Contract

Cycle SHOULD define:

```ts
type AgentExecutorCapabilities = {
  readonly toolsDts: string;
  readonly agentsMd?: string;
  readonly supportsSearch: boolean;
  readonly authority: AgentAuthorityContext;
};

type AgentExecutor = {
  readonly capabilities: Effect.Effect<AgentExecutorCapabilities, AgentRuntimeError>;
  readonly execute: (input: {
    readonly run: AgentRunRef;
    readonly script: string;
    readonly onTaskComplete: (summary: string, result?: JsonObject) => Effect.Effect<void>;
    readonly onSubagent: (input: SubagentRequest) => Stream.Stream<AgentRuntimeEvent>;
  }) => Stream.Stream<ScriptRuntimeOutput, AgentRuntimeError>;
  readonly executeUnsafe: (input: {
    readonly tool: string;
    readonly params: unknown;
    readonly run: AgentRunRef;
  }) => Effect.Effect<unknown, AgentRuntimeError>;
};
```

`executeUnsafe` exists for tests, direct UI diagnostics, and controlled internal calls. Agent Work
runtime SHOULD use `execute` for model-authored scripts.

### 12.2 Local Executor

The first implementation SHOULD provide a local executor that:

- runs JavaScript in a constrained VM;
- exposes only selected toolkit functions;
- hides `process` by default;
- captures `console` output as `ScriptOutput`;
- tracks running tool promises in scope;
- interrupts work when the parent run is cancelled;
- validates tool input and output through Effect Schema;
- records `ToolStarted`, `ToolCompleted`, and `ToolFailed` events.

The local executor MUST enforce Cycle authority context before invoking handlers.

### 12.3 RPC Executor

The contract SHOULD reserve room for an RPC executor with the same behavior. RPC is not required
for phase 1, but the contract MUST NOT bake in in-process-only assumptions.

### 12.4 Toolkits

Cycle SHOULD model tools as typed toolkit entries:

```ts
type CycleAgentTool<I, O> = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Schema.Schema<I>;
  readonly outputSchema: Schema.Schema<O>;
  readonly authority: ToolAuthorityPolicy;
  readonly handle: (input: I, context: ToolExecutionContext) => Effect.Effect<O, AgentToolError>;
};
```

Initial toolkit groups SHOULD include:

- ticket context read tools;
- comment and follow-up ticket write tools;
- repository file read/search tools;
- worktree file write/patch tools;
- shell/test tools for worktree modes;
- `delegate`;
- `taskComplete`;
- optional semantic `search`.

Existing Cycle MCP tools MAY be adapted into this toolkit model, but Agent Work SHOULD NOT depend
on provider-level MCP calls as the main execution path.

### 12.5 Tool Declaration Rendering

Cycle SHOULD render selected tools into declarations:

```ts
declare function cycleIssueGet(params: {
  readonly repositoryId: string;
  readonly issueId: string;
}): Promise<TicketResource>;
```

The renderer SHOULD use Effect Schema ASTs, following Clanka's `TypeBuilder` and
`ToolkitRenderer` approach.

The generated declaration block MUST be included in the agent system prompt for `execute(script)`.

## 13. Multi-Agent Orchestration

### 13.1 Parent Agent

The root agent is the supervisor-visible parent for an orchestration request. It receives:

- the user/job prompt;
- generated tool declarations;
- authority instructions;
- repository/ticket context;
- AGENTS.md or equivalent repository guidance when available;
- runtime guidance requiring `execute(script)` and `taskComplete`.

### 13.2 Subagents

A parent script MAY call `delegate`:

```ts
const analysis = await delegate({
  agentId: "codex",
  prompt: "Inspect the failing test path and summarize likely causes.",
  model: "gpt-5.4/medium",
});
```

The runtime MUST:

- create a child `AgentRunRef`;
- inherit or narrow authority context;
- stream child events with child attribution;
- expose child summary to the parent script;
- cancel child runs when the parent is cancelled;
- mark child failure as either recoverable tool failure or parent failure according to delegate
  options.

### 13.3 Output Ordering

Canonical storage SHOULD preserve append order. Renderers SHOULD group streaming deltas to avoid
interleaving partial reasoning/script output.

Minimum grouping rules:

- while one run is emitting reasoning deltas, keep that reasoning block contiguous in the live UI;
- while one run is emitting script deltas, keep that script block contiguous in the live UI;
- completed child summaries MAY be displayed inline under the parent delegate call;
- raw event views MUST allow exact chronological inspection.

### 13.4 Agent Selection

The first implementation MAY use the same provider/model for parent and children. The service
contract MUST allow:

- different child model;
- different child provider;
- child-specific instructions;
- concurrency limits for child runs;
- disabling child delegation by policy.

### 13.5 Steering

The runtime SHOULD support steering active root runs and MAY support steering child runs. Steering
SHOULD be modeled as a pending user message queue, following Clanka's approach.

For Agent Work, steering MAY initially be internal-only. UI user steering can be specified later.

## 14. Agent Work Integration

### 14.1 Runner Replacement

`agentWorkRunner.ts` SHOULD stop preparing a chat-style provider turn. Instead it SHOULD:

1. load the durable job;
2. create an `AgentOrchestrationRequest`;
3. call `AgentOrchestrationService.run`;
4. persist runtime events to Agent Work event/activity storage;
5. update job heartbeat from runtime progress;
6. complete/fail/cancel the durable job based on terminal runtime events;
7. let Cycle workflow steps perform final ticket comments, status transitions, branches, and
   cleanup.

### 14.2 Job Log Projection

Agent job logs MUST include runtime events. The existing log entries SHOULD be extended or replaced
with:

```ts
type AgentJobLogEntry = {
  readonly entryId: string;
  readonly kind: "status" | "checkpoint" | "local-event" | "runtime-event";
  readonly occurredAt: string;
  readonly title: string;
  readonly message: string;
  readonly runId?: string;
  readonly parentRunId?: string;
  readonly eventType?: string;
  readonly status?: string;
  readonly payload: JsonObject;
};
```

The UI log dialog SHOULD show:

- parent run summary;
- child agent sections;
- reasoning blocks;
- script blocks;
- tool calls with input/output/error payload details;
- task completion summary;
- retries and warnings;
- final failure/cancel reason.

### 14.3 Durable Event Storage

Cycle SHOULD add a durable runtime-event record, either as a new table or as a typed activity kind:

```ts
type AgentRuntimeEventRecord = {
  readonly sequence: number;
  readonly eventId: string;
  readonly jobId: string;
  readonly runId: string;
  readonly parentRunId?: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly recordJson: string;
};
```

If stored in the existing activity table, the payload MUST retain the complete schema-encoded
runtime event.

### 14.4 Heartbeats

Runtime output events SHOULD update `lastProviderEventAt` or a renamed `lastRuntimeEventAt`.
Heartbeats SHOULD be emitted on:

- run started;
- reasoning start/end;
- script start/end;
- tool start/end/failure;
- subagent start/complete;
- retry scheduled;
- task complete.

High-volume deltas MAY be throttled for heartbeat updates.

### 14.5 Completion and Ticket Comments

Agent Work SHOULD no longer complete jobs from arbitrary assistant text. For Agent Work:

- `taskComplete` summary is the canonical completion text;
- final ticket comments SHOULD be created by the workflow after the root run completes;
- implementation-worktree jobs SHOULD proceed through worktree finalization before completion;
- chat mode MAY still complete from assistant text.

## 15. Provider Layer

### 15.1 Model Provider Contract

The orchestration runtime SHOULD depend on a model provider contract closer to Effect AI
`LanguageModel` than the current Cycle `AgentService`.

Provider responsibilities:

- stream model text/reasoning/tool-call parts;
- accept a system prompt and user prompt;
- expose model/provider identity for logs;
- respect abort signals;
- report usage when available.

Provider responsibilities MUST NOT include:

- durable job state;
- Cycle ticket writes;
- worktree finalization;
- job logs;
- subagent graph persistence.

### 15.2 Codex App-Server Provider

Codex app-server remains the required provider path for the first implementation. The current
adapter SHOULD be wrapped or refactored into a provider layer that emits model stream parts into
the orchestrator.

### 15.3 Direct Effect AI Codex Provider

Clanka's `CodexAuth` and `Codex` layers show a clean direct-provider path using:

- Effect `KeyValueStore` for tokens;
- auth-aware `HttpClient`;
- serialized refresh/device flow;
- OpenAI Responses provider layers;
- account ID extraction from JWT claims.

Cycle MAY implement this as an optional provider after the orchestration service is stable. It is
not required for phase 1.

## 16. Semantic Search

Semantic repository search SHOULD be phase 2.

When added, it SHOULD follow Clanka's design:

- AST-aware chunking for TypeScript/JavaScript;
- meaningful-file filtering;
- sqlite-vector local storage;
- hash-based embedding reuse;
- initial index fiber;
- incremental update/remove hooks from file tools;
- `search(query)` as an executor capability only when the index is available.

Semantic search MUST be job/repository scoped and MUST NOT index unrelated workspaces.

## 17. Failure Handling

The orchestration runtime MUST distinguish:

- provider authentication failure;
- provider rate limit;
- provider timeout;
- model/tool input schema failure;
- tool handler failure;
- script syntax/preprocessing failure;
- script execution failure;
- child agent failure;
- cancellation;
- explicit task failure;
- executor unavailable;
- authority denial.

Retry policy SHOULD live in the orchestration supervisor for provider/model failures and in Agent
Work for durable job retries. Runtime retries MUST emit `RetryScheduled` events so the UI explains
why a job is still running.

Agent Work SHOULD only retry a durable job after a checkpoint marked retry-safe.

## 18. Cancellation, Pause, and Resume

Cancellation MUST flow from Agent Work to the orchestration service:

1. durable job transitions to `cancelling`;
2. runner calls `AgentOrchestrationService.cancel(rootRunId)`;
3. supervisor interrupts parent and child fibers;
4. executor interrupts running scripts and tool handlers where possible;
5. terminal `agent.run.cancelled` event is recorded;
6. durable job transitions to `cancelled`.

Pause SHOULD remain a scheduler-level concept. Active runs MAY continue to a safe checkpoint unless
policy says to cancel.

Resume after process restart SHOULD begin from durable Agent Work checkpoint state. Rehydrating
live in-memory fibers is not required.

## 19. Security and Authority

The executor MUST enforce authority with code, not only prompts.

Minimum policy:

- `ticket-context` allows ticket/repository reads and approved Cycle ticket write tools such as
  comment creation, but no file writes or shell mutation.
- `disposable-worktree` allows worktree reads/writes and validation commands in a disposable
  worktree, but no final branch publication.
- `implementation-worktree` allows worktree writes, tests, patches, commits, and branch handover
  through Cycle workflow steps.

Tool handlers MUST validate repository ID, ticket ID, worktree path, and allowed tool list.

Shell execution MUST require a worktree path for write modes and SHOULD default to bounded timeout,
bounded output, and explicit environment construction.

## 20. Migration Plan

### Phase 1: Runtime Event Protocol

1. Add `AgentRuntimeEvent` Effect Schema classes in `@cycle/agents`.
2. Add event encoding/decoding tests.
3. Add adapter functions from current `AgentEvent` to `AgentRuntimeEvent` where useful.
4. Extend Agent Work logs to accept `runtime-event` entries.

### Phase 2: Orchestration Service Skeleton

1. Add `AgentOrchestrationService`.
2. Add root run identity and snapshot tracking.
3. Add cancellation and inspect APIs.
4. Implement a compatibility provider path that can stream through existing Codex app-server.
5. Add deterministic fake model tests.

### Phase 3: Executor and Typed Toolkits

1. Add `AgentExecutor` contract.
2. Add local VM executor.
3. Add toolkit definition and renderer.
4. Adapt initial Cycle ticket/read/comment tools.
5. Add `taskComplete`.
6. Add tool lifecycle events.

### Phase 4: Agent Work Runner Switch

1. Replace chat-style provider turn execution in `agentWorkRunner.ts`.
2. Persist runtime events into job logs.
3. Complete Agent Work jobs from `agent.run.completed`.
4. Fail/cancel jobs from terminal runtime events.
5. Add UI grouping for runtime events and child runs.

### Phase 5: Subagents

1. Add `delegate` tool.
2. Add child run creation and attribution.
3. Add child cancellation propagation.
4. Add output muxing/grouping.
5. Add tests for parent plus two child agents running concurrently.

### Phase 6: Worktree Implementation Tools

1. Add worktree read/write/patch/shell tools under authority enforcement.
2. Adapt Clanka-style script preprocessing.
3. Adapt robust patch parser.
4. Connect implementation-worktree jobs to final branch/handover workflow.

### Phase 7: Semantic Search and Direct Codex Provider

1. Add optional repository semantic index.
2. Add `search` capability to executor when index is ready.
3. Explore direct Effect AI Codex provider and auth layer.

## 21. Testing Requirements

The redesign MUST include tests for:

- schema encode/decode of every runtime event;
- root run streaming success;
- explicit `taskComplete` terminal completion;
- script syntax failure and preprocessing recovery;
- tool input schema failure;
- tool output schema failure;
- authority denial by mode;
- cancellation before model call;
- cancellation during script execution;
- cancellation with active child agents;
- provider retry events;
- subagent start/part/complete event attribution;
- output muxing/grouping with two active child agents;
- Agent Work log projection from runtime events;
- Agent Work completion from runtime terminal event;
- Agent Work failure from runtime terminal event;
- no arbitrary assistant-text completion in Agent Work mode;
- compatibility with current Codex app-server provider path.

When worktree tools are added, tests MUST cover:

- file read/write boundaries;
- patch add/update/delete/rename;
- shell timeout;
- output truncation;
- path escape denial;
- worktree cleanup/finalization behavior.

## 22. Acceptance Criteria

The redesign is acceptable when:

1. Agent Work can run a root agent through `AgentOrchestrationService`.
2. The job log shows typed runtime events, including script/tool lifecycle.
3. A root agent can call `taskComplete` and complete the durable job.
4. A root agent can delegate to at least one child agent and the UI/log can attribute child output.
5. Cancelling a running job interrupts the root run and child runs.
6. Tool authority is enforced by executor/tool handlers.
7. Existing Codex app-server execution still works through the new orchestration boundary.
8. Tests cover success, failure, cancellation, subagent, and log projection paths.

## 23. Open Implementation Decisions

The following decisions are intentionally left implementation-defined:

1. Whether runtime events are stored in a new table or as typed activity records.
2. Whether the first toolkit implementation uses Effect `Toolkit` directly or a Cycle wrapper that
   can later map to Effect `Toolkit`.
3. Whether the local VM executor uses Node `vm`, `vm2`, an isolated worker, or another constrained
   execution mechanism.
4. Whether chat mode moves immediately to the orchestration service or remains on current
   `AgentService` until Agent Work is stable.
5. Whether direct Effect AI Codex provider support lands before or after semantic search.

These choices MUST NOT change the core contracts: typed runtime events, executor-enforced
authority, explicit completion, and parent/child run attribution.
