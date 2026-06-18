import { defaultAgentCapabilities } from "../providers.ts";
import type {
  AbortTurnResult,
  AgentApprovalDecision,
  AgentCapabilities,
  AgentError,
  AgentEvent,
  AgentInteractionResponseResult,
  AgentProviderId,
  AgentService,
  AgentSession,
  AgentSessionBinding,
  AgentSessionStore,
  AgentTurnRequest,
  AgentTurnResult,
  AgentUserInputAnswer,
  CreateAgentSessionInput,
} from "../types.ts";

const unsupportedError = (provider: AgentProviderId): AgentError => ({
  code: "unsupported_option",
  message: `Agent provider '${provider}' does not have an executable turn adapter yet.`,
  provider,
  retryable: false,
});

const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const bindingToSession = (binding: AgentSessionBinding): AgentSession => ({
  createdAt: new Date(binding.createdAt),
  harnessId: binding.provider,
  id: binding.sessionId,
  metadata: binding.metadata,
  native: binding.native,
  provider: binding.provider,
  title: binding.title,
  updatedAt: new Date(binding.updatedAt),
});

const sessionBinding = (input: {
  readonly id: string;
  readonly input?: CreateAgentSessionInput;
  readonly provider: AgentProviderId;
  readonly timestamp: Date;
}): AgentSessionBinding => ({
  createdAt: input.timestamp.toISOString(),
  ...(input.input?.workspace?.cwd === undefined ? {} : { cwd: input.input.workspace.cwd }),
  ...(input.input?.metadata === undefined ? {} : { metadata: input.input.metadata }),
  ...(input.input?.model?.id === undefined ? {} : { model: input.input.model.id }),
  ...(input.input?.runtimeMode === undefined
    ? {}
    : { runtime: { runtimeMode: input.input.runtimeMode } }),
  provider: input.provider,
  sessionId: input.id,
  status: "idle",
  ...(input.input?.title === undefined ? {} : { title: input.input.title }),
  updatedAt: input.timestamp.toISOString(),
});

export const makeUnsupportedAgentService = (
  provider: AgentProviderId,
  options: { readonly sessionStore?: AgentSessionStore } = {},
): AgentService => {
  const capabilities = defaultAgentCapabilities(provider);
  const sessions = new Map<string, AgentSession>();

  const failedResult = <TStructured>(
    sessionId: string,
    request: AgentTurnRequest<TStructured>,
  ): AgentTurnResult<TStructured> => {
    const now = new Date();
    return {
      artifacts: [],
      completedAt: now,
      createdAt: now,
      error: unsupportedError(provider),
      finishReason: "error",
      id: newId("turn"),
      metadata: request.metadata,
      provider,
      sessionId,
      status: "failed",
      text: "",
    };
  };

  return {
    abortTurn: async (): Promise<AbortTurnResult> => ({
      accepted: false,
      reason: "not_supported",
    }),
    capabilities: (): AgentCapabilities => capabilities,
    close: async () => undefined,
    createSession: async (input?: CreateAgentSessionInput): Promise<AgentSession> => {
      const now = new Date();
      const binding = sessionBinding({
        id: newId("session"),
        input,
        provider,
        timestamp: now,
      });
      await options.sessionStore?.upsert(binding);
      const session = bindingToSession(binding);
      sessions.set(session.id, session);
      return session;
    },
    provider,
    resumeSession: async (sessionId: string): Promise<AgentSession> => {
      const stored = await options.sessionStore?.get(sessionId);
      if (stored !== undefined) {
        const session = bindingToSession(stored);
        sessions.set(session.id, session);
        return session;
      }

      const existing = sessions.get(sessionId);
      if (existing !== undefined) return existing;

      const now = new Date();
      const binding = sessionBinding({ id: sessionId, provider, timestamp: now });
      await options.sessionStore?.upsert(binding);
      const session = bindingToSession(binding);
      sessions.set(session.id, session);
      return session;
    },
    respondToApproval: async (
      sessionId: string,
      requestId: string,
      _decision: AgentApprovalDecision,
    ): Promise<AgentInteractionResponseResult> => ({
      requestId,
      sessionId,
      status: "not_found",
    }),
    respondToUserInput: async (
      sessionId: string,
      requestId: string,
      _answers: readonly AgentUserInputAnswer[],
    ): Promise<AgentInteractionResponseResult> => ({
      requestId,
      sessionId,
      status: "not_found",
    }),
    run: async <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): Promise<AgentTurnResult<TStructured>> => failedResult(sessionId, request),
    stream: async function* <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): AsyncIterable<AgentEvent<TStructured>> {
      const result = failedResult(sessionId, request);
      yield {
        at: result.createdAt,
        provider,
        sessionId,
        turnId: result.id,
        type: "turn.started",
      };
      yield {
        at: result.completedAt ?? new Date(),
        error: unsupportedError(provider),
        sessionId,
        turnId: result.id,
        type: "turn.failed",
      };
    },
  };
};
