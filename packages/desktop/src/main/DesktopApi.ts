import { startCycleApiServer, type RepositoryOpenRequest } from "@cycle/api";
import {
  contractFor,
  type CycleUseCase,
  type RepositoryInput,
  type RepositoryMetadata,
} from "@cycle/contracts";
import { cycleDatabasePath } from "@cycle/database";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore } from "@cycle/git-db";
import { logError } from "@cycle/logging";
import { UseCaseRunner, type UseCaseRunnerShape } from "@cycle/usecases";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, FileSystem, Path, Schema } from "effect";
import { DesktopRuntime } from "../platform/DesktopRuntime.ts";
import { AppConfig, appConfigError, type RepositoryRecord } from "../shared/AppConfig.ts";
import { DesktopBootstrap, type DesktopBootstrapService } from "../shared/Bootstrap.ts";
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
  Effect.gen(function* () {
    return yield* GitDbStore.StoreService;
  }).pipe(
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
    const text = yield* fs
      .readFileString(configPath, "utf8")
      .pipe(Effect.catch(() => Effect.succeed(undefined)));
    let current: CycleCliConfigFile = {};

    if (text !== undefined) {
      try {
        current = Schema.decodeUnknownSync(CycleCliConfigFile)(JSON.parse(text) as unknown);
      } catch {
        current = {};
      }
    }

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

const repositoryIdFromUseCase = (useCase: CycleUseCase): string | undefined => {
  const input = useCase.input as unknown;
  if (typeof input !== "object" || input === null || !("repository" in input)) return undefined;

  const repository = (input as { readonly repository?: unknown }).repository;
  if (typeof repository !== "object" || repository === null || !("id" in repository)) {
    return undefined;
  }

  const id = (repository as { readonly id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
};

const runnerWithBackgroundPublish = (
  runner: UseCaseRunnerShape,
  bootstrap: DesktopBootstrapService,
): UseCaseRunnerShape => ({
  run: (useCase) => {
    const effect = runner.run(useCase);
    const contract = contractFor(useCase.name);
    const repositoryId = repositoryIdFromUseCase(useCase as CycleUseCase);

    if (contract.sideEffect !== "write" || repositoryId === undefined) return effect;

    return effect.pipe(Effect.tap(() => bootstrap.notifyRepositoryChanged(repositoryId)));
  },
});

export const startDesktopApi = Effect.fnUntraced(function* () {
  const appConfig = yield* AppConfig;
  const bootstrap = yield* DesktopBootstrap;
  const preferences = yield* ElectronPreferences;
  const gitRepository = yield* GitRepository;
  const localWorkspace = yield* LocalWorkspace;
  const runner = yield* UseCaseRunner;
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
          return yield* Effect.fail(
            appConfigError(
              "DesktopApi.repositoryOpenInput",
              "Repository path or registered repository id is required.",
            ),
          );
        }

        const inspected = yield* gitRepository.metadata(repository.path);
        const metadata = repositoryMetadata(inspected);
        const store = yield* makeLocalStore(repository.path, metadata.gitDir ?? inspected.gitDir);

        return {
          displayName: repository.displayName,
          gitDir: metadata.gitDir,
          metadata,
          pollIntervalMs: false,
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

        try {
          const handle = await startCycleApiServer({
            agentChatStore,
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
            runner: runnerWithBackgroundPublish(runner, bootstrap),
            runtimeFile: desktopApiRuntimeDiscoveryPath(),
            staticToken: config.api.staticToken,
          });

          return { agentChatStore, agentSessionStore, handle };
        } catch (error) {
          await agentChatStore.close?.();
          await agentSessionStore.close?.();
          throw error;
        }
      },
      catch: (cause) => cause,
    }),
    ({ agentChatStore, agentSessionStore, handle }) =>
      Effect.tryPromise({
        try: async () => {
          await handle.close();
          await agentChatStore.close?.();
          await agentSessionStore.close?.();
        },
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((error) =>
          logError("api", "api server shutdown failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
  );
});
