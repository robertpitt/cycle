import { startCycleApiServer, type RepositoryOpenRequest } from "@cycle/api";
import {
  contractFor,
  type CycleUseCase,
  type RepositoryInput,
  type RepositoryMetadata,
} from "@cycle/contracts";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore } from "@cycle/git-db";
import { logError } from "@cycle/logging";
import { UseCaseRunner, type UseCaseRunnerShape } from "@cycle/usecases";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { DesktopRuntime } from "../platform/DesktopRuntime.ts";
import { AppConfig, appConfigError, type RepositoryRecord } from "../shared/AppConfig.ts";
import { DesktopBootstrap, type DesktopBootstrapService } from "../shared/Bootstrap.ts";
import { LocalWorkspace } from "../shared/LocalWorkspace.ts";
import { cycleCliConfigPathFromHome } from "./CycleDirectory.ts";

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
          pollIntervalMs: LOCAL_PROJECTION_POLL_INTERVAL_MS,
          repositoryId: repository.id,
          store,
          syncOnOpen: request.syncOnOpen ?? false,
          worktreePath: repository.path,
        };
      }),
    );

  yield* Effect.acquireRelease(
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
          runner: runnerWithBackgroundPublish(runner, bootstrap),
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
          logError("api", "api server shutdown failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
  );
});
