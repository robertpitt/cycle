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
  Schema,
  TxRef,
} from "effect";
import { Git, type GitService } from "../git/Git.ts";
import { Document, parseDocumentJson } from "./Document.ts";
import { encodeValue } from "./Json.ts";
import * as Tree from "./Tree.ts";
import {
  invalidIdentifier,
  pointerConflict,
  pointerNotFound,
  snapshotNotFound,
  storeNotFound,
  syncConflict,
  transactionInactive,
  type GitAdapterError,
  type GitDbError,
  type RemoteFetchError,
  type RemotePushError,
} from "../errors/index.ts";
import { Options as OptionsSchema, Store, type Options as StoreOptions } from "../schemas/Store.ts";
import {
  collectionMetaPath,
  collectionRootPath,
  documentPath,
  idFromDocumentPath,
  indexEntryPath,
  isPotentialObjectId,
  isValidPointerName,
  joinStorePath,
  normalizeNamespace,
  normalizeStorePath,
  rejectEmptyMutationPath,
  validateCollectionName,
  validateDatabaseName,
  validateIndexKey,
  validateIndexName,
  validatePointerName,
  validateRemoteName,
} from "./Path.ts";
import type {
  Change,
  ChangeSet,
  CollectionEntry,
  CollectionInfo,
  CollectionListOptions,
  CollectionOptions,
  CollectionPage,
  CollectionPageOptions,
  CommitObject,
  CommitOptions,
  DeleteRefInput,
  Entry,
  FetchInput,
  HistoryOptions,
  MovePointerOptions,
  ObjectId,
  PointerSyncResult,
  PushInput,
  ReadOptions,
  Ref as GitRef,
  Snapshot,
  SyncOptions,
  SyncResult,
  TreeEntry,
  UpdateRefInput,
  WriteCommitInput,
} from "../domain/index.ts";
import { ShardLength } from "../schemas/Identifier.ts";

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
    const shardLength = yield* Schema.decodeUnknownEffect(ShardLength)(
      options.shardLength ?? 2,
    ).pipe(Effect.mapError(() => invalidIdentifier("shard length", String(options.shardLength))));

    if (options.verifyGitDir ?? true) {
      yield* fs.access(gitDir).pipe(Effect.mapError(() => storeNotFound(gitDir)));
    }

    return new Store({ cwd, database, defaultPointer, gitDir, namespace, shardLength });
  });

export const layer = (options: Options = {}) => Layer.effect(StoreConfig, make(options));

export type StoreServiceShape = {
  readonly begin: (pointer?: string) => Effect.Effect<Transaction, GitDbError>;
  readonly collection: <T = unknown>(
    name: string,
    options?: CollectionOptions<T>,
  ) => Effect.Effect<StoreCollection<T>, GitDbError>;
  readonly collections: <TMeta = unknown>(
    options?: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<CollectionInfo<TMeta>>, GitDbError>;
  readonly config: Store;
  readonly currentSnapshotForPointer: (
    pointer: string,
  ) => Effect.Effect<Snapshot | null, GitDbError>;
  readonly diff: (a: string, b: string) => Effect.Effect<ChangeSet, GitDbError>;
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
  readonly collection: <T = unknown>(
    name: string,
    options?: CollectionOptions<T>,
  ) => Effect.Effect<TransactionCollection<T>, GitDbError>;
  readonly commit: (options?: CommitOptions) => Effect.Effect<Snapshot, GitDbError>;
  readonly delete: (path: string) => Effect.Effect<void, GitDbError>;
  readonly get: (path: string) => Effect.Effect<Document | null, GitDbError>;
  readonly list: (path?: string) => Effect.Effect<ReadonlyArray<Entry>, GitDbError>;
  readonly put: (path: string, value: unknown) => Effect.Effect<void, GitDbError>;
};

export type StoreCollection<T = unknown> = {
  readonly delete: (id: string, options?: CommitOptions) => Effect.Effect<Snapshot, GitDbError>;
  readonly document: (
    id: string,
    options?: ReadOptions,
  ) => Effect.Effect<Document | null, GitDbError>;
  readonly get: (id: string, options?: ReadOptions) => Effect.Effect<T | null, GitDbError>;
  readonly index: <TValue = T>(
    name: string,
  ) => Effect.Effect<StoreCollectionIndex<TValue>, GitDbError>;
  readonly list: (
    options?: CollectionListOptions,
  ) => Effect.Effect<ReadonlyArray<CollectionEntry<T>>, GitDbError>;
  readonly meta: <TMeta = unknown>(
    options?: ReadOptions,
  ) => Effect.Effect<TMeta | null, GitDbError>;
  readonly name: string;
  readonly path: string;
  readonly page: (options?: CollectionPageOptions) => Effect.Effect<CollectionPage<T>, GitDbError>;
  readonly put: (
    id: string,
    value: T,
    options?: CommitOptions,
  ) => Effect.Effect<Snapshot, GitDbError>;
  readonly setMeta: <TMeta = unknown>(
    meta: TMeta,
    options?: CommitOptions,
  ) => Effect.Effect<Snapshot, GitDbError>;
};

export type TransactionCollection<T = unknown> = {
  readonly delete: (id: string) => Effect.Effect<void, GitDbError>;
  readonly get: (id: string) => Effect.Effect<T | null, GitDbError>;
  readonly index: (name: string) => Effect.Effect<TransactionCollectionIndex, GitDbError>;
  readonly meta: <TMeta = unknown>() => Effect.Effect<TMeta | null, GitDbError>;
  readonly name: string;
  readonly path: string;
  readonly put: (id: string, value: T) => Effect.Effect<void, GitDbError>;
  readonly setMeta: <TMeta = unknown>(meta: TMeta) => Effect.Effect<void, GitDbError>;
};

export type StoreCollectionIndex<T = unknown> = {
  readonly get: (
    key: string,
    options?: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<CollectionEntry<T>>, GitDbError>;
  readonly name: string;
  readonly page: (
    key: string,
    options?: CollectionPageOptions,
  ) => Effect.Effect<CollectionPage<T>, GitDbError>;
};

export type TransactionCollectionIndex = {
  readonly delete: (key: string, id: string) => Effect.Effect<void, GitDbError>;
  readonly name: string;
  readonly put: (key: string, id: string, value?: object) => Effect.Effect<void, GitDbError>;
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
  readonly documentPath: (
    collection: string,
    id: string,
    shardLength?: number,
  ) => Effect.Effect<string, GitDbError>;
};

type StoreRuntimeCache = {
  readonly commits: Cache.Cache<ObjectId, CommitObject, GitAdapterError>;
  readonly flatEntries: Cache.Cache<string, ReadonlyArray<Entry>, GitDbError>;
  readonly listEntries: Cache.Cache<string, ReadonlyArray<Entry>, GitDbError>;
  readonly trees: Cache.Cache<ObjectId, ReadonlyArray<TreeEntry>, GitAdapterError>;
};

type NormalizedCollectionOptions = {
  readonly indexes: ReadonlyArray<string>;
};

type DerivedIndexEntry = {
  readonly key: string;
  readonly name: string;
};

const defaultCollectionPageLimit = 100;

type StateUpdateResult =
  | {
      readonly _tag: "ok";
    }
  | {
      readonly _tag: "error";
      readonly error: GitDbError;
    };

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
    const git = yield* Git;
    const crypto = yield* Crypto.Crypto;
    const baseAdapter = bindGitAdapter(git, config);
    let listEntriesLookup: (key: string) => Effect.Effect<ReadonlyArray<Entry>, GitDbError> =
      uninitializedStructureCache("listEntries");
    let flatEntriesLookup: (key: string) => Effect.Effect<ReadonlyArray<Entry>, GitDbError> =
      uninitializedStructureCache("flatEntries");
    const cache = yield* makeStoreRuntimeCache(baseAdapter, {
      flatEntries: (key) => flatEntriesLookup(key),
      listEntries: (key) => listEntriesLookup(key),
    });
    const adapter = cacheGitAdapter(baseAdapter, cache);
    const runtime: StoreRuntime = {
      adapter,
      cache,
      config,
      documentPath: makeDocumentPath(config, crypto),
    };
    const store = makeStore(runtime);

    listEntriesLookup = (key) => {
      const decoded = decodeStructureCacheKey(key);

      return listStoreEntriesAtSnapshotUncached(store, runtime, decoded.snapshotId, decoded.path);
    };
    flatEntriesLookup = (key) => {
      const decoded = decodeStructureCacheKey(key);

      return walkStoreAtSnapshotUncached(store, runtime, decoded.snapshotId, decoded.path);
    };

    return store;
  }),
);

const makeDocumentPath =
  (config: Store, crypto: Crypto.Crypto) =>
  (collection: string, id: string, shardLength = config.shardLength) =>
    documentPath(collection, id, shardLength).pipe(Effect.provideService(Crypto.Crypto, crypto));

const bindGitAdapter = (git: GitService, config: Store): StoreGit => ({
  deleteRef: (input) => git.deleteRef(config, input),
  fetch: (input) => git.fetch(config, input),
  isAncestor: (ancestor, descendant) => git.isAncestor(config, ancestor, descendant),
  isCommit: (id) => git.isCommit(config, id),
  listRefs: (prefix) => git.listRefs(config, prefix),
  mergeBase: (a, b) => git.mergeBase(config, a, b),
  push: (input) => git.push(config, input),
  readBlob: (id) => git.readBlob(config, id),
  readCommit: (id) => git.readCommit(config, id),
  readRef: (name) => git.readRef(config, name),
  readTree: (id) => git.readTree(config, id),
  updateRef: (input) => git.updateRef(config, input),
  writeBlob: (bytes) => git.writeBlob(config, bytes),
  writeCommit: (input) => git.writeCommit(config, input),
  writeTree: (entries) => git.writeTree(config, entries),
});

const makeStoreRuntimeCache = (
  adapter: StoreGit,
  structureLookup: {
    readonly flatEntries: (key: string) => Effect.Effect<ReadonlyArray<Entry>, GitDbError>;
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
        adapter.readTree(id).pipe(
          Effect.map((entries) => [...entries].sort((a, b) => a.name.localeCompare(b.name))),
        ),
    });

    return {
      commits,
      flatEntries: yield* Cache.make<string, ReadonlyArray<Entry>, GitDbError>({
        capacity: 8192,
        lookup: structureLookup.flatEntries,
      }),
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
    Effect.sync(() => {
      throw new Error(`Store structure cache ${name} was read before initialization: ${key}`);
    });

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
    collection: <T = unknown>(name: string, options?: CollectionOptions<T>) =>
      Effect.gen(function* () {
        const collectionName = yield* validateCollectionName(name);
        const collectionOptions = yield* normalizeCollectionOptions(options);
        const rootPath = yield* collectionRootPath(collectionName);

        return makeStoreCollection<T>(store, runtime, collectionName, rootPath, collectionOptions);
      }),
    collections: <TMeta = unknown>(options: ReadOptions = {}) =>
      Effect.gen(function* () {
        const entries = yield* store.list("collections", options);
        const collections = entries.filter((entry) => entry.type === "tree");

        return yield* Effect.forEach(collections, (entry) =>
          Effect.gen(function* () {
            const metaPath = yield* collectionMetaPath(entry.name);
            const metaDocument = yield* store.get(metaPath, options);
            const meta = metaDocument ? yield* parseDocumentJson<TMeta>(metaDocument) : undefined;

            return {
              meta,
              name: entry.name,
              path: entry.path,
            } satisfies CollectionInfo<TMeta>;
          }),
        );
      }),
    config,
    currentSnapshotForPointer: (pointer) =>
      Effect.gen(function* () {
        const pointerName = yield* validatePointerName(pointer);
        const ref = `${refPrefix}/${pointerName}`;
        const snapshotId = yield* adapter.readRef(ref);

        return snapshotId ? yield* store.snapshot(snapshotId) : null;
      }),
    diff: (a, b) =>
      Effect.gen(function* () {
        const snapshotA = yield* snapshotOrResolve(store, a);
        const snapshotB = yield* snapshotOrResolve(store, b);
        const left = yield* Tree.flattenTree(adapter, snapshotA.root);
        const right = yield* Tree.flattenTree(adapter, snapshotB.root);
        const added: Array<Change> = [];
        const modified: Array<Change> = [];
        const deleted: Array<Change> = [];
        const paths = new Set([...left.keys(), ...right.keys()]);

        for (const path of [...paths].sort()) {
          const oldObjectId = left.get(path);
          const newObjectId = right.get(path);

          if (oldObjectId === undefined && newObjectId !== undefined) {
            added.push({ newObjectId, path });
          } else if (oldObjectId !== undefined && newObjectId === undefined) {
            deleted.push({ oldObjectId, path });
          } else if (
            oldObjectId !== undefined &&
            newObjectId !== undefined &&
            oldObjectId !== newObjectId
          ) {
            modified.push({ newObjectId, oldObjectId, path });
          }
        }

        return { added, deleted, modified } satisfies ChangeSet;
      }),
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
      Effect.gen(function* () {
        if (!(yield* adapter.isCommit(id))) {
          return yield* Effect.fail(snapshotNotFound(id));
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
    sync: (options: SyncOptions = {}) => sync(store, runtime, options),
  };

  return store;
};

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
      Effect.gen(function* () {
        const ref = yield* store.pointerRef(name);
        const hasExpected = Object.hasOwn(options, "expectedSnapshot");
        const input = hasExpected ? { expected: options.expectedSnapshot ?? null, ref } : { ref };

        yield* adapter
          .deleteRef(input)
          .pipe(
            Effect.catch((error) =>
              hasExpected
                ? adapter
                    .readRef(ref)
                    .pipe(
                      Effect.flatMap((actual) =>
                        Effect.fail(
                          pointerConflict(name, options.expectedSnapshot ?? null, actual, error),
                        ),
                      ),
                    )
                : Effect.fail(error),
            ),
          );
      }),
    fork: (targetName) =>
      Effect.gen(function* () {
        const current = yield* pointer.current();

        if (current === null) {
          return yield* Effect.fail(pointerNotFound(name));
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
          return yield* Effect.fail(pointerNotFound(source));
        }

        const ref = yield* store.pointerRef(name);
        yield* movePointerRef(runtime, ref, snapshotId, null, name);

        return pointer;
      }),
    history: (options: HistoryOptions = {}) => store.history(name, options),
    move: (target, options: MovePointerOptions = {}) =>
      Effect.gen(function* () {
        if (!(yield* adapter.isCommit(target))) {
          return yield* Effect.fail(snapshotNotFound(target));
        }

        const current = yield* pointer.current();
        const expected = Object.hasOwn(options, "expectedSnapshot")
          ? (options.expectedSnapshot ?? null)
          : (current?.id ?? null);
        const ref = yield* store.pointerRef(name);

        yield* movePointerRef(runtime, ref, target, expected, name);
      }),
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
      collection: <T = unknown>(name: string, options?: CollectionOptions<T>) =>
        Effect.gen(function* () {
          const collectionName = yield* validateCollectionName(name);
          const collectionOptions = yield* normalizeCollectionOptions(options);
          const rootPath = yield* collectionRootPath(collectionName);

          return makeTransactionCollection<T>(
            tx,
            runtime,
            collectionName,
            rootPath,
            collectionOptions,
          );
        }),
      commit: (options: CommitOptions = {}) =>
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
          const node = Tree.nodeAtPath(root, normalizedPath.split("/").filter(Boolean));

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
            ? Tree.nodeAtPath(root, normalizedPath.split("/").filter(Boolean))
            : root;

          if (node === null || node.kind !== "tree") return [];

          return [...node.entries]
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

const makeStoreCollection = <T>(
  store: StoreServiceShape,
  runtime: StoreRuntime,
  name: string,
  path: string,
  collectionOptions: NormalizedCollectionOptions,
): StoreCollection<T> => ({
  delete: (id, options = {}) =>
    Effect.gen(function* () {
      const tx = yield* store.begin(options.pointer ?? store.config.defaultPointer);
      const collection = yield* tx.collection<T>(name, collectionOptions as CollectionOptions<T>);

      yield* collection.delete(id);

      return yield* tx.commit(options);
    }),
  document: (id, options: ReadOptions = {}) =>
    runtime.documentPath(name, id).pipe(Effect.flatMap((path) => store.get(path, options))),
  get: (id, options: ReadOptions = {}) =>
    Effect.gen(function* () {
      const document = yield* runtime
        .documentPath(name, id)
        .pipe(Effect.flatMap((documentPath) => store.get(documentPath, options)));

      return document === null ? null : yield* parseDocumentJson<T>(document);
    }),
  index: <TValue = T>(indexName: string) =>
    validateIndexName(indexName).pipe(
      Effect.map((validName) => makeStoreCollectionIndex<TValue>(store, name, validName)),
    ),
  list: (options: CollectionListOptions = {}) =>
    Effect.gen(function* () {
      const entries = yield* collectionDocumentEntries(store, runtime, path, options);

      return yield* readCollectionEntries<T>(store, entries, options);
    }),
  meta: <TMeta = unknown>(options: ReadOptions = {}) =>
    Effect.gen(function* () {
      const metaPath = yield* collectionMetaPath(name);
      const document = yield* store.get(metaPath, options);

      return document === null ? null : yield* parseDocumentJson<TMeta>(document);
    }),
  name,
  page: (options: CollectionPageOptions = {}) =>
    Effect.gen(function* () {
      const entries = yield* collectionDocumentEntries(store, runtime, path, options);

      return yield* pageCollectionEntries<T>(store, entries, options, defaultCollectionPageLimit);
    }),
  path,
  put: (id, value, options: CommitOptions = {}) =>
    Effect.gen(function* () {
      const tx = yield* store.begin(options.pointer ?? store.config.defaultPointer);
      const collection = yield* tx.collection<T>(name, collectionOptions as CollectionOptions<T>);

      yield* collection.put(id, value);

      return yield* tx.commit(options);
    }),
  setMeta: <TMeta = unknown>(meta: TMeta, options: CommitOptions = {}) =>
    Effect.gen(function* () {
      const tx = yield* store.begin(options.pointer ?? store.config.defaultPointer);
      const collection = yield* tx.collection<T>(name, collectionOptions as CollectionOptions<T>);

      yield* collection.setMeta(meta);

      return yield* tx.commit(options);
    }),
});

const makeTransactionCollection = <T>(
  tx: Transaction,
  runtime: StoreRuntime,
  name: string,
  path: string,
  collectionOptions: NormalizedCollectionOptions,
): TransactionCollection<T> => {
  const collection: TransactionCollection<T> = {
    delete: (id) =>
      Effect.gen(function* () {
        const targetPath = yield* runtime.documentPath(name, id);
        const previous = yield* collection.get(id);
        const previousEntries =
          previous === null ? [] : yield* deriveIndexEntries(collectionOptions, previous);

        yield* deleteDerivedIndexEntries(collection, id, previousEntries);
        yield* tx.delete(targetPath);
      }),
    get: (id) =>
      Effect.gen(function* () {
        const targetPath = yield* runtime.documentPath(name, id);
        const document = yield* tx.get(targetPath);

        return document === null ? null : yield* parseDocumentJson<T>(document);
      }),
    index: (indexName) =>
      validateIndexName(indexName).pipe(
        Effect.map((validName) => makeTransactionCollectionIndex(tx, runtime, name, validName)),
      ),
    meta: <TMeta = unknown>() =>
      Effect.gen(function* () {
        const metaPath = yield* collectionMetaPath(name);
        const document = yield* tx.get(metaPath);

        return document === null ? null : yield* parseDocumentJson<TMeta>(document);
      }),
    name,
    path,
    put: (id, value) =>
      Effect.gen(function* () {
        const targetPath = yield* runtime.documentPath(name, id);
        const previous = yield* collection.get(id);
        const previousEntries =
          previous === null ? [] : yield* deriveIndexEntries(collectionOptions, previous);
        const nextEntries = yield* deriveIndexEntries(collectionOptions, value);

        yield* deleteDerivedIndexEntries(collection, id, previousEntries);
        yield* tx.put(targetPath, value);
        yield* putDerivedIndexEntries(collection, id, targetPath, nextEntries);
      }),
    setMeta: <TMeta = unknown>(meta: TMeta) =>
      Effect.gen(function* () {
        const metaPath = yield* collectionMetaPath(name);

        yield* tx.put(metaPath, meta);
      }),
  };

  return collection;
};

const makeStoreCollectionIndex = <T>(
  store: StoreServiceShape,
  collection: string,
  name: string,
): StoreCollectionIndex<T> => ({
  get: (key, options: ReadOptions = {}) =>
    Effect.gen(function* () {
      const indexKey = yield* validateIndexKey(key);
      const root = joinStorePath("indexes", collection, name, indexKey);
      const entries = yield* store.list(root, options);

      return yield* readIndexEntries<T>(
        store,
        entries.filter((item) => item.type === "blob").sort(compareEntriesByPath),
        options,
      );
    }),
  name,
  page: (key, options: CollectionPageOptions = {}) =>
    Effect.gen(function* () {
      const indexKey = yield* validateIndexKey(key);
      const root = joinStorePath("indexes", collection, name, indexKey);
      const entries = yield* store.list(root, options);

      return yield* pageIndexEntries<T>(
        store,
        entries.filter((item) => item.type === "blob").sort(compareEntriesByPath),
        options,
        defaultCollectionPageLimit,
      );
    }),
});

const makeTransactionCollectionIndex = (
  tx: Transaction,
  runtime: StoreRuntime,
  collection: string,
  name: string,
): TransactionCollectionIndex => ({
  delete: (key, id) =>
    indexEntryPath(collection, name, String(key), id).pipe(
      Effect.flatMap((path) => tx.delete(path)),
    ),
  name,
  put: (key, id, value) =>
    Effect.gen(function* () {
      const path = yield* indexEntryPath(collection, name, String(key), id);
      const pointer = value ?? {
        collection,
        id,
        path: yield* runtime.documentPath(collection, id),
      };

      yield* tx.put(path, pointer);
    }),
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

    if (mode === "fetch" || mode === "pull" || mode === "full") {
      const remotePrefix = yield* store.remoteRefPrefix(remote);
      yield* runtime.adapter.fetch({
        refspecs: [`+${store.refPrefix}/*:${remotePrefix}/*`],
        remote,
      });
    }

    for (const pointer of pointerNames) {
      const localRef = yield* store.pointerRef(pointer);
      const remoteRef = yield* store.remotePointerRef(remote, pointer);
      const localBefore = yield* runtime.adapter.readRef(localRef);
      const remoteBefore = yield* runtime.adapter.readRef(remoteRef);
      const resultBase = {
        localBefore: localBefore ?? undefined,
        pointer,
        remoteBefore: remoteBefore ?? undefined,
      };

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

      return yield* Effect.fail(
        syncConflict(pointer, localBefore, remoteBefore, mergeBase ?? undefined),
      );
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
          runtime.adapter
            .readRef(ref)
            .pipe(
              Effect.flatMap(
                (actual): Effect.Effect<void, GitDbError> =>
                  actual !== expected
                    ? Effect.fail(pointerConflict(pointerName, expected, actual, error))
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
      return yield* Effect.fail(pointerConflict(pointer, expected, actual));
    }
  });

const getActiveState = (
  state: TxRef.TxRef<TransactionState>,
): Effect.Effect<TransactionState, GitDbError> =>
  TxRef.get(state).pipe(
    Effect.flatMap((current) =>
      current.active ? Effect.succeed(current) : Effect.fail(transactionInactive()),
    ),
  );

const recordMutation = (
  state: TxRef.TxRef<TransactionState>,
  path: string,
  mutation: Tree.PendingMutation,
): Effect.Effect<void, GitDbError> =>
  TxRef.modify(state, (current): [StateUpdateResult, TransactionState] => {
    if (!current.active) {
      return [{ _tag: "error", error: transactionInactive() } satisfies StateUpdateResult, current];
    }

    return [
      { _tag: "ok" } satisfies StateUpdateResult,
      {
        ...current,
        mutations: HashMap.set(current.mutations, path, mutation),
      },
    ];
  }).pipe(
    Effect.flatMap((result) =>
      result._tag === "ok" ? Effect.succeed(undefined) : Effect.fail(result.error),
    ),
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
  Effect.gen(function* () {
    const root = yield* Tree.loadMutableTree(runtime.adapter, base?.root ?? null);

    for (const [path, mutation] of state.mutations) {
      Tree.applyMutation(root, path, mutation);
    }

    return root;
  });

const snapshotOrResolve = (
  store: StoreServiceShape,
  value: string,
): Effect.Effect<Snapshot, GitDbError> =>
  Effect.gen(function* () {
    const id = yield* store.resolveSnapshotId(value);

    if (id === null) return yield* Effect.fail(snapshotNotFound(value));

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

const walkStore = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  path: string,
  options: ReadOptions,
): Effect.Effect<ReadonlyArray<Entry>, GitDbError> =>
  Effect.gen(function* () {
    const normalizedPath = yield* normalizeStorePath(path);
    const snapshotId = yield* store.resolveSnapshotId(options.from);

    if (snapshotId === null) return [];

    return yield* walkStoreAtSnapshot(store, runtime, snapshotId, normalizedPath);
  });

const walkStoreAtSnapshot = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  snapshotId: string,
  normalizedPath: string,
): Effect.Effect<ReadonlyArray<Entry>, GitDbError> =>
  Cache.get(runtime.cache.flatEntries, structureCacheKey(snapshotId, normalizedPath));

const walkStoreAtSnapshotUncached = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  snapshotId: string,
  normalizedPath: string,
): Effect.Effect<ReadonlyArray<Entry>, GitDbError> =>
  Effect.gen(function* () {
    const direct = yield* listStoreEntriesAtSnapshot(store, runtime, snapshotId, normalizedPath);
    const output: Array<Entry> = [];

    for (const entry of direct) {
      if (entry.type === "tree") {
        output.push(...(yield* walkStoreAtSnapshot(store, runtime, snapshotId, entry.path)));
      } else {
        output.push(entry);
      }
    }

    return output;
  });

const compareEntriesByPath = (a: Entry, b: Entry): number => a.path.localeCompare(b.path);

const collectionDocumentEntries = (
  store: StoreServiceShape,
  runtime: StoreRuntime,
  path: string,
  options: ReadOptions,
): Effect.Effect<ReadonlyArray<Entry>, GitDbError> =>
  walkStore(store, runtime, path, options).pipe(
    Effect.map((entries) =>
      entries.filter((entry) => idFromDocumentPath(entry.path) !== null).sort(compareEntriesByPath),
    ),
  );

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

const readCollectionEntries = <T>(
  store: StoreServiceShape,
  entries: ReadonlyArray<Entry>,
  options: ReadOptions,
): Effect.Effect<ReadonlyArray<CollectionEntry<T>>, GitDbError> =>
  Effect.gen(function* () {
    const output: Array<CollectionEntry<T>> = [];

    for (const entry of entries) {
      const id = idFromDocumentPath(entry.path);

      if (id === null) continue;

      const document = yield* store.get(entry.path, options);

      if (document !== null) {
        output.push({
          document,
          id,
          path: entry.path,
          value: yield* parseDocumentJson<T>(document),
        });
      }
    }

    return output;
  });

const pageCollectionEntries = <T>(
  store: StoreServiceShape,
  entries: ReadonlyArray<Entry>,
  options: CollectionPageOptions,
  defaultLimit: number,
): Effect.Effect<CollectionPage<T>, GitDbError> =>
  Effect.gen(function* () {
    const limit = yield* normalizePageLimit(options.limit, defaultLimit);
    const selected = pageEntries(entries, options.cursor, limit);
    const hydrated = yield* readCollectionEntries<T>(store, selected.entries, options);

    return {
      entries: hydrated,
      nextCursor: selected.nextCursor,
    };
  });

const readIndexEntries = <T>(
  store: StoreServiceShape,
  entries: ReadonlyArray<Entry>,
  options: ReadOptions,
): Effect.Effect<ReadonlyArray<CollectionEntry<T>>, GitDbError> =>
  Effect.gen(function* () {
    const output: Array<CollectionEntry<T>> = [];

    for (const entry of entries) {
      const pointerDocument = yield* store.get(entry.path, options);
      const pointer = pointerDocument
        ? yield* parseDocumentJson<{ readonly id?: string; readonly path?: string }>(
            pointerDocument,
          )
        : undefined;
      const target = pointer?.path ? yield* store.get(pointer.path, options) : null;

      if (target !== null && pointer?.id !== undefined && pointer.path !== undefined) {
        output.push({
          document: target,
          id: pointer.id,
          path: pointer.path,
          value: yield* parseDocumentJson<T>(target),
        });
      }
    }

    return output;
  });

const pageIndexEntries = <T>(
  store: StoreServiceShape,
  entries: ReadonlyArray<Entry>,
  options: CollectionPageOptions,
  defaultLimit: number,
): Effect.Effect<CollectionPage<T>, GitDbError> =>
  Effect.gen(function* () {
    const limit = yield* normalizePageLimit(options.limit, defaultLimit);
    const selected = pageEntries(entries, options.cursor, limit);
    const hydrated = yield* readIndexEntries<T>(store, selected.entries, options);

    return {
      entries: hydrated,
      nextCursor: selected.nextCursor,
    };
  });

const pageEntries = (
  entries: ReadonlyArray<Entry>,
  cursor: string | undefined,
  limit: number,
): { readonly entries: ReadonlyArray<Entry>; readonly nextCursor?: string } => {
  const start = cursor === undefined ? 0 : firstEntryAfterCursor(entries, cursor);
  const visible = entries.slice(start, start + limit + 1);
  const page = visible.slice(0, limit);
  const nextCursor = visible.length > limit ? page.at(-1)?.path : undefined;

  return nextCursor === undefined ? { entries: page } : { entries: page, nextCursor };
};

const firstEntryAfterCursor = (entries: ReadonlyArray<Entry>, cursor: string): number => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const entry = entries[middle];

    if (entry !== undefined && entry.path <= cursor) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
};

const normalizePageLimit = (
  limit: number | undefined,
  defaultLimit: number,
): Effect.Effect<number, GitDbError> => {
  const value = limit ?? defaultLimit;

  if (!Number.isSafeInteger(value) || value <= 0) {
    return Effect.fail(invalidIdentifier("page limit", String(value)));
  }

  return Effect.succeed(value);
};

const normalizeCollectionOptions = <T>(
  options: CollectionOptions<T> = {},
): Effect.Effect<NormalizedCollectionOptions, GitDbError> =>
  Effect.gen(function* () {
    const indexes = yield* Effect.forEach(options.indexes ?? [], validateIndexName);

    return { indexes: [...new Set(indexes)] };
  });

const deriveIndexEntries = (
  options: NormalizedCollectionOptions,
  value: unknown,
): Effect.Effect<ReadonlyArray<DerivedIndexEntry>, GitDbError> =>
  Effect.gen(function* () {
    if (options.indexes.length === 0 || value === null || typeof value !== "object") {
      return [];
    }

    const record = value as Record<string, unknown>;
    const entries: Array<DerivedIndexEntry> = [];

    for (const name of options.indexes) {
      const rawValue = record[name];

      if (rawValue === undefined) continue;

      const values = Array.isArray(rawValue) ? rawValue : [rawValue];

      for (const item of values) {
        const key = yield* indexKeyFromValue(name, item);

        entries.push({ key, name });
      }
    }

    return entries;
  });

const indexKeyFromValue = (name: string, value: unknown): Effect.Effect<string, GitDbError> => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return validateIndexKey(String(value));
  }

  return Effect.fail(invalidIdentifier(`index value for ${name}`, String(value)));
};

const putDerivedIndexEntries = <T>(
  collection: TransactionCollection<T>,
  id: string,
  targetPath: string,
  entries: ReadonlyArray<DerivedIndexEntry>,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    for (const entry of entries) {
      const index = yield* collection.index(entry.name);

      yield* index.put(entry.key, id, {
        collection: collection.name,
        id,
        path: targetPath,
      });
    }
  });

const deleteDerivedIndexEntries = <T>(
  collection: TransactionCollection<T>,
  id: string,
  entries: ReadonlyArray<DerivedIndexEntry>,
): Effect.Effect<void, GitDbError> =>
  Effect.gen(function* () {
    for (const entry of entries) {
      const index = yield* collection.index(entry.name);

      yield* index.delete(entry.key, id);
    }
  });
