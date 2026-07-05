import type { AgentProviderId, AgentTurnRuntimeRecord } from "@cycle/agents";

export type AgentActiveTurnBeginInput = {
  readonly provider: AgentProviderId;
  readonly sessionId: string;
  readonly requestId?: string;
  readonly threadId?: string;
};

export type AgentActiveTurnBeginResult =
  | {
      readonly active: true;
      readonly record: AgentTurnRuntimeRecord;
    }
  | {
      readonly active: false;
      readonly existing: AgentTurnRuntimeRecord;
    };

export type AgentActiveTurnDirectoryShape = {
  readonly begin: (input: AgentActiveTurnBeginInput) => AgentActiveTurnBeginResult;
  readonly countByProvider: (provider: AgentProviderId) => number;
  readonly finish: (
    provider: AgentProviderId,
    sessionId: string,
    status?: AgentTurnRuntimeRecord["status"],
    error?: string,
  ) => void;
  readonly get: (
    provider: AgentProviderId,
    sessionId: string,
  ) => AgentTurnRuntimeRecord | undefined;
};
