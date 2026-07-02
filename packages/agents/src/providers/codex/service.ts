import type {
  AbortTurnResult,
  AgentApprovalDecision,
  AgentCapabilities,
  AgentEvent,
  AgentInteractionResponseResult,
  AgentService,
  AgentSession,
  AgentSessionBinding,
  AgentSessionBindingStatus,
  AgentTurnRequest,
  AgentTurnResult,
  AgentUserInputAnswer,
  CreateAgentSessionInput,
} from "../../types.ts";
import {
  interactionKey,
  runCodexAppServerTurn,
  streamCodexAppServerTurn,
  type CodexTurnRuntimeWithInteractions,
} from "./app-server/runtime.ts";
import { listCodexModels } from "./app-server/models.ts";
import { codexAgentCapabilities } from "./capabilities.ts";
import { codexProviderId, newCodexId, now } from "./constants.ts";
import { bindingFromSession, sessionFromBinding, withNativeThreadId } from "./session.ts";
import type { ActiveCodexTurn, CodexAgentServiceOptions, StoredCodexSession } from "./types.ts";

export const makeCodexAgentService = (options: CodexAgentServiceOptions = {}): AgentService => {
  const capabilities: AgentCapabilities = codexAgentCapabilities;
  const sessions = new Map<string, StoredCodexSession>();
  const activeTurns = new Map<string, ActiveCodexTurn>();
  const appServerRuntimes = new Map();
  const pendingApprovals: CodexTurnRuntimeWithInteractions["pendingApprovals"] = new Map();
  const pendingUserInputs: CodexTurnRuntimeWithInteractions["pendingUserInputs"] = new Map();
  const resolvedInteractions = new Set<string>();

  const saveSession = async (
    session: StoredCodexSession,
    status: AgentSessionBindingStatus,
    patch: Partial<AgentSessionBinding> = {},
  ): Promise<StoredCodexSession> => {
    const updatedAt = patch.updatedAt === undefined ? now() : new Date(patch.updatedAt);
    const updatedSession: StoredCodexSession = {
      ...session,
      updatedAt,
    };
    const binding = bindingFromSession(updatedSession, status, {
      ...patch,
      updatedAt: updatedAt.toISOString(),
    });
    const storedSession: StoredCodexSession = {
      ...updatedSession,
      binding,
    };

    sessions.set(storedSession.id, storedSession);
    await options.sessionStore?.upsert(binding);

    return storedSession;
  };

  const createSession = async (input?: CreateAgentSessionInput): Promise<AgentSession> => {
    const timestamp = now();
    const session: StoredCodexSession = {
      createdAt: timestamp,
      harnessId: codexProviderId,
      id: newCodexId("session"),
      metadata: input?.metadata,
      native:
        input?.runtimeMode === undefined
          ? undefined
          : {
              runtimeMode: input.runtimeMode,
            },
      provider: codexProviderId,
      title: input?.title,
      updatedAt: timestamp,
    };

    return saveSession(session, "idle", {
      ...(input?.workspace?.cwd === undefined ? {} : { cwd: input.workspace.cwd }),
      ...(input?.model?.id === undefined ? {} : { model: input.model.id }),
      ...(input?.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input?.runtimeMode === undefined ? {} : { runtime: { runtimeMode: input.runtimeMode } }),
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

    const timestamp = now();
    const session: StoredCodexSession = {
      createdAt: timestamp,
      harnessId: codexProviderId,
      id: sessionId,
      provider: codexProviderId,
      updatedAt: timestamp,
    };

    return saveSession(session, "idle");
  };

  const storeNativeThreadId = async (
    session: StoredCodexSession,
    threadId: string | null | undefined,
    updatedAt: Date,
    status: AgentSessionBindingStatus = "idle",
    patch: Partial<AgentSessionBinding> = {},
  ): Promise<StoredCodexSession> =>
    saveSession(withNativeThreadId(session, threadId, updatedAt), status, {
      ...patch,
      updatedAt: updatedAt.toISOString(),
    });

  const turnRuntime: CodexTurnRuntimeWithInteractions = {
    activeTurns,
    appServerRuntimes,
    options,
    pendingApprovals,
    pendingUserInputs,
    resumeSession,
    resolvedInteractions,
    saveSession,
    storeNativeThreadId,
  };

  return {
    abortTurn: async (sessionId, turnId): Promise<AbortTurnResult> => {
      const activeTurn = activeTurns.get(sessionId);
      if (activeTurn === undefined) return { accepted: false, reason: "not_found" };
      if (turnId !== undefined && activeTurn.turnId !== turnId) {
        return { accepted: false, reason: "not_found" };
      }
      if (activeTurn.controller.signal.aborted) {
        return { accepted: false, reason: "already_finished" };
      }

      activeTurn.controller.abort(new Error("Codex turn cancellation requested."));
      void activeTurn.interrupt?.().catch(() => undefined);
      return { accepted: true, reason: "cancel_requested" };
    },
    capabilities: () => capabilities,
    listModels: (request) => listCodexModels(options, request),
    close: async () => {
      for (const activeTurn of activeTurns.values()) {
        if (!activeTurn.controller.signal.aborted) {
          activeTurn.controller.abort(new Error("Codex service closed."));
        }
        await activeTurn.interrupt?.().catch(() => undefined);
      }
      for (const pending of pendingApprovals.values()) pending.decision("cancel");
      for (const pending of pendingUserInputs.values()) pending.answers([]);
      for (const runtime of appServerRuntimes.values()) {
        await runtime.client.close().catch(() => undefined);
      }
      activeTurns.clear();
      appServerRuntimes.clear();
      pendingApprovals.clear();
      pendingUserInputs.clear();
    },
    createSession,
    provider: codexProviderId,
    resumeSession,
    respondToApproval: async (
      sessionId: string,
      requestId: string,
      decision: AgentApprovalDecision,
    ): Promise<AgentInteractionResponseResult> => {
      const key = interactionKey(sessionId, requestId);
      const pending = pendingApprovals.get(key);
      if (pending === undefined) {
        return {
          requestId,
          sessionId,
          status: resolvedInteractions.has(key) ? "already_resolved" : "not_found",
        };
      }
      pending.decision(decision);
      return {
        requestId,
        sessionId,
        status: "accepted",
      };
    },
    respondToUserInput: async (
      sessionId: string,
      requestId: string,
      answers: readonly AgentUserInputAnswer[],
    ): Promise<AgentInteractionResponseResult> => {
      const key = interactionKey(sessionId, requestId);
      const pending = pendingUserInputs.get(key);
      if (pending === undefined) {
        return {
          requestId,
          sessionId,
          status: resolvedInteractions.has(key) ? "already_resolved" : "not_found",
        };
      }
      pending.answers(answers);
      return {
        requestId,
        sessionId,
        status: "accepted",
      };
    },
    run: <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): Promise<AgentTurnResult<TStructured>> =>
      runCodexAppServerTurn(turnRuntime, sessionId, request),
    stream: <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): AsyncIterable<AgentEvent<TStructured>> =>
      streamCodexAppServerTurn(turnRuntime, sessionId, request),
  };
};
