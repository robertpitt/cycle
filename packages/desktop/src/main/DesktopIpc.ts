import { dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import { Effect } from "effect";
import { readFile } from "node:fs/promises";
import {
  completeOnboardingChannel,
  clearCacheChannel,
  detectAgentProvidersChannel,
  getApiConnectionChannel,
  getAppConfigChannel,
  getBackendLogPathChannel,
  getBootstrapStatusChannel,
  getThemeStateChannel,
  isCompleteOnboardingInput,
  isInitializeRepositoryPathInput,
  isOpenExternalRequest,
  isProfileUpdateInput,
  isRemoveRepositoryRequest,
  isSetThemePreferenceRequest,
  isUpdateRepositoryPreferencesInput,
  isUpsertRepositoryPathInput,
  initializeRepositoryPathChannel,
  listRepositoriesChannel,
  openExternalChannel,
  removeRepositoryChannel,
  selectRepositoryFolderChannel,
  setThemePreferenceChannel,
  themeStateChangedChannel,
  updateRepositoryPreferencesChannel,
  updateProfileChannel,
  upsertRepositoryPathChannel,
  type ApiConnection,
  type OpenExternalRequest,
  type ElectronThemeState,
} from "../ipc/index.ts";
import { DesktopRuntime, type DesktopRuntimeService } from "../platform/DesktopRuntime.ts";
import { electronSecurityError, type ElectronError } from "../platform/ElectronError.ts";
import { ElectronShell } from "../platform/ElectronShell.ts";
import { AppConfigError, DEFAULT_API_PORT, type ApiConfig } from "../shared/AppConfig.ts";
import { AgentProviderDetector } from "@cycle/agents/detection";
import type { ThemePreference } from "../shared/AppConfig.ts";
import { DesktopBootstrap } from "../shared/Bootstrap.ts";
import {
  LocalWorkspace,
  type InitializeRepositoryPathInput,
  type LocalWorkspaceService,
  type SelectRepositoryFolderResult,
  type UpdateRepositoryPreferencesInput,
  type UpsertRepositoryPathInput,
} from "../shared/LocalWorkspace.ts";
import type { CompleteOnboardingInput, ProfileUpdateInput } from "../shared/Profile.ts";
import { desktopApiRuntimeDiscoveryPath } from "./DesktopApi.ts";
import { currentDesktopWindow } from "./DesktopWindowLive.ts";
import { DesktopLogger } from "./DesktopLoggerLive.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

type SetThemePreferenceRequest = {
  readonly preference: ThemePreference;
};

type RemoveRepositoryRequest = {
  readonly id: string;
};

type DesktopApiRuntimeFile = {
  readonly baseUrl?: unknown;
};

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
  if (!isOpenExternalRequest(value)) {
    return Effect.fail(
      electronSecurityError("ipc.openExternal", "Expected { targetUrl: string } from renderer."),
    );
  }

  return Effect.try({
    try: () => {
      const url = new URL(value.targetUrl);
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
  });
};

const decodeProfileUpdateInput = (
  value: unknown,
): Effect.Effect<ProfileUpdateInput, ElectronError> =>
  isProfileUpdateInput(value)
    ? Effect.succeed(value)
    : Effect.fail(
        electronSecurityError("ipc.profile", "Expected profile update input from renderer."),
      );

const decodeCompleteOnboardingInput = (
  value: unknown,
): Effect.Effect<CompleteOnboardingInput, ElectronError> =>
  isCompleteOnboardingInput(value)
    ? Effect.succeed(value)
    : Effect.fail(
        electronSecurityError("ipc.profile", "Expected onboarding completion input from renderer."),
      );

const decodeSetThemePreferenceRequest = (
  value: unknown,
): Effect.Effect<SetThemePreferenceRequest, ElectronError> =>
  isSetThemePreferenceRequest(value)
    ? Effect.succeed(value)
    : Effect.fail(
        electronSecurityError("ipc.theme", "Expected theme preference input from renderer."),
      );

const decodeUpsertRepositoryPathInput = (
  value: unknown,
): Effect.Effect<UpsertRepositoryPathInput, ElectronError> =>
  isUpsertRepositoryPathInput(value)
    ? Effect.succeed(value)
    : Effect.fail(
        electronSecurityError(
          "ipc.localWorkspace",
          "Expected repository path input from renderer.",
        ),
      );

const decodeInitializeRepositoryPathInput = (
  value: unknown,
): Effect.Effect<InitializeRepositoryPathInput, ElectronError> =>
  isInitializeRepositoryPathInput(value)
    ? Effect.succeed(value)
    : Effect.fail(
        electronSecurityError(
          "ipc.localWorkspace",
          "Expected repository path input from renderer.",
        ),
      );

const decodeRemoveRepositoryRequest = (
  value: unknown,
): Effect.Effect<RemoveRepositoryRequest, ElectronError> =>
  isRemoveRepositoryRequest(value)
    ? Effect.succeed(value)
    : Effect.fail(
        electronSecurityError(
          "ipc.localWorkspace",
          "Expected repository removal input from renderer.",
        ),
      );

const decodeUpdateRepositoryPreferencesInput = (
  value: unknown,
): Effect.Effect<UpdateRepositoryPreferencesInput, ElectronError> =>
  isUpdateRepositoryPreferencesInput(value)
    ? Effect.succeed(value)
    : Effect.fail(
        electronSecurityError(
          "ipc.localWorkspace",
          "Expected repository preferences input from renderer.",
        ),
      );

const decodeEmptyRequest = (value: unknown): Effect.Effect<void, ElectronError> =>
  value === undefined
    ? Effect.void
    : Effect.fail(electronSecurityError("ipc.request", "Expected empty renderer request."));

const apiBaseUrlFromConfig = (config: ApiConfig): string =>
  `http://${config.host}:${config.port === "auto" ? DEFAULT_API_PORT : config.port}`;

const readDesktopApiRuntimeBaseUrl = (): Effect.Effect<string | undefined> =>
  Effect.tryPromise({
    try: async () => {
      const parsed = JSON.parse(
        await readFile(desktopApiRuntimeDiscoveryPath(), "utf8"),
      ) as DesktopApiRuntimeFile;

      return typeof parsed.baseUrl === "string" && parsed.baseUrl.length > 0
        ? parsed.baseUrl.replace(/\/+$/u, "")
        : undefined;
    },
    catch: (cause) => cause,
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
              return yield* handle(request);
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
  yield* registerIpcHandler(runtime, getAppConfigChannel, decodeEmptyRequest, () =>
    preferences.read(),
  );
  yield* registerIpcHandler(runtime, getApiConnectionChannel, decodeEmptyRequest, () =>
    Effect.gen(function* () {
      const config = yield* preferences.read();
      const runtimeBaseUrl = yield* readDesktopApiRuntimeBaseUrl();

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
  );
  yield* registerIpcHandler(
    runtime,
    getThemeStateChannel,
    decodeEmptyRequest,
    () => preferences.themeState,
  );
  yield* registerIpcHandler(
    runtime,
    getBackendLogPathChannel,
    decodeEmptyRequest,
    () => logger.path,
  );
  yield* registerIpcHandler(runtime, getBootstrapStatusChannel, decodeEmptyRequest, () =>
    bootstrap.status(),
  );
  yield* registerIpcHandler(runtime, updateProfileChannel, decodeProfileUpdateInput, (request) =>
    preferences.updateProfile(request),
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
  );
  yield* registerIpcHandler(runtime, clearCacheChannel, decodeEmptyRequest, () =>
    preferences.clearCache(),
  );
  yield* registerIpcHandler(runtime, listRepositoriesChannel, decodeEmptyRequest, () =>
    localWorkspace.listRepositories(),
  );
  yield* registerIpcHandler(runtime, selectRepositoryFolderChannel, decodeEmptyRequest, () =>
    selectRepositoryFolder(localWorkspace),
  );
  yield* registerIpcHandler(
    runtime,
    upsertRepositoryPathChannel,
    decodeUpsertRepositoryPathInput,
    (request) => localWorkspace.upsertRepositoryPath(request),
  );
  yield* registerIpcHandler(
    runtime,
    initializeRepositoryPathChannel,
    decodeInitializeRepositoryPathInput,
    (request) => localWorkspace.initializeRepositoryPath(request),
  );
  yield* registerIpcHandler(
    runtime,
    removeRepositoryChannel,
    decodeRemoveRepositoryRequest,
    (request) => localWorkspace.removeRepository(request.id),
  );
  yield* registerIpcHandler(
    runtime,
    updateRepositoryPreferencesChannel,
    decodeUpdateRepositoryPreferencesInput,
    (request) => preferences.updateRepositoryPreferences(request),
  );
  yield* registerIpcHandler(runtime, detectAgentProvidersChannel, decodeEmptyRequest, () =>
    agentProviderDetector.detect(),
  );
});
