import type { AgentProviderId, AgentTurnRuntimeRecord } from "@cycle/agents";
import { Context, Layer } from "effect";

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

export class AgentActiveTurnDirectory extends Context.Service<
  AgentActiveTurnDirectory,
  AgentActiveTurnDirectoryShape
>()("@cycle/api/AgentActiveTurnDirectory") {}

const activeTurnKey = (provider: AgentProviderId, sessionId: string): string =>
  `${provider}:${sessionId}`;

export const makeAgentActiveTurnDirectory = (): AgentActiveTurnDirectoryShape => {
  const records = new Map<string, AgentTurnRuntimeRecord>();

  return {
    begin: (input) => {
      const key = activeTurnKey(input.provider, input.sessionId);
      const existing = records.get(key);
      if (existing !== undefined) return { active: false, existing };

      const record = {
        abortController: new AbortController(),
        provider: input.provider,
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        sessionId: input.sessionId,
        startedAt: new Date().toISOString(),
        status: "starting" as const,
        ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
        turnId: `turn_${input.requestId ?? crypto.randomUUID()}`,
      };

      records.set(key, record);
      return { active: true, record };
    },
    countByProvider: (provider) =>
      [...records.values()].filter((record) => record.provider === provider).length,
    finish: (provider, sessionId) => {
      records.delete(activeTurnKey(provider, sessionId));
    },
    get: (provider, sessionId) => records.get(activeTurnKey(provider, sessionId)),
  };
};

export const AgentActiveTurnDirectoryLive = Layer.sync(AgentActiveTurnDirectory, () =>
  AgentActiveTurnDirectory.of(makeAgentActiveTurnDirectory()),
);
