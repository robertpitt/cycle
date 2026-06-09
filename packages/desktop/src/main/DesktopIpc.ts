import { dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import { Effect } from "effect";
import {
  completeOnboardingChannel,
  detectAgentProvidersChannel,
  getAppConfigChannel,
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
  updateRepositoryPreferencesChannel,
  updateProfileChannel,
  upsertRepositoryPathChannel,
  type OpenExternalRequest,
} from "../ipc/index.ts";
import { electronSecurityError, type ElectronError } from "../platform/ElectronError.ts";
import { ElectronShell } from "../platform/ElectronShell.ts";
import { AppConfigError } from "../shared/AppConfig.ts";
import { AgentProviderDetector } from "../shared/AgentProviders.ts";
import { AppConfig, type ThemePreference } from "../shared/AppConfig.ts";
import {
  LocalWorkspace,
  type InitializeRepositoryPathInput,
  type LocalWorkspaceService,
  type SelectRepositoryFolderResult,
  type UpdateRepositoryPreferencesInput,
  type UpsertRepositoryPathInput,
} from "../shared/LocalWorkspace.ts";
import {
  Profile,
  type CompleteOnboardingInput,
  type ProfileUpdateInput,
} from "../shared/Profile.ts";
import { currentDesktopWindow } from "./DesktopWindowLive.ts";

type SetThemePreferenceRequest = {
  readonly preference: ThemePreference;
};

type RemoveRepositoryRequest = {
  readonly id: string;
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
  channel: string,
  decode: (value: unknown) => Effect.Effect<A, ElectronError>,
  handle: (request: A) => Effect.Effect<B, unknown>,
) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      ipcMain.handle(channel, async (event, payload: unknown) =>
        Effect.runPromise(
          Effect.gen(function* () {
            yield* validateInvokeSender(event, channel);
            const request = yield* decode(payload);
            return yield* handle(request);
          }),
        ),
      );
    }),
    () => Effect.sync(() => ipcMain.removeHandler(channel)),
  ).pipe(Effect.asVoid);

export const registerDesktopIpc = Effect.fnUntraced(function* () {
  const shell = yield* ElectronShell;
  const appConfig = yield* AppConfig;
  const profile = yield* Profile;
  const localWorkspace = yield* LocalWorkspace;
  const agentProviderDetector = yield* AgentProviderDetector;

  yield* registerIpcHandler(openExternalChannel, decodeOpenExternalRequest, (request) =>
    shell.openExternal(request.targetUrl),
  );
  yield* registerIpcHandler(getAppConfigChannel, decodeEmptyRequest, () => appConfig.read());
  yield* registerIpcHandler(updateProfileChannel, decodeProfileUpdateInput, (request) =>
    profile.updateProfile(request),
  );
  yield* registerIpcHandler(completeOnboardingChannel, decodeCompleteOnboardingInput, (request) =>
    profile.completeOnboarding(request),
  );
  yield* registerIpcHandler(setThemePreferenceChannel, decodeSetThemePreferenceRequest, (request) =>
    appConfig.setThemePreference(request.preference),
  );
  yield* registerIpcHandler(listRepositoriesChannel, decodeEmptyRequest, () =>
    localWorkspace.listRepositories(),
  );
  yield* registerIpcHandler(selectRepositoryFolderChannel, decodeEmptyRequest, () =>
    selectRepositoryFolder(localWorkspace),
  );
  yield* registerIpcHandler(
    upsertRepositoryPathChannel,
    decodeUpsertRepositoryPathInput,
    (request) => localWorkspace.upsertRepositoryPath(request),
  );
  yield* registerIpcHandler(
    initializeRepositoryPathChannel,
    decodeInitializeRepositoryPathInput,
    (request) => localWorkspace.initializeRepositoryPath(request),
  );
  yield* registerIpcHandler(removeRepositoryChannel, decodeRemoveRepositoryRequest, (request) =>
    localWorkspace.removeRepository(request.id),
  );
  yield* registerIpcHandler(
    updateRepositoryPreferencesChannel,
    decodeUpdateRepositoryPreferencesInput,
    (request) => localWorkspace.updateRepositoryPreferences(request),
  );
  yield* registerIpcHandler(detectAgentProvidersChannel, decodeEmptyRequest, () =>
    agentProviderDetector.detect(),
  );
});
