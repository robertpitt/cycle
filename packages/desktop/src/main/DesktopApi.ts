import { startCycleApiServer, type RepositoryOpenRequest } from "@cycle/api";
import { mcpBearerTokenEnvVar } from "@cycle/agents/codex";
import { detectAgentProviders } from "@cycle/agents/detection";
import {
  agentProviderDefinitionById,
  agentProviderProfileFromDetection,
  supportedAgentProviders,
} from "@cycle/agents/providers";
import { makeDefaultAgentServiceRegistry } from "@cycle/agents/service";
import type { AgentModelCatalog, AgentProviderId, AgentProviderProfile } from "@cycle/agents/types";
import {
  AgentTaskServiceLive,
  AgentTaskStore,
  makeNodeSqliteAgentTaskStore,
} from "@cycle/agents/task";
import type { RepositoryInput, RepositoryMetadata } from "@cycle/contracts";
import { DatabaseService, cycleDatabasePath, cycleHomeDirectory } from "@cycle/database";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { WorktreeService } from "@cycle/git/worktree";
import { GitDb, Store as GitDbStore } from "@cycle/git-db";
import { logError } from "@cycle/logging";
import { repositoryIdFromInput } from "@cycle/usecases";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { DesktopApiError } from "../errors/index.ts";
import { DesktopRuntime } from "../platform/DesktopRuntime.ts";
import {
  AppConfig,
  AppConfigError,
  defaultAgentProviderPreference,
  type AppConfigState,
  type RepositoryRecord,
} from "../shared/AppConfig.ts";
import { DesktopBootstrap } from "../shared/Bootstrap.ts";
import { LocalWorkspace } from "../shared/LocalWorkspace.ts";
import { cycleCliConfigPathFromHome } from "./CycleDirectory.ts";
import { makeDesktopAgentChatStore } from "./DesktopAgentChatStore.ts";
import { makeDesktopAgentSessionStore } from "./DesktopAgentSessionStore.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

export const desktopApiRuntimeDiscoveryPath = (): string =>
  process.env.CYCLE_API_RUNTIME_FILE ??
  join(tmpdir(), `cycle-api-${process.getuid?.() ?? "user"}.json`);

const cliConfigPath = (): string =>
  process.env.CYCLE_CONFIG_PATH ?? cycleCliConfigPathFromHome(homedir());

const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);
const CycleCliConfigFile = Schema.StructWithRest(
  Schema.Struct({
    api: Schema.optional(
      Schema.StructWithRest(
        Schema.Struct({
          staticToken: Schema.optional(Schema.String),
        }),
        [UnknownRecord],
      ),
    ),
  }),
  [UnknownRecord],
);
type CycleCliConfigFile = typeof CycleCliConfigFile.Type;

const repositoryMetadata = (metadata: GitRepositoryMetadata): RepositoryMetadata => ({
  ...(metadata.currentBranch === undefined ? {} : { currentBranch: metadata.currentBranch }),
  ...(metadata.defaultRemote === undefined ? {} : { defaultRemote: metadata.defaultRemote }),
  ...(metadata.defaultRemoteUrl === undefined
    ? {}
    : { defaultRemoteUrl: metadata.defaultRemoteUrl }),
  gitDir: metadata.gitDir,
  inspectedAt: metadata.inspectedAt,
  remotes: metadata.remotes,
  worktreePath: metadata.path,
});

const makeLocalStore = (
  repositoryPath: string,
  gitDir: string,
): Effect.Effect<GitDbStore.StoreServiceShape, unknown> =>
  GitDbStore.StoreService.pipe(
    Effect.provide(
      GitDb.GitDbFilesystem({
        cwd: repositoryPath,
        database: "cycle",
        gitDir,
      }),
    ),
  );

const writeCliConfigToken = (
  token: string,
): Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const configPath = cliConfigPath();
    const text = yield* fs.readFileString(configPath, "utf8").pipe(Effect.catch(() => Effect.void));
    const current: CycleCliConfigFile =
      text === undefined
        ? {}
        : yield* Effect.try({
            try: () => Schema.decodeUnknownSync(CycleCliConfigFile)(JSON.parse(text) as unknown),
            catch: (cause) =>
              new DesktopApiError({
                cause,
                message: cause instanceof Error ? cause.message : "parse cli config failed",
                operation: "parse cli config",
              }),
          }).pipe(Effect.catch(() => Effect.succeed({} satisfies CycleCliConfigFile)));

    const api = current.api ?? {};
    yield* fs.makeDirectory(path.dirname(configPath), { recursive: true, mode: 0o700 });
    yield* fs.writeFileString(
      configPath,
      `${JSON.stringify(
        {
          ...current,
          api: {
            ...api,
            staticToken: token,
          },
        },
        null,
        2,
      )}\n`,
      {
        mode: 0o600,
      },
    );
  });

const repositoryById = (
  repositories: ReadonlyArray<RepositoryRecord>,
  repositoryId: string,
): RepositoryRecord | undefined =>
  repositories.find((repository) => repository.id === repositoryId);

const profileWithPreference = (
  profile: AgentProviderProfile,
  config: AppConfigState,
  providerId: AgentProviderId,
): AgentProviderProfile => {
  const definition = agentProviderDefinitionById(providerId);
  const preference =
    config.agentProviders.preferences.find((entry) => entry.id === providerId) ??
    defaultAgentProviderPreference(providerId, definition.defaultEnabled ?? false);
  const enabled = preference.enabled;

  return {
    ...profile,
    activeRunCount: profile.activeRunCount ?? 0,
    configuration: {
      ...profile.configuration,
      detectedStatus: profile.status,
      preference: {
        config: preference.config ?? {},
        defaultModel: preference.defaultModel ?? null,
        enabled: preference.enabled,
        executablePath: preference.executablePath ?? null,
        maxConcurrentRuns: preference.maxConcurrentRuns,
      },
    },
    ...(preference.executablePath === null || preference.executablePath === undefined
      ? {}
      : { configuredExecutablePath: preference.executablePath }),
    defaultModel: preference.defaultModel ?? profile.defaultModel ?? null,
    maxConcurrentRuns: preference.maxConcurrentRuns,
    message: enabled ? profile.message : `${profile.displayName} is disabled in Cycle settings.`,
    status: enabled ? profile.status : "disabled",
  };
};

const preferenceForProvider = (config: AppConfigState, providerId: AgentProviderId) => {
  const definition = agentProviderDefinitionById(providerId);
  return (
    config.agentProviders.preferences.find((entry) => entry.id === providerId) ??
    defaultAgentProviderPreference(providerId, definition.defaultEnabled ?? false)
  );
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const modelCatalogStatus = (
  catalog: AgentModelCatalog,
): "available" | "unsupported" | "unavailable" =>
  catalog.source === "unsupported"
    ? "unsupported"
    : catalog.source === "unavailable"
      ? "unavailable"
      : "available";

const profileWithModelCatalog = (
  profile: AgentProviderProfile,
  config: AppConfigState,
  providerId: AgentProviderId,
  catalog: AgentModelCatalog,
): AgentProviderProfile => {
  const preference = preferenceForProvider(config, providerId);
  const models = catalog.models
    .filter((model) => model.status !== "hidden" && model.disabled !== true)
    .map((model) => model.id);
  const preferredModel =
    typeof preference.defaultModel === "string" && preference.defaultModel.trim().length > 0
      ? preference.defaultModel.trim()
      : undefined;

  return {
    ...profile,
    configuration: {
      ...profile.configuration,
      modelCatalog: {
        defaultReasoningEffortId: catalog.defaultReasoningEffortId ?? null,
        fetchedAt: catalog.fetchedAt,
        modelCount: models.length,
        reasoningEffortCount: catalog.reasoningEfforts?.length ?? 0,
        source: catalog.source,
        status: modelCatalogStatus(catalog),
        stale: catalog.stale === true,
      },
    },
    defaultModel:
      preferredModel ?? catalog.defaultModelId ?? models[0] ?? profile.defaultModel ?? null,
    defaultReasoningEffortId:
      catalog.defaultReasoningEffortId ?? profile.defaultReasoningEffortId ?? null,
    models,
    ...(catalog.reasoningEfforts === undefined
      ? {}
      : { reasoningEfforts: catalog.reasoningEfforts }),
  };
};

const profileWithModelCatalogFailure = (
  profile: AgentProviderProfile,
  error: unknown,
): AgentProviderProfile => ({
  ...profile,
  configuration: {
    ...profile.configuration,
    modelCatalog: {
      checkedAt: new Date().toISOString(),
      error: errorMessage(error),
      status: "failed",
    },
  },
});

export const startDesktopApi = Effect.fnUntraced(function* () {
  const appConfig = yield* AppConfig;
  const bootstrap = yield* DesktopBootstrap;
  const database = yield* DatabaseService;
  const preferences = yield* ElectronPreferences;
  const gitRepository = yield* GitRepository;
  const worktreeService = yield* WorktreeService;
  const localWorkspace = yield* LocalWorkspace;
  const runtime = yield* DesktopRuntime;
  const config = yield* appConfig.read();

  if (!config.api.enabled) return;

  yield* writeCliConfigToken(config.api.staticToken).pipe(
    Effect.catch((error) =>
      logError("api", "api cli config token write failed", {
        error: error instanceof Error ? error.message : String(error),
      }),
    ),
  );

  const repositoryOpenInput = (request: RepositoryOpenRequest): Promise<RepositoryInput> =>
    runtime.runPromise(
      "api.repositoryOpenInput",
      Effect.gen(function* () {
        const repository =
          request.path !== undefined
            ? yield* localWorkspace.upsertRepositoryPath({
                displayName: request.displayName,
                path: request.path,
              })
            : repositoryById(yield* localWorkspace.listRepositories(), request.repositoryId ?? "");

        if (repository === undefined) {
          return yield* new AppConfigError({
            message: "Repository path or registered repository id is required.",
            operation: "DesktopApi.repositoryOpenInput",
          });
        }

        const inspected = yield* gitRepository.metadata(repository.path);
        const metadata = repositoryMetadata(inspected);
        const store = yield* makeLocalStore(repository.path, metadata.gitDir ?? inspected.gitDir);

        return {
          displayName: repository.displayName,
          gitDir: metadata.gitDir,
          metadata,
          repositoryId: repository.id,
          store,
          syncOnOpen: request.syncOnOpen ?? false,
          worktreePath: repository.path,
        };
      }),
    );

  yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const agentChatStore = makeDesktopAgentChatStore(cycleDatabasePath());
        const agentSessionStore = makeDesktopAgentSessionStore(cycleDatabasePath());
        const agentTaskStore = makeNodeSqliteAgentTaskStore(cycleDatabasePath());
        const codexPreference = preferenceForProvider(config, "codex");
        const claudeCodePreference = preferenceForProvider(config, "claude-code");
        const agentServices = makeDefaultAgentServiceRegistry({
          env: {
            ...process.env,
            [mcpBearerTokenEnvVar]: config.api.staticToken,
          },
          ...(codexPreference.executablePath === null ||
          codexPreference.executablePath === undefined
            ? {}
            : { executablePath: codexPreference.executablePath }),
          claudeCode: {
            config: claudeCodePreference.config ?? {},
            executablePath: claudeCodePreference.executablePath ?? null,
          },
          sessionStore: agentSessionStore,
        });
        const listAgentProviderProfiles = async (): Promise<readonly AgentProviderProfile[]> => {
          const currentConfig = await runtime.runPromise(
            "api.agentProviderProfiles.config",
            appConfig.read(),
          );
          const detected = await Effect.runPromise(detectAgentProviders(process.env));
          const detectedById = new Map(detected.map((provider) => [provider.id, provider]));

          return Promise.all(
            supportedAgentProviders.map(async (definition) => {
              const detectedProvider = detectedById.get(definition.id);
              const baseProfile =
                detectedProvider === undefined
                  ? {
                      ...agentProviderProfileFromDetection({
                        capabilities:
                          definition.capabilities ??
                          agentProviderDefinitionById(definition.id).capabilities,
                        detectedAt: new Date().toISOString(),
                        executable: definition.executable,
                        id: definition.id,
                        name: definition.name,
                        packageName: definition.packageName,
                        status: "missing",
                      }),
                      message: `${definition.name} provider status has not been checked.`,
                    }
                  : agentProviderProfileFromDetection(detectedProvider);
              const preferredProfile = profileWithPreference(
                baseProfile,
                currentConfig,
                definition.id,
              );
              if (preferredProfile.status !== "available") return preferredProfile;

              try {
                const service = await Effect.runPromise(agentServices.serviceFor(definition.id));
                const catalog = await service.listModels();
                return profileWithModelCatalog(
                  preferredProfile,
                  currentConfig,
                  definition.id,
                  catalog,
                );
              } catch (error) {
                logError("api", "agent provider model listing failed", {
                  error: errorMessage(error),
                  providerId: definition.id,
                });
                return profileWithModelCatalogFailure(preferredProfile, error);
              }
            }),
          );
        };
        const agentTaskLayer = AgentTaskServiceLive().pipe(
          Layer.provide(Layer.succeed(AgentTaskStore, AgentTaskStore.of(agentTaskStore))),
        );

        try {
          const handle = await startCycleApiServer({
            agentChatStore,
            agentProviderProfiles: listAgentProviderProfiles,
            agentServices,
            agentSessionStore,
            host: config.api.host,
            localSettings: {
              completeOnboarding: (input) =>
                runtime.runPromise(
                  "api.localSettings.completeOnboarding",
                  preferences.completeOnboarding({
                    displayName: input.displayName,
                    email: input.email,
                    enabledAgentProviderIds: input.enabledAgentProviderIds,
                    themePreference: input.themePreference,
                  }),
                ),
              read: () => runtime.runPromise("api.localSettings.read", preferences.read()),
              removeRepository: (repositoryId) =>
                runtime.runPromise(
                  "api.localSettings.removeRepository",
                  preferences.removeRepository(repositoryId),
                ),
              setInterfaceDensity: (density) =>
                runtime.runPromise(
                  "api.localSettings.setInterfaceDensity",
                  preferences.setInterfaceDensity(density),
                ),
              setThemePreference: (preference) =>
                runtime.runPromise(
                  "api.localSettings.setThemePreference",
                  preferences.setThemePreference(preference),
                ),
              updateProfile: (input) =>
                runtime.runPromise(
                  "api.localSettings.updateProfile",
                  preferences.updateProfile(input),
                ),
              updateRepositoryPreferences: (input) =>
                runtime.runPromise(
                  "api.localSettings.updateRepositoryPreferences",
                  preferences.updateRepositoryPreferences({
                    id: input.id,
                    preferences: input.preferences,
                  }),
                ),
              updateAgentProviderPreference: (input) =>
                runtime.runPromise(
                  "api.localSettings.updateAgentProviderPreference",
                  preferences.updateAgentProviderPreference({
                    preference: input.preference,
                    providerId: input.providerId,
                  }),
                ),
            },
            logging: { console: false },
            mcp: {
              apiToken: config.api.staticToken,
              auth: { token: config.api.staticToken },
              enabled: true,
              env: {
                ...process.env,
                CYCLE_API_RUNTIME_FILE: desktopApiRuntimeDiscoveryPath(),
              },
              path: "/mcp",
            },
            port: config.api.port === "auto" ? undefined : config.api.port,
            repositoryOpenInput,
            onUseCaseSuccess: (event) => {
              const repositoryId = repositoryIdFromInput(event.input);
              if (event.sideEffect !== "write" || repositoryId === undefined) return;

              return runtime.runPromise(
                "api.repositoryChanged",
                bootstrap.notifyRepositoryChanged(repositoryId),
              ) as Promise<void>;
            },
            runtimeFile: desktopApiRuntimeDiscoveryPath(),
            staticToken: config.api.staticToken,
            useCaseLayer: Layer.mergeAll(
              Layer.succeed(DatabaseService, DatabaseService.of(database)),
              agentTaskLayer,
            ),
            worktreeService,
            worktreeStoragePath: join(cycleHomeDirectory(), "agent-task-worktrees"),
          });

          return { agentChatStore, agentSessionStore, agentTaskStore, handle };
        } catch (error) {
          await Effect.runPromise(agentTaskStore.close());
          await agentChatStore.close?.();
          await agentSessionStore.close?.();
          throw error;
        }
      },
      catch: (cause) =>
        new DesktopApiError({
          cause,
          message: cause instanceof Error ? cause.message : "start api server failed",
          operation: "start api server",
        }),
    }),
    ({ agentChatStore, agentSessionStore, agentTaskStore, handle }) =>
      Effect.tryPromise({
        try: async () => {
          await handle.close();
          await Effect.runPromise(agentTaskStore.close());
          await agentChatStore.close?.();
          await agentSessionStore.close?.();
        },
        catch: (cause) =>
          new DesktopApiError({
            cause,
            message: cause instanceof Error ? cause.message : "stop api server failed",
            operation: "stop api server",
          }),
      }).pipe(
        Effect.catch((error) =>
          logError("api", "api server shutdown failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
  );
});
