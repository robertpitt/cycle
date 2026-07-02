import { query, type McpServerConfig, type Options, type Query } from "@anthropic-ai/claude-agent-sdk";
import type {
  AbortTurnResult,
  AgentCapabilities,
  AgentEvent,
  AgentMcpAttachment,
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
} from "../../types.ts";
import { claudeCodeAgentCapabilities } from "./capabilities.ts";
import {
  decodeClaudeCodeProviderConfig,
  type ClaudeCodeProviderConfig,
} from "./config.ts";
import { claudeCodeNow, claudeCodeProviderId, newClaudeCodeId } from "./constants.ts";
import { claudeCodeError, mapClaudeCodeSdkMessage } from "./events.ts";

export type ClaudeCodeAgentServiceOptions = {
  readonly config?: ClaudeCodeProviderConfig | JsonObject;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string | null;
  readonly sessionStore?: {
    readonly get: (sessionId: string) => Promise<AgentSessionBinding | undefined>;
    readonly upsert: (binding: AgentSessionBinding) => Promise<void>;
  };
};

type StoredClaudeCodeSession = AgentSession & {
  readonly binding?: AgentSessionBinding;
};

type ActiveClaudeCodeTurn = {
  readonly abortController: AbortController;
  readonly query?: Query;
  readonly turnId: string;
};

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
    await options.sessionStore?.upsert(binding);
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
        runtimeMode: input?.runtimeMode,
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

  const resumeSession = async (sessionId: string): Promise<AgentSession> => {
    const storedBinding = await options.sessionStore?.get(sessionId);
    if (storedBinding !== undefined) {
      const storedSession = sessionFromBinding(storedBinding);
      sessions.set(storedSession.id, storedSession);
      return storedSession;
    }

    const existing = sessions.get(sessionId);
    if (existing !== undefined) return existing;

    const timestamp = claudeCodeNow();
    const session: StoredClaudeCodeSession = {
      createdAt: timestamp,
      harnessId: claudeCodeProviderId,
      id: sessionId,
      provider: claudeCodeProviderId,
      updatedAt: timestamp,
    };
    return saveSession(session, "idle");
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

      for await (const event of streamClaudeCodeTurn({
        activeTurns,
        env: options.env,
        executablePath,
        providerConfig,
        request,
        sessionId,
      })) {
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
    ): AsyncIterable<AgentEvent<TStructured>> =>
      streamClaudeCodeTurn({
        activeTurns,
        env: options.env,
        executablePath,
        providerConfig,
        request,
        sessionId,
      }) as AsyncIterable<AgentEvent<TStructured>>,
  };
};

const streamClaudeCodeTurn = async function* (input: {
  readonly activeTurns: Map<string, ActiveClaudeCodeTurn>;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string | null;
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
      options: sdkOptionsFromTurn({
        abortController,
        env: input.env,
        executablePath: input.executablePath,
        providerConfig: input.providerConfig,
        request: input.request,
      }),
      prompt: promptFromTurn(input.request),
    });
    Object.assign(active, { query: sdkQuery });

    for await (const message of sdkQuery) {
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

const sdkOptionsFromTurn = (input: {
  readonly abortController: AbortController;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string | null;
  readonly providerConfig: ClaudeCodeProviderConfig;
  readonly request: AgentTurnRequest;
}): Options => {
  const runtimeMode = input.request.runtimeMode ?? "read-only";
  const cwd = cwdFromRequest(input.request);
  const mcpServers = mcpServersFromAttachment(input.request.mcp);
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
    ...(input.providerConfig.maxTurns === null || input.providerConfig.maxTurns === undefined
      ? {}
      : { maxTurns: input.providerConfig.maxTurns }),
    ...(input.request.model?.id === undefined ? {} : { model: input.request.model.id }),
    ...(mcpServers === undefined ? {} : { mcpServers }),
    ...(outputFormat === undefined ? {} : { outputFormat }),
    ...(input.executablePath === null || input.executablePath === undefined
      ? {}
      : { pathToClaudeCodeExecutable: input.executablePath }),
    permissionMode,
    ...(runtimeMode === "read-only"
      ? {
          disallowedTools: ["Bash", "Edit", "MultiEdit", "NotebookEdit", "Write"],
          tools: ["Read", "Grep", "Glob", "LS"],
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

const bridgeAbort = (
  source: AbortSignal | undefined,
  target: AbortController,
): (() => void) => {
  if (source === undefined) return () => undefined;
  if (source.aborted) {
    target.abort(source.reason);
    return () => undefined;
  }
  const abort = () => target.abort(source.reason);
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
};

const sessionFromBinding = (binding: AgentSessionBinding): StoredClaudeCodeSession => ({
  createdAt: new Date(binding.createdAt),
  harnessId: claudeCodeProviderId,
  id: binding.sessionId,
  metadata: binding.metadata,
  native: binding.native,
  provider: binding.provider,
  title: binding.title,
  updatedAt: new Date(binding.updatedAt),
  binding,
});
