import { DatabaseService, type RepositoryMetadata, type RepositoryStatus } from "@cycle/database";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore, type SyncResult } from "@cycle/git-db";
import { logDebug, logError, logInfo } from "@cycle/logging";
import { Context, Effect, Layer, Queue, Schema, Scope } from "effect";
import type { RepositoryRecord } from "@cycle/config/app-config";
import { LocalSettings } from "./LocalSettings.ts";
import { LocalWorkspace } from "./LocalWorkspace.ts";
import { BackendBootstrapError, errorMessage } from "./BackendErrors.ts";

const DEFAULT_POINTER = "main";
const REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY = 10;
const BACKGROUND_REMOTE_SYNC_POLL_INTERVAL_MS = 15_000;

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const BootstrapPhase = Schema.Literals([
  "idle",
  "starting",
  "loading-repositories",
  "opening-repository",
  "ready",
  "ready-with-background-sync",
  "failed",
]);
export type BootstrapPhase = typeof BootstrapPhase.Type;

export const BootstrapRepositoryStage = Schema.Literals([
  "pending",
  "opening",
  "ready",
  "syncing",
  "failed",
]);
export type BootstrapRepositoryStage = typeof BootstrapRepositoryStage.Type;

export const BootstrapRepositoryStatus = Schema.Struct({
  activeSnapshotId: Schema.optional(Schema.NullOr(Schema.String)),
  currentBranch: Schema.optional(Schema.String),
  defaultRemote: Schema.optional(Schema.String),
  defaultRemoteUrl: Schema.optional(Schema.String),
  displayName: Schema.String,
  error: Schema.optional(Schema.String),
  path: Schema.String,
  repositoryId: Schema.String,
  stage: BootstrapRepositoryStage,
  updatedAt: Schema.String,
  warningCount: Schema.optional(NonNegativeInteger),
});
export type BootstrapRepositoryStatus = typeof BootstrapRepositoryStatus.Type;

export const BootstrapStatus = Schema.Struct({
  blocking: Schema.Boolean,
  completedAt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  message: Schema.String,
  phase: BootstrapPhase,
  repositories: Schema.Array(BootstrapRepositoryStatus),
  startedAt: Schema.optional(Schema.String),
});
export type BootstrapStatus = typeof BootstrapStatus.Type;

export type RepositoryBootstrapService = {
  readonly ensureRepositoryOpened: (repositoryId: string) => Effect.Effect<void, unknown>;
  readonly notifyRepositoryChanged: (repositoryId: string) => Effect.Effect<void>;
  readonly pushRepositoryToRemote: (repositoryId: string) => Effect.Effect<SyncResult, unknown>;
  readonly start: () => Effect.Effect<void>;
  readonly status: () => Effect.Effect<BootstrapStatus>;
  readonly syncRepositoryFromRemote: (repositoryId: string) => Effect.Effect<void, unknown>;
};

export class RepositoryBootstrap extends Context.Service<
  RepositoryBootstrap,
  RepositoryBootstrapService
>()("@cycle/backend/RepositoryBootstrap") {}

type RuntimeRepository = {
  readonly metadata: RepositoryMetadata;
  readonly record: RepositoryRecord;
  readonly store: GitDbStore.StoreServiceShape;
};

const nowIso = (): string => new Date().toISOString();

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

const summarizeRepositoryStatuses = (
  statuses: Iterable<BootstrapRepositoryStatus>,
): Record<string, unknown> => {
  let failed = 0;
  let ready = 0;
  let syncing = 0;
  let warnings = 0;

  for (const status of statuses) {
    if (status.stage === "failed") failed += 1;
    if (status.stage === "ready") ready += 1;
    if (status.stage === "syncing") syncing += 1;
    warnings += status.warningCount ?? 0;
  }

  return {
    failed,
    ready,
    syncing,
    warnings,
  };
};

const bootstrapLogFields = (fields: Readonly<Record<string, unknown>> = {}) => ({
  ...fields,
  component: "bootstrap",
  service: "backend",
});

const info = (message: string, fields?: Readonly<Record<string, unknown>>) =>
  logInfo("backend", message, bootstrapLogFields(fields));

const debug = (message: string, fields?: Readonly<Record<string, unknown>>) =>
  logDebug("backend", message, bootstrapLogFields(fields));

const errorLog = (message: string, fields?: Readonly<Record<string, unknown>>) =>
  logError("backend", message, bootstrapLogFields(fields));

export const RepositoryBootstrapLive = Layer.effect(
  RepositoryBootstrap,
  Effect.gen(function* () {
    const settings = yield* LocalSettings;
    const database = yield* DatabaseService;
    const gitRepository = yield* GitRepository;
    const localWorkspace = yield* LocalWorkspace;
    const scope = yield* Scope.Scope;
    const changeSignals = yield* Queue.unbounded<string>();
    const opened = new Map<string, RuntimeRepository>();
    const pendingRemoteSync = new Set<string>();
    const repositoryStatuses = new Map<string, BootstrapRepositoryStatus>();
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

    const repositoryById = (repositoryId: string): Effect.Effect<RepositoryRecord, unknown> =>
      settings.read().pipe(
        Effect.flatMap((config) => {
          const repository = config.localWorkspace.repositories.find(
            (candidate) => candidate.id === repositoryId,
          );

          return repository === undefined
            ? Effect.fail(
                new BackendBootstrapError({
                  message: `Repository is not configured: ${repositoryId}`,
                  operation: "RepositoryBootstrap.repositoryById",
                  repositoryId,
                }),
              )
            : Effect.succeed(repository);
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
        yield* info("bootstrap opening repository", {
          displayName: repository.displayName,
          path: repository.path,
          repositoryId: repository.id,
        });

        const inspected = yield* gitRepository.metadata(repository.path);
        const metadata = repositoryMetadata(inspected);
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

        const projection = yield* database.syncRepository(repository.id);
        const runtimeRepository = {
          metadata,
          record: repository,
          store,
        };
        opened.set(repository.id, runtimeRepository);
        remoteSyncedSnapshots.set(repository.id, yield* snapshotIdForStore(store));
        setRepositoryStatus(repository, repositoryStatusFromProjection(repository, projection));
        yield* info("bootstrap local materialization finished", {
          ...projectionLogFields(projection),
          repositoryId: repository.id,
        });
      }).pipe(
        Effect.catch((error) =>
          errorLog("bootstrap repository open failed", {
            error: errorMessage(error),
            repositoryId: repository.id,
          }).pipe(
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

    const openRepository = (repository: RepositoryRecord): Effect.Effect<void, unknown> =>
      ensureRepositoryOpenedUnsafe(repository).pipe(
        Effect.withSpan("backend.bootstrap.openRepository", {
          attributes: {
            "backend.repositoryId": repository.id,
            service: "@cycle/backend",
          },
        }),
      );

    const openConfiguredRepositories = (
      repositories: ReadonlyArray<RepositoryRecord>,
    ): Effect.Effect<void> =>
      Effect.forEach(
        repositories,
        (repository) => openRepository(repository).pipe(Effect.catch(() => Effect.void)),
        {
          concurrency: REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY,
        },
      ).pipe(Effect.asVoid);

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

    const syncRepositoryFromRemoteUnsafe = (
      repositoryId: string,
      options: { readonly pushFirst?: boolean } = {},
    ): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* ensureRepositoryOpenedUnsafe(repository);
        const runtimeRepository = opened.get(repositoryId);
        if (runtimeRepository === undefined) {
          return yield* new BackendBootstrapError({
            message: `Repository is not open: ${repositoryId}`,
            operation: "RepositoryBootstrap.syncRepositoryFromRemote",
            repositoryId,
          });
        }

        const remote = runtimeRepository.metadata.defaultRemote;
        if (remote === undefined) {
          pendingRemoteSync.delete(repositoryId);
          remoteSyncedSnapshots.set(
            repositoryId,
            yield* snapshotIdForStore(runtimeRepository.store),
          );
          yield* info("bootstrap remote sync skipped: no default remote", { repositoryId });
          return;
        }

        yield* info("bootstrap remote sync checking for remote changes", {
          remote,
          repositoryId,
          strategy: options.pushFirst === true ? "push-first" : "fetch-first",
        });

        if (runtimeRepository.metadata.gitDir === undefined) {
          return yield* new BackendBootstrapError({
            message: `Repository git directory is unavailable: ${repositoryId}`,
            operation: "RepositoryBootstrap.syncRepositoryFromRemote",
            repositoryId,
          });
        }

        setRepositoryStatus(runtimeRepository.record, {
          error: undefined,
          stage: "syncing",
        });
        const localProjection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtimeRepository.record,
          repositoryStatusFromProjection(runtimeRepository.record, localProjection),
        );

        const transportStore = yield* makeTransportStore(
          runtimeRepository.record.path,
          runtimeRepository.metadata.gitDir,
        );
        const remoteResult = yield* transportStore.sync({
          mode: options.pushFirst === true ? "push" : "full",
          onDiverged: options.pushFirst === true ? "error" : "rebase",
          pointers: [DEFAULT_POINTER],
          remote,
        });
        yield* info("bootstrap remote GitDB sync finished", {
          pointers: remoteResult.pointers,
          remote: remoteResult.remote,
          repositoryId,
          strategy: options.pushFirst === true ? "push-first" : "fetch-first",
        });

        const projection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtimeRepository.record,
          repositoryStatusFromProjection(runtimeRepository.record, projection),
        );
        remoteSyncedSnapshots.set(repositoryId, yield* snapshotIdForStore(runtimeRepository.store));
        pendingRemoteSync.delete(repositoryId);
      });

    const syncRepositoryFromRemote = (repositoryId: string): Effect.Effect<void, unknown> =>
      syncRepositoryFromRemoteUnsafe(repositoryId).pipe(
        Effect.catch((error) =>
          errorLog("bootstrap repository sync failed", {
            error: errorMessage(error),
            repositoryId,
          }).pipe(Effect.andThen(Effect.fail(error))),
        ),
      );

    const pushRepositoryToRemote = (repositoryId: string): Effect.Effect<SyncResult, unknown> =>
      Effect.gen(function* () {
        const repository = yield* repositoryById(repositoryId);
        yield* ensureRepositoryOpenedUnsafe(repository);
        const runtimeRepository = opened.get(repositoryId);
        if (runtimeRepository === undefined) {
          return yield* new BackendBootstrapError({
            message: `Repository is not open: ${repositoryId}`,
            operation: "RepositoryBootstrap.pushRepositoryToRemote",
            repositoryId,
          });
        }
        const remote = runtimeRepository.metadata.defaultRemote;
        if (remote === undefined || runtimeRepository.metadata.gitDir === undefined) {
          return yield* new BackendBootstrapError({
            message: `Repository cannot be pushed: ${repositoryId}`,
            operation: "RepositoryBootstrap.pushRepositoryToRemote",
            repositoryId,
          });
        }

        setRepositoryStatus(runtimeRepository.record, {
          error: undefined,
          stage: "syncing",
        });
        const transportStore = yield* makeTransportStore(
          runtimeRepository.record.path,
          runtimeRepository.metadata.gitDir,
        );
        const pushResult = yield* transportStore.sync({
          mode: "push",
          onDiverged: "error",
          pointers: [DEFAULT_POINTER],
          remote,
        });
        const projection = yield* database.syncRepository(repositoryId);
        setRepositoryStatus(
          runtimeRepository.record,
          repositoryStatusFromProjection(runtimeRepository.record, projection),
        );
        remoteSyncedSnapshots.set(repositoryId, yield* snapshotIdForStore(runtimeRepository.store));
        pendingRemoteSync.delete(repositoryId);
        return pushResult;
      });

    const syncConfiguredRepositoriesFromRemote = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        remoteSyncCycle += 1;
        const cycle = remoteSyncCycle;
        let remoteFailed = 0;
        let remoteSkipped = 0;
        let remoteSynced = 0;
        const repositories = yield* settings.read().pipe(
          Effect.map((config) => config.localWorkspace.repositories),
          Effect.catch((error) =>
            errorLog("bootstrap background sync skipped: unable to read app config", {
              error: errorMessage(error),
            }).pipe(Effect.as([] as ReadonlyArray<RepositoryRecord>)),
          ),
        );

        yield* Effect.forEach(
          repositories,
          (repository) => {
            const lastSynced = remoteSyncedSnapshots.get(repository.id);
            const runtimeRepository = opened.get(repository.id);
            if (runtimeRepository === undefined) return Effect.void;
            if (runtimeRepository.metadata.defaultRemote === undefined) {
              remoteSkipped += 1;
            } else {
              remoteSynced += 1;
            }
            return snapshotIdForStore(runtimeRepository.store).pipe(
              Effect.flatMap((currentSnapshot) =>
                pendingRemoteSync.has(repository.id) || lastSynced !== currentSnapshot
                  ? syncRepositoryFromRemoteUnsafe(repository.id, { pushFirst: true })
                  : syncRepositoryFromRemoteUnsafe(repository.id),
              ),
              Effect.catch((error) =>
                Effect.sync(() => {
                  remoteFailed += 1;
                  if (runtimeRepository.metadata.defaultRemote !== undefined) remoteSynced -= 1;
                  setRepositoryStatus(runtimeRepository.record, {
                    error: errorMessage(error),
                    stage: "ready",
                  });
                }).pipe(
                  Effect.andThen(
                    errorLog("bootstrap background repository sync failed", {
                      error: errorMessage(error),
                      repositoryId: repository.id,
                    }),
                  ),
                ),
              ),
            );
          },
          { concurrency: REPOSITORY_BACKGROUND_OPERATION_CONCURRENCY },
        );

        yield* (cycle === 1 ? info : debug)("bootstrap remote sync phase completed", {
          cycle,
          remoteFailed,
          remoteMissingGitDbRefs: 0,
          remoteSkipped,
          remoteSynced,
          repositories: repositories.length,
          ...summarizeRepositoryStatuses(repositoryStatuses.values()),
        });
      });

    const waitForBackgroundSyncSignal = Effect.race(
      Effect.sleep(BACKGROUND_REMOTE_SYNC_POLL_INTERVAL_MS),
      Queue.take(changeSignals).pipe(Effect.asVoid),
    );

    const runBackgroundSyncLoop = syncConfiguredRepositoriesFromRemote().pipe(
      Effect.andThen(waitForBackgroundSyncSignal),
      Effect.forever,
    );

    const runBootstrap = Effect.gen(function* () {
      setStatus({
        blocking: true,
        message: "Loading configured repositories",
        phase: "starting",
        startedAt: nowIso(),
      });
      yield* info("bootstrap started");

      const config = yield* settings.read().pipe(
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
      yield* info("bootstrap local open phase completed", {
        openedRepositories: [...opened.keys()],
        repositories: repositories.length,
      });

      yield* runBackgroundSyncLoop.pipe(Effect.forkScoped);
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
      return runBootstrap.pipe(
        Effect.forkScoped,
        Effect.asVoid,
        Effect.provideService(Scope.Scope, scope),
      );
    };

    const notifyRepositoryChanged = (repositoryId: string): Effect.Effect<void> =>
      Effect.sync(() => {
        pendingRemoteSync.add(repositoryId);
      }).pipe(Effect.andThen(Queue.offer(changeSignals, repositoryId)), Effect.asVoid);

    return RepositoryBootstrap.of({
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
