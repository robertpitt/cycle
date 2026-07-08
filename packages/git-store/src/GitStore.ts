import { Context, Effect, Exit, Layer, Ref } from "effect";
import {
  EmptyTransactionError,
  PathConflictError,
  RefExpectedValueConflictError,
  SnapshotNotFoundError,
  TransactionInactiveError,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import {
  ChangeSet,
  joinStorePath,
  type Change,
  type GitStoreConfig,
  type GitStoreKey,
  type HistoryOptions,
  type ObjectId,
  type ReadOptions,
  type RefName,
  type Snapshot,
  type StorePath,
  type TreeEntry,
} from "./GitStoreSchemas.ts";
import { Document, encodeDocumentInput, makeDocument, type DocumentInput } from "./Document.ts";
import { CommitWriter } from "./CommitWriter.ts";
import { GitStoreChanges } from "./GitStoreChanges.ts";
import { ObjectCodec } from "./ObjectCodec.ts";
import { ObjectStore } from "./ObjectStore.ts";
import { RefReader } from "./RefReader.ts";
import { RefTransaction } from "./RefTransaction.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import { encodeTreeBody } from "./internal/git-object.ts";
import {
  entryAtPath,
  flattenTree,
  loadMutableTree,
  applyMutation,
  writeMutableTree,
  type PendingMutation,
} from "./internal/tree.ts";
import {
  normalizeMutationPath,
  normalizeStorePath,
  pointerRef,
  validateObjectId,
  validatePointerName,
} from "./internal/refs.ts";
import {
  directChildOf,
  isDescendant,
  isPathOrDescendant,
  pathAncestors,
} from "./internal/store-path.ts";

export type TransactionOptions = {
  readonly author?: import("./GitStoreSchemas.ts").IdentityInput;
  readonly committer?: import("./GitStoreSchemas.ts").IdentityInput;
  readonly expectedSnapshot?: ObjectId | null;
  readonly message: string;
  readonly parents?: ReadonlyArray<ObjectId>;
  readonly pointer?: string;
};

export type TransactionResult<A> = {
  readonly snapshot: Snapshot;
  readonly value: A;
};

export type GitStoreTransaction = {
  readonly base: Snapshot | null;
  readonly delete: (path: string) => Effect.Effect<void, GitStoreError>;
  readonly get: (path: string) => Effect.Effect<Document | null, GitStoreError>;
  readonly list: (path?: string) => Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError>;
  readonly put: (path: string, input: DocumentInput) => Effect.Effect<void, GitStoreError>;
};

export type GitStoreShape = {
  readonly config: GitStoreConfig;
  readonly diff: (a: string, b: string) => Effect.Effect<ChangeSet, GitStoreError>;
  readonly get: (
    path: string,
    options?: ReadOptions,
  ) => Effect.Effect<Document | null, GitStoreError>;
  readonly history: (
    from?: string,
    options?: HistoryOptions,
  ) => Effect.Effect<ReadonlyArray<Snapshot>, GitStoreError>;
  readonly key: GitStoreKey;
  readonly list: (
    path?: string,
    options?: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError>;
  readonly pointerRef: (pointer: string) => Effect.Effect<RefName, GitStoreError>;
  readonly resolveSnapshotId: (from?: string) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly snapshot: (id: string) => Effect.Effect<Snapshot, GitStoreError>;
  readonly transaction: <A, E, R>(
    options: TransactionOptions,
    use: (tx: GitStoreTransaction) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<TransactionResult<A>, GitStoreError | E, R>;
};

export class GitStore extends Context.Service<GitStore, GitStoreShape>()(
  "@cycle/git-store/GitStore",
) {}

type TxState = {
  readonly active: boolean;
  readonly mutations: ReadonlyMap<string, PendingMutation>;
};

type VirtualDocument = {
  readonly bytes?: Uint8Array;
  readonly objectId: ObjectId;
};

export const GitStoreLive = Layer.effect(
  GitStore,
  Effect.gen(function* () {
    const runtime = yield* GitStoreRuntime;
    const objects = yield* ObjectStore;
    const codec = yield* ObjectCodec;
    const commits = yield* CommitWriter;
    const changes = yield* GitStoreChanges;
    const refs = yield* RefReader;
    const refTx = yield* RefTransaction;

    const pointerRefFor = Effect.fn("GitStore.pointerRef")(function* (pointer: string) {
      return pointerRef(
        runtime.config.namespace,
        runtime.config.database,
        yield* validatePointerName(pointer),
      );
    });

    const resolveSnapshotId = Effect.fn("GitStore.resolveSnapshotId")(function* (from?: string) {
      if (from === undefined) {
        return yield* refs.read(
          pointerRef(
            runtime.config.namespace,
            runtime.config.database,
            runtime.config.defaultPointer,
          ),
        );
      }

      const objectId = yield* validateObjectId(from).pipe(Effect.catch(() => Effect.succeed(null)));
      if (objectId !== null) return objectId;

      const ref = from.startsWith("refs/") ? (from as RefName) : yield* pointerRefFor(from);

      return yield* refs.read(ref);
    });

    const snapshot = Effect.fn("GitStore.snapshot")(function* (id: string) {
      const objectId = yield* validateObjectId(id);
      const commit = yield* objects.readCommit(objectId).pipe(
        Effect.mapError((error) =>
          error._tag === "ObjectNotFoundError"
            ? new SnapshotNotFoundError({
                message: `Snapshot not found: ${id}`,
                snapshot: id,
              })
            : error,
        ),
      );

      return {
        author: commit.author,
        committer: commit.committer,
        createdAt: commit.committer?.date,
        id: commit.id,
        message: commit.message,
        parents: commit.parents,
        root: commit.tree,
      };
    });

    const currentSnapshot = (from?: string): Effect.Effect<Snapshot | null, GitStoreError> =>
      resolveSnapshotId(from).pipe(
        Effect.flatMap((id) => (id === null ? Effect.succeed(null) : snapshot(id))),
      );

    const get = Effect.fn("GitStore.get")(function* (
      documentPath: string,
      options: ReadOptions = {},
    ) {
      const path = yield* normalizeStorePath(documentPath);
      const base = yield* currentSnapshot(options.from);

      if (base === null) return null;

      const entry = yield* entryAtPath(objects, base.root, path);

      if (entry === null || entry.type !== "blob") return null;

      return makeDocument(path, entry.objectId, yield* objects.readBlob(entry.objectId));
    });

    const list = Effect.fn("GitStore.list")(function* (
      documentPath = "",
      options: ReadOptions = {},
    ) {
      const path = yield* normalizeStorePath(documentPath);
      const base = yield* currentSnapshot(options.from);

      if (base === null) return [];

      const entry = yield* entryAtPath(objects, base.root, path);

      if (entry === null || entry.type !== "tree") return [];

      return (yield* objects.readTree(entry.objectId)).map((item) => ({
        ...item,
        path: joinStorePath(path, item.name) as StorePath,
      }));
    });

    const diff = Effect.fn("GitStore.diff")(function* (a: string, b: string) {
      const left = yield* snapshot(a);
      const right = yield* snapshot(b);
      const leftFiles = yield* flattenTree(objects, left.root);
      const rightFiles = yield* flattenTree(objects, right.root);
      const added: Array<Change> = [];
      const deleted: Array<Change> = [];
      const modified: Array<Change> = [];

      for (const [path, objectId] of [...rightFiles.entries()].sort(([x], [y]) =>
        x.localeCompare(y),
      )) {
        const oldObjectId = leftFiles.get(path);

        if (oldObjectId === undefined) {
          added.push({ newObjectId: objectId, path: path as StorePath });
        } else if (oldObjectId !== objectId) {
          modified.push({ newObjectId: objectId, oldObjectId, path: path as StorePath });
        }
      }

      for (const [path, objectId] of [...leftFiles.entries()].sort(([x], [y]) =>
        x.localeCompare(y),
      )) {
        if (!rightFiles.has(path)) {
          deleted.push({ oldObjectId: objectId, path: path as StorePath });
        }
      }

      return { added, deleted, modified };
    });

    const history = Effect.fn("GitStore.history")(function* (
      from?: string,
      options: HistoryOptions = {},
    ) {
      const start = yield* resolveSnapshotId(from);

      if (start === null) return [];

      const max = options.max ?? Number.POSITIVE_INFINITY;
      const output: Array<Snapshot> = [];
      const seen = new Set<ObjectId>();
      const queue: Array<ObjectId> = [start];

      while (queue.length > 0 && output.length < max) {
        const current = queue.shift();

        if (current === undefined || seen.has(current)) continue;

        seen.add(current);
        const currentSnapshot = yield* snapshot(current);
        output.push(currentSnapshot);
        queue.push(...[...currentSnapshot.parents].sort());
      }

      return output;
    });

    const transaction = Effect.fn("GitStore.transaction")(function* <A, E, R>(
      options: TransactionOptions,
      use: (tx: GitStoreTransaction) => Effect.Effect<A, E, R>,
    ) {
      const pointer = yield* validatePointerName(options.pointer ?? runtime.config.defaultPointer);
      const ref = pointerRef(runtime.config.namespace, runtime.config.database, pointer);
      const current = yield* refs.read(ref);
      const base = current === null ? null : yield* snapshot(current);
      const state = yield* Ref.make<TxState>({
        active: true,
        mutations: new Map(),
      });

      const withActiveState = <A2, E2, R2>(
        effect: (state: TxState) => Effect.Effect<A2, E2, R2>,
      ): Effect.Effect<A2, E2 | GitStoreError, R2> =>
        Ref.get(state).pipe(
          Effect.flatMap((currentState) => {
            if (currentState.active) {
              return effect(currentState) as Effect.Effect<A2, E2 | GitStoreError, R2>;
            }

            return Effect.fail(
              new TransactionInactiveError({ message: "Transaction is no longer active" }),
            ) as Effect.Effect<A2, E2 | GitStoreError, R2>;
          }),
        ) as Effect.Effect<A2, E2 | GitStoreError, R2>;

      const virtualDocuments = (mutations: ReadonlyMap<string, PendingMutation>) =>
        Effect.gen(function* () {
          const docs = new Map<string, VirtualDocument>();

          if (base !== null) {
            for (const [path, objectId] of yield* flattenTree(objects, base.root)) {
              docs.set(path, { objectId });
            }
          }

          for (const [path, mutation] of mutations) {
            if (mutation.kind === "delete") {
              for (const key of docs.keys()) {
                if (isPathOrDescendant(key, path)) docs.delete(key);
              }
            } else {
              docs.set(path, {
                bytes: mutation.bytes,
                objectId: yield* codec.hash("blob", mutation.bytes),
              });
            }
          }

          return docs;
        });

      const baseEntry = (path: string) =>
        base === null ? Effect.succeed(null) : entryAtPath(objects, base.root, path);

      const ancestorDeleted = (
        path: string,
        mutations: ReadonlyMap<string, PendingMutation>,
      ): boolean =>
        pathAncestors(path).some((ancestor) => mutations.get(ancestor)?.kind === "delete");

      const hasAncestorPut = (
        path: string,
        mutations: ReadonlyMap<string, PendingMutation>,
      ): boolean => pathAncestors(path).some((ancestor) => mutations.get(ancestor)?.kind === "put");

      const hasDescendantPut = (
        path: string,
        mutations: ReadonlyMap<string, PendingMutation>,
      ): boolean =>
        [...mutations.entries()].some(
          ([key, mutation]) => mutation.kind === "put" && isDescendant(key, path),
        );

      const hasBaseDescendant = (path: string) =>
        Effect.gen(function* () {
          if (base === null) return false;

          const docs = yield* flattenTree(objects, base.root);

          return [...docs.keys()].some((key) => isDescendant(key, path));
        });

      const validatePut = (
        path: string,
        mutations: ReadonlyMap<string, PendingMutation>,
      ): Effect.Effect<void, GitStoreError> =>
        Effect.gen(function* () {
          if (hasAncestorPut(path, mutations)) {
            return yield* pathConflict(path, "an ancestor has a staged document");
          }

          if (hasDescendantPut(path, mutations) && mutations.get(path)?.kind !== "delete") {
            return yield* pathConflict(path, "a descendant has a staged document");
          }

          if (!ancestorDeleted(path, mutations)) {
            for (const ancestor of pathAncestors(path)) {
              const entry = yield* baseEntry(ancestor);

              if (entry?.type === "blob") {
                return yield* pathConflict(path, `ancestor ${ancestor} is a document`);
              }
            }
          }

          const currentBaseEntry = yield* baseEntry(path);

          if (currentBaseEntry?.type === "tree" && mutations.get(path)?.kind !== "delete") {
            return yield* pathConflict(path, "path is a tree in the base snapshot");
          }

          if ((yield* hasBaseDescendant(path)) && mutations.get(path)?.kind !== "delete") {
            return yield* pathConflict(path, "path has descendants in the base snapshot");
          }
        });

      const validateDelete = (
        path: string,
        mutations: ReadonlyMap<string, PendingMutation>,
      ): Effect.Effect<void, GitStoreError> =>
        Effect.gen(function* () {
          if (hasAncestorPut(path, mutations)) {
            return yield* pathConflict(path, "an ancestor has a staged document");
          }

          if (!ancestorDeleted(path, mutations)) {
            for (const ancestor of pathAncestors(path)) {
              const entry = yield* baseEntry(ancestor);

              if (entry?.type === "blob") {
                return yield* pathConflict(path, `ancestor ${ancestor} is a document`);
              }
            }
          }

          if (hasDescendantPut(path, mutations)) {
            return yield* pathConflict(path, "a descendant has a staged document");
          }
        });

      const tx: GitStoreTransaction = {
        base,
        delete: Effect.fn("GitStoreTransaction.delete")(function* (rawPath: string) {
          const path = yield* normalizeMutationPath(rawPath);

          yield* withActiveState((currentState) =>
            Effect.gen(function* () {
              const next = new Map(currentState.mutations);
              const exact = next.get(path);

              if (exact?.kind === "put") {
                const entry = yield* baseEntry(path);

                next.delete(path);
                if (entry !== null) next.set(path, { kind: "delete" });
                yield* Ref.set(state, { ...currentState, mutations: next });
                return;
              }

              yield* validateDelete(path, currentState.mutations);
              next.set(path, { kind: "delete" });
              yield* Ref.set(state, { ...currentState, mutations: next });
            }),
          );
        }),
        get: Effect.fn("GitStoreTransaction.get")(function* (rawPath: string) {
          const path = yield* normalizeStorePath(rawPath);

          return yield* withActiveState((currentState) =>
            Effect.gen(function* () {
              const docs = yield* virtualDocuments(currentState.mutations);
              const doc = docs.get(path);

              if (doc === undefined) return null;

              return makeDocument(
                path,
                doc.objectId,
                doc.bytes ?? (yield* objects.readBlob(doc.objectId)),
              );
            }),
          );
        }),
        list: Effect.fn("GitStoreTransaction.list")(function* (rawPath = "") {
          const path = yield* normalizeStorePath(rawPath);

          return yield* withActiveState((currentState) =>
            Effect.gen(function* () {
              const docs = yield* virtualDocuments(currentState.mutations);

              return yield* listVirtualDocuments(path, docs, codec);
            }),
          );
        }),
        put: Effect.fn("GitStoreTransaction.put")(function* (
          rawPath: string,
          input: DocumentInput,
        ) {
          const path = yield* normalizeMutationPath(rawPath);
          const bytes = yield* encodeDocumentInput(input, path);

          yield* withActiveState((currentState) =>
            Effect.gen(function* () {
              yield* validatePut(path, currentState.mutations);

              const next = new Map(currentState.mutations);
              next.set(path, { bytes, kind: "put" });
              yield* Ref.set(state, { ...currentState, mutations: next });
            }),
          );
        }),
      };

      const callbackExit = yield* Effect.exit(use(tx));

      if (Exit.isFailure(callbackExit)) {
        yield* Ref.update(state, (currentState) => ({ ...currentState, active: false }));
        return yield* Effect.failCause(callbackExit.cause);
      }

      const value = callbackExit.value;
      const commitEffect = Effect.gen(function* () {
        const currentState = yield* Ref.get(state);

        if (!currentState.active) {
          return yield* new TransactionInactiveError({
            message: "Transaction is no longer active",
          });
        }

        const expected =
          options.expectedSnapshot !== undefined ? options.expectedSnapshot : (base?.id ?? null);

        if (currentState.mutations.size === 0) {
          if (base === null) {
            return yield* new EmptyTransactionError({
              message: "Cannot commit an empty transaction without a base snapshot",
              pointer,
            });
          }

          const latest = yield* refs.read(ref);

          if (latest !== expected) {
            return yield* new RefExpectedValueConflictError({
              actual: latest,
              expected,
              message: `Ref ${ref} expected ${expected ?? "missing"} but found ${latest ?? "missing"}`,
              ref,
            });
          }

          return base;
        }

        const mutable = loadMutableTree(base?.root ?? null);

        for (const [path, mutation] of currentState.mutations) {
          yield* applyMutation(objects, mutable, path, mutation);
        }

        const root = yield* writeMutableTree(objects, mutable);
        const commitId = yield* commits.writeCommitObject({
          author: options.author,
          committer: options.committer,
          message: options.message,
          parents: options.parents ?? (base === null ? [] : [base.id]),
          tree: root,
        });

        yield* refTx.update(ref, commitId, { expected });
        yield* changes.poll({ ref, source: "local" });

        return yield* snapshot(commitId);
      }).pipe(
        Effect.onExit(() =>
          Ref.update(state, (currentState) => ({ ...currentState, active: false })),
        ),
      );

      return {
        snapshot: yield* commitEffect,
        value,
      };
    });

    return GitStore.of({
      config: runtime.config,
      diff,
      get,
      history,
      key: runtime.key,
      list,
      pointerRef: pointerRefFor,
      resolveSnapshotId,
      snapshot,
      transaction,
    });
  }),
);

const pathConflict = (path: string, reason: string): Effect.Effect<never, PathConflictError> =>
  Effect.fail(
    new PathConflictError({
      message: `Path conflict at ${path}: ${reason}`,
      path,
    }),
  );

const listVirtualDocuments = (
  path: StorePath,
  docs: ReadonlyMap<string, VirtualDocument>,
  codec: import("./ObjectCodec.ts").ObjectCodecShape,
): Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError> =>
  Effect.gen(function* () {
    const children = new Map<string, "blob" | "tree">();

    for (const docPath of docs.keys()) {
      const child = directChildOf(path, docPath);
      if (child !== null) children.set(child.name, child.type);
    }

    const entries: Array<TreeEntry> = [];

    for (const [name, type] of [...children.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const childPath = joinStorePath(path, name) as StorePath;
      const objectId =
        type === "blob"
          ? docs.get(childPath)?.objectId
          : yield* virtualTreeObjectId(childPath, docs, codec);

      if (objectId === undefined) continue;

      entries.push({
        mode: type === "tree" ? "040000" : "100644",
        name,
        objectId,
        path: childPath,
        type,
      });
    }

    return entries;
  });

const virtualTreeObjectId = (
  path: StorePath,
  docs: ReadonlyMap<string, VirtualDocument>,
  codec: import("./ObjectCodec.ts").ObjectCodecShape,
): Effect.Effect<ObjectId, GitStoreError> =>
  Effect.gen(function* () {
    const entries = yield* listVirtualDocuments(path, docs, codec);
    const body = yield* encodeTreeBody(entries.map(({ path: _path, ...entry }) => entry));

    return yield* codec.hash("tree", body);
  });
