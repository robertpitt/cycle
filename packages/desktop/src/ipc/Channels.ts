import type { TicketRpcMethod, TicketRpcResponse } from "@cycle/rpc/protocol";
import type { AppConfigState, ThemePreference } from "../shared/AppConfig.ts";
import type { AgentProviderId, DetectedAgentProvider } from "../shared/AgentProviders.ts";
import type { BootstrapStatus } from "../shared/Bootstrap.ts";
import type { CompleteOnboardingInput, ProfileUpdateInput } from "../shared/Profile.ts";
import type {
  InitializeRepositoryPathInput,
  SelectRepositoryFolderResult,
  UpdateRepositoryPreferencesInput,
  UpsertRepositoryPathInput,
} from "../shared/LocalWorkspace.ts";
import type { RepositoryRecord } from "../shared/AppConfig.ts";

export const getAppConfigChannel = "cycle:desktop:app-config/get";
export const updateProfileChannel = "cycle:desktop:profile/update";
export const completeOnboardingChannel = "cycle:desktop:profile/complete-onboarding";
export const setThemePreferenceChannel = "cycle:desktop:theme/set-preference";
export const listRepositoriesChannel = "cycle:desktop:local-workspace/list-repositories";
export const selectRepositoryFolderChannel =
  "cycle:desktop:local-workspace/select-repository-folder";
export const initializeRepositoryPathChannel =
  "cycle:desktop:local-workspace/initialize-repository-path";
export const updateRepositoryPreferencesChannel =
  "cycle:desktop:local-workspace/update-repository-preferences";
export const upsertRepositoryPathChannel = "cycle:desktop:local-workspace/upsert-repository-path";
export const removeRepositoryChannel = "cycle:desktop:local-workspace/remove-repository";
export const detectAgentProvidersChannel = "cycle:desktop:agent-providers/detect";
export const openExternalChannel = "cycle:desktop:shell/open-external";
export const ticketRpcChannel = "cycle:desktop:ticket-rpc/invoke";
export const getBootstrapStatusChannel = "cycle:desktop:bootstrap/status";
export const getBackendLogPathChannel = "cycle:desktop:logs/path";

export type OpenExternalRequest = {
  readonly targetUrl: string;
};

export type SetThemePreferenceRequest = {
  readonly preference: ThemePreference;
};

export type RemoveRepositoryRequest = {
  readonly id: string;
};

export type TicketRpcBridgeRequest = {
  readonly id: string;
  readonly method: TicketRpcMethod;
  readonly payload: unknown;
};

export type CycleDesktopBridge = {
  readonly completeOnboarding: (input: CompleteOnboardingInput) => Promise<AppConfigState>;
  readonly detectAgentProviders: () => Promise<ReadonlyArray<DetectedAgentProvider>>;
  readonly getBackendLogPath: () => Promise<string>;
  readonly getBootstrapStatus: () => Promise<BootstrapStatus>;
  readonly getAppConfig: () => Promise<AppConfigState>;
  readonly initializeRepositoryPath: (
    input: InitializeRepositoryPathInput,
  ) => Promise<RepositoryRecord>;
  readonly listRepositories: () => Promise<ReadonlyArray<RepositoryRecord>>;
  readonly openExternal: (targetUrl: string) => Promise<void>;
  readonly platform: NodeJS.Platform;
  readonly removeRepository: (id: string) => Promise<ReadonlyArray<RepositoryRecord>>;
  readonly selectRepositoryFolder: () => Promise<SelectRepositoryFolderResult>;
  readonly setThemePreference: (preference: ThemePreference) => Promise<AppConfigState>;
  readonly ticketRpc: (request: TicketRpcBridgeRequest) => Promise<TicketRpcResponse>;
  readonly updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ) => Promise<RepositoryRecord | null>;
  readonly updateProfile: (input: ProfileUpdateInput) => Promise<{
    readonly displayName: string;
    readonly email: string;
  }>;
  readonly upsertRepositoryPath: (input: UpsertRepositoryPathInput) => Promise<RepositoryRecord>;
};

declare global {
  interface Window {
    readonly cycleDesktop?: CycleDesktopBridge;
  }
}

export const isOpenExternalRequest = (value: unknown): value is OpenExternalRequest =>
  typeof value === "object" &&
  value !== null &&
  "targetUrl" in value &&
  typeof (value as { readonly targetUrl?: unknown }).targetUrl === "string";

export const isThemePreferenceValue = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAgentProviderId = (value: unknown): value is AgentProviderId =>
  value === "codex" || value === "claude" || value === "opencode";

export const isProfileUpdateInput = (value: unknown): value is ProfileUpdateInput =>
  isRecord(value) &&
  (value.displayName === undefined || typeof value.displayName === "string") &&
  (value.email === undefined || typeof value.email === "string");

export const isCompleteOnboardingInput = (value: unknown): value is CompleteOnboardingInput =>
  isRecord(value) &&
  typeof value.displayName === "string" &&
  typeof value.email === "string" &&
  (value.enabledAgentProviderIds === undefined ||
    (Array.isArray(value.enabledAgentProviderIds) &&
      value.enabledAgentProviderIds.every(isAgentProviderId))) &&
  (value.themePreference === "light" ||
    value.themePreference === "dark" ||
    value.themePreference === "system");

export const isSetThemePreferenceRequest = (value: unknown): value is SetThemePreferenceRequest =>
  isRecord(value) && isThemePreferenceValue(value.preference);

export const isUpsertRepositoryPathInput = (value: unknown): value is UpsertRepositoryPathInput =>
  isRecord(value) &&
  typeof value.path === "string" &&
  (value.displayName === undefined || typeof value.displayName === "string");

export const isInitializeRepositoryPathInput = (
  value: unknown,
): value is InitializeRepositoryPathInput => isUpsertRepositoryPathInput(value);

export const isUpdateRepositoryPreferencesInput = (
  value: unknown,
): value is UpdateRepositoryPreferencesInput =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isRecord(value.preferences) &&
  (value.preferences.sidebarExpanded === undefined ||
    typeof value.preferences.sidebarExpanded === "boolean");

export const isRemoveRepositoryRequest = (value: unknown): value is RemoveRepositoryRequest =>
  isRecord(value) && typeof value.id === "string";

export const isTicketRpcBridgeRequest = (value: unknown): value is TicketRpcBridgeRequest =>
  isRecord(value) && typeof value.id === "string" && typeof value.method === "string";
