export {
  clearCacheChannel,
  getApiConnectionChannel,
  getBackendLogPathChannel,
  getBootstrapStatusChannel,
  getThemeStateChannel,
  openExternalChannel,
  selectRepositoryFolderChannel,
  themeStateChangedChannel,
} from "./Channels.ts";
export type {
  ApiConnection as ApiConnectionBridgeValue,
  CycleDesktopBridge,
  SelectRepositoryFolderResult as SelectRepositoryFolderBridgeResult,
} from "./Channels.ts";

import { Schema } from "effect";
import { RepositoryCommitStyle, ThemePreference } from "../shared/AppConfig.ts";
import { BootstrapStatus } from "../shared/Bootstrap.ts";
import { ElectronThemeSource, ElectronThemeState } from "../platform/ElectronTheme.ts";
import type {
  ApiConnection as ApiConnectionValue,
  SelectRepositoryFolderResult as SelectRepositoryFolderResultValue,
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
