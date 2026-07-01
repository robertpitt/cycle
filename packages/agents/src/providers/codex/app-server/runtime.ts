import {
  CodexAppServerRequestError,
  spawnCodexAppServerClient,
  type CodexAppServerClient,
  type FileChangeRequestApprovalParams,
  type JsonValue as CodexJsonValue,
  type ThreadItem,
  type ToolRequestUserInputParams,
} from "@cycle/codex-app-server";
import type {
  AgentApprovalDecision,
  AgentApprovalRequest,
  AgentArtifact,
  AgentContentStreamKind,
  AgentError,
  AgentEvent,
  AgentMcpAttachment,
  AgentRuntimeMode,
  AgentSessionBinding,
  AgentTurnRequest,
  AgentTurnResult,
  AgentUsage,
  AgentUserInputAnswer,
  AgentUserInputQuestion,
  AgentUserInputRequest,
  JsonObject,
} from "../../../types.ts";
import {
  codexProviderId,
  defaultCodexTimeoutMs,
  mcpBearerTokenEnvVar,
  newCodexId,
  now,
} from "../constants.ts";
import { normalizeCodexError } from "../errors.ts";
import type { CodexTurnRuntime } from "../runtime.ts";
import type { StoredCodexSession } from "../types.ts";
import { parseStructured } from "../structured.ts";
import {
  defaultRuntimeMode,
  runtimeModeFromUnknown,
  runtimeModeToCodexThreadConfig,
} from "./modes.ts";

type QueueTake<T> = {
  readonly reject: (error: unknown) => void;
  readonly resolve: (value: IteratorResult<T>) => void;
};

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private ended = false;
  private error: unknown;
  private readonly items: T[] = [];
  private readonly takes: QueueTake<T>[] = [];

  push(item: T): void {
    if (this.ended) return;
    const take = this.takes.shift();
    if (take === undefined) {
      this.items.push(item);
      return;
    }
    take.resolve({ done: false, value: item });
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const take of this.takes.splice(0)) take.resolve({ done: true, value: undefined });
  }

  fail(error: unknown): void {
    if (this.ended) return;
    this.ended = true;
    this.error = error;
    for (const take of this.takes.splice(0)) take.reject(error);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ done: false, value: item });
        if (this.error !== undefined) return Promise.reject(this.error);
        if (this.ended) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve, reject) => this.takes.push({ reject, resolve }));
      },
      return: () => {
        this.end();
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  }
}

type PendingApproval = {
  readonly decision: (decision: AgentApprovalDecision) => void;
  readonly request: AgentApprovalRequest;
};

type PendingUserInput = {
  readonly answers: (answers: readonly AgentUserInputAnswer[]) => void;
  readonly request: AgentUserInputRequest;
};

type CurrentTurn = {
  readonly artifactByItemId: Map<string, AgentArtifact>;
  readonly createdAt: Date;
  readonly queue: AsyncEventQueue<AgentEvent>;
  readonly refreshTimeout: () => void;
  readonly request: AgentTurnRequest;
  readonly sessionId: string;
  readonly suspendTimeout: () => () => void;
  text: string;
  readonly turnId: string;
  nativeTurnId?: string;
};

export type CodexAppServerSessionRuntime = {
  activeTurn?: CurrentTurn;
  readonly client: CodexAppServerClient;
  initialized: boolean;
  nativeThreadId?: string;
  readonly sessionId: string;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const jsonObjectFromRecord = (value: Readonly<Record<string, unknown>>): JsonObject => {
  const entries = Object.entries(value).filter((entry): entry is [string, JsonObject[string]] =>
    isJsonValue(entry[1]),
  );
  return Object.fromEntries(entries);
};

const isJsonValue = (value: unknown): value is JsonObject[string] => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
};

const inputText = (request: AgentTurnRequest): string =>
  typeof request.input === "string"
    ? request.input
    : request.input.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n");

const buildPrompt = (request: AgentTurnRequest): string =>
  [request.instructions, inputText(request)].filter(Boolean).join("\n\n");

const cwdFromRequest = (
  request: AgentTurnRequest,
  fallback: string | undefined,
  session: StoredCodexSession,
): string | undefined => {
  const requestCwd = request.context?.cwd;
  if (typeof requestCwd === "string" && requestCwd.length > 0) return requestCwd;
  return session.binding?.cwd ?? fallback;
};

const selectedRuntimeMode = (
  request: AgentTurnRequest,
  session: StoredCodexSession,
  fallback: AgentRuntimeMode | undefined,
): AgentRuntimeMode =>
  request.runtimeMode ??
  runtimeModeFromUnknown(session.binding?.runtime?.runtimeMode ?? session.native?.runtimeMode) ??
  fallback ??
  defaultRuntimeMode;

const bearerTokenFromMcp = (mcp: AgentMcpAttachment | undefined): string | undefined => {
  if (mcp?.mode !== "http") return undefined;

  const authorization =
    mcp.headers?.authorization ?? mcp.headers?.Authorization ?? mcp.headers?.["AUTHORIZATION"];
  const prefix = "Bearer ";
  return authorization?.startsWith(prefix) ? authorization.slice(prefix.length) : undefined;
};

const mcpConfig = (mcp: AgentMcpAttachment | undefined): Record<string, CodexJsonValue> =>
  mcp?.mode === "http"
    ? {
        mcp_servers: {
          cycle: {
            bearer_token_env_var: mcpBearerTokenEnvVar,
            enabled: true,
            url: mcp.url,
          },
        },
      }
    : {};

const isAppServerMethodNotFound = (error: unknown): boolean =>
  error instanceof CodexAppServerRequestError && error.code === -32601;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const cycleMcpWarmupStatus = (
  value: unknown,
): { readonly ready: true } | { readonly ready: false; readonly reason: string } => {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return { ready: false, reason: "Codex app-server returned an invalid MCP status payload." };
  }

  const entry = value.data.find((candidate) => isRecord(candidate) && candidate.name === "cycle");
  if (!isRecord(entry)) {
    return { ready: false, reason: "Codex app-server did not report the Cycle MCP server." };
  }

  const authStatus = typeof entry.authStatus === "string" ? entry.authStatus : undefined;
  if (authStatus === "notLoggedIn") {
    return { ready: false, reason: "Cycle MCP server is not authenticated." };
  }

  if (!isRecord(entry.tools) || Object.keys(entry.tools).length === 0) {
    return { ready: false, reason: "Cycle MCP server reported no tools." };
  }

  return { ready: true };
};

const pushMcpWarmupWarning = (
  sessionRuntime: CodexAppServerSessionRuntime,
  error: unknown,
): void => {
  const active = sessionRuntime.activeTurn;
  if (active === undefined) return;
  active.queue.push({
    at: now(),
    message: `Cycle MCP warm-up failed: ${errorMessage(error)}`,
    raw: {
      error: errorMessage(error),
    },
    sessionId: active.sessionId,
    turnId: active.turnId,
    type: "runtime.warning",
  });
};

const warmCycleMcpServer = async (
  sessionRuntime: CodexAppServerSessionRuntime,
  request: AgentTurnRequest,
  nativeThreadId: string,
): Promise<void> => {
  if (request.mcp?.mode !== "http") return;

  try {
    await sessionRuntime.client.request("config/mcpServer/reload", undefined);
  } catch {
    // Reload is best-effort; listing status below still forces inventory discovery.
  }

  let lastError: unknown;
  for (const waitMs of [0, 150, 300]) {
    if (waitMs > 0) await delay(waitMs);
    try {
      const status = await sessionRuntime.client.request("mcpServerStatus/list", {
        detail: "full",
        threadId: nativeThreadId,
      });
      const warmupStatus = cycleMcpWarmupStatus(status);
      if (warmupStatus.ready) return;
      lastError = new Error(warmupStatus.reason);
    } catch (error) {
      if (isAppServerMethodNotFound(error)) return;
      lastError = error;
    }
  }

  const error = lastError ?? new Error("Codex app-server did not report the Cycle MCP server.");
  if (request.mcp.required === true) {
    throw new Error(`Cycle MCP warm-up failed: ${errorMessage(error)}`);
  }

  pushMcpWarmupWarning(sessionRuntime, error);
};

const environmentForRequest = (
  runtime: CodexTurnRuntime,
  request: AgentTurnRequest,
): Record<string, string> => {
  const token = bearerTokenFromMcp(request.mcp);
  const entries = Object.entries({
    ...process.env,
    ...runtime.options.env,
    ...(token === undefined ? {} : { [mcpBearerTokenEnvVar]: token }),
  }).filter((entry): entry is [string, string] => typeof entry[1] === "string");

  return Object.fromEntries(entries);
};

const timeoutSignal = (
  signal: AbortSignal | undefined,
  timeoutMs: number,
): {
  readonly cleanup: () => void;
  readonly controller: AbortController;
  readonly refresh: () => void;
  readonly signal: AbortSignal;
  readonly suspend: () => () => void;
} => {
  const controller = new AbortController();
  let cleanupFinished = false;
  let suspended = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timeout === undefined) return;
    clearTimeout(timeout);
    timeout = undefined;
  };
  const startTimer = () => {
    if (cleanupFinished || suspended > 0 || controller.signal.aborted || timeout !== undefined) {
      return;
    }
    timeout = setTimeout(() => controller.abort(new Error("Codex turn timed out.")), timeoutMs);
  };
  const onAbort = () => {
    clearTimer();
    controller.abort(signal?.reason);
  };

  if (signal?.aborted) controller.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  startTimer();

  return {
    cleanup: () => {
      cleanupFinished = true;
      clearTimer();
      signal?.removeEventListener("abort", onAbort);
    },
    controller,
    refresh: () => {
      clearTimer();
      startTimer();
    },
    signal: controller.signal,
    suspend: () => {
      suspended += 1;
      clearTimer();
      let resumed = false;
      return () => {
        if (resumed) return;
        resumed = true;
        suspended = Math.max(0, suspended - 1);
        startTimer();
      };
    },
  };
};

const normalizeUsage = (usage: unknown): AgentUsage | undefined => {
  if (!isRecord(usage)) return undefined;
  const inputTokens = numberField(usage, "input_tokens") ?? numberField(usage, "inputTokens");
  const outputTokens = numberField(usage, "output_tokens") ?? numberField(usage, "outputTokens");
  const totalTokens =
    numberField(usage, "total_tokens") ??
    numberField(usage, "totalTokens") ??
    (inputTokens === undefined || outputTokens === undefined
      ? undefined
      : inputTokens + outputTokens);
  const reasoningTokens =
    numberField(usage, "reasoning_output_tokens") ?? numberField(usage, "reasoningTokens");
  const cacheReadTokens =
    numberField(usage, "cached_input_tokens") ?? numberField(usage, "cacheReadTokens");

  return {
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
};

const numberField = (value: Readonly<Record<string, unknown>>, key: string): number | undefined =>
  typeof value[key] === "number" ? value[key] : undefined;

const approvalDecisionToCodexFileDecision = (
  decision: AgentApprovalDecision,
): AgentApprovalDecision => decision;

const approvalRequestFromFileChange = (
  sessionId: string,
  requestId: string,
  payload: FileChangeRequestApprovalParams,
): AgentApprovalRequest => ({
  createdAt: now().toISOString(),
  defaultDecision: "decline",
  details: jsonObjectFromRecord({
    changes: payload.changes,
  }),
  itemId: payload.itemId,
  kind: "file-change",
  requestId,
  sessionId,
  turnId: payload.turnId,
});

const questionType = (question: ToolRequestUserInputParams["questions"][number]) => {
  if (
    question.type === "text" ||
    question.type === "single_select" ||
    question.type === "multi_select" ||
    question.type === "boolean"
  ) {
    return question.type;
  }
  if (question.options !== undefined && question.options !== null) {
    return question.multiSelect === true ? "multi_select" : "single_select";
  }
  return "text";
};

const userInputRequestFromPayload = (
  sessionId: string,
  requestId: string,
  payload: ToolRequestUserInputParams,
): AgentUserInputRequest => {
  const questions: AgentUserInputQuestion[] = payload.questions.map((question) => ({
    header: question.header ?? question.question,
    id: question.id,
    multiSelect: question.multiSelect ?? question.type === "multi_select",
    options: (question.options ?? []).map((option) => ({
      ...(option.description === undefined ? {} : { description: option.description }),
      ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
      label: option.label,
      ...(option.value === undefined ? {} : { value: option.value }),
    })),
    question: question.question,
    type: questionType(question),
  }));

  return {
    createdAt: now().toISOString(),
    itemId: payload.itemId,
    prompt: questions.map((entry) => entry.question).join("\n"),
    questions,
    requestId,
    sessionId,
    turnId: payload.turnId,
  };
};

const userInputAnswersToCodex = (
  answers: readonly AgentUserInputAnswer[],
): Record<string, { answers: string[] }> =>
  Object.fromEntries(
    answers.map((answer) => [
      answer.questionId,
      {
        answers: Array.isArray(answer.value)
          ? [...answer.value]
          : [typeof answer.value === "boolean" ? String(answer.value) : answer.value],
      },
    ]),
  );

const artifactFromItem = (item: ThreadItem): AgentArtifact | undefined => {
  const itemType = typeof item.type === "string" ? (item.type as string) : undefined;
  if (itemType === "commandExecution" || itemType === "command_execution") {
    return {
      input: item.command ?? item.commandActions,
      metadata: {
        itemId: item.id,
      },
      name: "command_execution",
      output: item.output ?? item.aggregated_output,
      status:
        item.status === "failed" ? "failed" : item.status === "completed" ? "completed" : "started",
      type: "tool",
    };
  }
  if (itemType === "fileChange" || itemType === "file_change") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const files = changes.flatMap((change) =>
      isRecord(change) && typeof change.path === "string" ? [change.path] : [],
    );
    return {
      files,
      metadata: {
        changes,
        itemId: item.id,
      },
      summary: files.join("\n"),
      type: "patch",
    };
  }
  return undefined;
};

const agentErrorFromTurn = (turn: {
  readonly error?: unknown;
  readonly status?: string;
}): AgentError => {
  const message =
    isRecord(turn.error) && typeof turn.error.message === "string"
      ? turn.error.message
      : "Codex failed to complete the turn.";
  return {
    code: "provider_error",
    message,
    provider: codexProviderId,
    raw: turn.error,
    retryable: false,
  };
};

const eventTurnId = (current: CurrentTurn, nativeTurnId?: string): string =>
  current.nativeTurnId === nativeTurnId || nativeTurnId === undefined
    ? current.turnId
    : current.turnId;

const pushDelta = (
  current: CurrentTurn,
  input: {
    readonly delta: string;
    readonly itemId?: string;
    readonly nativeTurnId?: string;
    readonly streamKind: AgentContentStreamKind;
  },
) => {
  const at = now();
  current.refreshTimeout();
  if (input.streamKind === "assistant_text") current.text = `${current.text}${input.delta}`;
  const snapshot = input.streamKind === "assistant_text" ? current.text : undefined;
  current.queue.push({
    at,
    delta: input.delta,
    ...(input.itemId === undefined ? {} : { itemId: input.itemId }),
    ...(snapshot === undefined ? {} : { snapshot }),
    sessionId: current.sessionId,
    streamKind: input.streamKind,
    turnId: eventTurnId(current, input.nativeTurnId),
    type: "content.delta",
  });
  if (input.streamKind === "assistant_text") {
    current.queue.push({
      at,
      delta: input.delta,
      ...(snapshot === undefined ? {} : { snapshot }),
      sessionId: current.sessionId,
      turnId: eventTurnId(current, input.nativeTurnId),
      type: "text.delta",
    });
  }
};

const decodeBase64 = (value: string): string => Buffer.from(value, "base64").toString("utf8");

const completedResult = <TStructured>(
  current: CurrentTurn,
  completedAt: Date,
  usage: AgentUsage | undefined,
  raw: unknown,
): AgentTurnResult<TStructured> => {
  const structured = parseStructured<TStructured>(
    (current.request as AgentTurnRequest<TStructured>).responseFormat,
    current.text,
  );
  return {
    artifacts: [...current.artifactByItemId.values()],
    completedAt,
    createdAt: current.createdAt,
    finishReason: "stop",
    id: current.turnId,
    metadata: current.request.metadata,
    provider: codexProviderId,
    raw,
    sessionId: current.sessionId,
    status: "completed",
    ...(structured === undefined ? {} : { structured }),
    text: current.text,
    ...(usage === undefined ? {} : { usage }),
  };
};

const patchNative = (
  session: StoredCodexSession,
  runtimeMode: AgentRuntimeMode,
  nativeThreadId?: string,
): StoredCodexSession => ({
  ...session,
  native: {
    ...session.native,
    ...(nativeThreadId === undefined ? {} : { threadId: nativeThreadId }),
    runtimeMode,
    ...(nativeThreadId === undefined ? {} : { resumeCursor: { threadId: nativeThreadId } }),
  },
});

const updateSessionBinding = async (
  runtime: CodexTurnRuntime,
  session: StoredCodexSession,
  status: AgentSessionBinding["status"],
  runtimeMode: AgentRuntimeMode,
  patch: Partial<AgentSessionBinding> = {},
): Promise<StoredCodexSession> =>
  runtime.saveSession(session, status, {
    ...patch,
    runtime: {
      ...session.binding?.runtime,
      runtimeMode,
    },
  });

export type CodexTurnRuntimeWithInteractions = CodexTurnRuntime & {
  readonly pendingApprovals: Map<string, PendingApproval>;
  readonly pendingUserInputs: Map<string, PendingUserInput>;
  readonly resolvedInteractions: Set<string>;
};

const registerHandlers = (
  runtime: CodexTurnRuntimeWithInteractions,
  sessionRuntime: CodexAppServerSessionRuntime,
) => {
  const current = () => sessionRuntime.activeTurn;

  sessionRuntime.client.handleServerNotification("thread/started", (payload) => {
    sessionRuntime.nativeThreadId = payload.thread.id;
  });

  sessionRuntime.client.handleServerNotification("turn/started", (payload) => {
    const active = current();
    if (active === undefined) return;
    active.refreshTimeout();
    active.nativeTurnId = payload.turn.id;
    active.queue.push({
      at: now(),
      provider: codexProviderId,
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "turn.started",
    });
  });

  sessionRuntime.client.handleServerNotification("item/agentMessage/delta", (payload) => {
    const active = current();
    if (active === undefined) return;
    pushDelta(active, {
      delta: payload.delta,
      itemId: payload.itemId,
      nativeTurnId: payload.turnId,
      streamKind: "assistant_text",
    });
  });

  sessionRuntime.client.handleServerNotification("item/reasoning/textDelta", (payload) => {
    const active = current();
    if (active === undefined) return;
    pushDelta(active, {
      delta: payload.delta,
      itemId: payload.itemId,
      nativeTurnId: payload.turnId,
      streamKind: "reasoning_text",
    });
  });

  sessionRuntime.client.handleServerNotification("item/reasoning/summaryTextDelta", (payload) => {
    const active = current();
    if (active === undefined) return;
    pushDelta(active, {
      delta: payload.delta,
      itemId: payload.itemId,
      nativeTurnId: payload.turnId,
      streamKind: "reasoning_summary",
    });
  });

  sessionRuntime.client.handleServerNotification("item/plan/delta", (payload) => {
    const active = current();
    if (active === undefined) return;
    pushDelta(active, {
      delta: payload.delta,
      itemId: payload.itemId,
      nativeTurnId: payload.turnId,
      streamKind: "plan",
    });
  });

  sessionRuntime.client.handleServerNotification("item/commandExecution/outputDelta", (payload) => {
    const active = current();
    if (active === undefined) return;
    pushDelta(active, {
      delta:
        payload.delta ??
        (payload.deltaBase64 === undefined ? "" : decodeBase64(payload.deltaBase64)),
      itemId: payload.itemId,
      nativeTurnId: payload.turnId,
      streamKind: "command_output",
    });
  });

  sessionRuntime.client.handleServerNotification("item/fileChange/outputDelta", (payload) => {
    const active = current();
    if (active === undefined) return;
    pushDelta(active, {
      delta: payload.delta ?? "",
      itemId: payload.itemId,
      nativeTurnId: payload.turnId,
      streamKind: "file_change_output",
    });
  });

  sessionRuntime.client.handleServerNotification("turn/plan/updated", (payload) => {
    const active = current();
    if (active === undefined) return;
    active.refreshTimeout();
    active.queue.push({
      at: now(),
      ...(payload.explanation === undefined || payload.explanation === null
        ? {}
        : { explanation: payload.explanation }),
      plan: payload.plan,
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "turn.plan.updated",
    });
  });

  sessionRuntime.client.handleServerNotification("turn/diff/updated", (payload) => {
    const active = current();
    if (active === undefined) return;
    active.refreshTimeout();
    active.queue.push({
      at: now(),
      diff: payload.diff,
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "turn.diff.updated",
    });
  });

  const pushItemEvent = (
    phase: "item.started" | "item.completed",
    item: ThreadItem,
    nativeTurnId: string,
  ) => {
    const active = current();
    if (active === undefined) return;
    active.refreshTimeout();
    const artifact = artifactFromItem(item);
    if (artifact !== undefined) active.artifactByItemId.set(item.id, artifact);
    active.queue.push({
      at: now(),
      item,
      itemId: item.id,
      ...(typeof item.type === "string" ? { itemType: item.type } : {}),
      sessionId: active.sessionId,
      turnId: eventTurnId(active, nativeTurnId),
      type: phase,
    });
    if (artifact !== undefined) {
      active.queue.push({
        artifact,
        at: now(),
        sessionId: active.sessionId,
        turnId: eventTurnId(active, nativeTurnId),
        type: "artifact",
      });
    }
  };

  sessionRuntime.client.handleServerNotification("item/started", (payload) =>
    pushItemEvent("item.started", payload.item, payload.turnId),
  );
  sessionRuntime.client.handleServerNotification("item/completed", (payload) =>
    pushItemEvent("item.completed", payload.item, payload.turnId),
  );

  sessionRuntime.client.handleServerNotification("warning", (payload) => {
    const active = current();
    if (active === undefined) return;
    active.refreshTimeout();
    active.queue.push({
      at: now(),
      message: payload.message ?? "Codex app-server warning.",
      raw: payload,
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "runtime.warning",
    });
  });

  sessionRuntime.client.handleServerNotification("error", (payload) => {
    const active = current();
    if (active === undefined) return;
    active.refreshTimeout();
    active.queue.push({
      at: now(),
      error: {
        code: payload.willRetry === true ? "provider_error" : "unknown",
        message: payload.error?.message ?? payload.message ?? "Codex app-server error.",
        provider: codexProviderId,
        raw: payload,
        retryable: payload.willRetry === true,
      },
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "runtime.error",
    });
  });

  sessionRuntime.client.handleUnknownServerNotification((method, payload) => {
    const active = current();
    if (
      active === undefined ||
      method !== "mcpServer/startupStatus/updated" ||
      !isRecord(payload) ||
      payload.name !== "cycle" ||
      payload.status !== "failed"
    ) {
      return;
    }

    const error = typeof payload.error === "string" ? payload.error : undefined;
    active.refreshTimeout();
    active.queue.push({
      at: now(),
      message: `Cycle MCP startup failed${error === undefined ? "." : `: ${error}`}`,
      raw: payload,
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "runtime.warning",
    });
  });

  sessionRuntime.client.handleServerNotification("turn/completed", (payload) => {
    const active = current();
    if (active === undefined) return;
    active.refreshTimeout();
    const completedAt = now();
    const usage = normalizeUsage(payload.usage);

    if (usage !== undefined) {
      active.queue.push({
        at: completedAt,
        sessionId: active.sessionId,
        turnId: active.turnId,
        type: "usage",
        usage,
      });
    }

    if (payload.turn.status === "failed") {
      active.queue.push({
        at: completedAt,
        error: agentErrorFromTurn(payload.turn),
        sessionId: active.sessionId,
        turnId: active.turnId,
        type: "turn.failed",
      });
      active.queue.end();
      return;
    }

    active.queue.push({
      at: completedAt,
      result: completedResult(active, completedAt, usage, payload),
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "turn.completed",
    });
    active.queue.end();
  });

  sessionRuntime.client.handleServerRequest(
    "item/commandExecution/requestApproval",
    async () => {
      const active = current();
      if (active === undefined) {
        throw CodexAppServerRequestError.internalError(
          "No active Cycle turn for Codex approval request.",
        );
      }
      active.refreshTimeout();
      // Cycle uses Codex sandbox modes as the command safety boundary. Command approvals are
      // therefore non-interactive so chat turns cannot hang waiting for an approval UI.
      return {
        decision: "accept",
      };
    },
  );

  sessionRuntime.client.handleServerRequest(
    "item/fileChange/requestApproval",
    async (payload) => {
      const active = current();
      if (active === undefined) {
        throw CodexAppServerRequestError.internalError(
          "No active Cycle turn for Codex approval request.",
        );
      }
      active.refreshTimeout();
      const requestId = newCodexId("approval");
      const request = approvalRequestFromFileChange(active.sessionId, requestId, payload);
      const resumeTimeout = active.suspendTimeout();
      const decision = await new Promise<AgentApprovalDecision>((resolve) => {
        runtime.pendingApprovals.set(`${active.sessionId}:${requestId}`, {
          decision: resolve,
          request,
        });
        active.queue.push({
          at: now(),
          request,
          sessionId: active.sessionId,
          turnId: active.turnId,
          type: "approval.requested",
        });
      }).finally(resumeTimeout);
      runtime.resolvedInteractions.add(`${active.sessionId}:${requestId}`);
      runtime.pendingApprovals.delete(`${active.sessionId}:${requestId}`);
      active.queue.push({
        at: now(),
        decision,
        requestId,
        sessionId: active.sessionId,
        turnId: active.turnId,
        type: "approval.resolved",
      });
      return {
        decision: approvalDecisionToCodexFileDecision(decision),
      };
    },
  );

  sessionRuntime.client.handleServerRequest("item/tool/requestUserInput", async (payload) => {
    const active = current();
    if (active === undefined) {
      throw CodexAppServerRequestError.internalError(
        "No active Cycle turn for Codex user-input request.",
      );
    }
    active.refreshTimeout();
    const requestId = newCodexId("user-input");
    const request = userInputRequestFromPayload(active.sessionId, requestId, payload);
    const resumeTimeout = active.suspendTimeout();
    const answers = await new Promise<readonly AgentUserInputAnswer[]>((resolve) => {
      runtime.pendingUserInputs.set(`${active.sessionId}:${requestId}`, {
        answers: resolve,
        request,
      });
      active.queue.push({
        at: now(),
        request,
        sessionId: active.sessionId,
        turnId: active.turnId,
        type: "user-input.requested",
      });
    }).finally(resumeTimeout);
    runtime.resolvedInteractions.add(`${active.sessionId}:${requestId}`);
    runtime.pendingUserInputs.delete(`${active.sessionId}:${requestId}`);
    active.queue.push({
      answers,
      at: now(),
      requestId,
      sessionId: active.sessionId,
      turnId: active.turnId,
      type: "user-input.resolved",
    });
    return {
      answers: userInputAnswersToCodex(answers),
    };
  });

  sessionRuntime.client.handleUnknownServerRequest((method) => {
    throw CodexAppServerRequestError.methodNotFound(method);
  });
};

const createClient = async (
  runtime: CodexTurnRuntime,
  request: AgentTurnRequest,
  cwd: string | undefined,
): Promise<CodexAppServerClient> => {
  if (
    typeof runtime.options.appServerClient === "object" &&
    runtime.options.appServerClient !== null
  ) {
    return runtime.options.appServerClient;
  }

  const env = environmentForRequest(runtime, request);
  if (typeof runtime.options.appServerClient === "function") {
    return runtime.options.appServerClient({
      ...(runtime.options.codexHome === undefined ? {} : { codexHome: runtime.options.codexHome }),
      ...(cwd === undefined ? {} : { cwd }),
      env,
      executablePath: runtime.options.executablePath ?? "codex",
    });
  }

  return spawnCodexAppServerClient({
    ...(runtime.options.codexHome === undefined ? {} : { codexHome: runtime.options.codexHome }),
    ...(cwd === undefined ? {} : { cwd }),
    env,
    executablePath: runtime.options.executablePath ?? "codex",
  });
};

const getSessionRuntime = async (
  runtime: CodexTurnRuntimeWithInteractions,
  sessionId: string,
  request: AgentTurnRequest,
  cwd: string | undefined,
): Promise<CodexAppServerSessionRuntime> => {
  const existing = runtime.appServerRuntimes.get(sessionId);
  if (existing !== undefined) return existing;

  const sessionRuntime: CodexAppServerSessionRuntime = {
    client: await createClient(runtime, request, cwd),
    initialized: false,
    sessionId,
  };
  registerHandlers(runtime, sessionRuntime);
  runtime.appServerRuntimes.set(sessionId, sessionRuntime);
  return sessionRuntime;
};

const ensureInitializedThread = async (
  runtime: CodexTurnRuntime,
  sessionRuntime: CodexAppServerSessionRuntime,
  session: StoredCodexSession,
  request: AgentTurnRequest,
  cwd: string | undefined,
  runtimeMode: AgentRuntimeMode,
): Promise<{ readonly session: StoredCodexSession; readonly nativeThreadId: string }> => {
  if (!sessionRuntime.initialized) {
    await sessionRuntime.client.request("initialize", {
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
      clientInfo: {
        name: "cycle",
        title: "Cycle",
        version: "0.0.0",
      },
    });
    await sessionRuntime.client.notify("initialized", undefined);
    sessionRuntime.initialized = true;
  }

  const config = runtimeModeToCodexThreadConfig(runtimeMode);
  const nativeThreadId =
    sessionRuntime.nativeThreadId ??
    (typeof session.native?.threadId === "string" ? session.native.threadId : undefined);
  const common = {
    approvalPolicy: config.approvalPolicy,
    config: mcpConfig(request.mcp),
    ...(cwd === undefined ? {} : { cwd }),
    ...(request.model?.id === undefined
      ? session.binding?.model === undefined
        ? {}
        : { model: session.binding.model }
      : { model: request.model.id }),
    sandbox: config.sandbox,
    serviceName: "cycle",
  };

  let opened;
  if (nativeThreadId === undefined) {
    opened = await sessionRuntime.client.request("thread/start", common);
  } else {
    try {
      opened = await sessionRuntime.client.request("thread/resume", {
        ...common,
        threadId: nativeThreadId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (!message.includes("thread")) throw error;
      opened = await sessionRuntime.client.request("thread/start", common);
      const active = sessionRuntime.activeTurn;
      active?.queue.push({
        at: now(),
        message: "Stored Codex thread was unavailable; started a fresh app-server thread.",
        raw: { previousThreadId: nativeThreadId },
        sessionId: active.sessionId,
        turnId: active.turnId,
        type: "runtime.warning",
      });
    }
  }

  sessionRuntime.nativeThreadId = opened.thread.id;
  await warmCycleMcpServer(sessionRuntime, request, opened.thread.id);
  return {
    nativeThreadId: opened.thread.id,
    session: await updateSessionBinding(
      runtime,
      patchNative(session, runtimeMode, opened.thread.id),
      "running",
      runtimeMode,
      {
        ...(cwd === undefined ? {} : { cwd }),
        ...(opened.model === undefined ? {} : { model: opened.model }),
      },
    ),
  };
};

export async function* streamCodexAppServerTurn<TStructured = unknown>(
  runtime: CodexTurnRuntimeWithInteractions,
  sessionId: string,
  request: AgentTurnRequest<TStructured>,
): AsyncIterable<AgentEvent<TStructured>> {
  const createdAt = now();
  const turnId = newCodexId("turn");
  let session = (await runtime.resumeSession(sessionId)) as StoredCodexSession;
  const cwd = cwdFromRequest(request, runtime.options.cwd, session);
  const runtimeMode = selectedRuntimeMode(request, session, undefined);
  const sessionRuntime = await getSessionRuntime(runtime, sessionId, request, cwd);
  const queue = new AsyncEventQueue<AgentEvent>();
  const abort = timeoutSignal(request.signal, runtime.options.timeoutMs ?? defaultCodexTimeoutMs);
  const currentTurn: CurrentTurn = {
    artifactByItemId: new Map(),
    createdAt,
    queue,
    refreshTimeout: abort.refresh,
    request,
    sessionId,
    suspendTimeout: abort.suspend,
    text: "",
    turnId,
  };

  sessionRuntime.activeTurn = currentTurn;
  runtime.activeTurns.set(sessionId, {
    controller: abort.controller,
    interrupt: async () => {
      if (currentTurn.nativeTurnId !== undefined && sessionRuntime.nativeThreadId !== undefined) {
        await sessionRuntime.client.request("turn/interrupt", {
          threadId: sessionRuntime.nativeThreadId,
          turnId: currentTurn.nativeTurnId,
        });
      }
    },
    nativeThreadId: sessionRuntime.nativeThreadId,
    nativeTurnId: currentTurn.nativeTurnId,
    turnId,
  });

  const abortListener = () => {
    const error = normalizeCodexError(
      abort.signal.reason ?? new Error("Codex turn cancellation requested."),
    );
    queue.push({
      at: now(),
      error,
      sessionId,
      turnId,
      type: error.code === "cancelled" ? "turn.cancelled" : "turn.failed",
    });
    queue.end();
  };
  abort.signal.addEventListener("abort", abortListener, { once: true });

  void (async () => {
    try {
      session = await updateSessionBinding(runtime, session, "starting", runtimeMode, {
        activeTurnId: turnId,
        ...(cwd === undefined ? {} : { cwd }),
        ...(request.model?.id === undefined ? {} : { model: request.model.id }),
      });
      const opened = await ensureInitializedThread(
        runtime,
        sessionRuntime,
        session,
        request,
        cwd,
        runtimeMode,
      );
      session = opened.session;
      const response = await sessionRuntime.client.request("turn/start", {
        approvalPolicy: runtimeModeToCodexThreadConfig(runtimeMode).approvalPolicy,
        input: [{ text: buildPrompt(request), text_elements: [], type: "text" }],
        ...(request.model?.id === undefined ? {} : { model: request.model.id }),
        ...(request.responseFormat?.type === "json_schema"
          ? { outputSchema: request.responseFormat.schema as CodexJsonValue }
          : {}),
        threadId: opened.nativeThreadId,
      });
      currentTurn.nativeTurnId = response.turn.id;
      runtime.activeTurns.set(sessionId, {
        controller: abort.controller,
        interrupt: async () => {
          await sessionRuntime.client.request("turn/interrupt", {
            threadId: opened.nativeThreadId,
            turnId: response.turn.id,
          });
        },
        nativeThreadId: opened.nativeThreadId,
        nativeTurnId: response.turn.id,
        turnId,
      });
    } catch (error) {
      const normalized = normalizeCodexError(error);
      queue.push({
        at: now(),
        error: normalized,
        sessionId,
        turnId,
        type: normalized.code === "cancelled" ? "turn.cancelled" : "turn.failed",
      });
      queue.end();
    }
  })();

  try {
    for await (const event of queue) {
      yield event as AgentEvent<TStructured>;
      if (
        event.type === "turn.completed" ||
        event.type === "turn.failed" ||
        event.type === "turn.cancelled"
      ) {
        const status =
          event.type === "turn.completed"
            ? "idle"
            : event.type === "turn.cancelled"
              ? "idle"
              : "error";
        const lastError =
          event.type === "turn.failed" || event.type === "turn.cancelled"
            ? event.error.message
            : undefined;
        const patch = lastError === undefined ? {} : { lastError };
        session = await updateSessionBinding(
          runtime,
          patchNative(session, runtimeMode, sessionRuntime.nativeThreadId),
          status,
          runtimeMode,
          patch,
        );
        return;
      }
    }
  } finally {
    abort.signal.removeEventListener("abort", abortListener);
    abort.cleanup();
    if (sessionRuntime.activeTurn?.turnId === turnId) sessionRuntime.activeTurn = undefined;
    const activeTurn = runtime.activeTurns.get(sessionId);
    if (activeTurn?.turnId === turnId) runtime.activeTurns.delete(sessionId);
  }
}

export const runCodexAppServerTurn = async <TStructured = unknown>(
  runtime: CodexTurnRuntimeWithInteractions,
  sessionId: string,
  request: AgentTurnRequest<TStructured>,
): Promise<AgentTurnResult<TStructured>> => {
  let terminal: AgentEvent<TStructured> | undefined;
  for await (const event of streamCodexAppServerTurn(runtime, sessionId, request)) {
    if (
      event.type === "turn.completed" ||
      event.type === "turn.failed" ||
      event.type === "turn.cancelled"
    ) {
      terminal = event;
    }
  }

  if (terminal?.type === "turn.completed") return terminal.result;
  const completedAt = now();
  const error: AgentError =
    terminal?.type === "turn.failed" || terminal?.type === "turn.cancelled"
      ? terminal.error
      : {
          code: "unknown",
          message: "Codex app-server turn ended without a terminal event.",
          provider: codexProviderId,
        };

  return {
    artifacts: [],
    completedAt,
    createdAt: completedAt,
    error,
    finishReason: error.code === "cancelled" ? "cancelled" : "error",
    id: terminal?.turnId ?? newCodexId("turn"),
    metadata: request.metadata,
    provider: codexProviderId,
    sessionId,
    status: error.code === "cancelled" ? "cancelled" : "failed",
    text: "",
  };
};

export const interactionKey = (sessionId: string, requestId: string): string =>
  `${sessionId}:${requestId}`;
