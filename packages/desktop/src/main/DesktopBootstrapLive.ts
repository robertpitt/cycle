import { DatabaseService, type RepositoryMetadata, type RepositoryStatus } from "@cycle/database";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore, type SyncResult } from "@cycle/git-db";
import { Cause, Deferred, Effect, Layer, Option, Queue } from "effect";
import { BootstrapRepositoryError } from "../errors/index.ts";
import { DesktopRuntime } from "../platform/DesktopRuntime.ts";
import type { RepositoryRecord } from "../shared/AppConfig.ts";
import {
  DesktopBootstrap,
  type BootstrapRepositoryStatus,
  type BootstrapStatus,
} from "../shared/Bootstrap.ts";
import { LocalWorkspace } from "../shared/LocalWorkspace.ts";
import { DesktopLogger } from "./DesktopLoggerLive.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

const DEFAULT_POINTER = "main";
const REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY = 10;
const BACKGROUND_REMOTE_SYNC_POLL_INTERVAL_MS = 15_000;
const BACKGROUND_REMOTE_SYNC_RETRY_BASE_MS = 5_000;
const BACKGROUND_REMOTE_SYNC_RETRY_MAX_MS = 5 * 60_000;

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

type RemoteRetryState = {
  readonly attempts: number;
  readonly nextRetryAt: number;
};

type RemoteSyncOutcome =
  | {
      readonly repositoryId: string;
      readonly status: "failed";
      readonly error: string;
    }
  | {
      readonly repositoryId: string;
      readonly status: "missing-remote-gitdb-ref" | "synced";
      readonly remote: string;
      readonly result: SyncResult;
    }
  | {
      readonly repositoryId: string;
      readonly status: "skipped-no-default-remote";
    }
  | {
      readonly repositoryId: string;
      readonly status: "deferred-retry";
    };

const nowIso = (): string => new Date().toISOString();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isRemotePushRejection = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const record = error as {
    readonly _tag?: unknown;
    readonly message?: unknown;
    readonly stderr?: unknown;
  };

  if (record._tag !== "RemotePushError") return false;

  const text = `${String(record.message ?? "")}\n${String(record.stderr ?? "")}`;

  return /fetch first|non-fast-forward|remote contains work|stale info|updates were rejected/iu.test(
    text,
  );
};

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

const projectionLogFields = (projection: RepositoryStatus): Record<string, unknown> => ({
  activeGeneration: projection.activeGeneration,
  activeSnapshotId: projection.activeSnapshotId,
  repositoryState: projection.activeSnapshotId === null ? "no_snapshot" : projection.status,
  warningCount: projection.warningCount,
});

const retryDelayMs = (attempts: number): number =>
  Math.min(
    BACKGROUND_REMOTE_SYNC_RETRY_MAX_MS,
    BACKGROUND_REMOTE_SYNC_RETRY_BASE_MS * 2 ** Math.min(attempts, 6),
  );

export const DesktopBootstrapLive = Layer.effect(
  DesktopBootstrap,
  Effect.gen(function* () {
    const preferences = yield* ElectronPreferences;
    const database = yield* DatabaseService;
    const gitRepository = yield* GitRepository;
    const localWorkspace = yield* LocalWorkspace;
    const logger = yield* DesktopLogger;
    const runtime = yield* DesktopRuntime;
    const changeSignals = yield* Queue.unbounded<string>();
    const opened = new Map<string, RuntimeRepository>();
    const pendingRemoteSync = new Set<string>();
    const repositoryQueues = new Map<string, Queue.Queue<RepositoryOperationTask>>();
    const repositoryStatuses = new Map<string, BootstrapRepositoryStatus>();
    const remoteRetry = new Map<string, RemoteRetryState>();
    const remoteSyncedSnapshots = new Map<string, string | null>();
    let remoteSyncCycle = 0;
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

    const bootstrapSummary = (): Record<string, number> => {
      const repositories = [...repositoryStatuses.values()];

      return {
        failed: repositories.filter((repository) => repository.stage === "failed").length,
        noSnapshot: repositories.filter(
          (repository) => repository.stage === "ready" && repository.activeSnapshotId === null,
        ).length,
        ready: repositories.filter(
          (repository) =>
            repository.stage === "ready" &&
            repository.activeSnapshotId !== undefined &&
            repository.activeSnapshotId !== null,
        ).length,
        repositories: repositories.length,
        warnings: repositories.reduce(
          (total, repository) => total + (repository.warningCount ?? 0),
          0,
        ),
      };
    };

    const remoteSyncSummary = (
      outcomes: ReadonlyArray<RemoteSyncOutcome>,
    ): Record<string, number> => {
      const local = bootstrapSummary();

      return {
        ...local,
        remoteDeferred: outcomes.filter((outcome) => outcome.status === "deferred-retry").length,
        remoteFailed: outcomes.filter((outcome) => outcome.status === "failed").length,
        remoteMissingGitDbRefs: outcomes.filter(
          (outcome) => outcome.status === "missing-remote-gitdb-ref",
        ).length,
        remoteSkipped: outcomes.filter((outcome) => outcome.status === "skipped-no-default-remote")
          .length,
        remoteSynced: outcomes.filter((outcome) => outcome.status === "synced").length,
        repositories: outcomes.length,
      };
    };

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
      GitDbStore.StoreService.pipe(
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
      GitDbStore.StoreService.pipe(
        Effect.provide(
          GitDb.GitDbLive({
            cwd: repositoryPath,
            database: "cycle",
            gitDir,
          }),
        ),
      );

    const snapshotIdForStore = (
      store: GitDbStore.StoreServiceShape,
    ): Effect.Effect<string | null, unknown> =>
      store
        .currentSnapshotForPointer(DEFAULT_POINTER)
        .pipe(Effect.map((snapshot) => snapshot?.id ?? null));

    const publishTransportStore = (
      transportStore: GitDbStore.StoreServiceShape,
      remote: string,
      repositoryId: string,
    ): Effect.Effect<SyncResult, unknown> =>
      transportStore
        .sync({
          mode: "push",
          onDiverged: "error",
          pointers: [DEFAULT_POINTER],
          remote,
        })
        .pipe(
          Effect.catch((error) =>
            isRemotePushRejection(error)
              ? logger
                  .info("bootstrap GitDB push rejected: rebasing before retry", {
                    error: errorMessage(error),
                    remote,
                    repositoryId,
                  })
                  .pipe(
                    Effect.andThen(
                      transportStore.sync({
                        mode: "full",
                        onDiverged: "rebase",
                        pointers: [DEFAULT_POINTER],
                        remote,
                      }),
                    ),
                  )
              : Effect.fail(error),
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
        const parentSpan = yield* Effect.currentSpan.pipe(Effect.option);

        yield* Queue.offer(queue, {
          effect: Option.isSome(parentSpan)
            ? effect.pipe(Effect.withParentSpan(parentSpan.value))
            : effect,
          label,
          result,
        });

        return (yield* Deferred.await(result)) as A;
      }).pipe(
        Effect.withSpan(`desktop.bootstrap.${label}`, {
          attributes: {
            "desktop.repositoryId": repositoryId,
            "desktop.repositoryOperation": label,
            service: "@cycle/desktop",
          },
        }),
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
        const registered = yield* database.openRepository({
          displayName: repository.displayName,
          gitDir: metadata.gitDir,
          metadata,
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
          ...projectionLogFields(registered),
          repositoryId: repository.id,
        });

        yield* logger.info("bootstrap local materialization started", {
          repositoryId: repository.id,
        });
        const projection = yield* database.syncRepository(repository.id);

        const runtimeRepository = {
          metadata,
          record: repository,
          store,
        };
        opened.set(repository.id, runtimeRepository);
        remoteSyncedSnapshots.set(repository.id, yield* snapshotIdForStore(store));
        setRepositoryStatus(repository, repositoryStatusFromProjection(repository, projection));
        yield* logger.info("bootstrap local materialization finished", {
          ...projectionLogFields(projection),
          repositoryId: repository.id,
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

    const openConfiguredRepositories = (
      repositories: ReadonlyArray<RepositoryRecord>,
    ): Effect.Effect<void> =>
      Effect.forEach(
        repositories,
        (repository) => openRepository(repository).pipe(Effect.catch(() => Effect.void)),
        {
          concurrency: REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY,
        },
      ).pipe(
        Effect.asVoid,
        Effect.withSpan("desktop.bootstrap.openConfiguredRepositories", {
          attributes: {
            "desktop.bootstrap.concurrency": REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY,
            "desktop.bootstrap.repositories": repositories.length,
            service: "@cycle/desktop",
          },
        }),
      );

    const resolveConfiguredRepositories = (
      repositories: ReadonlyArray<RepositoryRecord>,
    ): Effect.Effect<ReadonlyArray<RepositoryRecord>, unknown> =>
      Effect.forEach(
        repositories,
        (repository) =>
          localWorkspace.upsertRepositoryPath({
            displayName: repository.displayName,
            path: repository.path,
          }),
        {
          concurrency: 1,
        },
      );

    const repositoryById = (repositoryId: string): Effect.Effect<RepositoryRecord, unknown> =>
      preferences.read().pipe(
        Effect.flatMap((config) => {
          const repository = config.localWorkspace.repositories.find(
            (candidate) => candidate.id === repositoryId,
          );

          return repository === undefined
            ? Effect.fail(
                new BootstrapRepositoryError({
                  message: `Repository is not configured: ${repositoryId}`,
                  repositoryId,
                }),
              )
            : Effect.succeed(repository);
        }),
      );

    const runRemoteOperation = <A>(
      repositoryId: string,
      label: string,
      operation: () => Effect.Effect<A, unknown>,
    ): Effect.Effect<A, unknown> => runRepositoryOperation(repositoryId, label, operation());

    const syncRepositoryFromRemoteUnsafe = (
      repositoryId: string,
      options: { readonly pushFirst?: boolean } = {},
    ): Effect.Effect<RemoteSyncOutcome, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* ensureRepositoryOpenedUnsafe(repository);
        const runtime = opened.get(repositoryId);
        if (runtime === undefined) {
          return yield* new BootstrapRepositoryError({
            message: `Repository is not open: ${repositoryId}`,
            repositoryId,
          });
        }

        const remote = runtime.metadata.defaultRemote;
        if (remote === undefined) {
          yield* logger.info("bootstrap remote sync skipped: no default remote", {
            repositoryId,
          });
          return {
            repositoryId,
            status: "skipped-no-default-remote",
          };
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
          ...projectionLogFields(localProjection),
          repositoryId,
        });

        setRepositoryStatus(runtime.record, {
          error: undefined,
          stage: "syncing",
        });
        const operation = options.pushFirst === true ? "publish" : "sync";
        const strategy = options.pushFirst === true ? "push-first" : "fetch-first";

        yield* logger.info(`bootstrap remote GitDB ${operation} started`, {
          remote,
          repositoryId,
          strategy,
        });

        if (runtime.metadata.gitDir === undefined) {
          return yield* new BootstrapRepositoryError({
            message: `Repository git directory is unavailable: ${repositoryId}`,
            repositoryId,
          });
        }

        const transportStore = yield* makeTransportStore(
          runtime.record.path,
          runtime.metadata.gitDir,
        );
        const remoteSync =
          options.pushFirst === true
            ? publishTransportStore(transportStore, remote, repositoryId)
            : transportStore.sync({
                mode: "full",
                onDiverged: "rebase",
                pointers: [DEFAULT_POINTER],
                remote,
              });
        const remoteResult = yield* remoteSync;
        const syncStatus = remoteResult.pointers.every(
          (pointer) => pointer.status === "missing-remote-gitdb-ref",
        )
          ? "missing-remote-gitdb-ref"
          : "synced";
        yield* logger.info(`bootstrap remote GitDB ${operation} finished`, {
          pointers: remoteResult.pointers,
          remote: remoteResult.remote,
          repositoryId,
          status: syncStatus,
          strategy,
        });

        const projection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtime.record,
          repositoryStatusFromProjection(runtime.record, projection),
        );
        remoteSyncedSnapshots.set(repositoryId, yield* snapshotIdForStore(runtime.store));
        pendingRemoteSync.delete(repositoryId);
        remoteRetry.delete(repositoryId);
        yield* logger.info("bootstrap post-remote materialization finished", {
          ...projectionLogFields(projection),
          repositoryId,
        });

        return {
          remote: remoteResult.remote,
          repositoryId,
          result: remoteResult,
          status: syncStatus,
        };
      });

    const syncRepositoryFromRemoteOutcome = (
      repositoryId: string,
    ): Effect.Effect<RemoteSyncOutcome, unknown> =>
      runRemoteOperation(repositoryId, "syncRepositoryFromRemote", () =>
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

    const syncRepositoryFromRemote = (repositoryId: string): Effect.Effect<void, unknown> =>
      syncRepositoryFromRemoteOutcome(repositoryId).pipe(Effect.asVoid);

    const pushRepositoryToRemoteUnsafe = (
      repositoryId: string,
    ): Effect.Effect<SyncResult, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* ensureRepositoryOpenedUnsafe(repository);
        const runtime = opened.get(repositoryId);
        if (runtime === undefined) {
          return yield* new BootstrapRepositoryError({
            message: `Repository is not open: ${repositoryId}`,
            repositoryId,
          });
        }

        const remote = runtime.metadata.defaultRemote;
        if (remote === undefined) {
          return yield* new BootstrapRepositoryError({
            message: `Repository has no default remote: ${repositoryId}`,
            repositoryId,
          });
        }

        if (runtime.metadata.gitDir === undefined) {
          return yield* new BootstrapRepositoryError({
            message: `Repository git directory is unavailable: ${repositoryId}`,
            repositoryId,
          });
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
          ...projectionLogFields(localProjection),
          repositoryId,
        });

        const transportStore = yield* makeTransportStore(
          runtime.record.path,
          runtime.metadata.gitDir,
        );
        const pushResult = yield* publishTransportStore(transportStore, remote, repositoryId);
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
        remoteSyncedSnapshots.set(repositoryId, yield* snapshotIdForStore(runtime.store));
        pendingRemoteSync.delete(repositoryId);
        remoteRetry.delete(repositoryId);
        yield* logger.info("bootstrap post-push materialization finished", {
          ...projectionLogFields(projection),
          repositoryId,
        });

        return pushResult;
      });

    const pushRepositoryToRemote = (repositoryId: string): Effect.Effect<SyncResult, unknown> =>
      runRemoteOperation(repositoryId, "pushRepositoryToRemote", () =>
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

    const refreshLocalProjectionIfNeeded = (
      runtimeRepository: RuntimeRepository,
    ): Effect.Effect<string | null, unknown> =>
      Effect.gen(function* () {
        const pointerSnapshotId = yield* snapshotIdForStore(runtimeRepository.store);
        const current = repositoryStatuses.get(runtimeRepository.record.id);

        if (current?.activeSnapshotId === pointerSnapshotId) return pointerSnapshotId;

        yield* logger.info("bootstrap local materialization started", {
          reason: "local-pointer-changed",
          repositoryId: runtimeRepository.record.id,
        });

        const projection = yield* database.syncRepository(runtimeRepository.record.id);
        setRepositoryStatus(
          runtimeRepository.record,
          repositoryStatusFromProjection(runtimeRepository.record, projection),
        );
        yield* logger.info("bootstrap local materialization finished", {
          ...projectionLogFields(projection),
          reason: "local-pointer-changed",
          repositoryId: runtimeRepository.record.id,
        });
        return pointerSnapshotId;
      });

    const markRemoteFailure = (repositoryId: string, error: unknown): RemoteSyncOutcome => {
      const previous = remoteRetry.get(repositoryId);
      const attempts = (previous?.attempts ?? 0) + 1;

      remoteRetry.set(repositoryId, {
        attempts,
        nextRetryAt: Date.now() + retryDelayMs(attempts),
      });
      pendingRemoteSync.add(repositoryId);

      return {
        error: errorMessage(error),
        repositoryId,
        status: "failed",
      };
    };

    const syncRepositoryInBackgroundUnsafe = (
      repositoryId: string,
    ): Effect.Effect<RemoteSyncOutcome, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* ensureRepositoryOpenedUnsafe(repository);
        const runtimeRepository = opened.get(repositoryId);
        if (runtimeRepository === undefined) {
          return yield* new BootstrapRepositoryError({
            message: `Repository is not open: ${repositoryId}`,
            repositoryId,
          });
        }

        const localSnapshot = yield* refreshLocalProjectionIfNeeded(runtimeRepository);
        const lastSynced = remoteSyncedSnapshots.get(repositoryId);
        const changed = pendingRemoteSync.has(repositoryId) || lastSynced !== localSnapshot;

        const retry = remoteRetry.get(repositoryId);
        if (retry !== undefined && retry.nextRetryAt > Date.now()) {
          return {
            repositoryId,
            status: "deferred-retry",
          };
        }

        if (runtimeRepository.metadata.defaultRemote === undefined) {
          pendingRemoteSync.delete(repositoryId);
          remoteSyncedSnapshots.set(repositoryId, localSnapshot);
          remoteRetry.delete(repositoryId);
          yield* logger.info("bootstrap remote publish skipped: no default remote", {
            repositoryId,
          });
          return {
            repositoryId,
            status: "skipped-no-default-remote",
          };
        }

        yield* logger.info(
          changed
            ? "bootstrap remote publish detected local change"
            : "bootstrap remote sync checking for remote changes",
          {
            lastSyncedSnapshotId: lastSynced ?? null,
            localSnapshotId: localSnapshot,
            repositoryId,
          },
        );

        return yield* syncRepositoryFromRemoteUnsafe(repositoryId, { pushFirst: changed });
      });

    const syncRepositoryInBackground = (
      repositoryId: string,
    ): Effect.Effect<RemoteSyncOutcome, never> =>
      runRemoteOperation(repositoryId, "syncRepositoryInBackground", () =>
        syncRepositoryInBackgroundUnsafe(repositoryId),
      ).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            const runtime = opened.get(repositoryId);
            if (runtime !== undefined) {
              setRepositoryStatus(runtime.record, {
                error: errorMessage(error),
                stage: "ready",
              });
            }
          }).pipe(
            Effect.andThen(
              logger.error("bootstrap background repository sync failed", {
                error: errorMessage(error),
                repositoryId,
              }),
            ),
            Effect.as(markRemoteFailure(repositoryId, error)),
          ),
        ),
      );

    const syncConfiguredRepositoriesFromRemote = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        remoteSyncCycle += 1;
        const cycle = remoteSyncCycle;

        yield* Effect.gen(function* () {
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
          yield* Effect.annotateCurrentSpan({
            "desktop.bootstrap.repositories": repositories.length,
          });

          const outcomes = yield* Effect.forEach(
            repositories,
            (repository) => syncRepositoryInBackground(repository.id),
            {
              concurrency: REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY,
            },
          );

          const message = "bootstrap remote sync phase completed";
          const summary = remoteSyncSummary(outcomes);
          const fields = {
            ...summary,
            cycle,
          };
          yield* Effect.annotateCurrentSpan({
            "desktop.bootstrap.remoteDeferred": summary["remoteDeferred"],
            "desktop.bootstrap.remoteFailed": summary["remoteFailed"],
            "desktop.bootstrap.remoteSynced": summary["remoteSynced"],
          });

          if (cycle === 1) {
            yield* logger.info(message, fields);
          } else {
            yield* logger.debug(message, fields);
          }
        }).pipe(
          Effect.withSpan("desktop.bootstrap.backgroundSyncCycle", {
            attributes: {
              "desktop.bootstrap.concurrency": REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY,
              "desktop.bootstrap.cycle": cycle,
              service: "@cycle/desktop",
            },
          }),
        );
      });

    const waitForBackgroundSyncSignal = Effect.race(
      Effect.sleep(BACKGROUND_REMOTE_SYNC_POLL_INTERVAL_MS),
      Queue.take(changeSignals).pipe(Effect.asVoid),
    );

    const runBackgroundSyncLoop = syncConfiguredRepositoriesFromRemote().pipe(
      Effect.andThen(waitForBackgroundSyncSignal),
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

      const repositories = yield* resolveConfiguredRepositories(config.localWorkspace.repositories);

      for (const repository of repositories) {
        setRepositoryStatus(repository, {
          stage: "pending",
        });
      }

      yield* openConfiguredRepositories(repositories);

      setStatus({
        blocking: false,
        completedAt: nowIso(),
        message:
          repositories.length === 0
            ? "No repositories configured"
            : "Repository projections are ready",
        phase: "ready-with-background-sync",
      });
      yield* logger.info("bootstrap local open phase completed", {
        ...bootstrapSummary(),
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

    const notifyRepositoryChanged = (repositoryId: string): Effect.Effect<void> =>
      Effect.sync(() => {
        pendingRemoteSync.add(repositoryId);
      }).pipe(Effect.andThen(Queue.offer(changeSignals, repositoryId)), Effect.asVoid);

    return DesktopBootstrap.of({
      ensureRepositoryOpened: (repositoryId) =>
        Effect.gen(function* () {
          const repository = yield* repositoryById(repositoryId);
          yield* openRepository(repository);
        }),
      notifyRepositoryChanged,
      pushRepositoryToRemote,
      start,
      status: () => Effect.sync(snapshot),
      syncRepositoryFromRemote,
    });
  }),
);
