import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DatabaseService,
  ValidationError,
  type DatabaseFailure,
  type DatabaseServiceShape,
} from "@cycle/database";
import type { RepositoryStatus } from "@cycle/contracts/schemas";
import { GitRepository } from "@cycle/git";
import { Data, Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { ElectronRuntimeLive } from "../src/ElectronRuntime.ts";
import { defaultAppConfig, type RepositoryRecord } from "@cycle/contracts/schemas/app";
import { RepositoryBootstrap as DesktopBootstrap } from "@cycle/backend/bootstrap";
import { LocalWorkspace } from "@cycle/backend/workspace";
import { DesktopBootstrapLive } from "../src/DesktopBootstrapLive.ts";
import { DesktopLogger } from "../src/DesktopLogger.ts";
import { ElectronPreferences } from "../src/ElectronPreferences.ts";

const execFileAsync = promisify(execFile);
const temporaryDirectories: Array<string> = [];

const makeTempDir = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cycle-bootstrap-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const repositoryStatus = (
  repositoryId: string,
  status: RepositoryStatus["status"],
  activeSnapshotId: string | null,
): RepositoryStatus => ({
  activeGeneration: activeSnapshotId === null ? 0 : 1,
  activeSnapshotId,
  repositoryId,
  status,
  warningCount: 0,
});

const makeRepository = (path: string): RepositoryRecord => ({
  addedAt: "2026-06-12T00:00:00.000Z",
  displayName: "Cycle Test",
  id: "repo-test",
  path,
  preferences: {
    autoSync: false,
    commitStyle: "descriptive",
    sidebarExpanded: true,
  },
});

const initializeRepositoryWithCommit = async (repositoryPath: string): Promise<void> => {
  await mkdir(repositoryPath, { recursive: true });
  await execFileAsync("git", ["init", "--initial-branch=main"], { cwd: repositoryPath });
  await writeFile(join(repositoryPath, "source.txt"), "source\n");
  await execFileAsync("git", ["add", "source.txt"], { cwd: repositoryPath });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Test User",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "Initial source commit",
    ],
    { cwd: repositoryPath },
  );
};

const addOriginWithCycleRef = async (repositoryPath: string): Promise<string> => {
  const remoteRoot = await makeTempDir();
  const remote = join(remoteRoot, "origin.git");

  await execFileAsync("git", ["update-ref", "refs/gitdb/cycle/main", "HEAD"], {
    cwd: repositoryPath,
  });
  await execFileAsync("git", ["clone", "--bare", repositoryPath, remote], {
    cwd: repositoryPath,
  });
  await execFileAsync("git", ["remote", "add", "origin", remote], {
    cwd: repositoryPath,
  });

  return remote;
};

const advanceRemoteCycleRef = async (remote: string): Promise<string> => {
  const cloneRoot = await makeTempDir();
  const clone = join(cloneRoot, "remote-writer");
  const fileName = `remote-${Date.now()}.txt`;

  await execFileAsync("git", ["clone", remote, clone]);
  await writeFile(join(clone, fileName), `remote update ${Date.now()}\n`);
  await execFileAsync("git", ["add", fileName], { cwd: clone });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Remote User",
      "-c",
      "user.email=remote@example.invalid",
      "commit",
      "-m",
      "Remote GitDB update",
    ],
    { cwd: clone },
  );

  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: clone });
  const snapshot = stdout.trim();

  await execFileAsync("git", ["update-ref", "refs/gitdb/cycle/main", snapshot], { cwd: clone });
  await execFileAsync("git", ["push", "origin", "refs/gitdb/cycle/main:refs/gitdb/cycle/main"], {
    cwd: clone,
  });

  return snapshot;
};

const readCycleRef = async (repositoryPath: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "refs/gitdb/cycle/main"], {
    cwd: repositoryPath,
  });

  return stdout.trim();
};

const addLocalCycleRef = async (repositoryPath: string): Promise<void> => {
  await execFileAsync("git", ["update-ref", "refs/gitdb/cycle/main", "HEAD"], {
    cwd: repositoryPath,
  });
};

const addOriginWithoutCycleRef = async (repositoryPath: string): Promise<string> => {
  const remoteRoot = await makeTempDir();
  const remote = join(remoteRoot, "origin.git");

  await execFileAsync("git", ["clone", "--bare", repositoryPath, remote], {
    cwd: repositoryPath,
  });
  await execFileAsync("git", ["remote", "add", "origin", remote], {
    cwd: repositoryPath,
  });

  return remote;
};

type LogEvent = {
  readonly fields?: Readonly<Record<string, unknown>>;
  readonly level: "debug" | "error" | "info" | "warn";
  readonly message: string;
};

type MakeLayerOptions = {
  readonly defaultRemote?: string | ((repository: RepositoryRecord) => string | undefined);
  readonly logs?: Array<LogEvent>;
  readonly syncRepository?: (
    repositoryId: string,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
};

class TestFailure extends Data.TaggedError("TestFailure")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const waitUntil = (
  predicate: () => boolean,
  message: string,
  options: {
    readonly attempts?: number;
    readonly intervalMs?: number;
  } = {},
): Effect.Effect<void, TestFailure> =>
  Effect.gen(function* () {
    const attempts = options.attempts ?? 100;
    const intervalMs = options.intervalMs ?? 50;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (predicate()) return;
      yield* Effect.sleep(intervalMs);
    }

    return yield* new TestFailure({ message });
  });

const waitUntilEffect = (
  predicate: () => Effect.Effect<boolean, TestFailure>,
  message: string,
  options: {
    readonly attempts?: number;
    readonly intervalMs?: number;
  } = {},
): Effect.Effect<void, TestFailure> =>
  Effect.gen(function* () {
    const attempts = options.attempts ?? 100;
    const intervalMs = options.intervalMs ?? 50;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (yield* predicate()) return;
      yield* Effect.sleep(intervalMs);
    }

    return yield* new TestFailure({ message });
  });

const waitUntilYield = (
  predicate: () => boolean,
  message: string,
  attempts = 1_000,
): Effect.Effect<void, TestFailure> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (predicate()) return;
      yield* Effect.yieldNow;
    }

    return yield* new TestFailure({ message });
  });

const makeLayer = (
  repositoryOrRepositories: RepositoryRecord | ReadonlyArray<RepositoryRecord>,
  events: Array<string>,
  options: MakeLayerOptions = {},
) => {
  const repositories = Array.isArray(repositoryOrRepositories)
    ? repositoryOrRepositories
    : [repositoryOrRepositories];
  const config = {
    ...defaultAppConfig(),
    localWorkspace: {
      repositories,
    },
  };
  const gitDirFor = (repositoryPath: string): string => join(repositoryPath, ".git");
  const repositoryForPath = (repositoryPath: string): RepositoryRecord | undefined =>
    repositories.find((repository) => repository.path === repositoryPath);
  const defaultRemoteFor = (repository: RepositoryRecord | undefined): string | undefined =>
    typeof options.defaultRemote === "function"
      ? repository === undefined
        ? undefined
        : options.defaultRemote(repository)
      : options.defaultRemote;
  const recordLog =
    (level: LogEvent["level"]) =>
    (message: string, fields?: Readonly<Record<string, unknown>>): Effect.Effect<void> =>
      Effect.sync(() => {
        options.logs?.push({
          ...(fields === undefined ? {} : { fields }),
          level,
          message,
        });
      });

  const preferences = Layer.succeed(ElectronPreferences)(
    ElectronPreferences.of({
      clearCache: () => Effect.void,
      completeOnboarding: () => Effect.succeed(config),
      read: () => Effect.succeed(config),
      removeRepository: () => Effect.succeed(config),
      setInterfaceDensity: () => Effect.succeed(config),
      setThemePreference: () => Effect.succeed(config),
      updateAgentProviderPreference: () => Effect.succeed(config),
      shouldAutoSyncRepository: () =>
        Effect.sync(() => {
          events.push("shouldAutoSyncRepository");
          return false;
        }),
      startThemeLifecycleSupervision: () => Effect.void,
      syncThemePreference: () =>
        Effect.succeed({
          resolvedMode: "light",
          shouldUseDarkColors: false,
          source: "system",
        }),
      themeState: Effect.succeed({
        resolvedMode: "light",
        shouldUseDarkColors: false,
        source: "system",
      }),
      updateProfile: () =>
        Effect.succeed({
          displayName: "",
          email: "",
        }),
      updateRepositoryPreferences: (input) =>
        Effect.succeed(
          repositories.find((repository) => repository.id === input.id) ?? repositories[0] ?? null,
        ),
    }),
  );

  const database = Layer.succeed(DatabaseService)(
    DatabaseService.of({
      openRepository: (input) =>
        Effect.sync(() => {
          events.push(`openRepository:${input.repositoryId}:${String(input.syncOnOpen)}`);
          return repositoryStatus(input.repositoryId, "empty", null);
        }),
      syncRepository: (repositoryId) =>
        options.syncRepository !== undefined
          ? options.syncRepository(repositoryId)
          : Effect.sync(() => {
              events.push(`syncRepository:${repositoryId}`);
              return repositoryStatus(repositoryId, "ready", "snapshot-local");
            }),
    } as Partial<DatabaseServiceShape> as DatabaseServiceShape),
  );

  const git = Layer.succeed(GitRepository)(
    GitRepository.of({
      ensure: (repositoryPath) =>
        Effect.succeed({ cwd: repositoryPath, gitDir: gitDirFor(repositoryPath) }),
      init: (repositoryPath) =>
        Effect.succeed({ cwd: repositoryPath, gitDir: gitDirFor(repositoryPath) }),
      inspect: (repositoryPath) =>
        Effect.succeed({
          gitDir: gitDirFor(repositoryPath),
          path: repositoryPath,
          status: "git",
        }),
      metadata: (repositoryPath) =>
        Effect.sync(() => {
          const repository = repositoryForPath(repositoryPath);
          const defaultRemote = defaultRemoteFor(repository);
          const gitDir = gitDirFor(repositoryPath);

          events.push(`metadata:${repositoryPath}`);
          return {
            currentBranch: "main",
            ...(defaultRemote === undefined
              ? {}
              : {
                  defaultRemote,
                }),
            gitDir,
            inspectedAt: "2026-06-12T00:00:00.000Z",
            path: repositoryPath,
            remotes: defaultRemote === undefined ? [] : [{ name: defaultRemote }],
          };
        }),
      resolveGitDir: (repositoryPath) => Effect.succeed(gitDirFor(repositoryPath)),
    }),
  );

  const logger = Layer.succeed(DesktopLogger)(
    DesktopLogger.of({
      debug: recordLog("debug"),
      error: recordLog("error"),
      info: recordLog("info"),
      path: Effect.succeed(join(repositories[0]?.path ?? "", "cycle.jsonl")),
      warn: recordLog("warn"),
    }),
  );

  const localWorkspace = Layer.succeed(LocalWorkspace)(
    LocalWorkspace.of({
      initializeRepositoryPath: (input) =>
        Effect.succeed(
          repositories.find((repository) => repository.path === input.path) ??
            repositories[0] ??
            makeRepository(input.path),
        ),
      listRepositories: () => Effect.succeed(repositories),
      markRepositoryOpened: (id) =>
        Effect.succeed(repositories.find((repository) => repository.id === id) ?? null),
      removeRepository: () => Effect.succeed(repositories),
      updateRepositoryPreferences: (input) =>
        Effect.succeed(repositories.find((repository) => repository.id === input.id) ?? null),
      upsertRepositoryPath: (input) =>
        Effect.succeed(
          repositories.find((repository) => repository.path === input.path) ??
            repositories[0] ??
            makeRepository(input.path),
        ),
    }),
  );

  return DesktopBootstrapLive.pipe(
    Layer.provide(
      Layer.mergeAll(ElectronRuntimeLive, preferences, database, git, localWorkspace, logger),
    ),
  );
};

describe("DesktopBootstrapLive", () => {
  it("materializes the local projection while opening a repository", async () => {
    const repositoryPath = await makeTempDir();
    await mkdir(repositoryPath, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: repositoryPath });

    const events: Array<string> = [];
    const repository = makeRepository(repositoryPath);

    const status = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bootstrap = yield* DesktopBootstrap;
          yield* bootstrap.ensureRepositoryOpened(repository.id);
          return yield* bootstrap.status();
        }),
      ).pipe(Effect.provide(makeLayer(repository, events))),
    );

    expect(events).toEqual([
      `metadata:${repositoryPath}`,
      `openRepository:${repository.id}:false`,
      `syncRepository:${repository.id}`,
    ]);
    expect(status.repositories).toEqual([
      expect.objectContaining({
        activeSnapshotId: "snapshot-local",
        repositoryId: repository.id,
        stage: "ready",
      }),
    ]);
  });

  it("publishes in the background after a local change notification", async () => {
    const repositoryPath = await makeTempDir();
    await initializeRepositoryWithCommit(repositoryPath);
    await addOriginWithCycleRef(repositoryPath);

    const events: Array<string> = [];
    const repository = makeRepository(repositoryPath);

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bootstrap = yield* DesktopBootstrap;
          yield* bootstrap.start();
          yield* waitUntil(
            () => events.filter((event) => event === `syncRepository:${repository.id}`).length >= 1,
            "repository did not open",
          );
          yield* bootstrap.notifyRepositoryChanged(repository.id);
          yield* waitUntil(
            () => events.filter((event) => event === `syncRepository:${repository.id}`).length >= 2,
            "background publish did not run",
          );
        }),
      ).pipe(Effect.provide(makeLayer(repository, events, { defaultRemote: "origin" }))),
    );

    expect(events).not.toContain("shouldAutoSyncRepository");
    expect(
      events.filter((event) => event === `syncRepository:${repository.id}`).length,
    ).toBeGreaterThan(1);
  });

  it("fetches remote GitDB changes even when the local snapshot is unchanged", async () => {
    const repositoryPath = await makeTempDir();
    await initializeRepositoryWithCommit(repositoryPath);
    const remote = await addOriginWithCycleRef(repositoryPath);
    const initialSnapshot = await readCycleRef(repositoryPath);

    const events: Array<string> = [];
    const repository = makeRepository(repositoryPath);
    let syncCalls = 0;
    let remoteSnapshot: string | undefined;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bootstrap = yield* DesktopBootstrap;
          yield* bootstrap.start();
          yield* waitUntilEffect(
            () =>
              Effect.tryPromise({
                try: async () =>
                  remoteSnapshot !== undefined &&
                  (await readCycleRef(repositoryPath)) === remoteSnapshot,
                catch: (cause) =>
                  new TestFailure({
                    cause,
                    message: "failed to read remote snapshot",
                  }),
              }),
            "background sync did not fetch the remote GitDB snapshot",
          );
        }),
      ).pipe(
        Effect.provide(
          makeLayer(repository, events, {
            defaultRemote: "origin",
            syncRepository: (repositoryId) =>
              Effect.tryPromise({
                try: async () => {
                  events.push(`syncRepository:${repositoryId}`);
                  syncCalls += 1;

                  if (syncCalls === 1) {
                    remoteSnapshot = await advanceRemoteCycleRef(remote);
                  }

                  return repositoryStatus(
                    repositoryId,
                    "ready",
                    await readCycleRef(repositoryPath),
                  );
                },
                catch: (cause) =>
                  new ValidationError({
                    field: "syncRepository",
                    message: "sync repository failed",
                    cause: cause,
                  }),
              }),
          }),
        ),
      ),
    );

    expect(remoteSnapshot).toBeDefined();
    expect(remoteSnapshot).not.toBe(initialSnapshot);
    expect(await readCycleRef(repositoryPath)).toBe(remoteSnapshot);
  });

  it("summarizes skipped and synced repositories during background publish", async () => {
    const skippedRepositoryPath = await makeTempDir();
    const syncedRepositoryPath = await makeTempDir();
    await initializeRepositoryWithCommit(skippedRepositoryPath);
    await initializeRepositoryWithCommit(syncedRepositoryPath);
    await addLocalCycleRef(skippedRepositoryPath);
    await addOriginWithoutCycleRef(syncedRepositoryPath);
    await addLocalCycleRef(syncedRepositoryPath);

    const events: Array<string> = [];
    const skippedRepository = {
      ...makeRepository(skippedRepositoryPath),
      id: "repo-skipped",
    };
    const syncedRepository = {
      ...makeRepository(syncedRepositoryPath),
      id: "repo-synced",
    };

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bootstrap = yield* DesktopBootstrap;
          yield* bootstrap.start();
          yield* waitUntilEffect(
            () =>
              bootstrap
                .status()
                .pipe(
                  Effect.map((snapshot) =>
                    snapshot.repositories.every((repository) => repository.stage === "ready"),
                  ),
                ),
            "repositories did not open",
          );
          yield* bootstrap.notifyRepositoryChanged(skippedRepository.id);
          yield* bootstrap.notifyRepositoryChanged(syncedRepository.id);
          yield* waitUntil(
            () =>
              events.filter((event) => event === `syncRepository:${syncedRepository.id}`).length >
              1,
            "background publish did not run",
          );
        }),
      ).pipe(
        Effect.provide(
          makeLayer([skippedRepository, syncedRepository], events, {
            defaultRemote: (repository) =>
              repository.id === syncedRepository.id ? "origin" : undefined,
            syncRepository: (repositoryId) =>
              Effect.sync(() => {
                events.push(`syncRepository:${repositoryId}`);
                return repositoryStatus(repositoryId, "ready", "snapshot-local");
              }),
          }),
        ),
      ),
    );

    expect(
      events.filter((event) => event === `syncRepository:${skippedRepository.id}`).length,
    ).toBe(1);
    expect(
      events.filter((event) => event === `syncRepository:${syncedRepository.id}`).length,
    ).toBeGreaterThan(1);
  });

  it("keeps background sync running for other repositories when one remote fails", async () => {
    const badRepositoryPath = await makeTempDir();
    const goodRepositoryPath = await makeTempDir();
    await initializeRepositoryWithCommit(badRepositoryPath);
    await initializeRepositoryWithCommit(goodRepositoryPath);
    await addLocalCycleRef(badRepositoryPath);
    await addOriginWithCycleRef(goodRepositoryPath);

    const events: Array<string> = [];
    const badRepository = {
      ...makeRepository(badRepositoryPath),
      id: "repo-bad",
    };
    const goodRepository = {
      ...makeRepository(goodRepositoryPath),
      id: "repo-good",
    };

    const status = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bootstrap = yield* DesktopBootstrap;
          yield* bootstrap.start();
          yield* waitUntilEffect(
            () =>
              bootstrap
                .status()
                .pipe(
                  Effect.map((snapshot) =>
                    snapshot.repositories.every((repository) => repository.stage === "ready"),
                  ),
                ),
            "repositories did not open",
          );
          yield* bootstrap.notifyRepositoryChanged(badRepository.id);
          yield* bootstrap.notifyRepositoryChanged(goodRepository.id);
          yield* waitUntilEffect(
            () =>
              bootstrap.status().pipe(
                Effect.map((snapshot) => {
                  const bad = snapshot.repositories.find(
                    (repository) => repository.repositoryId === badRepository.id,
                  );
                  const good = snapshot.repositories.find(
                    (repository) => repository.repositoryId === goodRepository.id,
                  );
                  const goodSyncCount = events.filter(
                    (event) => event === `syncRepository:${goodRepository.id}`,
                  ).length;

                  return bad?.error !== undefined && good?.stage === "ready" && goodSyncCount > 1;
                }),
              ),
            "background sync failure did not stay isolated",
          );
          return yield* bootstrap.status();
        }),
      ).pipe(
        Effect.provide(
          makeLayer([badRepository, goodRepository], events, {
            defaultRemote: (repository) =>
              repository.id === badRepository.id ? "missing" : "origin",
          }),
        ),
      ),
    );

    expect(
      events.filter((event) => event === `syncRepository:${goodRepository.id}`).length,
    ).toBeGreaterThan(1);
    expect(status.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error: expect.stringContaining("missing"),
          repositoryId: badRepository.id,
          stage: "ready",
        }),
        expect.objectContaining({
          repositoryId: goodRepository.id,
          stage: "ready",
        }),
      ]),
    );
  });

  it("does not overlap background sync work for the same repository", async () => {
    const repositoryPath = await makeTempDir();
    await initializeRepositoryWithCommit(repositoryPath);
    await addLocalCycleRef(repositoryPath);

    const events: Array<string> = [];
    const repository = makeRepository(repositoryPath);
    let syncCalls = 0;
    let activeSyncs = 0;
    let maxActiveSyncs = 0;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const bootstrap = yield* DesktopBootstrap;
          yield* bootstrap.start();
          yield* waitUntil(
            () => events.some((event) => event === `syncRepository:${repository.id}`),
            "repository did not open",
          );
          yield* bootstrap.notifyRepositoryChanged(repository.id);
          yield* bootstrap.notifyRepositoryChanged(repository.id);
          yield* waitUntilYield(
            () => events.some((event) => event.startsWith("syncRepository:blocking")),
            "blocking background sync did not start",
          );
          yield* Effect.yieldNow;
        }),
      ).pipe(
        Effect.provide(
          makeLayer(repository, events, {
            defaultRemote: "origin",
            syncRepository: (repositoryId) =>
              Effect.gen(function* () {
                syncCalls += 1;

                if (syncCalls === 1) {
                  events.push(`syncRepository:${repositoryId}`);
                  return repositoryStatus(repositoryId, "ready", "snapshot-local");
                }

                activeSyncs += 1;
                maxActiveSyncs = Math.max(maxActiveSyncs, activeSyncs);
                events.push(`syncRepository:blocking:${repositoryId}:${syncCalls}`);

                yield* Effect.sleep(50);
                activeSyncs -= 1;
                return repositoryStatus(repositoryId, "ready", "snapshot-local");
              }),
          }),
        ),
      ),
    );

    expect(maxActiveSyncs).toBe(1);
    expect(events.some((event) => event.startsWith("syncRepository:blocking"))).toBe(true);
  });
});
