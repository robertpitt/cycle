import { startCycleApiServer, type RepositoryOpenRequest } from "@cycle/api";
import { type RepositoryInput, type RepositoryMetadata } from "@cycle/contracts";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore } from "@cycle/git-db";
import { UseCaseRunner } from "@cycle/usecases";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { DesktopRuntime } from "../platform/DesktopRuntime.ts";
import { AppConfig, appConfigError, type RepositoryRecord } from "../shared/AppConfig.ts";
import { LocalWorkspace } from "../shared/LocalWorkspace.ts";
import { cycleCliConfigPathFromHome } from "./CycleDirectory.ts";
import { DesktopLogger } from "./DesktopLoggerLive.ts";

const LOCAL_PROJECTION_POLL_INTERVAL_MS = 60_000;

export const desktopApiRuntimeDiscoveryPath = (): string =>
  process.env.CYCLE_API_RUNTIME_FILE ??
  join(tmpdir(), `cycle-api-${process.getuid?.() ?? "user"}.json`);

const cliConfigPath = (): string =>
  process.env.CYCLE_CONFIG_PATH ?? cycleCliConfigPathFromHome(homedir());

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

const writeCliConfigToken = (token: string): Effect.Effect<void, unknown> =>
  Effect.tryPromise({
    try: async () => {
      const path = cliConfigPath();
      let current: Record<string, unknown> = {};

      try {
        current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      } catch {
        current = {};
      }

      const api = typeof current.api === "object" && current.api !== null ? current.api : {};
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(
        path,
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
    },
    catch: (cause) => cause,
  });

const repositoryById = (
  repositories: ReadonlyArray<RepositoryRecord>,
  repositoryId: string,
): RepositoryRecord | undefined =>
  repositories.find((repository) => repository.id === repositoryId);

export const startDesktopApi = Effect.fnUntraced(function* () {
  const appConfig = yield* AppConfig;
  const gitRepository = yield* GitRepository;
  const localWorkspace = yield* LocalWorkspace;
  const logger = yield* DesktopLogger;
  const runner = yield* UseCaseRunner;
  const runtime = yield* DesktopRuntime;
  const config = yield* appConfig.read();

  if (!config.api.enabled) return;

  yield* writeCliConfigToken(config.api.staticToken).pipe(
    Effect.catch((error) =>
      logger.error("api cli config token write failed", {
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
          pollIntervalMs: LOCAL_PROJECTION_POLL_INTERVAL_MS,
          repositoryId: repository.id,
          store,
          syncOnOpen: request.syncOnOpen ?? false,
          worktreePath: repository.path,
        };
      }),
    );

  const handle = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        startCycleApiServer({
          host: config.api.host,
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
          runner,
          runtimeFile: desktopApiRuntimeDiscoveryPath(),
          staticToken: config.api.staticToken,
        }),
      catch: (cause) => cause,
    }),
    (handle) =>
      Effect.tryPromise({
        try: () => handle.close(),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((error) =>
          logger.error("api server shutdown failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
  );

  yield* logger.info("api server started", {
    baseUrl: handle.baseUrl,
    runtimeFile: desktopApiRuntimeDiscoveryPath(),
    scope: "api",
  });
});
