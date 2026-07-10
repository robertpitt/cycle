import {
  query,
  type McpServerConfig,
  type Options,
  type Query,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import type {
  AbortTurnResult,
  AgentCapabilities,
  AgentEvent,
  AgentMcpAttachment,
  AgentModelCatalog,
  AgentResponseFormat,
  AgentRuntimeMode,
  AgentService,
  AgentSession,
  AgentSessionBinding,
  AgentSessionBindingStatus,
  AgentTurnRequest,
  AgentTurnResult,
  CreateAgentSessionInput,
  JsonObject,
  ResumeAgentSessionInput,
} from "../../types.ts";
import { claudeCodeAgentCapabilities } from "./capabilities.ts";
import { decodeClaudeCodeProviderConfig, type ClaudeCodeProviderConfig } from "./config.ts";
import { claudeCodeNow, claudeCodeProviderId, newClaudeCodeId } from "./constants.ts";
import { claudeCodeError, mapClaudeCodeSdkMessage } from "./events.ts";

export type ClaudeCodeAgentServiceOptions = {
  readonly config?: ClaudeCodeProviderConfig | JsonObject;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string | null;
};

type StoredClaudeCodeSession = AgentSession & {
  readonly binding?: AgentSessionBinding;
};

type ActiveClaudeCodeTurn = {
  readonly abortController: AbortController;
  readonly query?: Query;
  readonly turnId: string;
};

type NativeClaudeCodeSession = {
  readonly id: string;
  readonly resume: boolean;
};

const cycleMcpToolPattern = "mcp__cycle__*";
const readOnlyClaudeCodeTools = ["Read", "Grep", "Glob", "LS"] as const;

export const makeClaudeCodeAgentService = (
  options: ClaudeCodeAgentServiceOptions = {},
): AgentService => {
  const capabilities: AgentCapabilities = claudeCodeAgentCapabilities;
  const sessions = new Map<string, StoredClaudeCodeSession>();
  const activeTurns = new Map<string, ActiveClaudeCodeTurn>();
  const providerConfig = decodeClaudeCodeProviderConfig(options.config ?? {});
  const executablePath = options.executablePath ?? providerConfig.executablePath ?? null;

  const saveSession = async (
    session: StoredClaudeCodeSession,
    status: AgentSessionBindingStatus,
    patch: Partial<AgentSessionBinding> = {},
  ): Promise<StoredClaudeCodeSession> => {
    const updatedAt = patch.updatedAt === undefined ? claudeCodeNow() : new Date(patch.updatedAt);
    const updated: StoredClaudeCodeSession = {
      ...session,
      updatedAt,
    };
    const binding: AgentSessionBinding = {
      createdAt: updated.createdAt.toISOString(),
      metadata: updated.metadata,
      model: updated.binding?.model,
      native: updated.native,
      provider: claudeCodeProviderId,
      sessionId: updated.id,
      status,
      title: updated.title,
      updatedAt: updatedAt.toISOString(),
      ...patch,
    };
    const stored = { ...updated, binding };
    sessions.set(stored.id, stored);
    return stored;
  };

  const createSession = async (input?: CreateAgentSessionInput): Promise<AgentSession> => {
    const timestamp = claudeCodeNow();
    const session: StoredClaudeCodeSession = {
      createdAt: timestamp,
      harnessId: claudeCodeProviderId,
      id: newClaudeCodeId("claude_session"),
      metadata: input?.metadata,
      native: {
        initialized: false,
        runtimeMode: input?.runtimeMode,
        sessionId: randomUUID(),
      },
      provider: claudeCodeProviderId,
      title: input?.title,
      updatedAt: timestamp,
    };
    return saveSession(session, "idle", {
      cwd: input?.workspace?.cwd,
      model: input?.model?.id,
      runtime: input?.runtimeMode === undefined ? undefined : { runtimeMode: input.runtimeMode },
    });
  };

  const resumeSession = async (
    sessionId: string,
    input?: ResumeAgentSessionInput,
  ): Promise<AgentSession> => {
    const existing = sessions.get(sessionId);
    if (existing !== undefined) return existing;

    const timestamp = claudeCodeNow();
    const session: StoredClaudeCodeSession = {
      createdAt: timestamp,
      harnessId: claudeCodeProviderId,
      id: sessionId,
      native:
        input?.native ??
        ({
          initialized: false,
          sessionId: randomUUID(),
        } as const),
      provider: claudeCodeProviderId,
      updatedAt: timestamp,
    };
    return saveSession(session, "idle");
  };

  const streamTurn = <TStructured = unknown>(
    sessionId: string,
    request: AgentTurnRequest<TStructured>,
  ): AsyncIterable<AgentEvent<TStructured>> => {
    const session = sessions.get(sessionId);
    const nativeSession = nativeClaudeCodeSession(session);
    return streamClaudeCodeTurn({
      activeTurns,
      env: options.env,
      executablePath,
      nativeSession,
      onSessionInitialized: async (nativeSessionId) => {
        const current = sessions.get(sessionId);
        if (current === undefined) return;
        await saveSession(
          {
            ...current,
            native: {
              ...current.native,
              initialized: true,
              sessionId: nativeSessionId,
            },
          },
          "running",
        );
      },
      providerConfig,
      request,
      sessionId,
    }) as AsyncIterable<AgentEvent<TStructured>>;
  };

  return {
    abortTurn: async (sessionId, turnId): Promise<AbortTurnResult> => {
      const active = activeTurns.get(sessionId);
      if (active === undefined) return { accepted: false, reason: "not_found" };
      if (turnId !== undefined && active.turnId !== turnId) {
        return { accepted: false, reason: "not_found" };
      }
      if (active.abortController.signal.aborted) {
        return { accepted: false, reason: "already_finished" };
      }
      active.abortController.abort(new Error("Claude Code turn cancellation requested."));
      active.query?.close();
      return { accepted: true, reason: "cancel_requested" };
    },
    capabilities: () => capabilities,
    listModels: async (): Promise<AgentModelCatalog> => ({
      defaultModelId: null,
      fetchedAt: new Date().toISOString(),
      models: [],
      provider: claudeCodeProviderId,
      source: "unsupported",
    }),
    close: async () => {
      for (const active of activeTurns.values()) {
        active.abortController.abort(new Error("Claude Code service closed."));
        active.query?.close();
      }
      activeTurns.clear();
    },
    createSession,
    provider: claudeCodeProviderId,
    resumeSession,
    respondToApproval: async (sessionId, requestId) => ({
      requestId,
      sessionId,
      status: "not_found",
    }),
    respondToUserInput: async (sessionId, requestId) => ({
      requestId,
      sessionId,
      status: "not_found",
    }),
    run: async <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): Promise<AgentTurnResult<TStructured>> => {
      let final: AgentTurnResult<TStructured> | undefined;
      let text = "";
      let error: ReturnType<typeof claudeCodeError> | undefined;

      for await (const event of streamTurn(sessionId, request)) {
        if (event.type === "text.delta") {
          text = event.snapshot ?? `${text}${event.delta}`;
        }
        if (event.type === "content.delta" && event.streamKind === "assistant_text") {
          text = event.snapshot ?? `${text}${event.delta}`;
        }
        if (event.type === "turn.completed") {
          final = event.result as AgentTurnResult<TStructured>;
        }
        if (event.type === "turn.failed" || event.type === "turn.cancelled") {
          error = event.error;
        }
      }

      if (final !== undefined) return final;

      const timestamp = claudeCodeNow();
      return {
        artifacts: [],
        completedAt: timestamp,
        createdAt: timestamp,
        error,
        finishReason: error?.code === "cancelled" ? "cancelled" : error ? "error" : "stop",
        id: newClaudeCodeId("claude_turn"),
        provider: claudeCodeProviderId,
        sessionId,
        status: error?.code === "cancelled" ? "cancelled" : error ? "failed" : "completed",
        text,
      };
    },
    stream: <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): AsyncIterable<AgentEvent<TStructured>> => streamTurn(sessionId, request),
  };
};

const nativeClaudeCodeSession = (
  session: StoredClaudeCodeSession | undefined,
): NativeClaudeCodeSession | undefined => {
  const sessionId = session?.native?.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) return undefined;
  return {
    id: sessionId,
    resume: session?.native?.initialized === true,
  };
};

const streamClaudeCodeTurn = async function* (input: {
  readonly activeTurns: Map<string, ActiveClaudeCodeTurn>;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string | null;
  readonly nativeSession?: NativeClaudeCodeSession;
  readonly onSessionInitialized?: (sessionId: string) => Promise<void>;
  readonly providerConfig: ClaudeCodeProviderConfig;
  readonly request: AgentTurnRequest;
  readonly sessionId: string;
}): AsyncIterable<AgentEvent> {
  const turnId = newClaudeCodeId("claude_turn");
  const abortController = new AbortController();
  const cleanupAbort = bridgeAbort(input.request.signal, abortController);
  const active: ActiveClaudeCodeTurn = {
    abortController,
    turnId,
  };
  input.activeTurns.set(input.sessionId, active);

  yield {
    at: claudeCodeNow(),
    provider: claudeCodeProviderId,
    sessionId: input.sessionId,
    turnId,
    type: "turn.started",
  };

  try {
    const sdkQuery = query({
      options: claudeCodeSdkOptionsFromTurn({
        abortController,
        env: input.env,
        executablePath: input.executablePath,
        nativeSession: input.nativeSession,
        providerConfig: input.providerConfig,
        request: input.request,
      }),
      prompt: promptFromTurn(input.request),
    });
    Object.assign(active, { query: sdkQuery });

    for await (const message of sdkQuery) {
      if (message.type === "system" && message.subtype === "init") {
        await input.onSessionInitialized?.(message.session_id);
      }
      for (const event of mapClaudeCodeSdkMessage({
        message,
        provider: claudeCodeProviderId,
        sessionId: input.sessionId,
        turnId,
      })) {
        yield event;
      }
    }
  } catch (cause) {
    const error = claudeCodeError(cause);
    yield {
      at: claudeCodeNow(),
      error,
      sessionId: input.sessionId,
      turnId,
      type: error.code === "cancelled" ? "turn.cancelled" : "turn.failed",
    };
  } finally {
    cleanupAbort();
    input.activeTurns.delete(input.sessionId);
  }
};

export const claudeCodeSdkOptionsFromTurn = (input: {
  readonly abortController: AbortController;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string | null;
  readonly nativeSession?: NativeClaudeCodeSession;
  readonly providerConfig: ClaudeCodeProviderConfig;
  readonly request: AgentTurnRequest;
}): Options => {
  const runtimeMode = input.request.runtimeMode ?? "read-only";
  const cwd = cwdFromRequest(input.request);
  const mcpServers = mcpServersFromAttachment(input.request.mcp);
  const mcpToolPatterns = mcpServers === undefined ? [] : [cycleMcpToolPattern];
  const outputFormat = outputFormatFromResponseFormat(input.request.responseFormat);
  const systemPrompt =
    input.providerConfig.systemPromptMode === "provider-default" ||
    input.request.instructions === undefined
      ? undefined
      : {
          append: input.request.instructions,
          preset: "claude_code" as const,
          type: "preset" as const,
        };
  const permissionMode = permissionModeForRuntime(runtimeMode, input.providerConfig);

  return {
    abortController: input.abortController,
    ...(cwd === undefined ? {} : { cwd }),
    env: {
      ...process.env,
      ...input.env,
      CLAUDE_AGENT_SDK_CLIENT_APP: "cycle/0.1.0",
    },
    includePartialMessages: true,
    ...(mcpToolPatterns.length === 0 ? {} : { allowedTools: mcpToolPatterns }),
    ...(input.providerConfig.maxTurns === null || input.providerConfig.maxTurns === undefined
      ? {}
      : { maxTurns: input.providerConfig.maxTurns }),
    ...(input.request.model?.id === undefined ? {} : { model: input.request.model.id }),
    ...(mcpServers === undefined ? {} : { mcpServers }),
    ...(input.nativeSession === undefined
      ? {}
      : input.nativeSession.resume
        ? { resume: input.nativeSession.id }
        : { sessionId: input.nativeSession.id }),
    ...(outputFormat === undefined ? {} : { outputFormat }),
    ...(input.executablePath === null || input.executablePath === undefined
      ? {}
      : { pathToClaudeCodeExecutable: input.executablePath }),
    permissionMode,
    ...(runtimeMode === "read-only"
      ? {
          disallowedTools: ["Bash", "Edit", "MultiEdit", "NotebookEdit", "Write"],
          tools: [...readOnlyClaudeCodeTools, ...mcpToolPatterns],
        }
      : { tools: { preset: "claude_code" as const, type: "preset" as const } }),
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
  };
};

const permissionModeForRuntime = (
  runtimeMode: AgentRuntimeMode,
  providerConfig: ClaudeCodeProviderConfig,
): Options["permissionMode"] => {
  if (runtimeMode === "read-only") return "dontAsk";
  if (providerConfig.permissionMode === "bypassPermissions" && runtimeMode !== "full-access") {
    return "default";
  }
  return providerConfig.permissionMode ?? "default";
};

const promptFromTurn = (request: AgentTurnRequest): string => {
  const input =
    typeof request.input === "string"
      ? request.input
      : request.input.parts.map((part) => part.text).join("\n");
  const context =
    request.context === undefined || Object.keys(request.context).length === 0
      ? undefined
      : `Cycle context:\n${JSON.stringify(request.context, null, 2)}`;
  return [context, input].filter((part): part is string => part !== undefined).join("\n\n");
};

const cwdFromRequest = (request: AgentTurnRequest): string | undefined => {
  const contextCwd = request.context?.cwd;
  const metadataCwd = request.metadata?.cwd ?? request.metadata?.workspacePath;
  return typeof contextCwd === "string"
    ? contextCwd
    : typeof metadataCwd === "string"
      ? metadataCwd
      : undefined;
};

const mcpServersFromAttachment = (
  attachment: AgentMcpAttachment | undefined,
): Record<string, McpServerConfig> | undefined => {
  if (attachment === undefined) return undefined;
  if (attachment.mode === "http") {
    return {
      cycle: {
        alwaysLoad: true,
        headers: attachment.headers === undefined ? undefined : { ...attachment.headers },
        type: "http",
        url: attachment.url,
      },
    };
  }
  return {
    cycle: {
      args: attachment.args === undefined ? undefined : [...attachment.args],
      command: attachment.command,
      env: attachment.env === undefined ? undefined : { ...attachment.env },
      alwaysLoad: true,
      type: "stdio",
    },
  };
};

const outputFormatFromResponseFormat = (
  responseFormat: AgentResponseFormat | undefined,
): Options["outputFormat"] | undefined =>
  responseFormat?.type === "json_schema"
    ? {
        schema: responseFormat.schema,
        type: "json_schema",
      }
    : undefined;

const bridgeAbort = (source: AbortSignal | undefined, target: AbortController): (() => void) => {
  if (source === undefined) return () => undefined;
  if (source.aborted) {
    target.abort(source.reason);
    return () => undefined;
  }
  const abort = () => target.abort(source.reason);
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
};
