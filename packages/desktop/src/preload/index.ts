import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  clearCacheChannel,
  getApiConnectionChannel,
  getBackendLogPathChannel,
  getBootstrapStatusChannel,
  getSettingsDiagnosticsChannel,
  getThemeStateChannel,
  openExternalChannel,
  selectRepositoryFolderChannel,
  themeStateChangedChannel,
  type ApiConnection,
  type CycleDesktopBridge,
  type SelectRepositoryFolderResult,
  type SettingsDiagnostics,
} from "../ipc/Channels.ts";
import type { ElectronThemeState } from "../ElectronTheme.ts";
import type { BootstrapStatus } from "@cycle/contracts/schemas/backend";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (value: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
};

const stringValue = (value: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
};

const apiConnectionFrom = (value: unknown): ApiConnection => {
  if (!isRecord(value)) throw new TypeError("API connection response must be an object.");

  const baseUrl = stringField(value, "baseUrl");
  const token = stringField(value, "token");
  if (baseUrl === undefined || token === undefined) {
    throw new TypeError("API connection response must include baseUrl and token.");
  }

  const rawProfile = isRecord(value.profile) ? value.profile : undefined;
  const displayName = rawProfile === undefined ? undefined : stringValue(rawProfile, "displayName");
  const email = rawProfile === undefined ? undefined : stringValue(rawProfile, "email");

  return {
    baseUrl,
    ...(displayName === undefined || email === undefined
      ? {}
      : {
          profile: {
            displayName,
            email,
          },
        }),
    token,
  };
};

const selectedRepositoryFolderFrom = (value: unknown): SelectRepositoryFolderResult => {
  if (!isRecord(value)) throw new TypeError("Repository folder response must be an object.");

  if (value.status === "cancelled") return { status: "cancelled" };
  if (value.status === "selected") {
    const path = stringField(value, "path");
    if (path !== undefined) return { path, status: "selected" };
  }

  throw new TypeError("Repository folder response must be cancelled or selected.");
};

const isThemeSource = (value: unknown): value is ElectronThemeState["source"] =>
  value === "dark" || value === "light" || value === "system";

const isThemeResolvedMode = (value: unknown): value is ElectronThemeState["resolvedMode"] =>
  value === "dark" || value === "light";

const themeStateFrom = (value: unknown): ElectronThemeState => {
  if (!isRecord(value)) throw new TypeError("Theme state response must be an object.");
  if (
    isThemeResolvedMode(value.resolvedMode) &&
    typeof value.shouldUseDarkColors === "boolean" &&
    isThemeSource(value.source)
  ) {
    return {
      resolvedMode: value.resolvedMode,
      shouldUseDarkColors: value.shouldUseDarkColors,
      source: value.source,
    };
  }

  throw new TypeError("Theme state response is invalid.");
};

const invoke = async <A>(channel: string, payload?: unknown): Promise<A> =>
  ipcRenderer.invoke(channel, payload) as Promise<A>;

const desktopBridge: CycleDesktopBridge = {
  clearCache: async () => {
    await ipcRenderer.invoke(clearCacheChannel);
  },
  getApiConnection: async () =>
    apiConnectionFrom(await ipcRenderer.invoke(getApiConnectionChannel)),
  getBackendLogPath: async () => invoke<string>(getBackendLogPathChannel),
  getBootstrapStatus: async () => invoke<BootstrapStatus>(getBootstrapStatusChannel),
  getSettingsDiagnostics: async () => invoke<SettingsDiagnostics>(getSettingsDiagnosticsChannel),
  getThemeState: async () => themeStateFrom(await ipcRenderer.invoke(getThemeStateChannel)),
  onThemeStateChanged: (listener) => {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function.");
    }

    const handler = (_event: IpcRendererEvent, state: unknown): void => {
      try {
        listener(themeStateFrom(state));
      } catch {
        // Ignore malformed native events from stale or incompatible main processes.
      }
    };

    ipcRenderer.on(themeStateChangedChannel, handler);
    return () => {
      ipcRenderer.off(themeStateChangedChannel, handler);
    };
  },
  openExternal: async (targetUrl) => {
    if (typeof targetUrl !== "string") throw new TypeError("targetUrl must be a string.");
    await ipcRenderer.invoke(openExternalChannel, { targetUrl });
  },
  platform: process.platform,
  selectRepositoryFolder: async () =>
    selectedRepositoryFolderFrom(await ipcRenderer.invoke(selectRepositoryFolderChannel)),
};

contextBridge.exposeInMainWorld("cycleDesktop", desktopBridge);
