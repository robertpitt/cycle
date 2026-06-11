import { DatabaseService, type RepositoryMetadata, type RepositoryStatus } from "@cycle/database";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore, type SyncResult } from "@cycle/git-db";
import { Effect, Layer } from "effect";
import { AppConfig, type RepositoryRecord } from "../shared/AppConfig.ts";
import {
  DesktopBootstrap,
  type BootstrapRepositoryStatus,
  type BootstrapStatus,
} from "../shared/Bootstrap.ts";
import { DesktopLogger } from "./DesktopLoggerLive.ts";

const DEFAULT_POINTER = "main";
const LOCAL_PROJECTION_POLL_INTERVAL_MS = 60_000;

type RuntimeRepository = {
  readonly metadata: RepositoryMetadata;
  readonly record: RepositoryRecord;
  readonly store: GitDbStore.StoreServiceShape;
};

const nowIso = (): string => new Date().toISOString();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

const repositoryStatusFromProjection = (
  record: RepositoryRecord,
  projection: RepositoryStatus,
): BootstrapRepositoryStatus => ({
  activeSnapshotId: projection.activeSnapshotId,
  currentBranch: projection.metadata?.currentBranch,
  defaultRemote: projection.metadata?.defaultRemote,
  defaultRemoteUrl: projection.metadata?.defaultRemoteUrl,
  displayName: record.displayName,
  path: record.path,
  repositoryId: record.id,
  stage: projection.status === "syncing" ? "syncing" : "ready",
  updatedAt: nowIso(),
  warningCount: projection.warningCount,
});

export const DesktopBootstrapLive = Layer.effect(
  DesktopBootstrap,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const database = yield* DatabaseService;
    const gitRepository = yield* GitRepository;
    const logger = yield* DesktopLogger;
    const opened = new Map<string, RuntimeRepository>();
    const opening = new Map<string, Promise<void>>();
    const remoteOperations = new Map<string, Promise<unknown>>();
    const repositoryStatuses = new Map<string, BootstrapRepositoryStatus>();
    let status: Omit<BootstrapStatus, "repositories"> = {
      blocking: true,
      message: "Waiting to start",
      phase: "idle",
    };
    let started = false;

    const snapshot = (): BootstrapStatus => ({
      ...status,
      repositories: [...repositoryStatuses.values()],
    });

    const setStatus = (next: Partial<Omit<BootstrapStatus, "repositories">>): void => {
      status = {
        ...status,
        ...next,
      };
    };

    const setRepositoryStatus = (
      repository: RepositoryRecord,
      next: Partial<BootstrapRepositoryStatus>,
    ): void => {
      const current = repositoryStatuses.get(repository.id);

      repositoryStatuses.set(repository.id, {
        displayName: repository.displayName,
        path: repository.path,
        repositoryId: repository.id,
        stage: "pending",
        updatedAt: nowIso(),
        ...current,
        ...next,
      });
    };

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

    const makeTransportStore = (
      repositoryPath: string,
      gitDir: string,
    ): Effect.Effect<GitDbStore.StoreServiceShape, unknown> =>
      Effect.gen(function* () {
        return yield* GitDbStore.StoreService;
      }).pipe(
        Effect.provide(
          GitDb.GitDbLive({
            cwd: repositoryPath,
            database: "cycle",
            gitDir,
          }),
        ),
      );

    const openRepositoryUnsafe = (repository: RepositoryRecord): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        setStatus({
          blocking: true,
          message: `Loading ${repository.displayName}`,
          phase: "opening-repository",
        });
        setRepositoryStatus(repository, {
          error: undefined,
          stage: "opening",
        });
        yield* logger.info("bootstrap opening repository", {
          displayName: repository.displayName,
          path: repository.path,
          repositoryId: repository.id,
        });

        const inspected = yield* gitRepository.metadata(repository.path);
        const metadata = repositoryMetadata(inspected);
        yield* logger.info("bootstrap repository metadata inspected", {
          currentBranch: metadata.currentBranch,
          defaultRemote: metadata.defaultRemote,
          defaultRemoteUrl: metadata.defaultRemoteUrl,
          gitDir: metadata.gitDir,
          remotes: metadata.remotes.map((remote) => remote.name),
          repositoryId: repository.id,
        });
        const store = yield* makeLocalStore(repository.path, metadata.gitDir ?? inspected.gitDir);
        const projection = yield* database.openRepository({
          displayName: repository.displayName,
          gitDir: metadata.gitDir,
          metadata,
          pollIntervalMs: LOCAL_PROJECTION_POLL_INTERVAL_MS,
          repositoryId: repository.id,
          store,
          syncOnOpen: false,
          worktreePath: repository.path,
        });

        opened.set(repository.id, {
          metadata,
          record: repository,
          store,
        });
        setRepositoryStatus(repository, repositoryStatusFromProjection(repository, projection));
        yield* logger.info("bootstrap repository registered", {
          activeGeneration: projection.activeGeneration,
          activeSnapshotId: projection.activeSnapshotId,
          repositoryId: repository.id,
          status: projection.status,
          warningCount: projection.warningCount,
        });
      }).pipe(
        Effect.catch((error) =>
          logger
            .error("bootstrap repository open failed", {
              error: errorMessage(error),
              repositoryId: repository.id,
            })
            .pipe(
              Effect.andThen(
                Effect.sync(() => {
                  setRepositoryStatus(repository, {
                    error: errorMessage(error),
                    stage: "failed",
                  });
                }),
              ),
              Effect.andThen(Effect.fail(error)),
            ),
        ),
      );

    const openRepository = (repository: RepositoryRecord): Effect.Effect<void, unknown> => {
      if (opened.has(repository.id)) return Effect.void;

      const existing = opening.get(repository.id);
      if (existing !== undefined) {
        return Effect.tryPromise({
          catch: (cause) => cause,
          try: () => existing,
        });
      }

      const promise = Effect.runPromise(openRepositoryUnsafe(repository)).finally(() => {
        opening.delete(repository.id);
      });

      opening.set(repository.id, promise);

      return Effect.tryPromise({
        catch: (cause) => cause,
        try: () => promise,
      });
    };

    const repositoryById = (repositoryId: string): Effect.Effect<RepositoryRecord, unknown> =>
      appConfig.read().pipe(
        Effect.flatMap((config) => {
          const repository = config.localWorkspace.repositories.find(
            (candidate) => candidate.id === repositoryId,
          );

          return repository === undefined
            ? Effect.fail(new Error(`Repository is not configured: ${repositoryId}`))
            : Effect.succeed(repository);
        }),
      );

    const runRemoteOperation = <A>(
      repositoryId: string,
      operation: () => Effect.Effect<A, unknown>,
    ): Effect.Effect<A, unknown> => {
      const existing = remoteOperations.get(repositoryId);
      if (existing !== undefined) {
        return Effect.tryPromise({
          catch: (cause) => cause,
          try: async () => {
            await existing.catch(() => undefined);
          },
        }).pipe(Effect.flatMap(() => runRemoteOperation(repositoryId, operation)));
      }

      const promise = Effect.runPromise(operation()).finally(() => {
        remoteOperations.delete(repositoryId);
      });

      remoteOperations.set(repositoryId, promise);

      return Effect.tryPromise({
        catch: (cause) => cause,
        try: () => promise,
      });
    };

    const syncRepositoryFromRemoteUnsafe = (repositoryId: string): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* openRepository(repository);
        const runtime = opened.get(repositoryId);
        if (runtime === undefined) return;

        setRepositoryStatus(runtime.record, {
          error: undefined,
          stage: "syncing",
        });
        yield* logger.info("bootstrap local materialization started", {
          repositoryId,
        });

        const localProjection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtime.record,
          repositoryStatusFromProjection(runtime.record, localProjection),
        );
        yield* logger.info("bootstrap local materialization finished", {
          activeGeneration: localProjection.activeGeneration,
          activeSnapshotId: localProjection.activeSnapshotId,
          repositoryId,
          status: localProjection.status,
          warningCount: localProjection.warningCount,
        });

        const remote = runtime.metadata.defaultRemote;
        if (remote === undefined) {
          yield* logger.info("bootstrap remote sync skipped: no default remote", {
            repositoryId,
          });
          return;
        }

        setRepositoryStatus(runtime.record, {
          error: undefined,
          stage: "syncing",
        });
        yield* logger.info("bootstrap remote GitDB pull started", {
          remote,
          repositoryId,
        });

        if (runtime.metadata.gitDir === undefined) {
          return yield* Effect.fail(
            new Error(`Repository git directory is unavailable: ${repositoryId}`),
          );
        }

        const transportStore = yield* makeTransportStore(runtime.record.path, runtime.metadata.gitDir);
        const remoteResult = yield* transportStore.sync({
          mode: "pull",
          onDiverged: "error",
          pointers: [DEFAULT_POINTER],
          remote,
        });
        yield* logger.info("bootstrap remote GitDB pull finished", {
          pointers: remoteResult.pointers,
          remote: remoteResult.remote,
          repositoryId,
        });

        const projection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtime.record,
          repositoryStatusFromProjection(runtime.record, projection),
        );
        yield* logger.info("bootstrap post-remote materialization finished", {
          activeGeneration: projection.activeGeneration,
          activeSnapshotId: projection.activeSnapshotId,
          repositoryId,
          status: projection.status,
          warningCount: projection.warningCount,
        });
      });

    const syncRepositoryFromRemote = (repositoryId: string): Effect.Effect<void, unknown> =>
      runRemoteOperation(
        repositoryId,
        () =>
          syncRepositoryFromRemoteUnsafe(repositoryId).pipe(
            Effect.catch((error) =>
              logger
                .error("bootstrap repository sync failed", {
                  error: errorMessage(error),
                  repositoryId,
                })
                .pipe(
                  Effect.andThen(
                    Effect.sync(() => {
                      const runtime = opened.get(repositoryId);
                      if (runtime !== undefined) {
                        setRepositoryStatus(runtime.record, {
                          error: errorMessage(error),
                          stage: "ready",
                        });
                      }
                    }),
                  ),
                  Effect.andThen(Effect.fail(error)),
                ),
            ),
          ),
      );

    const pushRepositoryToRemoteUnsafe = (
      repositoryId: string,
    ): Effect.Effect<SyncResult, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* openRepository(repository);
        const runtime = opened.get(repositoryId);
        if (runtime === undefined) {
          return yield* Effect.fail(new Error(`Repository is not open: ${repositoryId}`));
        }

        const remote = runtime.metadata.defaultRemote;
        if (remote === undefined) {
          return yield* Effect.fail(new Error(`Repository has no default remote: ${repositoryId}`));
        }

        if (runtime.metadata.gitDir === undefined) {
          return yield* Effect.fail(
            new Error(`Repository git directory is unavailable: ${repositoryId}`),
          );
        }

        setRepositoryStatus(runtime.record, {
          error: undefined,
          stage: "syncing",
        });
        yield* logger.info("bootstrap GitDB push started", {
          remote,
          repositoryId,
        });

        const localProjection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtime.record,
          repositoryStatusFromProjection(runtime.record, localProjection),
        );
        yield* logger.info("bootstrap pre-push materialization finished", {
          activeGeneration: localProjection.activeGeneration,
          activeSnapshotId: localProjection.activeSnapshotId,
          repositoryId,
          status: localProjection.status,
          warningCount: localProjection.warningCount,
        });

        const transportStore = yield* makeTransportStore(runtime.record.path, runtime.metadata.gitDir);
        const pushResult = yield* transportStore.sync({
          mode: "full",
          onDiverged: "error",
          pointers: [DEFAULT_POINTER],
          remote,
        });
        yield* logger.info("bootstrap GitDB push finished", {
          pointers: pushResult.pointers,
          remote: pushResult.remote,
          repositoryId,
        });

        const projection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtime.record,
          repositoryStatusFromProjection(runtime.record, projection),
        );
        yield* logger.info("bootstrap post-push materialization finished", {
          activeGeneration: projection.activeGeneration,
          activeSnapshotId: projection.activeSnapshotId,
          repositoryId,
          status: projection.status,
          warningCount: projection.warningCount,
        });

        return pushResult;
      });

    const pushRepositoryToRemote = (repositoryId: string): Effect.Effect<SyncResult, unknown> =>
      runRemoteOperation(
        repositoryId,
        () =>
          pushRepositoryToRemoteUnsafe(repositoryId).pipe(
            Effect.catch((error) =>
              logger
                .error("bootstrap repository push failed", {
                  error: errorMessage(error),
                  repositoryId,
                })
                .pipe(
                  Effect.andThen(
                    Effect.sync(() => {
                      const runtime = opened.get(repositoryId);
                      if (runtime !== undefined) {
                        setRepositoryStatus(runtime.record, {
                          error: errorMessage(error),
                          stage: "ready",
                        });
                      }
                    }),
                  ),
                  Effect.andThen(Effect.fail(error)),
                ),
            ),
          ),
      );

    const startBackgroundSync = (repositoryId: string): void => {
      void Effect.runPromise(syncRepositoryFromRemote(repositoryId)).catch(() => {
        // Repository-level bootstrap status carries the failure.
      });
    };

    const runBootstrap = Effect.gen(function* () {
      setStatus({
        blocking: true,
        message: "Loading configured repositories",
        phase: "starting",
        startedAt: nowIso(),
      });
      yield* logger.info("bootstrap started");

      const config = yield* appConfig.read().pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            setStatus({
              blocking: false,
              completedAt: nowIso(),
              error: errorMessage(error),
              message: "Unable to load app configuration",
              phase: "failed",
            });
          }).pipe(Effect.andThen(Effect.fail(error))),
        ),
      );

      setStatus({
        blocking: true,
        message: "Opening repository projections",
        phase: "loading-repositories",
      });
      yield* logger.info("bootstrap loaded configured repositories", {
        repositories: config.localWorkspace.repositories.map((repository) => ({
          displayName: repository.displayName,
          path: repository.path,
          repositoryId: repository.id,
        })),
      });

      for (const repository of config.localWorkspace.repositories) {
        setRepositoryStatus(repository, {
          stage: "pending",
        });
      }

      for (const repository of config.localWorkspace.repositories) {
        yield* openRepository(repository).pipe(Effect.catch(() => Effect.void));
      }

      setStatus({
        blocking: false,
        completedAt: nowIso(),
        message:
          config.localWorkspace.repositories.length === 0
            ? "No repositories configured"
            : "Repository projections are ready",
        phase: "ready-with-background-sync",
      });
      yield* logger.info("bootstrap local open phase completed", {
        openedRepositories: [...opened.keys()],
      });

      for (const repositoryId of opened.keys()) {
        startBackgroundSync(repositoryId);
      }
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          setStatus({
            blocking: false,
            completedAt: nowIso(),
            error: errorMessage(error),
            message: "Bootstrap failed",
            phase: "failed",
          });
        }),
      ),
    );

    const start = (): Effect.Effect<void> => {
      if (started) return Effect.void;
      started = true;

      return Effect.sync(() => {
        void Effect.runPromise(runBootstrap);
      });
    };

    return DesktopBootstrap.of({
      ensureRepositoryOpened: (repositoryId) =>
        Effect.gen(function* () {
          const repository = yield* repositoryById(repositoryId);
          yield* openRepository(repository);
        }),
      pushRepositoryToRemote,
      start,
      status: () => Effect.sync(snapshot),
      syncRepositoryFromRemote,
    });
  }),
);
