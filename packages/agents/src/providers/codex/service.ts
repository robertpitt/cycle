import type {
  AbortTurnResult,
  AgentCapabilities,
  AgentEvent,
  AgentService,
  AgentSession,
  AgentSessionBinding,
  AgentSessionBindingStatus,
  AgentTurnRequest,
  AgentTurnResult,
  CreateAgentSessionInput,
} from "../../types.ts";
import { codexAgentCapabilities } from "./capabilities.ts";
import { codexProviderId, newCodexId, now } from "./constants.ts";
import type { CodexTurnRuntime } from "./runtime.ts";
import { runCodexTurn } from "./runTurn.ts";
import { bindingFromSession, sessionFromBinding, withNativeThreadId } from "./session.ts";
import { streamCodexTurn } from "./streamTurn.ts";
import type { ActiveCodexTurn, CodexAgentServiceOptions, StoredCodexSession } from "./types.ts";

export const makeCodexAgentService = (options: CodexAgentServiceOptions = {}): AgentService => {
  const capabilities: AgentCapabilities = codexAgentCapabilities;
  const sessions = new Map<string, StoredCodexSession>();
  const activeTurns = new Map<string, ActiveCodexTurn>();

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
      provider: codexProviderId,
      title: input?.title,
      updatedAt: timestamp,
    };

    return saveSession(session, "idle", {
      ...(input?.workspace?.cwd === undefined ? {} : { cwd: input.workspace.cwd }),
      ...(input?.model?.id === undefined ? {} : { model: input.model.id }),
      ...(input?.metadata === undefined ? {} : { metadata: input.metadata }),
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

  const turnRuntime: CodexTurnRuntime = {
    activeTurns,
    options,
    resumeSession,
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
      return { accepted: true, reason: "cancel_requested" };
    },
    capabilities: () => capabilities,
    close: async () => {
      for (const activeTurn of activeTurns.values()) {
        if (!activeTurn.controller.signal.aborted) {
          activeTurn.controller.abort(new Error("Codex service closed."));
        }
      }
      activeTurns.clear();
    },
    createSession,
    provider: codexProviderId,
    resumeSession,
    run: <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): Promise<AgentTurnResult<TStructured>> => runCodexTurn(turnRuntime, sessionId, request),
    stream: <TStructured = unknown>(
      sessionId: string,
      request: AgentTurnRequest<TStructured>,
    ): AsyncIterable<AgentEvent<TStructured>> => streamCodexTurn(turnRuntime, sessionId, request),
  };
};
