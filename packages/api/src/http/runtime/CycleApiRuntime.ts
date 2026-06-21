import { type RepositoryInput } from "@cycle/contracts";
import type {
  AgentProviderId,
  AgentProviderProfile,
  AgentRuntimeMode,
  AgentSessionStore,
} from "@cycle/agents/types";
import { type AgentServiceRegistryShape } from "@cycle/agents/service";
import { type UseCaseRunnerShape } from "@cycle/usecases";
import { Context } from "effect";
import type {
  AgentActiveTurnBeginInput,
  AgentActiveTurnBeginResult,
  AgentActiveTurnDirectoryShape,
} from "../../agents/services/AgentActiveTurnDirectory.ts";

export type ApiConfig = {
  readonly enabled: boolean;
  readonly host: "127.0.0.1" | "localhost";
  readonly port: number | "auto";
  readonly staticToken: string;
};

export type LocalSettingsProfileUpdateInput = {
  readonly displayName?: string;
  readonly email?: string;
};

export type LocalSettingsThemePreference = "light" | "dark" | "system";
export type LocalSettingsRepositoryCommitStyle = "descriptive" | "compact";
export type LocalSettingsRepositoryPreferences = {
  readonly autoSync?: boolean;
  readonly commitStyle?: LocalSettingsRepositoryCommitStyle;
  readonly sidebarExpanded?: boolean;
};

export type LocalSettingsOnboardingInput = {
  readonly displayName: string;
  readonly email: string;
  readonly enabledAgentProviderIds?: ReadonlyArray<AgentProviderId>;
  readonly themePreference: LocalSettingsThemePreference;
};

export type LocalSettingsRepositoryPreferencesInput = {
  readonly id: string;
  readonly preferences: LocalSettingsRepositoryPreferences;
};

export type LocalSettingsProviderShape = {
  readonly completeOnboarding?: (input: LocalSettingsOnboardingInput) => Promise<unknown>;
  readonly read: () => Promise<unknown>;
  readonly setThemePreference?: (preference: LocalSettingsThemePreference) => Promise<unknown>;
  readonly updateProfile?: (input: LocalSettingsProfileUpdateInput) => Promise<unknown>;
  readonly updateRepositoryPreferences?: (
    input: LocalSettingsRepositoryPreferencesInput,
  ) => Promise<unknown>;
};

export type RuntimeDiscoveryFile = {
  readonly apiVersion: string;
  readonly baseUrl: string;
  readonly mcpPath?: string;
  readonly mcpUrl?: string;
  readonly pid: number;
  readonly specUrl?: string;
  readonly startedAt: string;
};

export type RepositoryOpenRequest = {
  readonly displayName?: string;
  readonly path?: string;
  readonly repositoryId?: string;
  readonly syncOnOpen?: boolean;
};

export type ApiRequestContext = {
  readonly requestId: string;
};

export type RepositoryOpenInputResolver = (
  request: RepositoryOpenRequest,
  context: ApiRequestContext,
) => Promise<RepositoryInput>;

export type CycleApiMcpOptions = {
  readonly apiToken?: string;
  readonly apiUrl?: string;
  readonly auth?: false | { readonly token?: string };
  readonly enabled?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly path?: string;
  readonly requireApiOnStart?: boolean;
};

export type CycleApiOptions = {
  readonly agentServices?: AgentServiceRegistryShape;
  readonly agentChatStore?: AgentChatStoreShape;
  readonly agentProviderProfiles?: () => Promise<readonly AgentProviderProfile[]>;
  readonly agentSessionStore?: AgentSessionStore;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly localSettings?: LocalSettingsProviderShape;
  readonly mcp?: false | CycleApiMcpOptions;
  readonly now?: () => Date;
  readonly repositoryOpenInput?: RepositoryOpenInputResolver;
  readonly runner: UseCaseRunnerShape;
  readonly startedAt?: Date;
  readonly staticToken: string;
};

export type CycleApi = {
  readonly dispose: () => Promise<void>;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly spec: () => Readonly<Record<string, unknown>>;
};

export type CycleApiRuntimeShape = {
  readonly agentServices: AgentServiceRegistryShape;
  readonly agentChatStore?: AgentChatStoreShape;
  readonly agentProviderProfiles: () => Promise<readonly AgentProviderProfile[]>;
  readonly agentSessionStore?: AgentSessionStore;
  readonly activeAgentTurns: AgentActiveTurnDirectoryShape;
  readonly apiVersion: string;
  readonly localSettings?: LocalSettingsProviderShape;
  readonly mcpPath?: string;
  readonly now: () => Date;
  readonly repositoryOpenInput?: RepositoryOpenInputResolver;
  readonly runner: UseCaseRunnerShape;
  readonly startedAt: string;
  readonly staticToken: string;
};

export type {
  AgentActiveTurnBeginInput,
  AgentActiveTurnBeginResult,
  AgentActiveTurnDirectoryShape,
};

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

export class CycleApiRuntime extends Context.Service<CycleApiRuntime, CycleApiRuntimeShape>()(
  "@cycle/api/CycleApiRuntime",
) {}
