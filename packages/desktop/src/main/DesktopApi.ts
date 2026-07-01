import { startCycleApiServer, type RepositoryOpenRequest } from "@cycle/api";
import {
  makeHttpAgentWorkRuntimeFromStore,
  makeNodeSqliteAgentWorkStore,
} from "@cycle/usecases/agent-work";
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
import { AppConfig, AppConfigError, type RepositoryRecord } from "../shared/AppConfig.ts";
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
        const agentWorkStore = makeNodeSqliteAgentWorkStore(cycleDatabasePath());
        const agentWork = makeHttpAgentWorkRuntimeFromStore(agentWorkStore, {
          executionPolicy: {
            supportedAuthorityModes: ["ticket-context", "implementation-worktree"],
          },
        });

        try {
          const handle = await startCycleApiServer({
            agentChatStore,
            agentSessionStore,
            agentWork,
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
            useCaseLayer: Layer.succeed(DatabaseService, DatabaseService.of(database)),
            worktreeService,
            worktreeStoragePath: join(cycleHomeDirectory(), "agent-worktrees"),
          });

          return { agentChatStore, agentSessionStore, agentWorkStore, handle };
        } catch (error) {
          await agentWorkStore.close?.();
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
    ({ agentChatStore, agentSessionStore, agentWorkStore, handle }) =>
      Effect.tryPromise({
        try: async () => {
          await handle.close();
          await agentWorkStore.close?.();
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
