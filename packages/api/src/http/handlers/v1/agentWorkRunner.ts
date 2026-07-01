import type { RepositoryStatus, TicketDocument } from "@cycle/contracts";
import {
  isAgentProviderId,
  type AgentInput,
  type AgentProviderId,
  type AgentResponseFormat,
} from "@cycle/agents";
import { CommentAdd, IssueGet, RepositoryList } from "@cycle/usecases";
import { agentRuntimeEventName, type AgentRuntimeEvent } from "@cycle/agents/runtime-events";
import type {
  BranchAssociation as GitBranchAssociation,
  WorktreeRecord as GitWorktreeRecord,
} from "@cycle/git/worktree";
import type { AgentWorkJob as AgentJob, JsonObject } from "@cycle/contracts/schemas";
import { Effect, Result, Schema } from "effect";
import type {
  AgentChatActivityRecord,
  AgentChatMessageRecord,
  AgentChatStoreShape,
  AgentChatThreadRecord,
  AgentChatTurnRecord,
  CycleApiRuntimeShape,
} from "../../runtime/CycleApiRuntime.ts";
import { meta, scoped } from "../shared.ts";
import type { ChatTurnPayload } from "./chat/domain.ts";
import { prepareChatTurn } from "./chat/prepare.ts";

const activeAgentWorkJobs = new Set<string>();

const runDefinition = <A, E, R>(
  runtime: CycleApiRuntimeShape,
  effect: Effect.Effect<A, E, R>,
): Promise<Result.Result<A, unknown>> =>
  Effect.runPromise(
    Effect.result(
      effect.pipe(Effect.provide(runtime.useCaseLayer)) as Effect.Effect<A, unknown, never>,
    ),
  );

export const launchAgentWorkJob = (input: {
  readonly runtime: CycleApiRuntimeShape;
  readonly job: AgentJob | null;
  readonly origin: string;
  readonly requestId: string;
}): void => {
  if (input.job === null || input.job.status !== "running") return;
  if (activeAgentWorkJobs.has(input.job.jobId)) return;

  activeAgentWorkJobs.add(input.job.jobId);
  void runAgentWorkJob({
    ...input,
    job: input.job,
  }).finally(() => {
    activeAgentWorkJobs.delete(input.job!.jobId);
  });
};

export const launchAgentWorkJobs = (input: {
  readonly runtime: CycleApiRuntimeShape;
  readonly jobs: readonly AgentJob[];
  readonly origin: string;
  readonly requestId: string;
}): void => {
  for (const job of input.jobs) {
    launchAgentWorkJob({
      job,
      origin: input.origin,
      requestId: input.requestId,
      runtime: input.runtime,
    });
  }
};

const runAgentWorkJob = async (input: {
  readonly runtime: CycleApiRuntimeShape;
  readonly job: AgentJob;
  readonly origin: string;
  readonly requestId: string;
}): Promise<void> => {
  const provider = providerFromJob(input.job);
  if (provider === undefined) {
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "provider-missing",
      message: `Agent provider '${input.job.providerId}' is not registered.`,
      retrySafe: false,
    });
    return;
  }

  if (
    input.job.authorityMode !== "ticket-context" &&
    input.job.authorityMode !== "implementation-worktree"
  ) {
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "unsupported-provider-capability",
      message: `Agent Work provider execution is not wired for authority '${input.job.authorityMode}'.`,
      remediation: "Use ticket-context or implementation-worktree authority.",
      retrySafe: false,
    });
    return;
  }

  const implementation = await prepareImplementationWorktree(input);
  if (implementation === "failed") return;

  const job = implementation?.job ?? input.job;
  const runInput = { ...input, job };
  const runtimeMode = runtimeModeForJob(job);
  const sessionId = `agent-work-${job.jobId}`;
  const chat = await createAgentWorkChatBridge({
    job,
    provider,
    runtime: runInput.runtime,
    sessionId,
  });
  const activeTurn = runInput.runtime.activeAgentTurns.begin({
    provider,
    requestId: job.jobId,
    sessionId,
    threadId: sessionId,
  });
  if (!activeTurn.active) {
    await runInput.runtime.agentWork.recordJobActivity({
      jobId: job.jobId,
      kind: "provider",
      message: "Provider turn is already active for this Agent Work job.",
      payload: {
        sessionId,
      },
    });
    return;
  }

  let finalStatus: "completed" | "failed" | "cancelled" = "failed";
  let finalError: string | undefined;
  let latestAssistantText = "";
  let lastTextActivityAt = 0;

  try {
    const prepared = prepareChatTurn({
      origin: runInput.origin,
      payload: {
        instructions: agentWorkInstructions(job),
        message: agentWorkMessage(job),
        mcpRequired: true,
        model: job.model ?? undefined,
        provider,
        repositories: [
          {
            id: job.repositoryId,
            ...(implementation === undefined ? {} : { path: implementation.worktree.path }),
          },
        ],
        responseFormat: AgentWorkTimelineResponseFormat,
        runtimeMode,
        sessionId,
        threadId: sessionId,
      } satisfies ChatTurnPayload,
      requestId: job.jobId,
      runtime: runInput.runtime,
    });

    if (prepared.agentRequest.mcp === undefined) {
      finalError = "Cycle MCP was not attached to the Agent Work provider request.";
      await runInput.runtime.agentWork.failJob(job.jobId, {
        actor: "workflow",
        code: "mcp-unavailable",
        message: "Cycle MCP was not attached to the Agent Work provider request.",
        remediation:
          "Restart the desktop API or check the local API MCP configuration before retrying the job.",
        retrySafe: true,
      });
      finalStatus = "failed";
      return;
    }

    await runInput.runtime.agentWork.recordJobActivity({
      jobId: job.jobId,
      kind: "provider",
      message: "Provider turn started.",
      payload: {
        orchestration: true,
        provider,
        sessionId: prepared.sessionId,
      },
    });

    for await (const event of runInput.runtime.agentOrchestration.run({
      authority: {
        jobId: job.jobId,
        mode: job.authorityMode,
        repositoryId: job.repositoryId,
        ticketId: job.ticketId,
        ...(implementation === undefined ? {} : { worktreePath: implementation.worktree.path }),
      },
      context: prepared.agentRequest.context,
      mcp: prepared.agentRequest.mcp,
      metadata: prepared.agentRequest.metadata,
      mode: "agent-work",
      prompt: promptText(prepared.agentRequest.input),
      responseFormat: prepared.agentRequest.responseFormat,
      root: {
        agentId: job.agentId,
        model: job.model ?? undefined,
        providerId: provider,
      },
      sessionId: prepared.sessionId,
      signal: activeTurn.record.abortController.signal,
      system: prepared.agentRequest.instructions,
    })) {
      if (
        await abortIfJobWasCancelled(
          runInput,
          provider,
          sessionId,
          activeTurn.record.abortController,
          event.rootRunId,
        )
      ) {
        finalStatus = "cancelled";
        return;
      }

      const result = await handleRuntimeEvent(runInput, event, {
        chat,
        getLatestAssistantText: () => latestAssistantText,
        setLatestAssistantText: (text) => {
          latestAssistantText = text;
        },
        getLastTextActivityAt: () => lastTextActivityAt,
        setLastTextActivityAt: (timestamp) => {
          lastTextActivityAt = timestamp;
        },
      });

      if (result === "waiting") {
        finalStatus = "cancelled";
        finalError = "Agent Work is waiting for user input.";
        activeTurn.record.abortController.abort(new Error("Agent Work is waiting for user input."));
        return;
      }

      if (result === "completed") {
        finalStatus = "completed";
        return;
      }

      if (result === "failed") {
        finalStatus = "failed";
        finalError = "Agent Work failed.";
        return;
      }

      if (result === "cancelled") {
        finalStatus = "cancelled";
        finalError = "Agent Work was cancelled.";
        return;
      }
    }

    await completeAgentWorkJob(runInput, latestAssistantText, chat);
    finalStatus = "completed";
  } catch (error) {
    const cancelled = await isJobCancelled(runInput.runtime, job.jobId);
    const message = error instanceof Error ? error.message : String(error);
    if (cancelled || activeTurn.record.abortController.signal.aborted) {
      finalStatus = "cancelled";
      finalError = message;
      return;
    }
    await runInput.runtime.agentWork.failJob(job.jobId, {
      actor: "provider",
      code: "provider-turn-failed",
      message,
      retrySafe: false,
    });
    finalStatus = "failed";
    finalError = message;
  } finally {
    runInput.runtime.activeAgentTurns.finish(provider, sessionId, finalStatus);
    await finishAgentWorkChatBridge(chat, finalStatus, {
      error: finalError,
      text: latestAssistantText,
    });
  }
};

type ImplementationWorktreeContext = {
  readonly job: AgentJob;
  readonly repositoryPath: string;
  readonly worktree: GitWorktreeRecord;
};

const prepareImplementationWorktree = async (input: {
  readonly runtime: CycleApiRuntimeShape;
  readonly job: AgentJob;
  readonly requestId: string;
}): Promise<ImplementationWorktreeContext | "failed" | undefined> => {
  if (input.job.authorityMode !== "implementation-worktree") return undefined;

  const service = input.runtime.worktreeService;
  const worktreeStoragePath = input.runtime.worktreeStoragePath;
  if (service === undefined || worktreeStoragePath === undefined) {
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "worktree-creation-failed",
      message: "Implementation jobs require a configured worktree service and storage path.",
      remediation: "Restart Cycle desktop so Agent Work can allocate implementation worktrees.",
      retrySafe: false,
    });
    return "failed";
  }

  try {
    const [repositoryPath, ticket] = await Promise.all([
      resolveRepositoryPath(input),
      resolveTicket(input),
    ]);
    const worktree = await Effect.runPromise(
      service.createImplementationWorktree({
        forbiddenPaths: [repositoryPath],
        jobId: input.job.jobId,
        repositoryId: input.job.repositoryId,
        repositoryPath,
        ticketId: input.job.ticketId,
        ticketSlugSource: ticketTitle(ticket) ?? input.job.ticketId,
        ticketType: ticketType(ticket),
        worktreeStoragePath,
      }),
    );
    const attached = await input.runtime.agentWork.attachWorktree(toAgentWorktreeInput(worktree));
    await input.runtime.agentWork.recordJobActivity({
      jobId: input.job.jobId,
      kind: "worktree",
      message: `Implementation worktree created at ${worktree.path}.`,
      payload: {
        branchName: worktree.branchName ?? null,
        path: worktree.path,
        worktreeId: worktree.worktreeId,
      },
    });
    return {
      job: attached ?? input.job,
      repositoryPath,
      worktree,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "worktree-creation-failed",
      message,
      retrySafe: false,
    });
    return "failed";
  }
};

const resolveRepositoryPath = async (input: {
  readonly runtime: CycleApiRuntimeShape;
  readonly job: AgentJob;
  readonly requestId: string;
}): Promise<string> => {
  const repositoriesResult = await runDefinition(
    input.runtime,
    RepositoryList.run({}, meta(input.requestId)),
  );
  if (Result.isFailure(repositoriesResult)) {
    throw new Error("Unable to list repositories for Agent Work implementation.");
  }

  const repositories = Array.isArray(repositoriesResult.success)
    ? (repositoriesResult.success as readonly RepositoryStatus[])
    : [];
  const repository = repositories.find(
    (candidate) => candidate.repositoryId === input.job.repositoryId,
  );
  const repositoryPath = repository?.metadata?.worktreePath;
  if (typeof repositoryPath !== "string" || repositoryPath.trim().length === 0) {
    throw new Error(
      `Repository '${input.job.repositoryId}' does not expose a primary worktree path.`,
    );
  }
  return repositoryPath;
};

const resolveTicket = async (input: {
  readonly runtime: CycleApiRuntimeShape;
  readonly job: AgentJob;
  readonly requestId: string;
}): Promise<TicketDocument | undefined> => {
  const ticketResult = await runDefinition(
    input.runtime,
    IssueGet.run(scoped(input.job.repositoryId, { id: input.job.ticketId }), meta(input.requestId)),
  );
  if (Result.isFailure(ticketResult)) return undefined;
  return typeof ticketResult.success === "object" && ticketResult.success !== null
    ? (ticketResult.success as TicketDocument)
    : undefined;
};

const ticketTitle = (ticket: TicketDocument | undefined): string | undefined =>
  typeof ticket?.frontmatter.title === "string" && ticket.frontmatter.title.trim().length > 0
    ? ticket.frontmatter.title
    : typeof ticket?.title === "string" && ticket.title.trim().length > 0
      ? ticket.title
      : undefined;

const ticketType = (ticket: TicketDocument | undefined): string | null | undefined =>
  typeof ticket?.type === "string"
    ? ticket.type
    : typeof ticket?.frontmatter.type === "string"
      ? ticket.frontmatter.type
      : undefined;

const runtimeModeForJob = (job: AgentJob) =>
  job.authorityMode === "implementation-worktree" ? "workspace-write" : "read-only";

const toAgentWorktreeInput = (worktree: GitWorktreeRecord) => ({
  baseRef: worktree.baseRef,
  baseSha: worktree.baseSha,
  jobId: worktree.jobId,
  mode: worktree.mode,
  path: worktree.path,
  repositoryId: worktree.repositoryId,
  status:
    worktree.status === "active"
      ? ("ready" as const)
      : worktree.status === "retained"
        ? ("retained" as const)
        : worktree.status,
  updatedAt: worktree.updatedAt,
  worktreeId: worktree.worktreeId,
  createdAt: worktree.createdAt,
  ...(worktree.branchName === undefined ? {} : { branchName: worktree.branchName }),
  ...(worktree.branchRef === undefined ? {} : { branchRef: worktree.branchRef }),
  ...(worktree.cleanedAt === undefined ? {} : { cleanedAt: worktree.cleanedAt }),
  ...(worktree.retentionReason === undefined ? {} : { retentionReason: worktree.retentionReason }),
});

type ProviderEventResult = "continue" | "waiting" | "completed" | "failed" | "cancelled";

type AgentWorkChatBridge = {
  readonly chatStore: AgentChatStoreShape;
  readonly thread: AgentChatThreadRecord;
  readonly turn: AgentChatTurnRecord;
};

const createAgentWorkChatBridge = async (input: {
  readonly runtime: CycleApiRuntimeShape;
  readonly job: AgentJob;
  readonly provider: AgentProviderId;
  readonly sessionId: string;
}): Promise<AgentWorkChatBridge | undefined> => {
  const chatStore = input.runtime.agentChatStore;
  if (chatStore === undefined) return undefined;

  const now = input.runtime.now().toISOString();
  const commentId = stringFromMetadata(input.job.metadata, "commentId");
  const commentBody = stringFromMetadata(input.job.metadata, "commentBody");
  const ticketUri = agentWorkTicketUri(input.job);
  const turnId = `turn-agent-work-${input.job.jobId}`;
  const userMessage: AgentChatMessageRecord = {
    actor: "user",
    body: agentWorkChatSeedMessage({
      commentBody,
      job: input.job,
      ticketUri,
    }),
    createdAt: input.job.createdAt,
    id: `message-agent-work-user-${input.job.jobId}`,
    metadata: {
      agentWork: true,
      jobId: input.job.jobId,
    },
    threadId: input.sessionId,
    turnId,
    updatedAt: input.job.createdAt,
  };
  const origin = {
    agentId: input.job.agentId,
    ...(commentId === undefined ? {} : { commentId }),
    issueId: input.job.ticketId,
    jobId: input.job.jobId,
    kind: commentId === undefined ? "agent-work" : "issue-comment",
    repositoryId: input.job.repositoryId,
    trigger: input.job.trigger,
  };
  const thread: AgentChatThreadRecord = {
    activeTurnId: turnId,
    agentId: input.provider,
    createdAt: input.job.createdAt,
    id: input.sessionId,
    lastError: null,
    model: input.job.model ?? null,
    origin,
    runtimeMode: runtimeModeForJob(input.job),
    sessionId: input.sessionId,
    status: "active",
    summary:
      commentBody?.trim().slice(0, 160) ??
      `Agent ${input.job.agentId} is working on ticket ${input.job.ticketId}.`,
    title: `${agentDisplayName(input.job.agentId)} review: ${input.job.ticketId}`,
    updatedAt: now,
  };
  const turn: AgentChatTurnRecord = {
    createdAt: now,
    id: turnId,
    inputMessageId: userMessage.id,
    metadata: {
      agentWork: true,
      authorityMode: input.job.authorityMode,
      jobId: input.job.jobId,
      trigger: input.job.trigger,
    },
    model: input.job.model ?? null,
    providerId: input.provider,
    runtimeMode: runtimeModeForJob(input.job),
    status: "running",
    threadId: input.sessionId,
    updatedAt: now,
  };

  await chatStore.upsertThread(thread);
  await chatStore.upsertMessage(userMessage);
  await chatStore.upsertTurn?.(turn);
  await upsertAgentWorkChatActivity(
    { chatStore, thread, turn },
    {
      createdAt: now,
      detail: `Ticket ${input.job.ticketId}`,
      id: `activity-agent-work-start-${input.job.jobId}`,
      kind: "progress",
      payload: {
        authorityMode: input.job.authorityMode,
        jobId: input.job.jobId,
        trigger: input.job.trigger,
      },
      status: "running",
      threadId: thread.id,
      title: "Agent work started",
      turnId,
      updatedAt: now,
    },
  );

  return { chatStore, thread, turn };
};

const agentDisplayName = (agentId: string): string =>
  agentId.length === 0 ? "Agent" : `${agentId[0]?.toUpperCase() ?? ""}${agentId.slice(1)}`;

const agentWorkChatSeedMessage = (input: {
  readonly commentBody?: string;
  readonly job: AgentJob;
  readonly ticketUri: string;
}): string =>
  [
    input.commentBody?.trim() ||
      `Agent ${input.job.agentId} was mentioned on ticket ${input.job.ticketId}.`,
    "",
    `Ticket: ${input.ticketUri}`,
  ].join("\n");

const finishAgentWorkChatBridge = async (
  chat: AgentWorkChatBridge | undefined,
  status: "completed" | "failed" | "cancelled",
  result: {
    readonly error?: string;
    readonly text: string;
  },
): Promise<void> => {
  if (chat === undefined) return;

  const completedAt = new Date().toISOString();
  const finalText = result.text.trim();
  const assistantMessageId = `message-agent-work-assistant-${chat.thread.id}`;
  if (finalText.length > 0) {
    await chat.chatStore.upsertMessage({
      actor: "agent",
      body: finalText,
      createdAt: completedAt,
      id: assistantMessageId,
      metadata: {
        agentWork: true,
        jobId: chat.thread.origin?.jobId,
      },
      streaming: false,
      threadId: chat.thread.id,
      turnId: chat.turn.id,
      updatedAt: completedAt,
    });
  }

  const turn: AgentChatTurnRecord = {
    ...chat.turn,
    ...(finalText.length === 0 ? {} : { assistantMessageId }),
    completedAt,
    lastError: result.error ?? null,
    status,
    updatedAt: completedAt,
  };
  const thread: AgentChatThreadRecord = {
    ...chat.thread,
    activeTurnId: null,
    lastError: result.error ?? null,
    status: status === "failed" ? "error" : "active",
    summary:
      status === "failed" && result.error
        ? result.error
        : finalText.slice(0, 160) || chat.thread.summary,
    updatedAt: completedAt,
  };

  await chat.chatStore.upsertTurn?.(turn);
  await chat.chatStore.upsertThread(thread);
  await upsertAgentWorkChatActivity(chat, {
    createdAt: completedAt,
    detail: result.error ?? undefined,
    id: `activity-agent-work-finished-${chat.thread.id}`,
    kind: status === "failed" ? "error" : "system",
    payload: {
      jobId: chat.thread.origin?.jobId,
      status,
    },
    status,
    threadId: chat.thread.id,
    title:
      status === "completed"
        ? "Agent work completed"
        : status === "cancelled"
          ? "Agent work cancelled"
          : "Agent work failed",
    turnId: chat.turn.id,
    updatedAt: completedAt,
  });
};

const upsertAgentWorkChatActivity = async (
  chat: AgentWorkChatBridge | undefined,
  activity: AgentChatActivityRecord,
): Promise<void> => {
  await chat?.chatStore.upsertActivity?.(activity);
};

const upsertAgentWorkAssistantMessage = async (
  chat: AgentWorkChatBridge | undefined,
  text: string,
  occurredAt: string,
  streaming: boolean,
): Promise<void> => {
  if (chat === undefined || text.trim().length === 0) return;

  await chat.chatStore.upsertMessage({
    actor: "agent",
    body: text,
    createdAt: occurredAt,
    id: `message-agent-work-assistant-${chat.thread.id}`,
    metadata: {
      agentWork: true,
      jobId: chat.thread.origin?.jobId,
    },
    streaming,
    threadId: chat.thread.id,
    turnId: chat.turn.id,
    updatedAt: occurredAt,
  });
};

const upsertAgentWorkRuntimeActivity = async (
  chat: AgentWorkChatBridge | undefined,
  event: AgentRuntimeEvent,
  payload: Readonly<Record<string, unknown>>,
  eventName: string,
): Promise<void> => {
  if (chat === undefined) return;
  if (event._tag === "AgentMessageDelta" || event._tag === "ReasoningDelta") return;

  const occurredAt = event.occurredAt;
  const activity = agentWorkActivityFromRuntimeEvent(chat, event, payload, eventName, occurredAt);
  if (activity !== undefined) await upsertAgentWorkChatActivity(chat, activity);
};

const agentWorkActivityFromRuntimeEvent = (
  chat: AgentWorkChatBridge,
  event: AgentRuntimeEvent,
  payload: Readonly<Record<string, unknown>>,
  eventName: string,
  occurredAt: string,
): AgentChatActivityRecord | undefined => {
  const base = {
    createdAt: occurredAt,
    payload,
    threadId: chat.thread.id,
    turnId: chat.turn.id,
    updatedAt: occurredAt,
  } satisfies Pick<
    AgentChatActivityRecord,
    "createdAt" | "payload" | "threadId" | "turnId" | "updatedAt"
  >;

  switch (event._tag) {
    case "AgentRunStarted":
      return {
        ...base,
        detail: event.providerId,
        id: `activity-agent-run-${event.runId}`,
        kind: "progress",
        status: "running",
        title: "Agent run started",
      };
    case "AgentRunCompleted":
      return {
        ...base,
        detail: event.summary,
        id: `activity-agent-run-${event.runId}`,
        kind: "progress",
        status: "completed",
        title: "Agent run completed",
      };
    case "AgentRunFailed":
      return {
        ...base,
        detail: event.message,
        id: `activity-agent-run-${event.runId}`,
        kind: "error",
        status: "failed",
        title: "Agent run failed",
      };
    case "AgentRunCancelled":
      return {
        ...base,
        detail: event.reason,
        id: `activity-agent-run-${event.runId}`,
        kind: "system",
        status: "cancelled",
        title: "Agent run cancelled",
      };
    case "ReasoningStarted":
    case "ReasoningEnded":
      return {
        ...base,
        id: `activity-reasoning-${event.itemId ?? event.runId}`,
        kind: "thinking",
        status: event._tag === "ReasoningEnded" ? "completed" : "running",
        title: "Thinking",
      };
    case "ScriptStarted":
    case "ScriptDelta":
    case "ScriptEnded":
    case "ScriptOutput":
      return {
        ...base,
        detail:
          event._tag === "ScriptOutput"
            ? event.output.slice(0, 1000)
            : event._tag === "ScriptDelta"
              ? event.delta.slice(0, 1000)
              : event._tag === "ScriptStarted"
                ? (event.title ?? event.scriptId)
                : event.scriptId,
        id: `activity-script-${event.scriptId ?? event.eventId}`,
        kind: "tool",
        status: event._tag === "ScriptEnded" ? "completed" : "running",
        title: "Script",
      };
    case "ToolStarted":
    case "ToolCompleted":
    case "ToolFailed":
      return {
        ...base,
        detail:
          event._tag === "ToolFailed" ? `${event.toolName}: ${event.message}` : event.toolName,
        id: `activity-tool-${event.toolCallId}`,
        kind: "tool",
        status:
          event._tag === "ToolFailed"
            ? "failed"
            : event._tag === "ToolCompleted"
              ? "completed"
              : "running",
        title: event.toolName.startsWith("mcp") ? "MCP tool" : "Tool",
      };
    case "SubagentStarted":
    case "SubagentEvent":
    case "SubagentCompleted":
      return {
        ...base,
        detail: event.childRunId,
        id: `activity-subagent-${event.childRunId}`,
        kind: "tool",
        status: event._tag === "SubagentCompleted" ? "completed" : "running",
        title: "Sub-agent",
      };
    case "UsageReported":
      return {
        ...base,
        detail:
          typeof event.totalTokens === "number" ? `${event.totalTokens} total tokens` : undefined,
        id: `activity-usage-${event.eventId}`,
        kind: "usage",
        status: "completed",
        title: "Usage summary",
      };
    case "RetryScheduled":
      return {
        ...base,
        detail: event.reason,
        id: `activity-retry-${event.eventId}`,
        kind: "system",
        status: "pending",
        title: "Retry scheduled",
      };
    case "WarningReported":
      return {
        ...base,
        detail: event.message,
        id: `activity-warning-${event.eventId}`,
        kind: "system",
        status: "completed",
        title: "Runtime warning",
      };
    default:
      return {
        ...base,
        id: `activity-runtime-${event.eventId}`,
        kind: "progress",
        status: "completed",
        title: eventName,
      };
  }
};

const handleRuntimeEvent = async (
  input: {
    readonly runtime: CycleApiRuntimeShape;
    readonly job: AgentJob;
    readonly requestId: string;
  },
  event: AgentRuntimeEvent,
  state: {
    readonly chat?: AgentWorkChatBridge;
    readonly getLatestAssistantText: () => string;
    readonly setLatestAssistantText: (text: string) => void;
    readonly getLastTextActivityAt: () => number;
    readonly setLastTextActivityAt: (timestamp: number) => void;
  },
): Promise<ProviderEventResult> => {
  const payload = runtimeEventPayload(event);
  const eventName = agentRuntimeEventName(event);
  await upsertAgentWorkRuntimeActivity(state.chat, event, payload, eventName);

  switch (event._tag) {
    case "AgentRunStarted":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "runtime-event",
        message: `Agent run started for ${event.agentId}.`,
        payload,
      });
      return "continue";

    case "AgentMessageDelta":
      state.setLatestAssistantText(
        event.snapshot ?? `${state.getLatestAssistantText()}${event.delta}`,
      );
      await upsertAgentWorkAssistantMessage(
        state.chat,
        state.getLatestAssistantText(),
        event.occurredAt,
        true,
      );
      await maybeRecordTextActivity(input, new Date(event.occurredAt), state);
      return "continue";

    case "ReasoningStarted":
    case "ReasoningDelta":
    case "ReasoningEnded":
      if (event._tag !== "ReasoningDelta") {
        await input.runtime.agentWork.recordJobActivity({
          jobId: input.job.jobId,
          kind: "reasoning",
          message: eventName,
          payload,
        });
      }
      return "continue";

    case "ScriptStarted":
    case "ScriptDelta":
    case "ScriptEnded":
    case "ScriptOutput":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "script",
        message:
          event._tag === "ScriptOutput"
            ? event.output.slice(0, 1000)
            : event._tag === "ScriptDelta"
              ? event.delta.slice(0, 1000)
              : eventName,
        payload,
      });
      return "continue";

    case "ToolStarted":
    case "ToolCompleted":
    case "ToolFailed":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "tool",
        message:
          event._tag === "ToolFailed"
            ? `${event.toolName} failed: ${event.message}`
            : `${event.toolName} ${event._tag === "ToolStarted" ? "started" : "completed"}.`,
        payload,
      });
      return "continue";

    case "SubagentStarted":
    case "SubagentEvent":
    case "SubagentCompleted":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "subagent",
        message:
          event._tag === "SubagentCompleted"
            ? `Subagent ${event.childRunId} completed.`
            : event._tag === "SubagentStarted"
              ? `Subagent ${event.childRunId} started.`
              : `Subagent ${event.childRunId} event.`,
        payload,
      });
      return "continue";

    case "UsageReported":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "usage",
        message:
          typeof event.totalTokens === "number"
            ? `Usage: ${event.totalTokens} total tokens.`
            : "Usage summary recorded.",
        payload,
      });
      return "continue";

    case "RetryScheduled":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "retry",
        message: event.reason,
        payload,
      });
      return "continue";

    case "WarningReported":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "warning",
        message: event.message,
        payload,
      });
      return "continue";

    case "AgentRunCompleted":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "runtime-event",
        message: "Agent run completed.",
        payload,
      });
      {
        const finalText = event.summary || state.getLatestAssistantText();
        state.setLatestAssistantText(finalText);
        await upsertAgentWorkAssistantMessage(state.chat, finalText, event.occurredAt, false);
        await completeAgentWorkJob(input, finalText, state.chat);
      }
      return "completed";

    case "AgentRunFailed":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "runtime-event",
        message: event.message,
        payload,
      });
      await input.runtime.agentWork.failJob(input.job.jobId, {
        actor: "orchestration",
        code: agentWorkFailureCodeFromRuntime(event.code),
        message: event.message,
        retrySafe: event.retryable ?? false,
      });
      return "failed";

    case "AgentRunCancelled":
      await input.runtime.agentWork.recordJobActivity({
        jobId: input.job.jobId,
        kind: "runtime-event",
        message: event.reason,
        payload,
      });
      await input.runtime.agentWork.cancelJob(input.job.jobId, event.reason, "orchestration");
      return "cancelled";
  }
};

const maybeRecordTextActivity = async (
  input: { readonly runtime: CycleApiRuntimeShape; readonly job: AgentJob },
  at: Date,
  state: {
    readonly getLatestAssistantText: () => string;
    readonly getLastTextActivityAt: () => number;
    readonly setLastTextActivityAt: (timestamp: number) => void;
  },
): Promise<void> => {
  const timestamp = at.getTime();
  const text = state.getLatestAssistantText().trim();
  if (text.length === 0 || timestamp - state.getLastTextActivityAt() < 2000) return;
  state.setLastTextActivityAt(timestamp);
  await input.runtime.agentWork.recordJobActivity({
    jobId: input.job.jobId,
    kind: "assistant_text",
    message: text.slice(-1200),
    payload: {
      length: text.length,
    },
  });
};

const completeAgentWorkJob = async (
  input: {
    readonly runtime: CycleApiRuntimeShape;
    readonly job: AgentJob;
    readonly requestId: string;
  },
  text: string,
  chat?: AgentWorkChatBridge,
): Promise<void> => {
  if (await isJobCancelled(input.runtime, input.job.jobId)) return;

  const finalText = text.trim();
  const completion = await implementationCompletion(input, finalText);
  const commentBody = completion?.commentBody ?? finalText;
  if (commentBody.length > 0) {
    await addCompletionComment(input, commentBody, chat);
  }

  await input.runtime.agentWork.completeJob(input.job.jobId, {
    actor: "provider",
    message:
      commentBody.length === 0
        ? "Provider completed without a text response."
        : input.job.authorityMode === "implementation-worktree"
          ? "Implementation branch was published and a ticket comment was added."
          : "Provider response was added as a ticket comment.",
    payload: {
      ...completion?.payload,
      responseLength: commentBody.length,
    },
  });
};

const implementationCompletion = async (
  input: {
    readonly runtime: CycleApiRuntimeShape;
    readonly job: AgentJob;
    readonly requestId: string;
  },
  providerText: string,
): Promise<
  | {
      readonly commentBody: string;
      readonly payload: Readonly<Record<string, unknown>>;
    }
  | undefined
> => {
  if (input.job.authorityMode !== "implementation-worktree") return undefined;

  const service = input.runtime.worktreeService;
  if (service === undefined) {
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "worktree-creation-failed",
      message: "Implementation completion requires a configured worktree service.",
      retrySafe: false,
    });
    throw new Error("Implementation completion requires a configured worktree service.");
  }

  const repositoryPath = await resolveRepositoryPath(input);
  const worktree = gitWorktreeFromJob(input.job);
  if (worktree === undefined) {
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "worktree-dirty-or-unavailable",
      message: "Implementation job completed without an attached worktree record.",
      retrySafe: false,
    });
    throw new Error("Implementation job completed without an attached worktree record.");
  }

  const diff = await Effect.runPromise(service.diffWorktree({ path: worktree.path }));
  if (!diff.dirty) {
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "worktree-dirty-or-unavailable",
      message: "Agent completed, but the implementation worktree has no changes to commit.",
      retrySafe: false,
    });
    throw new Error("Agent completed without implementation changes.");
  }

  const commit = await Effect.runPromise(
    service.commitWorktree({
      message: implementationCommitMessage(input.job, providerText),
      repositoryPath,
      worktree,
    }),
  );
  const publication = await Effect.runPromise(
    service.createOrUpdateBranch({
      baseSha: worktree.baseSha,
      desiredBranchName: worktree.branchName ?? `cycle/task/${input.job.ticketId}`,
      jobId: input.job.jobId,
      repositoryId: input.job.repositoryId,
      repositoryPath,
      targetSha: commit.sha,
      ticketId: input.job.ticketId,
    }),
  );
  await input.runtime.agentWork.attachBranchAssociation(
    toAgentBranchAssociationInput(publication.association),
  );
  const retained = await Effect.runPromise(
    service.retainWorktree({
      reason: "implementation-completed",
      worktree: {
        ...worktree,
        branchName: publication.association.branchName,
        branchRef: publication.association.branchRef,
      },
    }),
  );
  await input.runtime.agentWork.attachWorktree(toAgentWorktreeInput(retained));
  await input.runtime.agentWork.recordJobActivity({
    jobId: input.job.jobId,
    kind: "branch",
    message: `Implementation committed to ${publication.association.branchName}.`,
    payload: {
      branchAssociationId: publication.association.branchAssociationId,
      branchName: publication.association.branchName,
      branchRef: publication.association.branchRef,
      commitSha: commit.sha,
      worktreePath: retained.path,
    },
  });

  const commentBody = implementationCommentBody({
    branchName: publication.association.branchName,
    commitSha: commit.sha,
    providerText,
    worktreePath: retained.path,
  });
  return {
    commentBody,
    payload: {
      branchAssociationId: publication.association.branchAssociationId,
      branchName: publication.association.branchName,
      branchRef: publication.association.branchRef,
      commitSha: commit.sha,
      worktreePath: retained.path,
    },
  };
};

const gitWorktreeFromJob = (job: AgentJob): GitWorktreeRecord | undefined => {
  const worktreeId = job.worktreeId ?? stringFromMetadata(job.metadata, "worktreeId");
  const path = stringFromMetadata(job.metadata, "worktreePath");
  const baseRef = stringFromMetadata(job.metadata, "baseRef");
  const baseSha = stringFromMetadata(job.metadata, "baseSha");
  const branchName = stringFromMetadata(job.metadata, "branchName");
  const branchRef = stringFromMetadata(job.metadata, "branchRef");
  if (
    worktreeId === undefined ||
    path === undefined ||
    baseRef === undefined ||
    baseSha === undefined
  ) {
    return undefined;
  }

  return {
    baseRef,
    baseSha,
    createdAt: job.createdAt,
    jobId: job.jobId,
    mode: "implementation",
    path,
    repositoryId: job.repositoryId,
    status: "active",
    updatedAt: job.updatedAt,
    worktreeId,
    ...(branchName === undefined ? {} : { branchName }),
    ...(branchRef === undefined ? {} : { branchRef }),
  };
};

const toAgentBranchAssociationInput = (association: GitBranchAssociation) => ({
  baseSha: association.baseSha,
  branchAssociationId: association.branchAssociationId,
  branchName: association.branchName,
  branchRef: association.branchRef,
  createdAt: association.createdAt,
  headSha: association.headSha,
  jobId: association.jobId,
  repositoryId: association.repositoryId,
  status: association.status,
  ticketId: association.ticketId,
  updatedAt: association.updatedAt,
});

const implementationCommitMessage = (job: AgentJob, providerText: string): string =>
  [
    `Implement ${job.ticketId}`,
    providerText.trim().length === 0 ? undefined : providerText.trim().slice(0, 4000),
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n\n");

const implementationCommentBody = (input: {
  readonly branchName: string;
  readonly commitSha: string;
  readonly providerText: string;
  readonly worktreePath: string;
}): string =>
  [
    input.providerText.trim() || "Implemented the delegated ticket.",
    "",
    `Branch: ${input.branchName}`,
    `Commit: ${input.commitSha}`,
    `Worktree: ${input.worktreePath}`,
  ].join("\n");

const addCompletionComment = async (
  input: {
    readonly runtime: CycleApiRuntimeShape;
    readonly job: AgentJob;
    readonly requestId: string;
  },
  body: string,
  chat?: AgentWorkChatBridge,
): Promise<void> => {
  const commentRequestId = `${input.requestId}:agent-work-comment`;
  const result = await runDefinition(
    input.runtime,
    CommentAdd.run(
      scoped(input.job.repositoryId, {
        body,
        issueId: input.job.ticketId,
      }),
      meta(commentRequestId),
    ),
  );

  if (Result.isFailure(result)) {
    await input.runtime.agentWork.failJob(input.job.jobId, {
      actor: "workflow",
      code: "handover-comment-failed",
      message: "Provider completed, but Cycle could not add the response comment.",
      retrySafe: false,
    });
    throw new Error("Agent Work completion comment failed.");
  }

  await input.runtime.agentWork.recordJobActivity({
    jobId: input.job.jobId,
    kind: "comment",
    message: "Completion comment added to the ticket timeline.",
    payload: jsonObject({
      comment: result.success,
    }),
  });
  await input.runtime.agentWork.emit({
    dedupeKey: `agent-work-comment:${input.job.jobId}:${commentRequestId}`,
    eventType: "ticket.comment_added",
    jobId: input.job.jobId,
    payload: jsonObject({
      comment: result.success,
      requestId: commentRequestId,
    }),
    repositoryId: input.job.repositoryId,
    source: "api",
    ticketId: input.job.ticketId,
  });
  if (chat !== undefined) {
    const occurredAt = input.runtime.now().toISOString();
    await upsertAgentWorkChatActivity(chat, {
      createdAt: occurredAt,
      detail: `Ticket ${input.job.ticketId}`,
      id: `activity-comment-posted-${input.job.jobId}`,
      kind: "system",
      payload: jsonObject({
        comment: result.success,
        jobId: input.job.jobId,
        ticketId: input.job.ticketId,
      }),
      status: "completed",
      threadId: chat.thread.id,
      title: "Posted reply to issue",
      turnId: chat.turn.id,
      updatedAt: occurredAt,
    });
  }
};

const abortIfJobWasCancelled = async (
  input: { readonly runtime: CycleApiRuntimeShape; readonly job: AgentJob },
  provider: AgentProviderId,
  sessionId: string,
  controller: AbortController,
  rootRunId?: string,
): Promise<boolean> => {
  if (!(await isJobCancelled(input.runtime, input.job.jobId))) return false;
  controller.abort(new Error("Agent Work job was cancelled."));
  if (rootRunId !== undefined) {
    await input.runtime.agentOrchestration.cancel(rootRunId, "Agent Work job was cancelled.");
  } else {
    const service = await Effect.runPromise(input.runtime.agentServices.serviceFor(provider));
    await service.abortTurn(sessionId).catch(() => undefined);
  }
  return true;
};

const isJobCancelled = async (runtime: CycleApiRuntimeShape, jobId: string): Promise<boolean> => {
  const current = await runtime.agentWork.getJob(jobId);
  return current?.status === "cancelled" || current?.status === "cancelling";
};

const providerFromJob = (job: AgentJob): AgentProviderId | undefined =>
  isAgentProviderId(job.providerId) ? job.providerId : undefined;

const agentWorkFailureCodeFromRuntime = (code: string) =>
  code === "mcp_unavailable" ? "mcp-unavailable" : code;

const agentWorkInstructions = (job: AgentJob): string =>
  job.authorityMode === "implementation-worktree"
    ? [
        "You are running as a Cycle Agent Work implementation job.",
        "Implement the scoped ticket in the assigned worktree only. Do not modify the primary repository checkout, push to remotes, or transition ticket status.",
        "Use the attached Cycle MCP tools for ticket and repository context. Do not call localhost or the Cycle HTTP API with shell commands.",
        "When finished, return only structured JSON with a response field. The response field is a concise implementation summary for the ticket timeline, including relevant testing notes.",
        `Job id: ${job.jobId}`,
        `Authority mode: ${job.authorityMode}`,
      ].join("\n")
    : [
        "You are running as a Cycle Agent Work background job.",
        "This job has ticket-context authority: inspect the scoped ticket and repository context, but do not edit files, run mutating shell commands, transition ticket status, or create branches.",
        "Use the attached Cycle MCP tools for ticket and repository context. Do not call localhost or the Cycle HTTP API with shell commands.",
        "When finished, return only structured JSON with a response field. The response field is the exact concise comment body that should be added to the ticket timeline; do not include progress logs, diagnostics, or private runtime output.",
        `Job id: ${job.jobId}`,
        `Authority mode: ${job.authorityMode}`,
      ].join("\n");

const agentWorkMessage = (job: AgentJob): string =>
  [
    job.trigger === "agent-delegate"
      ? `Agent ${job.agentId} was delegated implementation for ticket ${job.ticketId}.`
      : `Agent ${job.agentId} was mentioned on ticket ${job.ticketId}.`,
    `Ticket URI: ${agentWorkTicketUri(job)}`,
    stringFromMetadata(job.metadata, "commentId") === undefined
      ? undefined
      : `Mention comment id: ${stringFromMetadata(job.metadata, "commentId")}`,
    stringFromMetadata(job.metadata, "instructions") === undefined
      ? undefined
      : `User instructions: ${stringFromMetadata(job.metadata, "instructions")}`,
    job.authorityMode === "implementation-worktree"
      ? "Implement the ticket in the assigned worktree, then reply with a concise implementation summary."
      : "Inspect the ticket and triggering comment, then reply with the result for the ticket timeline.",
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n");

const agentWorkTicketUri = (job: AgentJob): string =>
  `cycle://repository/${job.repositoryId}/tickets/${job.ticketId}`;

const stringFromMetadata = (
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined => {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const jsonObject = (value: unknown): JsonObject => {
  try {
    const text = JSON.stringify(value, (_key, entry) => {
      if (entry instanceof Error) {
        return {
          message: entry.message,
          name: entry.name,
        };
      }
      return entry;
    });
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : {};
  } catch {
    return {};
  }
};

const runtimeEventPayload = (event: AgentRuntimeEvent): JsonObject =>
  jsonObject({
    event,
    eventType: agentRuntimeEventName(event),
  });

const promptText = (input: AgentInput): string =>
  typeof input === "string"
    ? input
    : input.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n");

const AgentWorkTimelineResponse = Schema.Struct({
  response: Schema.String,
});
type AgentWorkTimelineResponse = typeof AgentWorkTimelineResponse.Type;

const AgentWorkTimelineResponseFormat = {
  effectSchema: AgentWorkTimelineResponse,
  schema: {
    additionalProperties: false,
    properties: {
      response: {
        description: "The exact concise ticket timeline comment body to publish.",
        type: "string",
      },
    },
    required: ["response"],
    type: "object",
  },
  type: "json_schema",
} satisfies AgentResponseFormat<AgentWorkTimelineResponse>;
