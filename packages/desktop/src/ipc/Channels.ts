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
export const getSettingsDiagnosticsChannel = "cycle:desktop:settings/diagnostics";

export type ApiConnection = {
  readonly baseUrl: string;
  readonly profile?: {
    readonly displayName: string;
    readonly email: string;
  };
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

export type EndpointStatus = "available" | "unavailable" | "unknown";
export type AuthStatus = "configured" | "missing" | "unknown";
export type RuntimeFileStatus = "present" | "missing" | "unreadable";

export type SettingsDiagnostics = {
  readonly api: {
    readonly auth: AuthStatus;
    readonly baseUrl?: string;
    readonly enabled: boolean;
    readonly status: EndpointStatus;
  };
  readonly app: {
    readonly electronVersion?: string;
    readonly nodeVersion: string;
    readonly schemaVersion: number;
  };
  readonly mcp: {
    readonly enabled: boolean;
    readonly path?: string;
    readonly status: EndpointStatus;
    readonly url?: string;
  };
  readonly paths: {
    readonly agentWorktrees: string;
    readonly appConfig: string;
    readonly cliConfig: string;
    readonly cycleHome: string;
    readonly database: string;
    readonly log: string;
    readonly runtimeDiscovery: string;
  };
  readonly runtimeFile: {
    readonly path: string;
    readonly pid?: number;
    readonly specUrl?: string;
    readonly startedAt?: string;
    readonly status: RuntimeFileStatus;
  };
};

export type CycleDesktopBridge = {
  readonly clearCache: () => Promise<void>;
  readonly getApiConnection: () => Promise<ApiConnection>;
  readonly getBackendLogPath: () => Promise<string>;
  readonly getBootstrapStatus: () => Promise<BootstrapStatus>;
  readonly getSettingsDiagnostics: () => Promise<SettingsDiagnostics>;
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
