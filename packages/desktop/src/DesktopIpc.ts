import { dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import { Config, Effect, FileSystem, Path, Schema } from "effect";
import {
  ApiConnection,
  clearCacheChannel,
  getApiConnectionChannel,
  getBackendLogPathChannel,
  getBootstrapStatusChannel,
  getSettingsDiagnosticsChannel,
  getThemeStateChannel,
  OpenExternalRequest,
  openExternalChannel,
  SelectRepositoryFolderResultSchema,
  selectRepositoryFolderChannel,
  SettingsDiagnostics,
  themeStateChangedChannel,
} from "./ipc/index.ts";
import type { ApiConnection as ApiConnectionValue } from "./ipc/Channels.ts";
import { ElectronRuntime, type ElectronRuntimeService } from "./ElectronRuntime.ts";
import { ElectronError } from "./errors/ElectronError.ts";
import { ElectronShell } from "./ElectronShell.ts";
import {
  ElectronThemeState as ElectronThemeStateSchema,
  type ElectronThemeState,
} from "./ElectronTheme.ts";
import { RepositoryBootstrap as DesktopBootstrap } from "@cycle/backend/bootstrap";
import { DEFAULT_API_PORT, type ApiConfig } from "@cycle/contracts/schemas/app";
import { BootstrapStatus } from "@cycle/contracts/schemas/backend";
import { parseRuntimeBaseUrlFromDiscoveryText } from "@cycle/backend/config";
import { desktopApiRuntimeDiscoveryPath } from "./DesktopApi.ts";
import { currentDesktopWindow } from "./DesktopWindow.ts";
import { DesktopLogger } from "./DesktopLogger.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNodeError = (cause: unknown): cause is NodeJS.ErrnoException =>
  cause instanceof Error && "code" in cause;

const isMissingFileError = (cause: unknown): boolean =>
  (isNodeError(cause) && cause.code === "ENOENT") ||
  (isRecord(cause) &&
    cause._tag === "PlatformError" &&
    isRecord(cause.reason) &&
    cause.reason._tag === "NotFound");

const errorMessage = (error: unknown): string =>
  isRecord(error) && typeof error.message === "string"
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error);

const errorTag = (error: unknown): string | undefined =>
  isRecord(error) && typeof error._tag === "string" ? error._tag : undefined;

const errorCategory = (error: unknown): string | undefined =>
  isRecord(error) && typeof error.category === "string" ? error.category : undefined;

const normalizeIpcError = (channel: string, error: unknown): Error => {
  const normalized = new Error(errorMessage(error));
  normalized.name = "CycleDesktopIpcError";
  Object.assign(normalized, {
    category: errorCategory(error),
    channel,
    sourceTag: errorTag(error),
  });
  return normalized;
};

const validateInvokeSender = (
  event: IpcMainInvokeEvent,
  channel: string,
): Effect.Effect<void, ElectronError> =>
  Effect.sync(() => event.senderFrame).pipe(
    Effect.flatMap((frame) => {
      if (frame === null) {
        return Effect.fail(
          new ElectronError({
            category: "security",
            message: `Rejected ${channel}: sender frame is unavailable.`,
            operation: "ipc.sender",
          }),
        );
      }
      if (frame.isDestroyed()) {
        return Effect.fail(
          new ElectronError({
            category: "security",
            message: `Rejected ${channel}: sender frame was destroyed.`,
            operation: "ipc.sender",
          }),
        );
      }
      if (frame.top !== null && frame.top !== frame) {
        return Effect.fail(
          new ElectronError({
            category: "security",
            message: `Rejected ${channel}: sender frame is not the top frame.`,
            operation: "ipc.sender",
          }),
        );
      }
      return Effect.void;
    }),
  );

const decodeOpenExternalRequest = (
  value: unknown,
): Effect.Effect<OpenExternalRequest, ElectronError> => {
  const decoded = decodeSchema(
    OpenExternalRequest,
    "ipc.openExternal",
    "Expected { targetUrl: string } from renderer.",
  )(value);

  return decoded.pipe(
    Effect.flatMap((request) =>
      Effect.try({
        try: () => {
          const url = new URL(request.targetUrl);
          if (!["https:", "http:", "mailto:"].includes(url.protocol)) {
            throw new Error(`Unsupported protocol ${url.protocol}`);
          }
          return { targetUrl: url.toString() };
        },
        catch: (cause) =>
          new ElectronError({
            category: "security",
            cause,
            message: "Renderer requested an invalid external URL.",
            operation: "ipc.openExternal",
          }),
      }),
    ),
  );
};

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const decodeSchema =
  <S extends Schema.Top>(schema: S, category: string, message: string) =>
  (value: unknown): Effect.Effect<S["Type"], ElectronError> =>
    Effect.try({
      try: () =>
        (
          Schema.decodeUnknownSync(schema as never, StrictDecodeOptions) as (
            input: unknown,
          ) => S["Type"]
        )(value),
      catch: (cause) =>
        new ElectronError({
          category: "security",
          cause,
          message,
          operation: category,
        }),
    });

const decodeIpcOutput = <S extends Schema.Top>(
  schema: S,
  channel: string,
  value: unknown,
): Effect.Effect<S["Type"], ElectronError> =>
  Effect.try({
    try: () =>
      (
        Schema.decodeUnknownSync(schema as never, StrictDecodeOptions) as (
          input: unknown,
        ) => S["Type"]
      )(value),
    catch: (cause) =>
      new ElectronError({
        category: "security",
        cause,
        message: `Main process produced an invalid response for ${channel}.`,
        operation: "ipc.response",
      }),
  });

const decodeEmptyRequest = (value: unknown): Effect.Effect<void, ElectronError> =>
  value === undefined
    ? Effect.void
    : Effect.fail(
        new ElectronError({
          category: "security",
          message: "Expected empty renderer request.",
          operation: "ipc.request",
        }),
      );

const apiBaseUrlFromConfig = (config: ApiConfig): string =>
  `http://${config.host}:${config.port === "auto" ? DEFAULT_API_PORT : config.port}`;

const stringField = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
};

const numberField = (value: unknown, key: string): number | undefined => {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
};

const readRuntimeDiscoveryFile = (
  fs: FileSystem.FileSystem,
  runtimePath: string,
): Effect.Effect<
  | { readonly status: "present"; readonly value: unknown }
  | { readonly status: "missing" | "unreadable" }
> =>
  Effect.gen(function* () {
    const text = yield* fs.readFileString(runtimePath, "utf8");
    const value = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: (cause) =>
        new ElectronError({
          category: "configuration",
          cause,
          message: "Unable to parse API runtime discovery file.",
          operation: "settings.runtimeDiscovery",
        }),
    });
    return { status: "present" as const, value };
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ status: isMissingFileError(error) ? "missing" : "unreadable" } as const),
    ),
  );

const readDesktopApiRuntimeBaseUrl = (
  runtimePath: string,
): Effect.Effect<string | undefined, ElectronError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return parseRuntimeBaseUrlFromDiscoveryText(yield* fs.readFileString(runtimePath, "utf8"));
  }).pipe(Effect.catch(() => Effect.as(Effect.void, undefined)));

const selectRepositoryFolder: Effect.Effect<
  { readonly path: string; readonly status: "selected" } | { readonly status: "cancelled" },
  ElectronError
> = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    try: async () => {
      const window = currentDesktopWindow();
      const options: OpenDialogOptions = {
        buttonLabel: "Add Repository",
        message: "Choose a project folder to add to Cycle.",
        properties: ["openDirectory"],
        title: "Add Repository",
      };

      return window === null
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(window, options);
    },
    catch: (cause) =>
      new ElectronError({
        category: "security",
        cause,
        message: "Unable to open repository folder picker.",
        operation: "dialog.selectRepositoryFolder",
      }),
  });

  const selectedPath = result.filePaths[0];
  if (result.canceled || selectedPath === undefined) {
    return {
      status: "cancelled" as const,
    };
  }

  return {
    path: selectedPath,
    status: "selected" as const,
  };
});

const registerIpcHandler = <A, B>(
  runtime: ElectronRuntimeService,
  channel: string,
  decode: (value: unknown) => Effect.Effect<A, ElectronError>,
  handle: (request: A) => Effect.Effect<B, unknown>,
  outputSchema?: Schema.Top,
) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      ipcMain.handle(channel, async (event, payload: unknown) =>
        runtime
          .runPromise(
            `ipc.${channel}`,
            Effect.gen(function* () {
              yield* validateInvokeSender(event, channel);
              const request = yield* decode(payload);
              const output = yield* handle(request);
              if (outputSchema === undefined) return output;
              return yield* decodeIpcOutput(outputSchema, channel, output);
            }),
          )
          .catch((error: unknown) => {
            throw normalizeIpcError(channel, error);
          }),
      );
    }),
    () => Effect.sync(() => ipcMain.removeHandler(channel)),
  ).pipe(Effect.asVoid);

const broadcastThemeState = (state: ElectronThemeState): Effect.Effect<void> =>
  Effect.sync(() => {
    const window = currentDesktopWindow();
    if (window === null || window.isDestroyed()) return;
    window.webContents.send(themeStateChangedChannel, state);
  });

export const startDesktopThemeLifecycle = Effect.gen(function* () {
  const preferences = yield* ElectronPreferences;

  yield* preferences.startThemeLifecycleSupervision({
    onUpdated: broadcastThemeState,
  });
});

export const registerDesktopIpc = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runtime = yield* ElectronRuntime;
  const shell = yield* ElectronShell;
  const preferences = yield* ElectronPreferences;
  const bootstrap = yield* DesktopBootstrap;
  const logger = yield* DesktopLogger;
  const homeDirectory = yield* Config.string("HOME").pipe(
    Config.withDefault("."),
    Config.map((value) => value.trim() || "."),
  );
  const diagnosticsCycleHome = path.join(homeDirectory, ".cycle");
  const diagnosticsAppConfigPath = path.join(diagnosticsCycleHome, "app-config.json");
  const diagnosticsDatabasePath = path.join(diagnosticsCycleHome, "cycle.db");
  const diagnosticsLogPath = path.join(diagnosticsCycleHome, "logs", "cycle.jsonl");
  const diagnosticsRuntimePath = yield* desktopApiRuntimeDiscoveryPath;

  yield* registerIpcHandler(runtime, openExternalChannel, decodeOpenExternalRequest, (request) =>
    shell.openExternal(request.targetUrl),
  );
  yield* registerIpcHandler(
    runtime,
    getApiConnectionChannel,
    decodeEmptyRequest,
    () =>
      Effect.gen(function* () {
        const config = yield* preferences.read;
        const runtimeBaseUrl = yield* readDesktopApiRuntimeBaseUrl(diagnosticsRuntimePath).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
        );

        if (!config.api.enabled) {
          return yield* new ElectronError({
            category: "security",
            message: "The local Cycle API is disabled.",
            operation: "ipc.apiConnection",
          });
        }

        return {
          baseUrl: runtimeBaseUrl ?? apiBaseUrlFromConfig(config.api),
          profile: config.profile,
          token: config.api.staticToken,
        } satisfies ApiConnectionValue;
      }),
    ApiConnection,
  );
  yield* registerIpcHandler(
    runtime,
    getThemeStateChannel,
    decodeEmptyRequest,
    () => preferences.themeState,
    ElectronThemeStateSchema,
  );
  yield* registerIpcHandler(
    runtime,
    getBackendLogPathChannel,
    decodeEmptyRequest,
    () => logger.path,
    Schema.String,
  );
  yield* registerIpcHandler(
    runtime,
    getSettingsDiagnosticsChannel,
    decodeEmptyRequest,
    () =>
      Effect.gen(function* () {
        const config = yield* preferences.read;
        const runtimeFile = yield* readRuntimeDiscoveryFile(fs, diagnosticsRuntimePath);
        const runtimeValue = runtimeFile.status === "present" ? runtimeFile.value : undefined;
        const runtimeBaseUrl = stringField(runtimeValue, "baseUrl")?.replace(/\/+$/u, "");
        const apiBaseUrl = runtimeBaseUrl ?? apiBaseUrlFromConfig(config.api);
        const mcpPath = stringField(runtimeValue, "mcpPath") ?? "/mcp";
        const mcpUrl = stringField(runtimeValue, "mcpUrl") ?? `${apiBaseUrl}${mcpPath}`;

        return {
          api: {
            auth: config.api.staticToken.length > 0 ? "configured" : "missing",
            baseUrl: apiBaseUrl,
            enabled: config.api.enabled,
            status: !config.api.enabled
              ? "unavailable"
              : runtimeFile.status === "present"
                ? "available"
                : "unknown",
          },
          app: {
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
            schemaVersion: config.schemaVersion,
          },
          mcp: {
            enabled: config.api.enabled && runtimeFile.status === "present" && mcpUrl.length > 0,
            path: mcpPath,
            status:
              config.api.enabled && runtimeFile.status === "present" ? "unknown" : "unavailable",
            url: mcpUrl,
          },
          paths: {
            agentWorktrees: path.join(diagnosticsCycleHome, "agent-task-worktrees"),
            appConfig: diagnosticsAppConfigPath,
            cycleHome: diagnosticsCycleHome,
            database: diagnosticsDatabasePath,
            log: diagnosticsLogPath,
            runtimeDiscovery: diagnosticsRuntimePath,
          },
          runtimeFile: {
            path: diagnosticsRuntimePath,
            pid: numberField(runtimeValue, "pid"),
            specUrl: stringField(runtimeValue, "specUrl"),
            startedAt: stringField(runtimeValue, "startedAt"),
            status: runtimeFile.status,
          },
        };
      }),
    SettingsDiagnostics,
  );
  yield* registerIpcHandler(
    runtime,
    getBootstrapStatusChannel,
    decodeEmptyRequest,
    () => bootstrap.status,
    BootstrapStatus,
  );
  yield* registerIpcHandler(
    runtime,
    clearCacheChannel,
    decodeEmptyRequest,
    () => preferences.clearCache,
  );
  yield* registerIpcHandler(
    runtime,
    selectRepositoryFolderChannel,
    decodeEmptyRequest,
    () => selectRepositoryFolder,
    SelectRepositoryFolderResultSchema,
  );
});
