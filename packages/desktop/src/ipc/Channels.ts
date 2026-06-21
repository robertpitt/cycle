import type { ElectronThemeState } from "../platform/ElectronTheme.ts";
import type { BootstrapStatus } from "../shared/Bootstrap.ts";

export const getThemeStateChannel = "cycle:desktop:theme/get-state";
export const themeStateChangedChannel = "cycle:desktop:theme/state-changed";
export const clearCacheChannel = "cycle:desktop:preferences/clear-cache";
export const selectRepositoryFolderChannel =
  "cycle:desktop:local-workspace/select-repository-folder";
export const openExternalChannel = "cycle:desktop:shell/open-external";
export const getBootstrapStatusChannel = "cycle:desktop:bootstrap/status";
export const getBackendLogPathChannel = "cycle:desktop:logs/path";
export const getApiConnectionChannel = "cycle:desktop:api/connection";

export type ApiConnection = {
  readonly baseUrl: string;
  readonly token: string;
};

export type SelectRepositoryFolderResult =
  | {
      readonly path: string;
      readonly status: "selected";
    }
  | {
      readonly status: "cancelled";
    };

export type CycleDesktopBridge = {
  readonly clearCache: () => Promise<void>;
  readonly getApiConnection: () => Promise<ApiConnection>;
  readonly getBackendLogPath: () => Promise<string>;
  readonly getBootstrapStatus: () => Promise<BootstrapStatus>;
  readonly getThemeState: () => Promise<ElectronThemeState>;
  readonly onThemeStateChanged: (listener: (state: ElectronThemeState) => void) => () => void;
  readonly openExternal: (targetUrl: string) => Promise<void>;
  readonly platform: NodeJS.Platform;
  readonly selectRepositoryFolder: () => Promise<SelectRepositoryFolderResult>;
};

declare global {
  interface Window {
    readonly cycleDesktop?: CycleDesktopBridge;
  }
}
