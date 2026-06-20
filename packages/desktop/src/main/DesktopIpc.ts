import { dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import { Effect, FileSystem, Schema } from "effect";
import {
  ApiConnection,
  completeOnboardingChannel,
  clearCacheChannel,
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
  type ElectronThemeState,
} from "../ipc/index.ts";
import { DesktopRuntime, type DesktopRuntimeService } from "../platform/DesktopRuntime.ts";
import { electronSecurityError, type ElectronError } from "../platform/ElectronError.ts";
import { ElectronShell } from "../platform/ElectronShell.ts";
import { ElectronThemeState as ElectronThemeStateSchema } from "../platform/ElectronTheme.ts";
import {
  AppConfigError,
  AppConfigState,
  DEFAULT_API_PORT,
  ProfileConfig,
  RepositoryRecord,
  type ApiConfig,
} from "../shared/AppConfig.ts";
import { AgentProviderDetector } from "@cycle/agents/detection";
import { DetectedAgentProvider } from "../shared/AgentProviders.ts";
import { BootstrapStatus, DesktopBootstrap } from "../shared/Bootstrap.ts";
import {
  InitializeRepositoryPathInput,
  LocalWorkspace,
  SelectRepositoryFolderResult,
  type LocalWorkspaceService,
  UpdateRepositoryPreferencesInput,
  UpsertRepositoryPathInput,
} from "../shared/LocalWorkspace.ts";
import { CompleteOnboardingInput, ProfileUpdateInput } from "../shared/Profile.ts";
import { desktopApiRuntimeDiscoveryPath } from "./DesktopApi.ts";
import { parseRuntimeBaseUrlFromDiscoveryText } from "./DesktopApiRuntimeDiscovery.ts";
import { currentDesktopWindow } from "./DesktopWindowLive.ts";
import { DesktopLogger } from "./DesktopLoggerLive.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
          electronSecurityError("ipc.sender", `Rejected ${channel}: sender frame is unavailable.`),
        );
      }
      if (frame.isDestroyed()) {
        return Effect.fail(
          electronSecurityError("ipc.sender", `Rejected ${channel}: sender frame was destroyed.`),
        );
      }
      if (frame.top !== null && frame.top !== frame) {
        return Effect.fail(
          electronSecurityError(
            "ipc.sender",
            `Rejected ${channel}: sender frame is not the top frame.`,
          ),
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
          electronSecurityError(
            "ipc.openExternal",
            "Renderer requested an invalid external URL.",
            cause,
          ),
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
      catch: (cause) => electronSecurityError(category, message, cause),
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
      electronSecurityError(
        "ipc.response",
        `Main process produced an invalid response for ${channel}.`,
        cause,
      ),
  });

const decodeProfileUpdateInput = (
  value: unknown,
): Effect.Effect<ProfileUpdateInput, ElectronError> =>
  decodeSchema(
    ProfileUpdateInput,
    "ipc.profile",
    "Expected profile update input from renderer.",
  )(value);

const decodeCompleteOnboardingInput = (
  value: unknown,
): Effect.Effect<CompleteOnboardingInput, ElectronError> =>
  decodeSchema(
    CompleteOnboardingInput,
    "ipc.profile",
    "Expected onboarding completion input from renderer.",
  )(value);

const decodeSetThemePreferenceRequest = (
  value: unknown,
): Effect.Effect<SetThemePreferenceRequest, ElectronError> =>
  decodeSchema(
    SetThemePreferenceRequest,
    "ipc.theme",
    "Expected theme preference input from renderer.",
  )(value);

const decodeUpsertRepositoryPathInput = (
  value: unknown,
): Effect.Effect<UpsertRepositoryPathInput, ElectronError> =>
  decodeSchema(
    UpsertRepositoryPathInput,
    "ipc.localWorkspace",
    "Expected repository path input from renderer.",
  )(value);

const decodeInitializeRepositoryPathInput = (
  value: unknown,
): Effect.Effect<InitializeRepositoryPathInput, ElectronError> =>
  decodeSchema(
    InitializeRepositoryPathInput,
    "ipc.localWorkspace",
    "Expected repository path input from renderer.",
  )(value);

const decodeRemoveRepositoryRequest = (
  value: unknown,
): Effect.Effect<RemoveRepositoryRequest, ElectronError> =>
  decodeSchema(
    RemoveRepositoryRequest,
    "ipc.localWorkspace",
    "Expected repository removal input from renderer.",
  )(value);

const decodeUpdateRepositoryPreferencesInput = (
  value: unknown,
): Effect.Effect<UpdateRepositoryPreferencesInput, ElectronError> =>
  decodeSchema(
    UpdateRepositoryPreferencesInput,
    "ipc.localWorkspace",
    "Expected repository preferences input from renderer.",
  )(value);

const decodeEmptyRequest = (value: unknown): Effect.Effect<void, ElectronError> =>
  value === undefined
    ? Effect.void
    : Effect.fail(electronSecurityError("ipc.request", "Expected empty renderer request."));

const apiBaseUrlFromConfig = (config: ApiConfig): string =>
  `http://${config.host}:${config.port === "auto" ? DEFAULT_API_PORT : config.port}`;

const readDesktopApiRuntimeBaseUrl = (): Effect.Effect<
  string | undefined,
  never,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return parseRuntimeBaseUrlFromDiscoveryText(
      yield* fs.readFileString(desktopApiRuntimeDiscoveryPath(), "utf8"),
    );
  }).pipe(Effect.catch(() => Effect.succeed(undefined)));

const selectRepositoryFolder = (
  localWorkspace: LocalWorkspaceService,
): Effect.Effect<SelectRepositoryFolderResult, ElectronError | AppConfigError> =>
  Effect.gen(function* () {
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
        electronSecurityError(
          "dialog.selectRepositoryFolder",
          "Unable to open repository folder picker.",
          cause,
        ),
    });

    const selectedPath = result.filePaths[0];
    if (result.canceled || selectedPath === undefined) {
      return {
        status: "cancelled" as const,
      };
    }

    return yield* localWorkspace.upsertRepositoryPath({ path: selectedPath }).pipe(
      Effect.map((repository) => ({
        repository,
        status: "added" as const,
      })),
      Effect.catch((error: AppConfigError) => {
        if (error.operation === "LocalWorkspace.git") {
          return Effect.succeed({
            message: error.message,
            path: selectedPath,
            status: "not-git" as const,
          });
        }

        return Effect.fail(error);
      }),
    );
  });

const registerIpcHandler = <A, B>(
  runtime: DesktopRuntimeService,
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

export const startDesktopThemeLifecycle = Effect.fnUntraced(function* () {
  const preferences = yield* ElectronPreferences;

  yield* preferences.startThemeLifecycleSupervision({
    onUpdated: broadcastThemeState,
  });
});

export const registerDesktopIpc = Effect.fnUntraced(function* () {
  const fs = yield* FileSystem.FileSystem;
  const runtime = yield* DesktopRuntime;
  const shell = yield* ElectronShell;
  const preferences = yield* ElectronPreferences;
  const bootstrap = yield* DesktopBootstrap;
  const logger = yield* DesktopLogger;
  const localWorkspace = yield* LocalWorkspace;
  const agentProviderDetector = yield* AgentProviderDetector;

  yield* registerIpcHandler(runtime, openExternalChannel, decodeOpenExternalRequest, (request) =>
    shell.openExternal(request.targetUrl),
  );
  yield* registerIpcHandler(
    runtime,
    getAppConfigChannel,
    decodeEmptyRequest,
    () => preferences.read(),
    AppConfigState,
  );
  yield* registerIpcHandler(
    runtime,
    getApiConnectionChannel,
    decodeEmptyRequest,
    () =>
      Effect.gen(function* () {
        const config = yield* preferences.read();
        const runtimeBaseUrl = yield* readDesktopApiRuntimeBaseUrl().pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
        );

        if (!config.api.enabled) {
          return yield* Effect.fail(
            electronSecurityError("ipc.apiConnection", "The local Cycle API is disabled."),
          );
        }

        return {
          baseUrl: runtimeBaseUrl ?? apiBaseUrlFromConfig(config.api),
          token: config.api.staticToken,
        } satisfies ApiConnection;
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
    getBootstrapStatusChannel,
    decodeEmptyRequest,
    () => bootstrap.status(),
    BootstrapStatus,
  );
  yield* registerIpcHandler(
    runtime,
    updateProfileChannel,
    decodeProfileUpdateInput,
    (request) => preferences.updateProfile(request),
    ProfileConfig,
  );
  yield* registerIpcHandler(
    runtime,
    completeOnboardingChannel,
    decodeCompleteOnboardingInput,
    (request) =>
      Effect.gen(function* () {
        const next = yield* preferences.completeOnboarding(request);
        const state = yield* preferences.themeState;
        yield* broadcastThemeState(state);
        return next;
      }),
    AppConfigState,
  );
  yield* registerIpcHandler(
    runtime,
    setThemePreferenceChannel,
    decodeSetThemePreferenceRequest,
    (request) =>
      Effect.gen(function* () {
        const next = yield* preferences.setThemePreference(request.preference);
        const state = yield* preferences.themeState;
        yield* broadcastThemeState(state);
        return next;
      }),
    AppConfigState,
  );
  yield* registerIpcHandler(runtime, clearCacheChannel, decodeEmptyRequest, () =>
    preferences.clearCache(),
  );
  yield* registerIpcHandler(
    runtime,
    listRepositoriesChannel,
    decodeEmptyRequest,
    () => localWorkspace.listRepositories(),
    Schema.Array(RepositoryRecord),
  );
  yield* registerIpcHandler(
    runtime,
    selectRepositoryFolderChannel,
    decodeEmptyRequest,
    () => selectRepositoryFolder(localWorkspace),
    SelectRepositoryFolderResult,
  );
  yield* registerIpcHandler(
    runtime,
    upsertRepositoryPathChannel,
    decodeUpsertRepositoryPathInput,
    (request) => localWorkspace.upsertRepositoryPath(request),
    RepositoryRecord,
  );
  yield* registerIpcHandler(
    runtime,
    initializeRepositoryPathChannel,
    decodeInitializeRepositoryPathInput,
    (request) => localWorkspace.initializeRepositoryPath(request),
    RepositoryRecord,
  );
  yield* registerIpcHandler(
    runtime,
    removeRepositoryChannel,
    decodeRemoveRepositoryRequest,
    (request) => localWorkspace.removeRepository(request.id),
    Schema.Array(RepositoryRecord),
  );
  yield* registerIpcHandler(
    runtime,
    updateRepositoryPreferencesChannel,
    decodeUpdateRepositoryPreferencesInput,
    (request) => preferences.updateRepositoryPreferences(request),
    Schema.NullOr(RepositoryRecord),
  );
  yield* registerIpcHandler(
    runtime,
    detectAgentProvidersChannel,
    decodeEmptyRequest,
    () => agentProviderDetector.detect(),
    Schema.Array(DetectedAgentProvider),
  );
});
