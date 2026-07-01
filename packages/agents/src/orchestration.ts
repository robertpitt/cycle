import { Effect } from "effect";
import type {
  AgentContentStreamKind,
  AgentEvent,
  AgentInput,
  AgentMcpAttachment,
  AgentProviderId,
  AgentResponseFormat,
  AgentRuntimeMode,
  AgentService,
  AgentTurnRequest,
  AgentTurnResult,
  JsonObject,
} from "./types.ts";
import type { AgentServiceRegistryShape } from "./services/AgentServiceRegistry.ts";
import {
  AgentMessageDelta,
  AgentRunCancelled,
  AgentRunCompleted,
  AgentRunFailed,
  AgentRunStarted,
  ReasoningDelta,
  ReasoningEnded,
  ReasoningStarted,
  ScriptDelta,
  ScriptEnded,
  ScriptOutput,
  ScriptStarted,
  ToolCompleted,
  ToolFailed,
  ToolStarted,
  UsageReported,
  WarningReported,
  type AgentRuntimeEvent,
} from "./runtime-events.ts";

export type AgentRunId = string;

export type AgentRunStatus =
  | "starting"
  | "running"
  | "waiting"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentRunRef = {
  readonly runId: AgentRunId;
  readonly parentRunId?: AgentRunId;
  readonly rootRunId: AgentRunId;
  readonly jobId?: string;
  readonly agentId: string;
  readonly providerId: AgentProviderId;
  readonly model?: string;
};

export type AgentAuthorityContext = {
  readonly mode: "ticket-context" | "disposable-worktree" | "implementation-worktree";
  readonly repositoryId: string;
  readonly ticketId?: string;
  readonly jobId?: string;
  readonly worktreePath?: string;
  readonly branchName?: string;
  readonly allowedTools?: readonly string[];
};

export type AgentOrchestrationRequest = {
  readonly root: {
    readonly agentId: string;
    readonly providerId: AgentProviderId;
    readonly model?: string;
  };
  readonly prompt: string;
  readonly system?: string;
  readonly authority: AgentAuthorityContext;
  readonly mode: "agent-work" | "chat" | "diagnostic";
  readonly metadata?: JsonObject;
  readonly context?: JsonObject;
  readonly mcp?: AgentMcpAttachment;
  readonly responseFormat?: AgentResponseFormat;
  readonly sessionId?: string;
  readonly signal?: AbortSignal;
};

export type AgentRunTerminalState =
  | {
      readonly status: "completed";
      readonly summary: string;
    }
  | {
      readonly status: "failed";
      readonly code: string;
      readonly message: string;
    }
  | {
      readonly status: "cancelled";
      readonly reason: string;
    };

export type AgentRunSnapshot = {
  readonly run: AgentRunRef;
  readonly status: AgentRunStatus;
  readonly children: readonly AgentRunId[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly terminal?: AgentRunTerminalState;
};

export type AgentRuntimeError = {
  readonly code: "not_found" | "provider_error" | "unsupported" | "unknown";
  readonly message: string;
};

export type AgentOrchestrationServiceShape = {
  readonly run: (request: AgentOrchestrationRequest) => AsyncIterable<AgentRuntimeEvent>;
  readonly cancel: (runId: AgentRunId, reason?: string) => Promise<void>;
  readonly steer: (runId: AgentRunId, message: string) => Promise<void>;
  readonly inspect: (runId: AgentRunId) => Promise<AgentRunSnapshot | undefined>;
};

export type AgentOrchestrationServiceOptions = {
  readonly agentServices: AgentServiceRegistryShape;
  readonly now?: () => Date;
  readonly makeId?: (prefix: string) => string;
};

type ActiveRun = {
  readonly controller: AbortController;
  readonly provider: AgentProviderId;
  readonly service: AgentService;
  readonly sessionId: string;
  snapshot: AgentRunSnapshot;
};

type RuntimeEventBaseInput = {
  readonly run: AgentRunRef;
  readonly makeId: (prefix: string) => string;
  readonly now: () => Date;
};

export const makeAgentOrchestrationService = (
  options: AgentOrchestrationServiceOptions,
): AgentOrchestrationServiceShape => {
  const now = options.now ?? (() => new Date());
  const makeId = options.makeId ?? defaultId;
  const activeRuns = new Map<AgentRunId, ActiveRun>();
  const snapshots = new Map<AgentRunId, AgentRunSnapshot>();

  const updateSnapshot = (
    runId: AgentRunId,
    patch: Partial<Pick<AgentRunSnapshot, "status" | "terminal" | "updatedAt">>,
  ) => {
    const active = activeRuns.get(runId);
    const current = active?.snapshot ?? snapshots.get(runId);
    if (current === undefined) return;
    const next: AgentRunSnapshot = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? now().toISOString(),
    };
    snapshots.set(runId, next);
    if (active !== undefined) active.snapshot = next;
  };

  return {
    cancel: async (runId, reason = "Agent run cancellation requested.") => {
      const active = activeRuns.get(runId);
      if (active === undefined) return;
      updateSnapshot(runId, { status: "cancelling" });
      active.controller.abort(new Error(reason));
      await active.service.abortTurn(active.sessionId).catch(() => undefined);
    },
    inspect: async (runId) => snapshots.get(runId),
    run: (request) =>
      runWithCurrentProvider({
        activeRuns,
        agentServices: options.agentServices,
        makeId,
        now,
        request,
        snapshots,
        updateSnapshot,
      }),
    steer: async () => {
      throw new Error("Agent run steering is not available for the compatibility provider path.");
    },
  };
};

const runWithCurrentProvider = async function* (input: {
  readonly activeRuns: Map<AgentRunId, ActiveRun>;
  readonly agentServices: AgentServiceRegistryShape;
  readonly makeId: (prefix: string) => string;
  readonly now: () => Date;
  readonly request: AgentOrchestrationRequest;
  readonly snapshots: Map<AgentRunId, AgentRunSnapshot>;
  readonly updateSnapshot: (
    runId: AgentRunId,
    patch: Partial<Pick<AgentRunSnapshot, "status" | "terminal" | "updatedAt">>,
  ) => void;
}): AsyncIterable<AgentRuntimeEvent> {
  const runId = input.makeId("run");
  const run: AgentRunRef = {
    agentId: input.request.root.agentId,
    jobId: input.request.authority.jobId,
    model: input.request.root.model,
    providerId: input.request.root.providerId,
    rootRunId: runId,
    runId,
  };
  const base = baseFactory({ makeId: input.makeId, now: input.now, run });
  const startedAt = input.now().toISOString();
  const snapshot: AgentRunSnapshot = {
    children: [],
    run,
    startedAt,
    status: "starting",
    updatedAt: startedAt,
  };
  input.snapshots.set(runId, snapshot);

  yield new AgentRunStarted({
    ...base(),
    agentId: run.agentId,
    model: run.model,
    prompt: input.request.prompt,
    providerId: run.providerId,
  });

  const controller = new AbortController();
  const cleanupAbort = bridgeAbort(input.request.signal, controller);
  let service: AgentService | undefined;
  let sessionId: string | undefined;
  let assistantText = "";
  let reasoningOpen = false;
  let sawAssistantContentDelta = false;
  const openScriptIds = new Set<string>();

  try {
    service = await Effect.runPromise(input.agentServices.serviceFor(run.providerId));
    const session =
      input.request.sessionId === undefined
        ? await service.createSession({
            metadata: input.request.metadata,
            model: run.model === undefined ? undefined : { id: run.model },
            runtimeMode: runtimeModeFromAuthority(input.request.authority),
            workspace:
              input.request.authority.worktreePath === undefined
                ? undefined
                : { cwd: input.request.authority.worktreePath },
          })
        : await service.resumeSession(input.request.sessionId);
    sessionId = session.id;
    input.activeRuns.set(runId, {
      controller,
      provider: run.providerId,
      service,
      sessionId,
      snapshot,
    });
    input.updateSnapshot(runId, { status: "running" });

    const request: AgentTurnRequest = {
      context: jsonObjectFromEntries({
        ...input.request.context,
        authorityMode: input.request.authority.mode,
        jobId: input.request.authority.jobId,
        repositoryId: input.request.authority.repositoryId,
        ticketId: input.request.authority.ticketId,
        worktreePath: input.request.authority.worktreePath,
      }),
      input: input.request.prompt,
      instructions: input.request.system,
      metadata: jsonObjectFromEntries({
        ...input.request.metadata,
        agentId: run.agentId,
        authorityMode: input.request.authority.mode,
        jobId: input.request.authority.jobId,
        rootRunId: run.rootRunId,
        runId: run.runId,
      }),
      mcp: input.request.mcp,
      model: run.model === undefined ? undefined : { id: run.model },
      responseFormat: input.request.responseFormat,
      runtimeMode: runtimeModeFromAuthority(input.request.authority),
      signal: controller.signal,
    };

    for await (const event of service.stream(session.id, request)) {
      if (controller.signal.aborted && event.type !== "turn.cancelled") {
        continue;
      }
      for (const runtimeEvent of mapProviderEvent({
        assistantText,
        base,
        event,
        openScriptIds,
        reasoningOpen,
        sawAssistantContentDelta,
      })) {
        if (runtimeEvent._tag === "AgentMessageDelta") {
          assistantText = runtimeEvent.snapshot ?? `${assistantText}${runtimeEvent.delta}`;
        }
        if (runtimeEvent._tag === "ReasoningStarted") reasoningOpen = true;
        if (runtimeEvent._tag === "ReasoningEnded") reasoningOpen = false;
        if (runtimeEvent._tag === "ScriptStarted") openScriptIds.add(runtimeEvent.scriptId);
        if (runtimeEvent._tag === "ScriptEnded") openScriptIds.delete(runtimeEvent.scriptId);
        yield runtimeEvent;
      }
      if (event.type === "content.delta" && event.streamKind === "assistant_text") {
        sawAssistantContentDelta = true;
      }

      if (event.type === "turn.completed") {
        for (const terminalCleanup of closeOpenBlocks(base, reasoningOpen, openScriptIds)) {
          yield terminalCleanup;
        }
        const summary = turnSummary(event.result, assistantText);
        const completed = new AgentRunCompleted({
          ...base(),
          result: turnResultPayload(event.result),
          summary,
        });
        input.updateSnapshot(runId, {
          status: "completed",
          terminal: { status: "completed", summary },
        });
        yield completed;
        return;
      }

      if (event.type === "turn.failed") {
        for (const terminalCleanup of closeOpenBlocks(base, reasoningOpen, openScriptIds)) {
          yield terminalCleanup;
        }
        const failed = new AgentRunFailed({
          ...base(),
          code: event.error.code,
          message: event.error.message,
          retryable: event.error.retryable,
        });
        input.updateSnapshot(runId, {
          status: "failed",
          terminal: {
            code: event.error.code,
            message: event.error.message,
            status: "failed",
          },
        });
        yield failed;
        return;
      }

      if (event.type === "turn.cancelled") {
        for (const terminalCleanup of closeOpenBlocks(base, reasoningOpen, openScriptIds)) {
          yield terminalCleanup;
        }
        const reason = event.error.message;
        const cancelled = new AgentRunCancelled({
          ...base(),
          reason,
        });
        input.updateSnapshot(runId, {
          status: "cancelled",
          terminal: { reason, status: "cancelled" },
        });
        yield cancelled;
        return;
      }
    }

    for (const terminalCleanup of closeOpenBlocks(base, reasoningOpen, openScriptIds)) {
      yield terminalCleanup;
    }
    const completed = new AgentRunCompleted({
      ...base(),
      summary: assistantText.trim(),
    });
    input.updateSnapshot(runId, {
      status: "completed",
      terminal: { status: "completed", summary: assistantText.trim() },
    });
    yield completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = controller.signal.aborted;
    const terminal = cancelled
      ? new AgentRunCancelled({ ...base(), reason: message })
      : new AgentRunFailed({ ...base(), code: "provider_error", message, retryable: false });
    input.updateSnapshot(runId, {
      status: cancelled ? "cancelled" : "failed",
      terminal: cancelled
        ? { reason: message, status: "cancelled" }
        : { code: "provider_error", message, status: "failed" },
    });
    yield terminal;
  } finally {
    cleanupAbort();
    input.activeRuns.delete(runId);
  }
};

const mapProviderEvent = function* (input: {
  readonly assistantText: string;
  readonly base: () => ReturnType<typeof runtimeEventBase>;
  readonly event: AgentEvent;
  readonly openScriptIds: Set<string>;
  readonly reasoningOpen: boolean;
  readonly sawAssistantContentDelta: boolean;
}): Iterable<AgentRuntimeEvent> {
  switch (input.event.type) {
    case "text.delta":
      if (input.sawAssistantContentDelta) return;
      yield new AgentMessageDelta({
        ...input.base(),
        delta: input.event.delta,
        snapshot: input.event.snapshot ?? `${input.assistantText}${input.event.delta}`,
      });
      return;
    case "content.delta":
      if (isReasoningKind(input.event.streamKind)) {
        if (!input.reasoningOpen) {
          yield new ReasoningStarted({
            ...input.base(),
            itemId: input.event.itemId,
          });
        }
        yield new ReasoningDelta({
          ...input.base(),
          delta: input.event.delta,
          itemId: input.event.itemId,
        });
        return;
      }
      if (input.event.streamKind === "assistant_text") {
        yield new AgentMessageDelta({
          ...input.base(),
          delta: input.event.delta,
          snapshot: input.event.snapshot ?? `${input.assistantText}${input.event.delta}`,
        });
        return;
      }
      if (isScriptLikeKind(input.event.streamKind)) {
        const scriptId = input.event.itemId ?? "provider-output";
        if (!input.openScriptIds.has(scriptId)) {
          yield new ScriptStarted({
            ...input.base(),
            scriptId,
            title: input.event.streamKind,
          });
        }
        yield new ScriptDelta({
          ...input.base(),
          delta: input.event.delta,
          scriptId,
        });
      }
      return;
    case "item.started": {
      const toolName = providerToolName(input.event.itemType);
      if (toolName === undefined) return;
      yield new ToolStarted({
        ...input.base(),
        input: input.event.item,
        toolCallId: input.event.itemId,
        toolName,
      });
      return;
    }
    case "item.completed": {
      const scriptId = input.event.itemId;
      if (input.openScriptIds.has(scriptId)) {
        yield new ScriptEnded({
          ...input.base(),
          scriptId,
        });
      }
      const toolName = providerToolName(input.event.itemType);
      if (toolName === undefined) return;
      yield new ToolCompleted({
        ...input.base(),
        output: input.event.item,
        toolCallId: input.event.itemId,
        toolName,
      });
      return;
    }
    case "artifact":
      if (input.event.artifact.type === "tool") {
        if (input.event.artifact.status === "failed") {
          yield new ToolFailed({
            ...input.base(),
            code: input.event.artifact.error?.code,
            message: input.event.artifact.error?.message ?? "Tool failed.",
            toolCallId:
              input.event.artifact.metadata?.itemId?.toString() ?? input.event.artifact.name,
            toolName: input.event.artifact.name,
          });
          return;
        }
        yield new ToolCompleted({
          ...input.base(),
          output: input.event.artifact.output,
          toolCallId:
            input.event.artifact.metadata?.itemId?.toString() ?? input.event.artifact.name,
          toolName: input.event.artifact.name,
        });
      }
      return;
    case "progress":
      yield new ScriptOutput({
        ...input.base(),
        output: input.event.message,
      });
      return;
    case "runtime.warning":
      yield new WarningReported({
        ...input.base(),
        message: input.event.message,
        raw: input.event.raw,
      });
      return;
    case "runtime.error":
      yield new WarningReported({
        ...input.base(),
        message: input.event.error.message,
        raw: input.event.error.raw,
      });
      return;
    case "usage":
      yield new UsageReported({
        ...input.base(),
        inputTokens: input.event.usage.inputTokens,
        outputTokens: input.event.usage.outputTokens,
        reasoningTokens: input.event.usage.reasoningTokens,
        totalTokens: input.event.usage.totalTokens,
      });
      return;
    case "approval.requested":
    case "user-input.requested":
      yield new WarningReported({
        ...input.base(),
        message:
          input.event.type === "approval.requested"
            ? `Provider requested ${input.event.request.kind} approval.`
            : input.event.request.prompt,
        raw: input.event.type === "approval.requested" ? input.event.request : input.event.request,
      });
      return;
    default:
      return;
  }
};

const closeOpenBlocks = function* (
  base: () => ReturnType<typeof runtimeEventBase>,
  reasoningOpen: boolean,
  openScriptIds: Set<string>,
): Iterable<AgentRuntimeEvent> {
  if (reasoningOpen) {
    yield new ReasoningEnded(base());
  }
  for (const scriptId of openScriptIds) {
    yield new ScriptEnded({
      ...base(),
      scriptId,
    });
  }
};

const baseFactory = (input: RuntimeEventBaseInput) => () => runtimeEventBase(input);

const runtimeEventBase = ({ makeId, now, run }: RuntimeEventBaseInput) => ({
  eventId: makeId("agent_evt"),
  jobId: run.jobId,
  occurredAt: now().toISOString(),
  parentRunId: run.parentRunId,
  rootRunId: run.rootRunId,
  runId: run.runId,
});

const isReasoningKind = (kind: AgentContentStreamKind): boolean =>
  kind === "reasoning_text" || kind === "reasoning_summary";

const isScriptLikeKind = (kind: AgentContentStreamKind): boolean =>
  kind === "command_output" || kind === "file_change_output" || kind === "tool_output";

const providerToolName = (itemType: string | undefined): string | undefined => {
  if (itemType === undefined) return undefined;
  const normalized = itemType.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (
    normalized === "agent_message" ||
    normalized === "reasoning" ||
    normalized === "user_message" ||
    normalized === "plan"
  ) {
    return undefined;
  }
  return normalized;
};

const runtimeModeFromAuthority = (authority: AgentAuthorityContext): AgentRuntimeMode =>
  authority.mode === "ticket-context" ? "read-only" : "workspace-write";

const inputText = (input: AgentInput): string =>
  typeof input === "string"
    ? input
    : input.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n");

const bridgeAbort = (
  source: AbortSignal | undefined,
  controller: AbortController,
): (() => void) => {
  if (source?.aborted) controller.abort(source.reason);
  const onAbort = () => controller.abort(source?.reason);
  source?.addEventListener("abort", onAbort, { once: true });
  return () => source?.removeEventListener("abort", onAbort);
};

const jsonObjectOrUndefined = (value: unknown): JsonObject | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as JsonObject;
};

const turnSummary = (result: AgentTurnResult, assistantText: string): string =>
  ((structuredResponseText(result.structured) ?? result.text) || assistantText).trim();

const structuredResponseText = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const response = (value as Readonly<Record<string, unknown>>).response;
  return typeof response === "string" && response.trim().length > 0 ? response : undefined;
};

const turnResultPayload = (result: AgentTurnResult): JsonObject | undefined => {
  const metadata = jsonObjectOrUndefined(result.metadata) ?? {};
  const structured = isJsonValue(result.structured) ? result.structured : undefined;
  const payload = jsonObjectFromEntries({
    ...metadata,
    ...(structured === undefined ? {} : { structured }),
  });
  return Object.keys(payload).length === 0 ? undefined : payload;
};

const jsonObjectFromEntries = (value: Readonly<Record<string, unknown>>): JsonObject =>
  Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, JsonObject[string]] =>
      isJsonValue(entry[1]),
    ),
  );

const isJsonValue = (value: unknown): value is JsonObject[string] => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
};

const defaultId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const agentPromptText = inputText;
