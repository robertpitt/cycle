import type { AgentRuntimeMode } from "@cycle/agents";

export type AgentChatMessageRecord = {
  readonly actor: "agent" | "user";
  readonly body: string;
  readonly createdAt: string;
  readonly id: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly sequence?: number;
  readonly streaming?: boolean;
  readonly threadId: string;
  readonly turnId?: string | null;
  readonly updatedAt?: string;
};

export type AgentChatThreadRecord = {
  readonly agentId?: string;
  readonly activeTurnId?: string | null;
  readonly archivedAt?: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly lastError?: string | null;
  readonly model?: string | null;
  readonly origin?: Readonly<Record<string, unknown>>;
  readonly runtimeMode?: AgentRuntimeMode | null;
  readonly sessionId?: string;
  readonly status: "active" | "archived" | "draft" | "error" | "waiting";
  readonly summary: string;
  readonly thinkingLevel?: string | null;
  readonly title: string;
  readonly updatedAt: string;
};

export type AgentChatThreadWithMessages = AgentChatThreadRecord & {
  readonly messages: readonly AgentChatMessageRecord[];
};

export type AgentChatTurnRecord = {
  readonly assistantMessageId?: string | null;
  readonly completedAt?: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly inputMessageId: string;
  readonly lastError?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly model?: string | null;
  readonly providerId: string;
  readonly runtimeMode?: AgentRuntimeMode | null;
  readonly status: "cancelled" | "completed" | "failed" | "queued" | "running" | "waiting_for_user";
  readonly thinkingLevel?: string | null;
  readonly threadId: string;
  readonly updatedAt: string;
};

export type AgentChatActivityRecord = {
  readonly createdAt: string;
  readonly detail?: string | null;
  readonly id: string;
  readonly kind: "error" | "progress" | "question" | "system" | "thinking" | "tool" | "usage";
  readonly payload?: Readonly<Record<string, unknown>> | null;
  readonly status?: "cancelled" | "completed" | "failed" | "pending" | "running" | null;
  readonly threadId: string;
  readonly title: string;
  readonly turnId?: string | null;
  readonly updatedAt?: string | null;
};

export type AgentChatQuestionItemRecord = {
  readonly header: string;
  readonly id: string;
  readonly multiSelect: boolean;
  readonly options: readonly {
    readonly description?: string | null;
    readonly disabled?: boolean;
    readonly label: string;
    readonly value?: string;
  }[];
  readonly question: string;
};

export type AgentChatQuestionRecord = {
  readonly answer?: Readonly<Record<string, unknown>> | null;
  readonly answeredAt?: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly prompt: string;
  readonly questions: readonly AgentChatQuestionItemRecord[];
  readonly status: "answered" | "cancelled" | "expired" | "open";
  readonly threadId: string;
  readonly turnId: string;
  readonly updatedAt?: string | null;
};

export type AgentChatEventRecord = {
  readonly createdAt: string;
  readonly eventId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sequence: number;
  readonly threadId: string;
  readonly type: string;
};

export type AgentChatStoreShape = {
  readonly appendEvent?: (
    input: Omit<AgentChatEventRecord, "sequence">,
  ) => Promise<AgentChatEventRecord>;
  readonly close?: () => Promise<void> | void;
  readonly deleteThread?: (threadId: string) => Promise<boolean>;
  readonly getThread?: (threadId: string) => Promise<AgentChatThreadWithMessages | undefined>;
  readonly listActivities?: (threadId: string) => Promise<readonly AgentChatActivityRecord[]>;
  readonly listEventsAfter?: (
    threadId: string,
    sequence: number,
  ) => Promise<readonly AgentChatEventRecord[]>;
  readonly listMessages: (threadId: string) => Promise<readonly AgentChatMessageRecord[]>;
  readonly listQuestions?: (threadId: string) => Promise<readonly AgentChatQuestionRecord[]>;
  readonly listThreads: () => Promise<readonly AgentChatThreadWithMessages[]>;
  readonly listTurns?: (threadId: string) => Promise<readonly AgentChatTurnRecord[]>;
  readonly upsertActivity?: (input: AgentChatActivityRecord) => Promise<AgentChatActivityRecord>;
  readonly upsertMessage: (input: AgentChatMessageRecord) => Promise<AgentChatMessageRecord>;
  readonly upsertQuestion?: (input: AgentChatQuestionRecord) => Promise<AgentChatQuestionRecord>;
  readonly upsertThread: (input: AgentChatThreadRecord) => Promise<AgentChatThreadRecord>;
  readonly upsertTurn?: (input: AgentChatTurnRecord) => Promise<AgentChatTurnRecord>;
};
