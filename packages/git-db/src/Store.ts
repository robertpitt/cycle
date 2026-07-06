import {
  Cache,
  Context,
  Crypto,
  Effect,
  FileSystem,
  HashMap,
  Layer,
  Option,
  Path,
  TxRef,
} from "effect";
import { Git, type GitService } from "@cycle/git/object-store/Git";
import { GitAdapterError, type RemoteFetchError, type RemotePushError } from "@cycle/git/errors";
import type {
  CommitObject,
  DeleteRefInput,
  FetchInput,
  ObjectId,
  PushInput,
  Ref as GitRef,
  TreeEntry,
  UpdateRefInput,
  WriteCommitInput,
} from "@cycle/git/schemas";
import { Document } from "./Document.ts";
import { encodeValue } from "./internals/json.ts";
import * as Tree from "./internals/tree.ts";
import {
  PointerConflictError,
  PointerNotFoundError,
  RepositoryIdentityConflictError,
  SnapshotNotFoundError,
  StoreNotFoundError,
  SyncConflictError,
  TransactionInactiveError,
  type GitDbError,
} from "./GitDbErrors.ts";
import { Options as OptionsSchema, Store, type Options as StoreOptions } from "./GitDbSchemas.ts";
import {
  isPotentialObjectId,
  isValidPointerName,
  joinStorePath,
  normalizeNamespace,
  normalizeStorePath,
  rejectEmptyMutationPath,
  validateDatabaseName,
  validatePointerName,
  validateRemoteName,
} from "./internals/path.ts";
import type {
  Change,
  ChangeSet,
  CommitOptions,
  Entry,
  HistoryOptions,
  MovePointerOptions,
  PointerSyncResult,
  ReadOptions,
  Snapshot,
  SyncOptions,
  SyncResult,
} from "./GitDbSchemas.ts";

export const Options = OptionsSchema;
export type Options = StoreOptions;

export class StoreConfig extends Context.Service<StoreConfig, Store>()(
  "@cycle/git-db/StoreConfig",
) {}

export const make = (
  options: Options = {},
): Effect.Effect<Store, GitDbError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const cwd = options.cwd === undefined ? path.resolve() : path.resolve(options.cwd);
    const gitDir = path.resolve(cwd, options.gitDir ?? ".git");
    const namespace = yield* normalizeNamespace(
      options.namespace ?? "refs/gitdb",
      options.allowBranchNamespace,
    );
    const database = yield* validateDatabaseName(options.database ?? "default");
    const defaultPointer = yield* validatePointerName(options.defaultPointer ?? "main");

    if (options.verifyGitDir ?? true) {
      yield* fs.access(gitDir).pipe(
        Effect.mapError(
          () =>
            new StoreNotFoundError({
              gitDir: gitDir,
              message: `Git directory not found: ${gitDir}`,
            }),
        ),
      );
    }

    return new Store({ cwd, database, defaultPointer, gitDir, namespace });
  });

export const layer = (options: Options = {}) => Layer.effect(StoreConfig, make(options));

export type StoreServiceShape = {
  readonly begin: (pointer?: string) => Effect.Effect<Transaction, GitDbError>;
  readonly config: Store;
  readonly currentSnapshotForPointer: (
    pointer: string,
  ) => Effect.Effect<Snapshot | null, GitDbError>;
  readonly deriveRepositoryIdentity: (
    pointer?: string,
  ) => Effect.Effect<RepositoryIdentity | null, GitDbError>;
  readonly diff: (a: string, b: string) => Effect.Effect<ChangeSet, GitDbError>;
  readonly ensureRepositoryIdentity: (
    options?: EnsureRepositoryIdentityOptions,
  ) => Effect.Effect<RepositoryIdentity, GitDbError>;
  readonly get: (path: string, options?: ReadOptions) => Effect.Effect<Document | null, GitDbError>;
  readonly history: (
    from?: string,
    options?: HistoryOptions,
  ) => Effect.Effect<ReadonlyArray<Snapshot>, GitDbError>;
  readonly list: (
    path?: string,
    options?: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Entry>, GitDbError>;
  readonly localPointers: () => Effect.Effect<ReadonlyArray<string>, GitDbError>;
  readonly pointer: (name: string) => Effect.Effect<StorePointer, GitDbError>;
  readonly pointerRef: (pointer: string) => Effect.Effect<string, GitDbError>;
  readonly refPrefix: string;
  readonly remotePointerRef: (remote: string, pointer: string) => Effect.Effect<string, GitDbError>;
  readonly remoteRefPrefix: (remote: string) => Effect.Effect<string, GitDbError>;
  readonly resolveSnapshotId: (from?: string) => Effect.Effect<string | null, GitDbError>;
  readonly snapshot: (id: string) => Effect.Effect<Snapshot, GitDbError>;
  readonly sync: (options?: SyncOptions) => Effect.Effect<SyncResult, GitDbError>;
};

export type RepositoryIdentitySource = "adopted-remote" | "created" | "local" | "remote";

export type RepositoryIdentity = {
  readonly ref: string;
  readonly repositoryId: string;
  readonly rootCommitId: string;
  readonly source: RepositoryIdentitySource;
};

export type EnsureRepositoryIdentityOptions = {
  readonly pointer?: string;
  readonly remote?: string;
};

export type StorePointer = {
  readonly begin: () => Effect.Effect<Transaction, GitDbError>;
  readonly current: () => Effect.Effect<Snapshot | null, GitDbError>;
  readonly delete: (options?: MovePointerOptions) => Effect.Effect<void, GitDbError>;
  readonly fork: (targetName: string) => Effect.Effect<StorePointer, GitDbError>;
  readonly forkFrom: (source: string) => Effect.Effect<StorePointer, GitDbError>;
  readonly history: (
    options?: HistoryOptions,
  ) => Effect.Effect<ReadonlyArray<Snapshot>, GitDbError>;
  readonly move: (target: string, options?: MovePointerOptions) => Effect.Effect<void, GitDbError>;
  readonly name: string;
};

export type Transaction = {
  readonly abort: () => Effect.Effect<void, GitDbError>;
  readonly base: Snapshot | null;
  readonly commit: (options?: CommitOptions) => Effect.Effect<Snapshot, GitDbError>;
  readonly delete: (path: string) => Effect.Effect<void, GitDbError>;
  readonly get: (path: string) => Effect.Effect<Document | null, GitDbError>;
  readonly list: (path?: string) => Effect.Effect<ReadonlyArray<Entry>, GitDbError>;
  readonly put: (path: string, value: unknown) => Effect.Effect<void, GitDbError>;
};

export class StoreService extends Context.Service<StoreService, StoreServiceShape>()(
  "@cycle/git-db/StoreService",
) {}

type TransactionState = {
  readonly active: boolean;
  readonly mutations: HashMap.HashMap<string, Tree.PendingMutation>;
};

type StoreRuntime = {
  readonly adapter: StoreGit;
  readonly cache: StoreRuntimeCache;
  readonly config: Store;
  readonly randomBytes: (size: number) => Effect.Effect<Uint8Array, unknown>;
};

type StoreRuntimeCache = {
  readonly commits: Cache.Cache<ObjectId, CommitObject, GitAdapterError>;
  readonly listEntries: Cache.Cache<string, ReadonlyArray<Entry>, GitDbError>;
  readonly trees: Cache.Cache<ObjectId, ReadonlyArray<TreeEntry>, GitAdapterError>;
};

type StateUpdateResult =
  | {
      readonly _tag: "ok";
    }
  | {
      readonly _tag: "error";
      readonly error: GitDbError;
    };

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

type StoreGit = {
  readonly deleteRef: (input: DeleteRefInput) => Effect.Effect<void, GitAdapterError>;
  readonly fetch: (input: FetchInput) => Effect.Effect<void, RemoteFetchError>;
  readonly isAncestor: (
    ancestor: ObjectId,
    descendant: ObjectId,
  ) => Effect.Effect<boolean, GitAdapterError>;
  readonly isCommit: (id: string) => Effect.Effect<boolean, GitAdapterError>;
  readonly listRefs: (prefix: string) => Effect.Effect<ReadonlyArray<GitRef>, GitAdapterError>;
  readonly mergeBase: (a: ObjectId, b: ObjectId) => Effect.Effect<ObjectId | null, GitAdapterError>;
  readonly push: (input: PushInput) => Effect.Effect<void, RemotePushError>;
  readonly readBlob: (id: ObjectId) => Effect.Effect<Uint8Array, GitAdapterError>;
  readonly readCommit: (id: ObjectId) => Effect.Effect<CommitObject, GitAdapterError>;
  readonly readRef: (name: string) => Effect.Effect<ObjectId | null, GitAdapterError>;
  readonly rootCommits: (
    start: ObjectId,
  ) => Effect.Effect<ReadonlyArray<ObjectId>, GitAdapterError>;
  readonly readTree: (id: ObjectId) => Effect.Effect<ReadonlyArray<TreeEntry>, GitAdapterError>;
  readonly updateRef: (input: UpdateRefInput) => Effect.Effect<void, GitAdapterError>;
  readonly writeBlob: (bytes: Uint8Array) => Effect.Effect<ObjectId, GitAdapterError>;
  readonly writeCommit: (input: WriteCommitInput) => Effect.Effect<ObjectId, GitAdapterError>;
  readonly writeTree: (
    entries: ReadonlyArray<TreeEntry>,
  ) => Effect.Effect<ObjectId, GitAdapterError>;
};

export const live = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const config = yield* StoreConfig;
    const crypto = yield* Crypto.Crypto;
    const git = yield* Git;
    const baseAdapter = bindGitAdapter(git, config);
    let listEntriesLookup: (key: string) => Effect.Effect<ReadonlyArray<Entry>, GitDbError> =
      uninitializedStructureCache("listEntries");
    const cache = yield* makeStoreRuntimeCache(baseAdapter, {
      listEntries: (key) => listEntriesLookup(key),
    });
    const adapter = cacheGitAdapter(baseAdapter, cache);
    const runtime: StoreRuntime = {
      adapter,
      cache,
      config,
      randomBytes: (size) => crypto.randomBytes(size),
    };
    const store = makeStore(runtime);

    listEntriesLookup = (key) => {
      const decoded = decodeStructureCacheKey(key);

      return listStoreEntriesAtSnapshotUncached(store, runtime, decoded.snapshotId, decoded.path);
    };

    return store;
  }),
);

const bindGitAdapter = (git: GitService, config: Store): StoreGit => ({
  deleteRef: (input) =>
    gitDbOperation("pointer.delete", config, git.deleteRef(config, input), { ref: input.ref }),
  fetch: (input) =>
    gitDbOperation("transport.fetch", config, git.fetch(config, input), { remote: input.remote }),
  isAncestor: (ancestor, descendant) =>
    gitDbOperation("conflict.isAncestor", config, git.isAncestor(config, ancestor, descendant), {
      ancestor,
      descendant,
    }),
  isCommit: (id) => gitDbOperation("snapshot.isCommit", config, git.isCommit(config, id), { id }),
  listRefs: (prefix) =>
    gitDbOperation("pointer.list", config, git.listRefs(config, prefix), { prefix }),
  mergeBase: (a, b) =>
    gitDbOperation("conflict.mergeBase", config, git.mergeBase(config, a, b), {
      left: a,
      right: b,
    }),
  push: (input) =>
    gitDbOperation("transport.push", config, git.push(config, input), { remote: input.remote }),
  readBlob: (id) => gitDbOperation("blob.read", config, git.readBlob(config, id), { id }),
  readCommit: (id) => gitDbOperation("commit.read", config, git.readCommit(config, id), { id }),
  readRef: (name) =>
    gitDbOperation("pointer.read", config, git.readRef(config, name), { ref: name }),
  rootCommits: (start) =>
    gitDbOperation("commit.roots", config, git.rootCommits(config, start), { start }),
  readTree: (id) => gitDbOperation("tree.read", config, git.readTree(config, id), { id }),
  updateRef: (input) =>
    gitDbOperation("pointer.update", config, git.updateRef(config, input), { ref: input.ref }),
  writeBlob: (bytes) =>
    gitDbOperation("blob.write", config, git.writeBlob(config, bytes), { bytes: bytes.byteLength }),
  writeCommit: (input) =>
    gitDbOperation("commit.write", config, git.writeCommit(config, input), {
      parents: input.parents?.length ?? 0,
    }),
  writeTree: (entries) =>
    gitDbOperation("tree.write", config, git.writeTree(config, entries), {
      entries: entries.length,
    }),
});

const gitDbOperation = <A, E, R>(
  operation: string,
  config: Store,
  effect: Effect.Effect<A, E, R>,
  attributes: Readonly<Record<string, unknown>> = {},
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.withSpan(`git-db.${operation}`, {
      attributes: {
        "gitdb.database": config.database,
        "gitdb.gitDir": config.gitDir,
        "gitdb.namespace": config.namespace,
        "gitdb.operation": operation,
        service: "@cycle/git-db",
        ...attributes,
      },
    }),
    Effect.annotateLogs({
      database: config.database,
      gitDir: config.gitDir,
      namespace: config.namespace,
      operation,
      service: "@cycle/git-db",
      ...attributes,
    }),
  );

const makeStoreRuntimeCache = (
  adapter: StoreGit,
  structureLookup: {
    readonly listEntries: (key: string) => Effect.Effect<ReadonlyArray<Entry>, GitDbError>;
  },
): Effect.Effect<StoreRuntimeCache> =>
  Effect.gen(function* () {
    const commits = yield* Cache.make<ObjectId, CommitObject, GitAdapterError>({
      capacity: 4096,
      lookup: (id) => adapter.readCommit(id),
    });
    const trees = yield* Cache.make<ObjectId, ReadonlyArray<TreeEntry>, GitAdapterError>({
      capacity: 8192,
      lookup: (id) =>
        adapter
          .readTree(id)
          .pipe(Effect.map((entries) => [...entries].sort((a, b) => a.name.localeCompare(b.name)))),
    });

    return {
      commits,
      listEntries: yield* Cache.make<string, ReadonlyArray<Entry>, GitDbError>({
        capacity: 8192,
        lookup: structureLookup.listEntries,
      }),
      trees,
    };
  });

const uninitializedStructureCache =
  (name: string) =>
  (key: string): Effect.Effect<ReadonlyArray<Entry>, never> =>
    Effect.die(new Error(`Store structure cache ${name} was read before initialization: ${key}`));

const cacheGitAdapter = (adapter: StoreGit, cache: StoreRuntimeCache): StoreGit => ({
  ...adapter,
  readCommit: (id) => Cache.get(cache.commits, id),
  readTree: (id) => Cache.get(cache.trees, id),
  writeTree: (entries) =>
    adapter.writeTree(entries).pipe(
      Effect.tap((id) =>
        Cache.set(
          cache.trees,
          id,
          [...entries].sort((a, b) => a.name.localeCompare(b.name)),
        ),
      ),
    ),
});

const makeStore = (runtime: StoreRuntime): StoreServiceShape => {
  const { adapter, config } = runtime;
  const refPrefix = `${config.namespace}/${config.database}`;

  const store: StoreServiceShape = {
    begin: (pointer = config.defaultPointer) =>
      Effect.gen(function* () {
        const storePointer = yield* store.pointer(pointer);
        return yield* storePointer.begin();
      }),
    config,
    currentSnapshotForPointer: (pointer) =>
      Effect.gen(function* () {
        const pointerName = yield* validatePointerName(pointer);
        const ref = `${refPrefix}/${pointerName}`;
        const snapshotId = yield* adapter.readRef(ref);

        return snapshotId ? yield* store.snapshot(snapshotId) : null;
      }),
    deriveRepositoryIdentity: (pointer = config.defaultPointer) =>
      Effect.gen(function* () {
        const pointerName = yield* validatePointerName(pointer);
        const ref = `${refPrefix}/${pointerName}`;
        const snapshotId = yield* adapter.readRef(ref);

        if (snapshotId === null) return null;

        const rootCommitId = yield* rootCommitForSnapshot(runtime, pointerName, snapshotId);

        return repositoryIdentity(ref, rootCommitId, "local");
      }),
    diff: (a, b) =>
      Effect.gen(function* () {
        const snapshotA = yield* snapshotOrResolve(store, a);
        const snapshotB = yield* snapshotOrResolve(store, b);
        return yield* diffSnapshotTrees(adapter, snapshotA.root, snapshotB.root);
      }),
    ensureRepositoryIdentity: (options: EnsureRepositoryIdentityOptions = {}) =>
      ensureRepositoryIdentity(store, runtime, options),
    get: (path, options: ReadOptions = {}) =>
      Effect.gen(function* () {
        const normalizedPath = yield* normalizeStorePath(path);
        const snapshotId = yield* store.resolveSnapshotId(options.from);

        if (snapshotId === null) return null;

        const snapshot = yield* store.snapshot(snapshotId);
        const entry = yield* Tree.entryAtPath(adapter, snapshot.root, normalizedPath);

        if (entry === null || entry.type !== "blob") return null;

        const bytes = yield* adapter.readBlob(entry.objectId);

        return new Document({
          bytes,
          objectId: entry.objectId,
          path: normalizedPath,
        });
      }),
    history: (from = config.defaultPointer, options: HistoryOptions = {}) =>
      Effect.gen(function* () {
        const start = yield* store.resolveSnapshotId(options.from ?? from);

        if (start === null) return [];

        const max = options.max ?? Number.POSITIVE_INFINITY;
        const since = options.since ? new Date(options.since).getTime() : undefined;
        const until = options.until ? new Date(options.until).getTime() : undefined;
        const pathFilter = options.path ? yield* normalizeStorePath(options.path) : undefined;
        const seen = new Set<string>();
        const stack = [start];
        const snapshots: Array<Snapshot> = [];

        while (stack.length > 0 && snapshots.length < max) {
          const id = stack.shift();

          if (id === undefined || seen.has(id)) continue;

          seen.add(id);

          const snapshot = yield* store.snapshot(id);

          for (const parent of snapshot.parents) {
            if (!seen.has(parent)) stack.push(parent);
          }

          const createdAt = snapshot.createdAt ? new Date(snapshot.createdAt).getTime() : undefined;
          const inRange =
            (since === undefined || createdAt === undefined || createdAt >= since) &&
            (until === undefined || createdAt === undefined || createdAt <= until);

          if (!inRange) continue;

          if (
            pathFilter !== undefined &&
            !(yield* snapshotTouchesPath(store, adapter, snapshot, pathFilter))
          ) {
            continue;
          }

          snapshots.push(snapshot);
        }

        return snapshots;
      }),
    list: (path = "", options: ReadOptions = {}) => listStoreEntries(store, runtime, path, options),
    localPointers: () =>
      adapter.listRefs(`${refPrefix}/`).pipe(
        Effect.map((refs) =>
          refs
            .map((ref) => ref.name.slice(`${refPrefix}/`.length))
            .filter((name) => isValidPointerName(name))
            .sort(),
        ),
      ),
    pointer: (name) =>
      validatePointerName(name).pipe(
        Effect.map((pointerName) => makeStorePointer(store, runtime, pointerName)),
      ),
    pointerRef: (pointer) =>
      validatePointerName(pointer).pipe(Effect.map((name) => `${refPrefix}/${name}`)),
    refPrefix,
    remotePointerRef: (remote, pointer) =>
      Effect.gen(function* () {
        const remotePrefix = yield* store.remoteRefPrefix(remote);
        const pointerName = yield* validatePointerName(pointer);

        return `${remotePrefix}/${pointerName}`;
      }),
    remoteRefPrefix: (remote) =>
      validateRemoteName(remote).pipe(
        Effect.map((remoteName) => `${refPrefix}/remotes/${remoteName}`),
      ),
    resolveSnapshotId: (from) =>
      Effect.gen(function* () {
        const source = from ?? config.defaultPointer;

        if (isValidPointerName(source)) {
          const pointerSnapshot = yield* adapter.readRef(`${refPrefix}/${source}`);

          if (pointerSnapshot !== null) return pointerSnapshot;
        }

        if (isPotentialObjectId(source) && (yield* adapter.isCommit(source))) {
          return source;
        }

        return null;
      }),
    snapshot: (id) =>
      gitDbOperation(
        "snapshot.read",
        config,
        Effect.gen(function* () {
          if (!(yield* adapter.isCommit(id))) {
            return yield* new SnapshotNotFoundError({
              snapshot: id,
              message: `Snapshot not found: ${id}`,
            });
          }

          const commit = yield* adapter.readCommit(id);
          const message = commit.message.trimEnd();

          return {
            author: commit.author,
            committer: commit.committer,
            createdAt: commit.committer?.date ?? commit.author?.date,
            id,
            message: message.length > 0 ? message : undefined,
            parents: commit.parents,
            root: commit.tree,
          };
        }),
        { snapshot: id },
      ),
    sync: (options: SyncOptions = {}) =>
      gitDbOperation("sync", config, sync(store, runtime, options), {
        mode: options.mode ?? "full",
        pointers: options.pointers?.length ?? null,
        remote: options.remote ?? "origin",
      }),
  };

  return store;
};

const repositoryIdentity = (
  ref: string,
  rootCommitId: string,
  source: RepositoryIdentitySource,
): RepositoryIdentity => {
  const normalized = rootCommitId.toLowerCase();

  return {
    ref,
    repositoryId: `repo_${normalized.slice(0, 5)}`,
    rootCommitId: normalized,
    source,
  };
};

const rootCommitForSnapshot = (
  runtime: StoreRuntime,
  pointer: string,
  snapshotId: string,
): Effect.Effect<string, GitDbError> =>
  Effect.gen(function* () {
    const roots = (yield* runtime.adapter.rootCommits(snapshotId))
      .map((root) => root.toLowerCase())
      .sort();

    if (roots.length === 1) return roots[0]!;

    const reason = roots.length === 0 ? "no-root" : "multiple-roots";

    return yield* new RepositoryIdentityConflictError({
      message: repositoryIdentityConflictMessage({ pointer, reason, roots }),
      pointer,
      reason,
      roots,
    });
  });

const repositoryIdentityConflictMessage = (input: {
  readonly localRoot?: string;
  readonly pointer: string;
  readonly reason: string;
  readonly remoteRoot?: string;
  readonly repositoryId?: string;
  readonly roots?: ReadonlyArray<string>;
}): string => {
  if (input.reason === "multiple-roots") {
    return `Repository identity conflict for ${input.pointer}: multiple roots ${
      input.roots?.join(", ") ?? "<unknown>"
    }`;
  }

  if (input.reason === "root-mismatch") {
    return `Repository identity conflict for ${input.pointer}: local root ${
      input.localRoot ?? "<missing>"
    }, remote root ${input.remoteRoot ?? "<missing>"}`;
  }

  if (input.reason === "id-collision") {
    return `Repository identity collision for ${input.repositoryId ?? "<unknown>"}`;
  }

  return `Repository identity conflict for ${input.pointer}: ${input.reason}`;
};

const randomSeedHex = (runtime: StoreRuntime): Effect.Effect<string, GitDbError> =>
  runtime.randomBytes(16).pipe(
    Effect.map(bytesToHex),
    Effect.mapError(
      (cause) =>
        new GitAdapterError({
          operation: "gitdb identity seed",
          message: "Unable to generate repository identity seed.",
          cause,
        }),
    ),
  );

const createBootstrapRoot = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  pointer: string,
): Effect.Effect<Snapshot, GitDbError> =>
  Effect.gen(function* () {
    const seed = yield* randomSeedHex(runtime);
    const transaction = yield* store.begin(pointer);

    return yield* transaction.commit({
      expectedSnapshot: null,
      message: `Initialize Cycle GitDB\n\nSeed: ${seed}`,
    });
  });

const ensureRepositoryIdentity = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  options: EnsureRepositoryIdentityOptions,
): Effect.Effect<RepositoryIdentity, GitDbError> =>
  Effect.gen(function* () {
    const pointer = yield* validatePointerName(options.pointer ?? runtime.config.defaultPointer);
    const localRef = yield* store.pointerRef(pointer);
    const localBefore = yield* runtime.adapter.readRef(localRef);
    const remote =
      options.remote === undefined ? undefined : yield* validateRemoteName(options.remote);
    let remoteFetchFailed = false;

    if (remote !== undefined) {
      const remoteRef = yield* store.remotePointerRef(remote, pointer);
      const remotePrefix = yield* store.remoteRefPrefix(remote);
      const fetched = yield* runtime.adapter
        .fetch({
          prune: true,
          refspecs: [`+${store.refPrefix}/*:${remotePrefix}/*`],
          remote,
        })
        .pipe(
          Effect.andThen(runtime.adapter.readRef(remoteRef)),
          Effect.matchEffect({
            onFailure: () =>
              Effect.sync(() => {
                remoteFetchFailed = true;
                return null;
              }),
            onSuccess: (snapshotId) => Effect.succeed(snapshotId),
          }),
        );

      if (fetched !== null) {
        const remoteRoot = yield* rootCommitForSnapshot(runtime, pointer, fetched);

        if (localBefore === null) {
          yield* movePointerRef(runtime, localRef, fetched, null, pointer);
          return repositoryIdentity(localRef, remoteRoot, "remote");
        }

        const localRoot = yield* rootCommitForSnapshot(runtime, pointer, localBefore);

        if (localRoot !== remoteRoot) {
          return yield* new RepositoryIdentityConflictError({
            localRoot,
            message: repositoryIdentityConflictMessage({
              localRoot,
              pointer,
              reason: "root-mismatch",
              remoteRoot,
            }),
            pointer,
            reason: "root-mismatch",
            remoteRoot,
          });
        }

        return repositoryIdentity(localRef, localRoot, "local");
      }
    }

    if (localBefore !== null) {
      const localRoot = yield* rootCommitForSnapshot(runtime, pointer, localBefore);
      return repositoryIdentity(localRef, localRoot, "local");
    }

    const created = yield* createBootstrapRoot(store, runtime, pointer);
    const createdIdentity = repositoryIdentity(localRef, created.id, "created");

    if (remote === undefined || remoteFetchFailed) return createdIdentity;

    const remoteRef = yield* store.remotePointerRef(remote, pointer);
    const remotePrefix = yield* store.remoteRefPrefix(remote);
    const pushed = yield* runtime.adapter
      .push({
        forceWithLease: [{ expected: null, ref: localRef }],
        refspecs: [`${localRef}:${localRef}`],
        remote,
      })
      .pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.succeed({
              _tag: "failed" as const,
              error,
            }),
          onSuccess: () =>
            Effect.succeed({
              _tag: "pushed" as const,
            }),
        }),
      );

    if (pushed._tag === "pushed") return createdIdentity;

    const remoteAfter = yield* runtime.adapter
      .fetch({
        prune: true,
        refspecs: [`+${store.refPrefix}/*:${remotePrefix}/*`],
        remote,
      })
      .pipe(Effect.andThen(runtime.adapter.readRef(remoteRef)));

    if (remoteAfter === null) {
      return yield* pushed.error;
    }

    yield* movePointerRef(runtime, localRef, remoteAfter, created.id, pointer);
    const remoteRoot = yield* rootCommitForSnapshot(runtime, pointer, remoteAfter);

    return repositoryIdentity(localRef, remoteRoot, "adopted-remote");
  });

const makeStorePointer = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  name: string,
): StorePointer => {
  const { adapter } = runtime;

  const pointer: StorePointer = {
    begin: () =>
      Effect.gen(function* () {
        const base = yield* pointer.current();
        return yield* makeTransaction(store, runtime, name, base);
      }),
    current: () => store.currentSnapshotForPointer(name),
    delete: (options: MovePointerOptions = {}) =>
      gitDbOperation(
        "pointer.delete",
        runtime.config,
        Effect.gen(function* () {
          const ref = yield* store.pointerRef(name);
          const hasExpected = Object.hasOwn(options, "expectedSnapshot");
          const input = hasExpected ? { expected: options.expectedSnapshot ?? null, ref } : { ref };

          yield* adapter.deleteRef(input).pipe(
            Effect.catch((error) =>
              hasExpected
                ? adapter.readRef(ref).pipe(
                    Effect.flatMap((actual) =>
                      Effect.fail(
                        new PointerConflictError({
                          actual,
                          cause: error,
                          expected: options.expectedSnapshot ?? null,
                          message: `Pointer conflict for ${name}: expected ${
                            options.expectedSnapshot ?? "<missing>"
                          }, actual ${actual ?? "<missing>"}`,
                          pointer: name,
                        }),
                      ),
                    ),
                  )
                : Effect.fail(error),
            ),
          );
        }),
        {
          expectedSnapshot: Object.hasOwn(options, "expectedSnapshot")
            ? (options.expectedSnapshot ?? null)
            : null,
          pointer: name,
        },
      ),
    fork: (targetName) =>
      Effect.gen(function* () {
        const current = yield* pointer.current();

        if (current === null) {
          return yield* new PointerNotFoundError({
            pointer: name,
            message: `Pointer not found: ${name}`,
          });
        }

        const target = yield* store.pointer(targetName);
        const targetRef = yield* store.pointerRef(target.name);

        yield* movePointerRef(runtime, targetRef, current.id, null, target.name);

        return target;
      }),
    forkFrom: (source) =>
      Effect.gen(function* () {
        const snapshotId = yield* store.resolveSnapshotId(source);

        if (snapshotId === null) {
          return yield* new PointerNotFoundError({
            pointer: source,
            message: `Pointer not found: ${source}`,
          });
        }

        const ref = yield* store.pointerRef(name);
        yield* movePointerRef(runtime, ref, snapshotId, null, name);

        return pointer;
      }),
    history: (options: HistoryOptions = {}) => store.history(name, options),
    move: (target, options: MovePointerOptions = {}) =>
      gitDbOperation(
        "pointer.move",
        runtime.config,
        Effect.gen(function* () {
          if (!(yield* adapter.isCommit(target))) {
            return yield* new SnapshotNotFoundError({
              snapshot: target,
              message: `Snapshot not found: ${target}`,
            });
          }

          const current = yield* pointer.current();
          const expected = Object.hasOwn(options, "expectedSnapshot")
            ? (options.expectedSnapshot ?? null)
            : (current?.id ?? null);
          const ref = yield* store.pointerRef(name);

          yield* movePointerRef(runtime, ref, target, expected, name);
        }),
        {
          pointer: name,
          target,
        },
      ),
    name,
  };

  return pointer;
};

const makeTransaction = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  pointer: string,
  base: Snapshot | null,
): Effect.Effect<Transaction, GitDbError> =>
  Effect.gen(function* () {
    const state = yield* TxRef.make<TransactionState>({
      active: true,
      mutations: HashMap.empty(),
    });

    const tx: Transaction = {
      abort: () =>
        TxRef.set(state, {
          active: false,
          mutations: HashMap.empty(),
        }),
      base,
      commit: (options: CommitOptions = {}) =>
        gitDbOperation(
          "transaction.commit",
          runtime.config,
          Effect.gen(function* () {
            const currentState = yield* getActiveState(state);
            const expected = Object.hasOwn(options, "expectedSnapshot")
              ? (options.expectedSnapshot ?? null)
              : (base?.id ?? null);
            const targetPointer = options.pointer ?? pointer;

            if (HashMap.size(currentState.mutations) === 0 && base !== null) {
              yield* assertPointerCurrent(store, runtime, pointer, expected);
              yield* TxRef.set(state, {
                active: false,
                mutations: HashMap.empty(),
              });

              return base;
            }

            const root = yield* materialize(runtime, base, currentState);
            const tree = yield* Tree.writeMutableTree(runtime.adapter, root);
            const snapshotId = yield* runtime.adapter.writeCommit({
              author: options.author,
              committer: options.committer,
              message: options.message,
              parents: base === null ? [] : [base.id],
              tree,
            });
            const targetRef = yield* store.pointerRef(targetPointer);

            yield* movePointerRef(runtime, targetRef, snapshotId, expected, targetPointer);
            yield* TxRef.set(state, {
              active: false,
              mutations: HashMap.empty(),
            });

            return yield* store.snapshot(snapshotId);
          }),
          {
            baseSnapshot: base?.id ?? null,
            pointer: options.pointer ?? pointer,
          },
        ),
      delete: (path) =>
        Effect.gen(function* () {
          const normalizedPath = yield* normalizeStorePath(path);
          const mutationPath = yield* rejectEmptyMutationPath(normalizedPath);

          yield* recordMutation(state, mutationPath, { kind: "delete" });
        }),
      get: (path) =>
        Effect.gen(function* () {
          const normalizedPath = yield* normalizeStorePath(path);
          const currentState = yield* getActiveState(state);
          const direct = HashMap.get(currentState.mutations, normalizedPath);

          if (!hasOverlappingMutation(currentState.mutations, normalizedPath)) {
            if (Option.isSome(direct) && direct.value.kind === "delete") return null;
            if (Option.isSome(direct) && direct.value.kind === "put") {
              return new Document({
                bytes: direct.value.bytes,
                objectId: "",
                path: normalizedPath,
              });
            }

            return yield* readBaseDocument(runtime, base, normalizedPath);
          }

          const root = yield* materialize(runtime, base, currentState);
          const node = yield* Tree.nodeAtPath(
            runtime.adapter,
            root,
            normalizedPath.split("/").filter(Boolean),
          );

          if (node === null || node.kind !== "blob") return null;

          const bytes =
            node.bytes ??
            (node.objectId !== undefined
              ? yield* runtime.adapter.readBlob(node.objectId)
              : new Uint8Array());

          return new Document({
            bytes,
            objectId: node.objectId ?? "",
            path: normalizedPath,
          });
        }),
      list: (path = "") =>
        Effect.gen(function* () {
          const normalizedPath = yield* normalizeStorePath(path);
          const currentState = yield* getActiveState(state);
          const root = yield* materialize(runtime, base, currentState);
          const node = normalizedPath
            ? yield* Tree.nodeAtPath(
                runtime.adapter,
                root,
                normalizedPath.split("/").filter(Boolean),
              )
            : root;

          if (node === null || node.kind !== "tree") return [];

          return [...(yield* Tree.entriesOf(runtime.adapter, node))]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([entryName, entry]) => ({
              mode: entry.kind === "tree" ? "040000" : entry.mode,
              name: entryName,
              objectId: entry.objectId ?? "",
              path: joinStorePath(normalizedPath, entryName),
              type: entry.kind === "tree" ? "tree" : "blob",
            }));
        }),
      put: (path, value) =>
        Effect.gen(function* () {
          const normalizedPath = yield* normalizeStorePath(path);
          const mutationPath = yield* rejectEmptyMutationPath(normalizedPath);
          const bytes = yield* encodeValue(value);

          yield* recordMutation(state, mutationPath, {
            bytes,
            kind: "put",
          });
        }),
    };

    return tx;
  });

const changeFinalObjectId = (change: Change): ObjectId | null => change.newObjectId ?? null;

const changesInSet = (changeSet: ChangeSet): ReadonlyArray<Change> => [
  ...changeSet.added,
  ...changeSet.modified,
  ...changeSet.deleted,
];

const pathContains = (parent: string, child: string): boolean => child.startsWith(`${parent}/`);

const changesConflict = (local: Change, remote: Change): boolean => {
  if (local.path === remote.path) {
    return changeFinalObjectId(local) !== changeFinalObjectId(remote);
  }

  return pathContains(local.path, remote.path) || pathContains(remote.path, local.path);
};

const hasMergeConflict = (local: ChangeSet, remote: ChangeSet): boolean => {
  const localChanges = changesInSet(local);
  const remoteChanges = changesInSet(remote);

  for (const localChange of localChanges) {
    if (remoteChanges.some((remoteChange) => changesConflict(localChange, remoteChange))) {
      return true;
    }
  }

  return false;
};

const applyChangesToTree = (
  runtime: StoreRuntime,
  root: Tree.MutableTree,
  changes: ChangeSet,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    for (const change of changesInSet(changes)) {
      if (change.newObjectId === undefined) {
        yield* Tree.applyMutation(runtime.adapter, root, change.path, { kind: "delete" });
        continue;
      }

      yield* Tree.applyMutation(runtime.adapter, root, change.path, {
        bytes: yield* runtime.adapter.readBlob(change.newObjectId),
        kind: "put",
      });
    }
  });

const mergeDivergedPointer = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  options: {
    readonly localBefore: ObjectId;
    readonly localRef: string;
    readonly mergeBase: ObjectId;
    readonly pointer: string;
    readonly remote: string;
    readonly remoteBefore: ObjectId;
  },
): Effect.Effect<ObjectId, GitDbError> =>
  Effect.gen(function* () {
    const localChanges = yield* store.diff(options.mergeBase, options.localBefore);
    const remoteChanges = yield* store.diff(options.mergeBase, options.remoteBefore);

    if (hasMergeConflict(localChanges, remoteChanges)) {
      return yield* new SyncConflictError({
        pointer: options.pointer,
        localSnapshot: options.localBefore,
        remoteSnapshot: options.remoteBefore,
        mergeBase: options.mergeBase,
        message: `Sync conflict for ${options.pointer}: local ${options.localBefore}, remote ${options.remoteBefore}`,
      });
    }

    const remoteSnapshot = yield* store.snapshot(options.remoteBefore);
    const root = yield* Tree.loadMutableTree(runtime.adapter, remoteSnapshot.root);

    yield* applyChangesToTree(runtime, root, localChanges);

    const tree = yield* Tree.writeMutableTree(runtime.adapter, root);
    const snapshotId = yield* runtime.adapter.writeCommit({
      message: `Merge GitDB pointer ${options.pointer}`,
      parents: [options.remoteBefore, options.localBefore],
      tree,
    });

    yield* movePointerRef(
      runtime,
      options.localRef,
      snapshotId,
      options.localBefore,
      options.pointer,
    );
    yield* runtime.adapter.push({
      refspecs: [`${options.localRef}:${options.localRef}`],
      remote: options.remote,
    });

    return snapshotId;
  });

const localSnapshotsSince = (
  store: StoreServiceShape,
  options: {
    readonly fromExclusive: ObjectId;
    readonly pointer: string;
    readonly toInclusive: ObjectId;
  },
): Effect.Effect<ReadonlyArray<Snapshot>, GitDbError> =>
  Effect.gen(function* () {
    const snapshots: Array<Snapshot> = [];
    let current = options.toInclusive;

    while (current !== options.fromExclusive) {
      const snapshot = yield* store.snapshot(current);
      snapshots.push(snapshot);

      const parent = snapshot.parents[0];
      if (parent === undefined) {
        return yield* new SyncConflictError({
          pointer: options.pointer,
          localSnapshot: options.toInclusive,
          remoteSnapshot: options.fromExclusive,
          message: `Sync conflict for ${options.pointer}: local ${options.toInclusive}, remote ${options.fromExclusive}`,
        });
      }

      current = parent;
    }

    return snapshots.reverse();
  });

const rebaseDivergedPointer = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  options: {
    readonly localBefore: ObjectId;
    readonly localRef: string;
    readonly mergeBase: ObjectId;
    readonly pointer: string;
    readonly remote: string;
    readonly remoteBefore: ObjectId;
  },
): Effect.Effect<ObjectId, GitDbError> =>
  Effect.gen(function* () {
    const localChanges = yield* store.diff(options.mergeBase, options.localBefore);
    const remoteChanges = yield* store.diff(options.mergeBase, options.remoteBefore);

    if (hasMergeConflict(localChanges, remoteChanges)) {
      return yield* new SyncConflictError({
        pointer: options.pointer,
        localSnapshot: options.localBefore,
        remoteSnapshot: options.remoteBefore,
        mergeBase: options.mergeBase,
        message: `Sync conflict for ${options.pointer}: local ${options.localBefore}, remote ${options.remoteBefore}`,
      });
    }

    const localSnapshots = yield* localSnapshotsSince(store, {
      fromExclusive: options.mergeBase,
      pointer: options.pointer,
      toInclusive: options.localBefore,
    });
    let rebasedSnapshotId = options.remoteBefore;

    for (const snapshot of localSnapshots) {
      const originalParent = snapshot.parents[0] ?? options.mergeBase;
      const changes = yield* store.diff(originalParent, snapshot.id);
      const base = yield* store.snapshot(rebasedSnapshotId);
      const root = yield* Tree.loadMutableTree(runtime.adapter, base.root);

      yield* applyChangesToTree(runtime, root, changes);

      const tree = yield* Tree.writeMutableTree(runtime.adapter, root);
      rebasedSnapshotId = yield* runtime.adapter.writeCommit({
        author: snapshot.author,
        committer: snapshot.committer,
        message: snapshot.message,
        parents: [rebasedSnapshotId],
        tree,
      });
    }

    yield* movePointerRef(
      runtime,
      options.localRef,
      rebasedSnapshotId,
      options.localBefore,
      options.pointer,
    );
    yield* runtime.adapter.push({
      refspecs: [`${options.localRef}:${options.localRef}`],
      remote: options.remote,
    });

    return rebasedSnapshotId;
  });

const sync = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  options: SyncOptions,
): Effect.Effect<SyncResult, GitDbError> =>
  Effect.gen(function* () {
    const remote = yield* validateRemoteName(options.remote ?? "origin");
    const mode = options.mode ?? "full";
    const divergence = options.onDiverged ?? "error";
    const pointerNames = options.pointers
      ? yield* Effect.forEach(options.pointers, validatePointerName)
      : yield* store.localPointers();
    const results: Array<PointerSyncResult> = [];
    const fetchesRemote = mode === "fetch" || mode === "pull" || mode === "full";
    const remotePrefix = yield* store.remoteRefPrefix(remote);
    const remoteBeforeFetch = new Map<string, ObjectId | null>();

    if (fetchesRemote) {
      for (const pointer of pointerNames) {
        remoteBeforeFetch.set(
          pointer,
          yield* runtime.adapter.readRef(`${remotePrefix}/${pointer}`),
        );
      }

      yield* runtime.adapter.fetch({
        prune: true,
        refspecs: [`+${store.refPrefix}/*:${remotePrefix}/*`],
        remote,
      });
    }

    for (const pointer of pointerNames) {
      const localRef = yield* store.pointerRef(pointer);
      const remoteRef = yield* store.remotePointerRef(remote, pointer);
      const localBefore = yield* runtime.adapter.readRef(localRef);
      const remoteBefore = yield* runtime.adapter.readRef(remoteRef);
      const trackedRemoteBeforeFetch = remoteBeforeFetch.get(pointer);
      const remoteDeleted =
        fetchesRemote &&
        trackedRemoteBeforeFetch !== undefined &&
        trackedRemoteBeforeFetch !== null &&
        remoteBefore === null;
      const resultBase = {
        localBefore: localBefore ?? undefined,
        pointer,
        remoteBefore: (remoteDeleted ? trackedRemoteBeforeFetch : remoteBefore) ?? undefined,
      };

      if (remoteDeleted) {
        results.push({
          ...resultBase,
          localAfter: localBefore ?? undefined,
          remoteAfter: undefined,
          status: "remote-deleted",
        });
        continue;
      }

      if (localBefore === null && remoteBefore === null) {
        results.push({
          ...resultBase,
          localAfter: undefined,
          remoteAfter: undefined,
          status: "missing-remote-gitdb-ref",
        });
        continue;
      }

      if (localBefore === remoteBefore) {
        results.push({
          ...resultBase,
          localAfter: localBefore ?? undefined,
          remoteAfter: remoteBefore ?? undefined,
          status: "up-to-date",
        });
        continue;
      }

      if (mode === "fetch") {
        results.push({
          ...resultBase,
          localAfter: localBefore ?? undefined,
          remoteAfter: remoteBefore ?? undefined,
          status: "up-to-date",
        });
        continue;
      }

      if (localBefore === null && remoteBefore !== null && (mode === "pull" || mode === "full")) {
        yield* movePointerRef(runtime, localRef, remoteBefore, null, pointer);
        results.push({
          ...resultBase,
          localAfter: remoteBefore,
          remoteAfter: remoteBefore,
          status: "fast-forwarded",
        });
        continue;
      }

      if (localBefore !== null && remoteBefore === null && (mode === "push" || mode === "full")) {
        yield* runtime.adapter.push({
          refspecs: [`${localRef}:${localRef}`],
          remote,
        });
        results.push({
          ...resultBase,
          localAfter: localBefore,
          remoteAfter: localBefore,
          status: "pushed",
        });
        continue;
      }

      if (localBefore === null || remoteBefore === null) {
        results.push({
          ...resultBase,
          localAfter: localBefore ?? undefined,
          remoteAfter: remoteBefore ?? undefined,
          status: "rejected",
        });
        continue;
      }

      const localDescendsFromRemote = yield* runtime.adapter.isAncestor(remoteBefore, localBefore);
      const remoteDescendsFromLocal = yield* runtime.adapter.isAncestor(localBefore, remoteBefore);

      if (remoteDescendsFromLocal && (mode === "pull" || mode === "full")) {
        yield* movePointerRef(runtime, localRef, remoteBefore, localBefore, pointer);
        results.push({
          ...resultBase,
          localAfter: remoteBefore,
          remoteAfter: remoteBefore,
          status: "fast-forwarded",
        });
        continue;
      }

      if (remoteDescendsFromLocal && mode === "push") {
        results.push({
          ...resultBase,
          localAfter: localBefore,
          remoteAfter: remoteBefore,
          status: "rejected",
        });
        continue;
      }

      if (localDescendsFromRemote && (mode === "push" || mode === "full")) {
        yield* runtime.adapter.push({
          refspecs: [`${localRef}:${localRef}`],
          remote,
        });
        results.push({
          ...resultBase,
          localAfter: localBefore,
          remoteAfter: localBefore,
          status: "pushed",
        });
        continue;
      }

      if (localDescendsFromRemote && mode === "pull") {
        results.push({
          ...resultBase,
          localAfter: localBefore,
          remoteAfter: remoteBefore,
          status: "up-to-date",
        });
        continue;
      }

      if (divergence === "keep-local") {
        yield* runtime.adapter.push({
          refspecs: [`+${localRef}:${localRef}`],
          remote,
        });
        results.push({
          ...resultBase,
          localAfter: localBefore,
          remoteAfter: localBefore,
          status: "pushed",
        });
        continue;
      }

      if (divergence === "keep-remote") {
        yield* movePointerRef(runtime, localRef, remoteBefore, localBefore, pointer);
        results.push({
          ...resultBase,
          localAfter: remoteBefore,
          remoteAfter: remoteBefore,
          status: "fast-forwarded",
        });
        continue;
      }

      const mergeBase = yield* runtime.adapter.mergeBase(localBefore, remoteBefore);

      if (divergence === "merge" && mergeBase !== null) {
        const snapshotId = yield* mergeDivergedPointer(store, runtime, {
          localBefore,
          localRef,
          mergeBase,
          pointer,
          remote,
          remoteBefore,
        });

        results.push({
          ...resultBase,
          localAfter: snapshotId,
          remoteAfter: snapshotId,
          status: "merged",
        });
        continue;
      }

      if (divergence === "rebase" && mergeBase !== null) {
        const snapshotId = yield* rebaseDivergedPointer(store, runtime, {
          localBefore,
          localRef,
          mergeBase,
          pointer,
          remote,
          remoteBefore,
        });

        results.push({
          ...resultBase,
          localAfter: snapshotId,
          remoteAfter: snapshotId,
          status: "rebased",
        });
        continue;
      }

      return yield* new SyncConflictError({
        pointer: pointer,
        localSnapshot: localBefore,
        remoteSnapshot: remoteBefore,
        mergeBase: mergeBase ?? undefined,
        message: `Sync conflict for ${pointer}: local ${localBefore}, remote ${remoteBefore}`,
      });
    }

    return {
      pointers: results,
      remote,
    };
  });

const movePointerRef = (
  runtime: StoreRuntime,
  ref: string,
  target: string,
  expected: string | null,
  pointerName: string,
): Effect.Effect<void, GitDbError> =>
  runtime.adapter
    .updateRef({
      expected,
      ref,
      target,
    })
    .pipe(
      Effect.catch(
        (error): Effect.Effect<void, GitDbError> =>
          runtime.adapter.readRef(ref).pipe(
            Effect.flatMap(
              (actual): Effect.Effect<void, GitDbError> =>
                actual !== expected
                  ? Effect.fail(
                      new PointerConflictError({
                        pointer: pointerName,
                        expected: expected,
                        actual: actual,
                        cause: error,
                        message: `Pointer conflict for ${pointerName}: expected ${expected ?? "<missing>"}, actual ${actual ?? "<missing>"}`,
                      }),
                    )
                  : Effect.fail(error),
            ),
          ),
      ),
    );

const assertPointerCurrent = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  pointer: string,
  expected: string | null,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    const ref = yield* store.pointerRef(pointer);
    const actual = yield* runtime.adapter.readRef(ref);

    if (actual !== expected) {
      return yield* new PointerConflictError({
        pointer: pointer,
        expected: expected,
        actual: actual,
        message: `Pointer conflict for ${pointer}: expected ${expected ?? "<missing>"}, actual ${actual ?? "<missing>"}`,
      });
    }
  });

const getActiveState = (
  state: TxRef.TxRef<TransactionState>,
): Effect.Effect<TransactionState, GitDbError> =>
  TxRef.get(state).pipe(
    Effect.flatMap((current) =>
      current.active
        ? Effect.succeed(current)
        : Effect.fail(new TransactionInactiveError({ message: "Transaction is no longer active" })),
    ),
  );

const recordMutation = (
  state: TxRef.TxRef<TransactionState>,
  path: string,
  mutation: Tree.PendingMutation,
): Effect.Effect<void, GitDbError> =>
  TxRef.modify(state, (current): [StateUpdateResult, TransactionState] => {
    if (!current.active) {
      return [
        {
          _tag: "error",
          error: new TransactionInactiveError({ message: "Transaction is no longer active" }),
        } satisfies StateUpdateResult,
        current,
      ];
    }

    return [
      { _tag: "ok" } satisfies StateUpdateResult,
      {
        ...current,
        mutations: HashMap.set(current.mutations, path, mutation),
      },
    ];
  }).pipe(
    Effect.flatMap((result) => (result._tag === "ok" ? Effect.void : Effect.fail(result.error))),
  );

const hasOverlappingMutation = (
  mutations: HashMap.HashMap<string, Tree.PendingMutation>,
  path: string,
): boolean => {
  for (const [mutationPath] of mutations) {
    if (mutationPath === path) continue;
    if (mutationPath.startsWith(`${path}/`) || path.startsWith(`${mutationPath}/`)) return true;
  }

  return false;
};

const readBaseDocument = (
  runtime: StoreRuntime,
  base: Snapshot | null,
  path: string,
): Effect.Effect<Document | null, GitDbError> =>
  Effect.gen(function* () {
    if (base === null) return null;

    const entry = yield* Tree.entryAtPath(runtime.adapter, base.root, path);

    if (entry === null || entry.type !== "blob") return null;

    const bytes = yield* runtime.adapter.readBlob(entry.objectId);

    return new Document({
      bytes,
      objectId: entry.objectId,
      path,
    });
  });

const materialize = (
  runtime: StoreRuntime,
  base: Snapshot | null,
  state: TransactionState,
): Effect.Effect<Tree.MutableTree, GitDbError> =>
  gitDbOperation(
    "tree.materialize",
    runtime.config,
    Effect.gen(function* () {
      const root = yield* Tree.loadMutableTree(runtime.adapter, base?.root ?? null);

      for (const [path, mutation] of state.mutations) {
        yield* Tree.applyMutation(runtime.adapter, root, path, mutation);
      }

      return root;
    }),
    {
      baseSnapshot: base?.id ?? null,
      mutations: HashMap.size(state.mutations),
    },
  );

const snapshotOrResolve = (
  store: StoreServiceShape,
  value: string,
): Effect.Effect<Snapshot, GitDbError> =>
  Effect.gen(function* () {
    const id = yield* store.resolveSnapshotId(value);

    if (id === null)
      return yield* new SnapshotNotFoundError({
        snapshot: value,
        message: `Snapshot not found: ${value}`,
      });

    return yield* store.snapshot(id);
  });

const objectIdAtSnapshotPath = (
  store: StoreServiceShape,
  adapter: StoreGit,
  snapshot: Snapshot,
  path: string,
): Effect.Effect<ObjectId | null, GitDbError> =>
  Tree.entryAtPath(adapter, snapshot.root, path).pipe(
    Effect.map((entry) => entry?.objectId ?? null),
  );

const snapshotTouchesPath = (
  store: StoreServiceShape,
  adapter: StoreGit,
  snapshot: Snapshot,
  path: string,
): Effect.Effect<boolean, GitDbError> =>
  Effect.gen(function* () {
    const current = yield* objectIdAtSnapshotPath(store, adapter, snapshot, path);

    if (snapshot.parents.length === 0) return current !== null;

    const parent = yield* store.snapshot(snapshot.parents[0]);
    const previous = yield* objectIdAtSnapshotPath(store, adapter, parent, path);

    return current !== previous;
  });

const diffSnapshotTrees = (
  adapter: StoreGit,
  leftRoot: ObjectId,
  rightRoot: ObjectId,
): Effect.Effect<ChangeSet, GitDbError> =>
  Effect.gen(function* () {
    const changes: {
      added: Array<Change>;
      deleted: Array<Change>;
      modified: Array<Change>;
    } = {
      added: [],
      deleted: [],
      modified: [],
    };

    yield* diffTreeEntries(adapter, leftRoot, rightRoot, "", changes);

    return {
      added: changes.added.sort(compareChangesByPath),
      deleted: changes.deleted.sort(compareChangesByPath),
      modified: changes.modified.sort(compareChangesByPath),
    };
  });

const diffTreeEntries = (
  adapter: StoreGit,
  leftTree: ObjectId,
  rightTree: ObjectId,
  prefix: string,
  changes: {
    readonly added: Array<Change>;
    readonly deleted: Array<Change>;
    readonly modified: Array<Change>;
  },
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    if (leftTree === rightTree) return;

    const left = entriesByName(yield* adapter.readTree(leftTree));
    const right = entriesByName(yield* adapter.readTree(rightTree));
    const names = [...new Set([...left.keys(), ...right.keys()])].sort();

    for (const name of names) {
      const leftEntry = left.get(name);
      const rightEntry = right.get(name);
      const path = joinStorePath(prefix, name);

      if (leftEntry === undefined && rightEntry !== undefined) {
        yield* collectAdded(adapter, rightEntry, path, changes.added);
        continue;
      }

      if (leftEntry !== undefined && rightEntry === undefined) {
        yield* collectDeleted(adapter, leftEntry, path, changes.deleted);
        continue;
      }

      if (leftEntry === undefined || rightEntry === undefined) continue;
      if (leftEntry.objectId === rightEntry.objectId && leftEntry.type === rightEntry.type) {
        continue;
      }

      if (leftEntry.type === "tree" && rightEntry.type === "tree") {
        yield* diffTreeEntries(adapter, leftEntry.objectId, rightEntry.objectId, path, changes);
        continue;
      }

      if (leftEntry.type === "blob" && rightEntry.type === "blob") {
        changes.modified.push({
          newObjectId: rightEntry.objectId,
          oldObjectId: leftEntry.objectId,
          path,
        });
        continue;
      }

      yield* collectDeleted(adapter, leftEntry, path, changes.deleted);
      yield* collectAdded(adapter, rightEntry, path, changes.added);
    }
  });

const collectAdded = (
  adapter: StoreGit,
  entry: TreeEntry,
  path: string,
  output: Array<Change>,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    if (entry.type === "blob") {
      output.push({ newObjectId: entry.objectId, path });
      return;
    }

    for (const [nestedPath, objectId] of yield* Tree.flattenTree(adapter, entry.objectId, path)) {
      output.push({ newObjectId: objectId, path: nestedPath });
    }
  });

const collectDeleted = (
  adapter: StoreGit,
  entry: TreeEntry,
  path: string,
  output: Array<Change>,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    if (entry.type === "blob") {
      output.push({ oldObjectId: entry.objectId, path });
      return;
    }

    for (const [nestedPath, objectId] of yield* Tree.flattenTree(adapter, entry.objectId, path)) {
      output.push({ oldObjectId: objectId, path: nestedPath });
    }
  });

const entriesByName = (entries: ReadonlyArray<TreeEntry>): Map<string, TreeEntry> =>
  new Map(entries.map((entry) => [entry.name, entry]));

const compareChangesByPath = (a: Change, b: Change): number => a.path.localeCompare(b.path);

const listStoreEntries = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  path: string,
  options: ReadOptions,
): Effect.Effect<ReadonlyArray<Entry>, GitDbError> =>
  Effect.gen(function* () {
    const normalizedPath = yield* normalizeStorePath(path);
    const snapshotId = yield* store.resolveSnapshotId(options.from);

    if (snapshotId === null) return [];

    return yield* listStoreEntriesAtSnapshot(store, runtime, snapshotId, normalizedPath);
  });

const listStoreEntriesAtSnapshot = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  snapshotId: string,
  normalizedPath: string,
): Effect.Effect<ReadonlyArray<Entry>, GitDbError> =>
  Cache.get(runtime.cache.listEntries, structureCacheKey(snapshotId, normalizedPath));

const listStoreEntriesAtSnapshotUncached = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  snapshotId: string,
  normalizedPath: string,
): Effect.Effect<ReadonlyArray<Entry>, GitDbError> =>
  Effect.gen(function* () {
    const snapshot = yield* store.snapshot(snapshotId);
    const treeId = normalizedPath
      ? yield* Tree.treeIdAtPath(runtime.adapter, snapshot.root, normalizedPath)
      : snapshot.root;

    if (treeId === null) {
      return [];
    }

    const entries = (yield* runtime.adapter.readTree(treeId)).map((entry) => ({
      mode: entry.mode,
      name: entry.name,
      objectId: entry.objectId,
      path: joinStorePath(normalizedPath, entry.name),
      type: entry.type,
    }));

    return entries;
  });

const structureCacheKey = (snapshotId: string, path: string): string => `${snapshotId}\0${path}`;

const decodeStructureCacheKey = (
  key: string,
): { readonly path: string; readonly snapshotId: string } => {
  const separator = key.indexOf("\0");

  return {
    path: key.slice(separator + 1),
    snapshotId: key.slice(0, separator),
  };
};
