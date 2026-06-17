import type { AgentSession, AgentSessionBinding, AgentSessionBindingStatus } from "../../types.ts";
import type { ActiveCodexTurn, CodexAgentServiceOptions, StoredCodexSession } from "./types.ts";

export type CodexTurnRuntime = {
  readonly activeTurns: Map<string, ActiveCodexTurn>;
  readonly options: CodexAgentServiceOptions;
  readonly resumeSession: (sessionId: string) => Promise<AgentSession>;
  readonly saveSession: (
    session: StoredCodexSession,
    status: AgentSessionBindingStatus,
    patch?: Partial<AgentSessionBinding>,
  ) => Promise<StoredCodexSession>;
  readonly storeNativeThreadId: (
    session: StoredCodexSession,
    threadId: string | null | undefined,
    updatedAt: Date,
    status?: AgentSessionBindingStatus,
    patch?: Partial<AgentSessionBinding>,
  ) => Promise<StoredCodexSession>;
};
