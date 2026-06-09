import { contextBridge, ipcRenderer } from "electron";
import {
  completeOnboardingChannel,
  detectAgentProvidersChannel,
  getAppConfigChannel,
  isCompleteOnboardingInput,
  isInitializeRepositoryPathInput,
  isProfileUpdateInput,
  isThemePreferenceValue,
  isUpdateRepositoryPreferencesInput,
  isUpsertRepositoryPathInput,
  initializeRepositoryPathChannel,
  listRepositoriesChannel,
  openExternalChannel,
  removeRepositoryChannel,
  selectRepositoryFolderChannel,
  setThemePreferenceChannel,
  updateRepositoryPreferencesChannel,
  updateProfileChannel,
  upsertRepositoryPathChannel,
  type CycleDesktopBridge,
} from "../ipc/index.ts";

const desktopBridge: CycleDesktopBridge = {
  completeOnboarding: async (input) => {
    if (!isCompleteOnboardingInput(input)) {
      throw new TypeError("input must include displayName, email, and themePreference.");
    }

    return ipcRenderer.invoke(completeOnboardingChannel, input);
  },
  detectAgentProviders: async () => ipcRenderer.invoke(detectAgentProvidersChannel),
  getAppConfig: async () => ipcRenderer.invoke(getAppConfigChannel),
  initializeRepositoryPath: async (input) => {
    if (!isInitializeRepositoryPathInput(input)) {
      throw new TypeError("input must include a repository path.");
    }

    return ipcRenderer.invoke(initializeRepositoryPathChannel, input);
  },
  listRepositories: async () => ipcRenderer.invoke(listRepositoriesChannel),
  openExternal: async (targetUrl) => {
    if (typeof targetUrl !== "string") {
      throw new TypeError("targetUrl must be a string.");
    }

    await ipcRenderer.invoke(openExternalChannel, { targetUrl });
  },
  platform: process.platform,
  removeRepository: async (id) => {
    if (typeof id !== "string") {
      throw new TypeError("id must be a string.");
    }

    return ipcRenderer.invoke(removeRepositoryChannel, { id });
  },
  selectRepositoryFolder: async () => ipcRenderer.invoke(selectRepositoryFolderChannel),
  setThemePreference: async (preference) => {
    if (!isThemePreferenceValue(preference)) {
      throw new TypeError("preference must be light, dark, or system.");
    }

    return ipcRenderer.invoke(setThemePreferenceChannel, { preference });
  },
  updateRepositoryPreferences: async (input) => {
    if (!isUpdateRepositoryPreferencesInput(input)) {
      throw new TypeError("input must include a repository id and preferences.");
    }

    return ipcRenderer.invoke(updateRepositoryPreferencesChannel, input);
  },
  updateProfile: async (input) => {
    if (!isProfileUpdateInput(input)) {
      throw new TypeError("input must be a profile update object.");
    }

    return ipcRenderer.invoke(updateProfileChannel, input);
  },
  upsertRepositoryPath: async (input) => {
    if (!isUpsertRepositoryPathInput(input)) {
      throw new TypeError("input must include a repository path.");
    }

    return ipcRenderer.invoke(upsertRepositoryPathChannel, input);
  },
};

contextBridge.exposeInMainWorld("cycleDesktop", desktopBridge);
