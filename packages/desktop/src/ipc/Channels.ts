import { Schema } from "effect";
import {
  AppConfigState,
  RepositoryCommitStyle,
  RepositoryRecord,
  ThemePreference,
} from "../shared/AppConfig.ts";
import { AgentProviderId, DetectedAgentProvider } from "../shared/AgentProviders.ts";
import { BootstrapStatus } from "../shared/Bootstrap.ts";
import { ElectronThemeSource, ElectronThemeState } from "../platform/ElectronTheme.ts";
import { CompleteOnboardingInput, ProfileUpdateInput } from "../shared/Profile.ts";
import {
  InitializeRepositoryPathInput,
  SelectRepositoryFolderResult,
  UpdateRepositoryPreferencesInput,
  UpsertRepositoryPathInput,
} from "../shared/LocalWorkspace.ts";

export const getAppConfigChannel = "cycle:desktop:app-config/get";
export const updateProfileChannel = "cycle:desktop:profile/update";
export const completeOnboardingChannel = "cycle:desktop:profile/complete-onboarding";
export const getThemeStateChannel = "cycle:desktop:theme/get-state";
export const setThemePreferenceChannel = "cycle:desktop:theme/set-preference";
export const themeStateChangedChannel = "cycle:desktop:theme/state-changed";
export const clearCacheChannel = "cycle:desktop:preferences/clear-cache";
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
export const getBootstrapStatusChannel = "cycle:desktop:bootstrap/status";
export const getBackendLogPathChannel = "cycle:desktop:logs/path";
export const getApiConnectionChannel = "cycle:desktop:api/connection";

export const ApiConnection = Schema.Struct({
  baseUrl: Schema.String,
  token: Schema.String,
});
export type ApiConnection = typeof ApiConnection.Type;

export const OpenExternalRequest = Schema.Struct({
  targetUrl: Schema.String,
});
export type OpenExternalRequest = typeof OpenExternalRequest.Type;

export const SetThemePreferenceRequest = Schema.Struct({
  preference: ThemePreference,
});
export type SetThemePreferenceRequest = typeof SetThemePreferenceRequest.Type;

export type { ElectronThemeState, ElectronThemeSource };

export const RemoveRepositoryRequest = Schema.Struct({
  id: Schema.String,
});
export type RemoveRepositoryRequest = typeof RemoveRepositoryRequest.Type;

export type CycleDesktopBridge = {
  readonly completeOnboarding: (input: CompleteOnboardingInput) => Promise<AppConfigState>;
  readonly detectAgentProviders: () => Promise<ReadonlyArray<DetectedAgentProvider>>;
  readonly getApiConnection: () => Promise<ApiConnection>;
  readonly getBackendLogPath: () => Promise<string>;
  readonly getBootstrapStatus: () => Promise<BootstrapStatus>;
  readonly getAppConfig: () => Promise<AppConfigState>;
  readonly getThemeState: () => Promise<ElectronThemeState>;
  readonly initializeRepositoryPath: (
    input: InitializeRepositoryPathInput,
  ) => Promise<RepositoryRecord>;
  readonly listRepositories: () => Promise<ReadonlyArray<RepositoryRecord>>;
  readonly openExternal: (targetUrl: string) => Promise<void>;
  readonly platform: NodeJS.Platform;
  readonly removeRepository: (id: string) => Promise<ReadonlyArray<RepositoryRecord>>;
  readonly selectRepositoryFolder: () => Promise<SelectRepositoryFolderResult>;
  readonly clearCache: () => Promise<void>;
  readonly setThemePreference: (preference: ThemePreference) => Promise<AppConfigState>;
  readonly onThemeStateChanged: (listener: (state: ElectronThemeState) => void) => () => void;
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

const isSchema =
  <S extends Schema.Top>(schema: S) =>
  (value: unknown): value is S["Type"] =>
    Schema.is(schema)(value);

export const isOpenExternalRequest = isSchema(OpenExternalRequest);

export const isThemePreferenceValue = isSchema(ThemePreference);

export const isElectronThemeSourceValue = isSchema(ElectronThemeSource);

export const isRepositoryCommitStyleValue = isSchema(RepositoryCommitStyle);

export const isElectronThemeState = isSchema(ElectronThemeState);

export const isProfileUpdateInput = isSchema(ProfileUpdateInput);

export const isCompleteOnboardingInput = isSchema(CompleteOnboardingInput);

export const isSetThemePreferenceRequest = isSchema(SetThemePreferenceRequest);

export const isUpsertRepositoryPathInput = isSchema(UpsertRepositoryPathInput);

export const isInitializeRepositoryPathInput = isSchema(InitializeRepositoryPathInput);

export const isUpdateRepositoryPreferencesInput = isSchema(UpdateRepositoryPreferencesInput);

export const isRemoveRepositoryRequest = isSchema(RemoveRepositoryRequest);

export const isApiConnection = isSchema(ApiConnection);
export const isAppConfigState = isSchema(AppConfigState);
export const isBootstrapStatus = isSchema(BootstrapStatus);
export const isDetectedAgentProviderArray = isSchema(Schema.Array(DetectedAgentProvider));
export const isRepositoryRecord = isSchema(RepositoryRecord);
export const isRepositoryRecordArray = isSchema(Schema.Array(RepositoryRecord));
export const isSelectRepositoryFolderResult = isSchema(SelectRepositoryFolderResult);
