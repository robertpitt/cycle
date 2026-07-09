import type {
  AgentChatEventBusShape,
  AgentChatRuntimeShape,
  AgentChatStoreShape,
} from "@cycle/agent-chat";
import type {
  UseCaseInput,
  UseCaseMeta,
  UseCaseName,
  UseCaseSideEffect,
  UseCaseSuccess,
} from "@cycle/usecases/contracts";
import type {
  AgentOrchestrationServiceShape,
  AgentProviderId,
  AgentProviderProfile,
  AgentServiceRegistryShape,
  AgentSessionStore,
} from "@cycle/agents";
import type { WorktreesShape } from "@cycle/git-worktrees";
import { Context, Layer } from "effect";
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
export type LocalSettingsInterfaceDensity = "compact" | "spacious";
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

export type LocalSettingsAgentProviderPreferencePatch = {
  readonly config?: Readonly<Record<string, unknown>>;
  readonly defaultModel?: string | null;
  readonly enabled?: boolean;
  readonly executablePath?: string | null;
  readonly maxConcurrentRuns?: number | null;
};

export type LocalSettingsAgentProviderPreferenceInput = {
  readonly providerId: AgentProviderId;
  readonly preference: LocalSettingsAgentProviderPreferencePatch;
};

export type LocalSettingsProviderShape = {
  readonly completeOnboarding?: (input: LocalSettingsOnboardingInput) => Promise<unknown>;
  readonly read: () => Promise<unknown>;
  readonly removeRepository?: (repositoryId: string) => Promise<unknown>;
  readonly setInterfaceDensity?: (density: LocalSettingsInterfaceDensity) => Promise<unknown>;
  readonly setThemePreference?: (preference: LocalSettingsThemePreference) => Promise<unknown>;
  readonly updateProfile?: (input: LocalSettingsProfileUpdateInput) => Promise<unknown>;
  readonly updateRepositoryPreferences?: (
    input: LocalSettingsRepositoryPreferencesInput,
  ) => Promise<unknown>;
  readonly updateAgentProviderPreference?: (
    input: LocalSettingsAgentProviderPreferenceInput,
  ) => Promise<unknown>;
};

export type ApiRequestContext = {
  readonly requestId: string;
};

export type RepositoryDirectoryEntry = {
  readonly displayName: string;
  readonly id: string;
  readonly path: string;
};

export type RepositoryDirectoryResolver = () => Promise<readonly RepositoryDirectoryEntry[]>;

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
  readonly agentOrchestration?: AgentOrchestrationServiceShape;
  readonly agentChatStore?: AgentChatStoreShape;
  readonly agentProviderProfiles?: () => Promise<readonly AgentProviderProfile[]>;
  readonly agentSessionStore?: AgentSessionStore;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly listRepositories?: RepositoryDirectoryResolver;
  readonly localSettings?: LocalSettingsProviderShape;
  readonly mcp?: false | CycleApiMcpOptions;
  readonly now?: () => Date;
  readonly onUseCaseSuccess?: (event: CycleApiUseCaseSuccessEvent) => Promise<void> | void;
  readonly startedAt?: Date;
  readonly staticToken: string;
  readonly useCaseLayer?: Layer.Layer<never, unknown, any>;
  readonly worktrees?: WorktreesShape;
  readonly worktreeStoragePath?: string;
};

export type CycleApi = {
  readonly dispose: () => Promise<void>;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly spec: () => Readonly<Record<string, unknown>>;
};

export type CycleApiRuntimeShape = {
  readonly agentServices?: AgentServiceRegistryShape;
  readonly agentOrchestration?: AgentOrchestrationServiceShape;
  readonly agentChatEventBus?: AgentChatEventBusShape;
  readonly agentChatRuntime?: AgentChatRuntimeShape;
  readonly agentProviderProfiles: () => Promise<readonly AgentProviderProfile[]>;
  readonly agentSessionStore?: AgentSessionStore;
  readonly activeAgentTurns: AgentActiveTurnDirectoryShape;
  readonly apiVersion: string;
  readonly baseUrl?: string;
  readonly listRepositories?: RepositoryDirectoryResolver;
  readonly localSettings?: LocalSettingsProviderShape;
  readonly mcpPath?: string;
  readonly mcpUrl?: string;
  readonly now: () => Date;
  readonly onUseCaseSuccess?: (event: CycleApiUseCaseSuccessEvent) => Promise<void> | void;
  readonly startedAt: string;
  readonly staticToken: string;
  readonly useCaseLayer: Layer.Layer<never, unknown, any>;
  readonly worktrees?: WorktreesShape;
  readonly worktreeStoragePath?: string;
};

export type CycleApiUseCaseSuccessEvent<Name extends UseCaseName = UseCaseName> = {
  readonly input: UseCaseInput<Name>;
  readonly meta?: UseCaseMeta;
  readonly name: Name;
  readonly sideEffect: UseCaseSideEffect;
  readonly value: UseCaseSuccess<Name>;
};

export type {
  AgentActiveTurnBeginInput,
  AgentActiveTurnBeginResult,
  AgentActiveTurnDirectoryShape,
};

export class CycleApiRuntime extends Context.Service<CycleApiRuntime, CycleApiRuntimeShape>()(
  "@cycle/api/CycleApiRuntime",
) {}
