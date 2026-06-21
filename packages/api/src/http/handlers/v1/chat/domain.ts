import type { AgentProviderId, AgentRuntimeMode, AgentTurnRequest } from "@cycle/agents";

export type ChatMessagePayload = {
  readonly content: string;
  readonly createdAt?: string;
  readonly id?: string;
  readonly role: "agent" | "assistant" | "system" | "user";
};

export type ChatRepositoryPayload = {
  readonly displayName?: string;
  readonly id: string;
  readonly path?: string;
};

export type ChatTurnPayload = {
  readonly instructions?: string;
  readonly message: string;
  readonly messages?: readonly ChatMessagePayload[];
  readonly model?: string;
  readonly provider?: AgentProviderId;
  readonly repositories?: readonly ChatRepositoryPayload[];
  readonly runtimeMode?: AgentRuntimeMode;
  readonly sessionId?: string;
  readonly stream?: {
    readonly heartbeatMs?: number;
    readonly includeArtifacts?: boolean;
    readonly includeProgress?: boolean;
  };
  readonly threadId?: string;
};

export type PreparedChatTurn = {
  readonly agentRequest: AgentTurnRequest;
  readonly provider: AgentProviderId;
  readonly sessionId: string;
  readonly threadId: string;
};

export type ChatStreamOptions = {
  readonly heartbeatMs: number;
  readonly includeArtifacts: boolean;
  readonly includeProgress: boolean;
};

export type ChatStreamEnvelope = {
  readonly at: string;
  readonly data?: unknown;
  readonly provider?: AgentProviderId;
  readonly requestId: string;
  readonly sequence: number;
  readonly sessionId?: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly type: string;
};

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;
