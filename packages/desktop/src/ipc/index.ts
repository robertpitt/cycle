export {
  clearCacheChannel,
  getApiConnectionChannel,
  getBackendLogPathChannel,
  getBootstrapStatusChannel,
  getSettingsDiagnosticsChannel,
  getThemeStateChannel,
  openExternalChannel,
  selectRepositoryFolderChannel,
  themeStateChangedChannel,
} from "./Channels.ts";
export type {
  ApiConnection as ApiConnectionBridgeValue,
  CycleDesktopBridge,
  SelectRepositoryFolderResult as SelectRepositoryFolderBridgeResult,
  SettingsDiagnostics as SettingsDiagnosticsBridgeValue,
} from "./Channels.ts";

import { Schema } from "effect";
import { RepositoryCommitStyle, ThemePreference } from "../shared/AppConfig.ts";
import { BootstrapStatus } from "../shared/Bootstrap.ts";
import { ElectronThemeSource, ElectronThemeState } from "../platform/ElectronTheme.ts";
import type {
  ApiConnection as ApiConnectionValue,
  SelectRepositoryFolderResult as SelectRepositoryFolderResultValue,
  SettingsDiagnostics as SettingsDiagnosticsValue,
} from "./Channels.ts";

export const ApiConnection: Schema.Schema<ApiConnectionValue> = Schema.Struct({
  baseUrl: Schema.String,
  token: Schema.String,
});

export const OpenExternalRequest = Schema.Struct({
  targetUrl: Schema.String,
});
export type OpenExternalRequest = typeof OpenExternalRequest.Type;

export const SelectRepositoryFolderResultSchema: Schema.Schema<SelectRepositoryFolderResultValue> =
  Schema.Union([
    Schema.Struct({
      path: Schema.String,
      status: Schema.Literal("selected"),
    }),
    Schema.Struct({
      status: Schema.Literal("cancelled"),
    }),
  ]);

export const SettingsDiagnostics: Schema.Schema<SettingsDiagnosticsValue> = Schema.Struct({
  api: Schema.Struct({
    auth: Schema.Literals(["configured", "missing", "unknown"]),
    baseUrl: Schema.optional(Schema.String),
    enabled: Schema.Boolean,
    status: Schema.Literals(["available", "unavailable", "unknown"]),
  }),
  app: Schema.Struct({
    electronVersion: Schema.optional(Schema.String),
    nodeVersion: Schema.String,
    schemaVersion: Schema.Number,
  }),
  mcp: Schema.Struct({
    enabled: Schema.Boolean,
    path: Schema.optional(Schema.String),
    status: Schema.Literals(["available", "unavailable", "unknown"]),
    url: Schema.optional(Schema.String),
  }),
  paths: Schema.Struct({
    agentWorktrees: Schema.String,
    appConfig: Schema.String,
    cliConfig: Schema.String,
    cycleHome: Schema.String,
    database: Schema.String,
    log: Schema.String,
    runtimeDiscovery: Schema.String,
  }),
  runtimeFile: Schema.Struct({
    path: Schema.String,
    pid: Schema.optional(Schema.Number),
    specUrl: Schema.optional(Schema.String),
    startedAt: Schema.optional(Schema.String),
    status: Schema.Literals(["present", "missing", "unreadable"]),
  }),
});

const isSchema =
  <S extends Schema.Top>(schema: S) =>
  (value: unknown): value is S["Type"] =>
    Schema.is(schema)(value);

export const isOpenExternalRequest = isSchema(OpenExternalRequest);

export const isThemePreferenceValue = isSchema(ThemePreference);

export const isElectronThemeSourceValue = isSchema(ElectronThemeSource);

export const isRepositoryCommitStyleValue = isSchema(RepositoryCommitStyle);

export const isElectronThemeState = isSchema(ElectronThemeState);

export const isApiConnection = isSchema(ApiConnection);
export const isBootstrapStatus = isSchema(BootstrapStatus);
export const isSelectRepositoryFolderResult = isSchema(SelectRepositoryFolderResultSchema);
