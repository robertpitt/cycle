import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { Schema } from "effect";
import {
  ApiConnection,
  clearCacheChannel,
  completeOnboardingChannel,
  detectAgentProvidersChannel,
  getApiConnectionChannel,
  getAppConfigChannel,
  getBackendLogPathChannel,
  getBootstrapStatusChannel,
  getThemeStateChannel,
  initializeRepositoryPathChannel,
  listRepositoriesChannel,
  OpenExternalRequest,
  openExternalChannel,
  RemoveRepositoryRequest,
  removeRepositoryChannel,
  selectRepositoryFolderChannel,
  SetThemePreferenceRequest,
  setThemePreferenceChannel,
  themeStateChangedChannel,
  updateRepositoryPreferencesChannel,
  updateProfileChannel,
  upsertRepositoryPathChannel,
  type CycleDesktopBridge,
} from "../ipc/index.ts";
import { ElectronThemeState } from "../platform/ElectronTheme.ts";
import {
  AppConfigState,
  ProfileConfig,
  RepositoryRecord,
  ThemePreference,
} from "../shared/AppConfig.ts";
import { DetectedAgentProvider } from "../shared/AgentProviders.ts";
import { BootstrapStatus } from "../shared/Bootstrap.ts";
import { CompleteOnboardingInput, ProfileUpdateInput } from "../shared/Profile.ts";
import {
  InitializeRepositoryPathInput,
  SelectRepositoryFolderResult,
  UpdateRepositoryPreferencesInput,
  UpsertRepositoryPathInput,
} from "../shared/LocalWorkspace.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const decodeValue = <S extends Schema.Top>(
  schema: S,
  value: unknown,
  message: string,
): S["Type"] => {
  try {
    return (
      Schema.decodeUnknownSync(schema as never, StrictDecodeOptions) as (
        input: unknown,
      ) => S["Type"]
    )(value);
  } catch (error) {
    throw new TypeError(`${message}: ${String(error)}`);
  }
};

const invoke = async <S extends Schema.Top>(
  channel: string,
  outputSchema: S,
  payload?: unknown,
): Promise<S["Type"]> => {
  const output: unknown = await ipcRenderer.invoke(channel, payload);
  return decodeValue(
    outputSchema,
    output,
    `main process returned an invalid response for ${channel}`,
  );
};

const desktopBridge: CycleDesktopBridge = {
  completeOnboarding: async (input) => {
    const request = decodeValue(
      CompleteOnboardingInput,
      input,
      "input must include displayName, email, and themePreference",
    );

    return invoke(completeOnboardingChannel, AppConfigState, request);
  },
  clearCache: async () => ipcRenderer.invoke(clearCacheChannel),
  detectAgentProviders: async () =>
    invoke(detectAgentProvidersChannel, Schema.Array(DetectedAgentProvider)),
  getApiConnection: async () => invoke(getApiConnectionChannel, ApiConnection),
  getBackendLogPath: async () => invoke(getBackendLogPathChannel, Schema.String),
  getBootstrapStatus: async () => invoke(getBootstrapStatusChannel, BootstrapStatus),
  getAppConfig: async () => invoke(getAppConfigChannel, AppConfigState),
  getThemeState: async () => invoke(getThemeStateChannel, ElectronThemeState),
  initializeRepositoryPath: async (input) => {
    const request = decodeValue(
      InitializeRepositoryPathInput,
      input,
      "input must include a repository path",
    );

    return invoke(initializeRepositoryPathChannel, RepositoryRecord, request);
  },
  listRepositories: async () => invoke(listRepositoriesChannel, Schema.Array(RepositoryRecord)),
  openExternal: async (targetUrl) => {
    const request = decodeValue(OpenExternalRequest, { targetUrl }, "targetUrl must be a string");

    await ipcRenderer.invoke(openExternalChannel, request);
  },
  platform: process.platform,
  removeRepository: async (id) => {
    const request = decodeValue(RemoveRepositoryRequest, { id }, "id must be a string");

    return invoke(removeRepositoryChannel, Schema.Array(RepositoryRecord), request);
  },
  selectRepositoryFolder: async () =>
    invoke(selectRepositoryFolderChannel, SelectRepositoryFolderResult),
  setThemePreference: async (preference) => {
    const nextPreference = decodeValue(
      ThemePreference,
      preference,
      "preference must be light, dark, or system",
    );
    const request = decodeValue(
      SetThemePreferenceRequest,
      { preference: nextPreference },
      "preference must be light, dark, or system",
    );

    return invoke(setThemePreferenceChannel, AppConfigState, request);
  },
  onThemeStateChanged: (listener) => {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function.");
    }

    const handler = (_event: IpcRendererEvent, state: unknown): void => {
      if (Schema.is(ElectronThemeState)(state)) listener(state);
    };

    ipcRenderer.on(themeStateChangedChannel, handler);
    return () => {
      ipcRenderer.off(themeStateChangedChannel, handler);
    };
  },
  updateRepositoryPreferences: async (input) => {
    const request = decodeValue(
      UpdateRepositoryPreferencesInput,
      input,
      "input must include a repository id and preferences",
    );

    return invoke(updateRepositoryPreferencesChannel, Schema.NullOr(RepositoryRecord), request);
  },
  updateProfile: async (input) => {
    const request = decodeValue(ProfileUpdateInput, input, "input must be a profile update object");

    return invoke(updateProfileChannel, ProfileConfig, request);
  },
  upsertRepositoryPath: async (input) => {
    const request = decodeValue(
      UpsertRepositoryPathInput,
      input,
      "input must include a repository path",
    );

    return invoke(upsertRepositoryPathChannel, RepositoryRecord, request);
  },
};

contextBridge.exposeInMainWorld("cycleDesktop", desktopBridge);
