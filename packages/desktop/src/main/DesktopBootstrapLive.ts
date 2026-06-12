import { DatabaseService, type RepositoryMetadata, type RepositoryStatus } from "@cycle/database";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore, type SyncResult } from "@cycle/git-db";
import { Cause, Deferred, Effect, Layer, Queue } from "effect";
import { DesktopRuntime } from "../platform/DesktopRuntime.ts";
import type { RepositoryRecord } from "../shared/AppConfig.ts";
import {
  DesktopBootstrap,
  type BootstrapRepositoryStatus,
  type BootstrapStatus,
} from "../shared/Bootstrap.ts";
import { DesktopLogger } from "./DesktopLoggerLive.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

const DEFAULT_POINTER = "main";
const BACKGROUND_REMOTE_SYNC_CONCURRENCY = 4;
const BACKGROUND_REMOTE_SYNC_POLL_INTERVAL_MS = 15_000;
const LOCAL_PROJECTION_POLL_INTERVAL_MS = 60_000;

type RuntimeRepository = {
  readonly metadata: RepositoryMetadata;
  readonly record: RepositoryRecord;
  readonly store: GitDbStore.StoreServiceShape;
};

type RepositoryOperationTask = {
  readonly effect: Effect.Effect<unknown, unknown>;
  readonly label: string;
  readonly result: Deferred.Deferred<unknown, unknown>;
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
    const preferences = yield* ElectronPreferences;
    const database = yield* DatabaseService;
    const gitRepository = yield* GitRepository;
    const logger = yield* DesktopLogger;
    const runtime = yield* DesktopRuntime;
    const opened = new Map<string, RuntimeRepository>();
    const repositoryQueues = new Map<string, Queue.Queue<RepositoryOperationTask>>();
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

    const completeOpenPhaseIfTerminal = (): void => {
      if (!status.blocking) return;
      if (status.phase !== "loading-repositories" && status.phase !== "opening-repository") return;

      const repositories = [...repositoryStatuses.values()];
      if (repositories.length === 0) return;
      if (
        !repositories.every(
          (repository) => repository.stage === "ready" || repository.stage === "failed",
        )
      ) {
        return;
      }

      setStatus({
        blocking: false,
        completedAt: nowIso(),
        message: "Repository projections are ready",
        phase: "ready-with-background-sync",
      });
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
      completeOpenPhaseIfTerminal();
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

    const runRepositoryQueue = (
      repositoryId: string,
      queue: Queue.Queue<RepositoryOperationTask>,
    ): Effect.Effect<void> =>
      Queue.take(queue).pipe(
        Effect.flatMap((task) =>
          task.effect.pipe(
            Effect.matchCauseEffect({
              onFailure: (cause) =>
                logger
                  .error("bootstrap repository operation failed", {
                    cause: Cause.pretty(cause),
                    operation: task.label,
                    repositoryId,
                  })
                  .pipe(Effect.andThen(Deferred.failCause(task.result, cause))),
              onSuccess: (value) => Deferred.succeed(task.result, value),
            }),
          ),
        ),
        Effect.forever,
      );

    const repositoryQueue = (
      repositoryId: string,
    ): Effect.Effect<Queue.Queue<RepositoryOperationTask>> =>
      Effect.gen(function* () {
        const existing = repositoryQueues.get(repositoryId);
        if (existing !== undefined) return existing;

        const queue = yield* Queue.unbounded<RepositoryOperationTask>();
        repositoryQueues.set(repositoryId, queue);
        runtime.run(
          `bootstrap.repositoryQueue.${repositoryId}`,
          runRepositoryQueue(repositoryId, queue),
        );
        return queue;
      });

    const runRepositoryOperation = <A>(
      repositoryId: string,
      label: string,
      effect: Effect.Effect<A, unknown>,
    ): Effect.Effect<A, unknown> =>
      Effect.gen(function* () {
        const queue = yield* repositoryQueue(repositoryId);
        const result = yield* Deferred.make<unknown, unknown>();

        yield* Queue.offer(queue, {
          effect: effect.pipe(
            Effect.withSpan(`desktop.bootstrap.${label}`, {
              attributes: {
                "desktop.repositoryId": repositoryId,
                "desktop.repositoryOperation": label,
              },
            }),
          ),
          label,
          result,
        });

        return (yield* Deferred.await(result)) as A;
      });

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
        const registered = yield* database.openRepository({
          displayName: repository.displayName,
          gitDir: metadata.gitDir,
          metadata,
          pollIntervalMs: LOCAL_PROJECTION_POLL_INTERVAL_MS,
          repositoryId: repository.id,
          store,
          syncOnOpen: false,
          worktreePath: repository.path,
        });
        setRepositoryStatus(repository, {
          ...repositoryStatusFromProjection(repository, registered),
          stage: "opening",
        });
        yield* logger.info("bootstrap repository registered", {
          activeGeneration: registered.activeGeneration,
          activeSnapshotId: registered.activeSnapshotId,
          repositoryId: repository.id,
          status: registered.status,
          warningCount: registered.warningCount,
        });

        yield* logger.info("bootstrap local materialization started", {
          repositoryId: repository.id,
        });
        const projection = yield* database.syncRepository(repository.id);

        opened.set(repository.id, {
          metadata,
          record: repository,
          store,
        });
        setRepositoryStatus(repository, repositoryStatusFromProjection(repository, projection));
        yield* logger.info("bootstrap local materialization finished", {
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

    const ensureRepositoryOpenedUnsafe = (
      repository: RepositoryRecord,
    ): Effect.Effect<void, unknown> =>
      opened.has(repository.id) ? Effect.void : openRepositoryUnsafe(repository);

    const openRepository = (repository: RepositoryRecord): Effect.Effect<void, unknown> => {
      if (opened.has(repository.id)) return Effect.void;

      return runRepositoryOperation(
        repository.id,
        "openRepository",
        ensureRepositoryOpenedUnsafe(repository),
      ).pipe(Effect.asVoid);
    };

    const repositoryById = (repositoryId: string): Effect.Effect<RepositoryRecord, unknown> =>
      preferences.read().pipe(
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
    ): Effect.Effect<A, unknown> =>
      runRepositoryOperation(repositoryId, "remoteOperation", operation());

    const syncRepositoryFromRemoteUnsafe = (repositoryId: string): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* ensureRepositoryOpenedUnsafe(repository);
        const runtime = opened.get(repositoryId);
        if (runtime === undefined) return;

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

        setRepositoryStatus(runtime.record, {
          error: undefined,
          stage: "syncing",
        });
        yield* logger.info("bootstrap remote GitDB sync started", {
          remote,
          repositoryId,
        });

        if (runtime.metadata.gitDir === undefined) {
          return yield* Effect.fail(
            new Error(`Repository git directory is unavailable: ${repositoryId}`),
          );
        }

        const transportStore = yield* makeTransportStore(
          runtime.record.path,
          runtime.metadata.gitDir,
        );
        const remoteResult = yield* transportStore.sync({
          mode: "full",
          onDiverged: "merge",
          pointers: [DEFAULT_POINTER],
          remote,
        });
        yield* logger.info("bootstrap remote GitDB sync finished", {
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
      runRemoteOperation(repositoryId, () =>
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
        yield* ensureRepositoryOpenedUnsafe(repository);
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

        const transportStore = yield* makeTransportStore(
          runtime.record.path,
          runtime.metadata.gitDir,
        );
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
      runRemoteOperation(repositoryId, () =>
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

    const syncConfiguredRepositoriesFromRemote = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        const repositories = yield* preferences.read().pipe(
          Effect.map((config) => config.localWorkspace.repositories),
          Effect.catch((error) =>
            logger
              .error("bootstrap background sync skipped: unable to read app config", {
                error: errorMessage(error),
              })
              .pipe(Effect.as([] as ReadonlyArray<RepositoryRecord>)),
          ),
        );

        yield* Effect.forEach(
          repositories,
          (repository) =>
            syncRepositoryFromRemote(repository.id).pipe(
              Effect.catch((error) =>
                logger.error("bootstrap background repository sync failed", {
                  error: errorMessage(error),
                  repositoryId: repository.id,
                }),
              ),
            ),
          {
            concurrency: BACKGROUND_REMOTE_SYNC_CONCURRENCY,
            discard: true,
          },
        );
      });

    const runBackgroundSyncLoop = syncConfiguredRepositoriesFromRemote().pipe(
      Effect.andThen(Effect.sleep(BACKGROUND_REMOTE_SYNC_POLL_INTERVAL_MS)),
      Effect.forever,
    );

    const startBackgroundSyncLoop = (): void => {
      runtime.run("bootstrap.backgroundSyncLoop", runBackgroundSyncLoop);
    };

    const runBootstrap = Effect.gen(function* () {
      setStatus({
        blocking: true,
        message: "Loading configured repositories",
        phase: "starting",
        startedAt: nowIso(),
      });
      yield* logger.info("bootstrap started");

      const config = yield* preferences.read().pipe(
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

      startBackgroundSyncLoop();
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
        runtime.run("bootstrap.start", runBootstrap);
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
