import { remoteTrackingRef } from "@cycle/git";
import { Context, Effect, Layer, Semaphore } from "effect";
import { GitSyncConflictError, type GitStoreError } from "./GitStoreErrors.ts";
import type { Change, ChangeSet, ObjectId, RefName, Snapshot } from "./GitStoreSchemas.ts";
import { CommitWriter } from "./CommitWriter.ts";
import { GitRemoteTransport } from "./GitRemoteTransport.ts";
import { GitStoreChanges, type GitStoreChangeSource } from "./GitStoreChanges.ts";
import { ObjectStore } from "./ObjectStore.ts";
import { RefReader } from "./RefReader.ts";
import { RefTransaction } from "./RefTransaction.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import { pointerRef, validatePointerName, validateRefName } from "./internal/refs.ts";
import { applyMutation, loadMutableTree, writeMutableTree } from "./internal/tree.ts";

export type GitSyncMode = "fetch" | "full" | "pull" | "push";
export type GitDivergenceMode = "error" | "rebase";

export type GitSyncOptions = {
  readonly mode?: GitSyncMode;
  readonly onDiverged?: GitDivergenceMode;
  readonly pointer?: string;
  readonly pointers?: ReadonlyArray<string>;
  readonly ref?: string;
  readonly remote?: string;
  readonly remoteRef?: string;
};

export type GitPointerSyncStatus =
  | "fast-forwarded"
  | "missing-remote-gitdb-ref"
  | "pushed"
  | "rebased"
  | "rejected"
  | "remote-deleted"
  | "up-to-date";

export type GitPointerSyncResult = {
  readonly localAfter?: ObjectId;
  readonly localBefore?: ObjectId;
  readonly pointer: string;
  readonly ref: RefName;
  readonly remoteAfter?: ObjectId;
  readonly remoteBefore?: ObjectId;
  readonly remoteRef: string;
  readonly status: GitPointerSyncStatus;
};

export type GitSyncResult = {
  readonly pointers: ReadonlyArray<GitPointerSyncResult>;
  readonly remote: string;
};

export type GitStoreSyncShape = {
  readonly fetch: (options?: GitSyncOptions) => Effect.Effect<GitSyncResult, GitStoreError>;
  readonly pull: (options?: GitSyncOptions) => Effect.Effect<GitSyncResult, GitStoreError>;
  readonly push: (options?: GitSyncOptions) => Effect.Effect<GitSyncResult, GitStoreError>;
  readonly sync: (options?: GitSyncOptions) => Effect.Effect<GitSyncResult, GitStoreError>;
};

export class GitStoreSync extends Context.Service<GitStoreSync, GitStoreSyncShape>()(
  "@cycle/git-store/GitStoreSync",
) {}

type ResolvedPointer = {
  readonly pointer: string;
  readonly ref: RefName;
  readonly remoteRef: string;
};

type ResolvedSyncOptions = {
  readonly divergence: GitDivergenceMode;
  readonly mode: GitSyncMode;
  readonly pointers: ReadonlyArray<ResolvedPointer>;
  readonly remote: string;
};

export const GitStoreSyncLive = Layer.effect(
  GitStoreSync,
  Effect.gen(function* () {
    const changes = yield* GitStoreChanges;
    const commits = yield* CommitWriter;
    const objects = yield* ObjectStore;
    const refs = yield* RefReader;
    const refTx = yield* RefTransaction;
    const remote = yield* GitRemoteTransport;
    const runtime = yield* GitStoreRuntime;
    const semaphore = yield* Semaphore.make(1);

    const resolvePointer = Effect.fn("GitStoreSync.resolvePointer")(function* (
      pointerName: string,
      options: Pick<GitSyncOptions, "ref" | "remoteRef">,
    ) {
      const pointer = yield* validatePointerName(pointerName);
      const ref =
        options.ref === undefined
          ? pointerRef(runtime.config.namespace, runtime.config.database, pointer)
          : yield* validateRefName(options.ref);

      return {
        pointer,
        ref,
        remoteRef: options.remoteRef ?? ref,
      } satisfies ResolvedPointer;
    });

    const resolve = Effect.fn("GitStoreSync.resolve")(function* (
      options: GitSyncOptions = {},
      mode: GitSyncMode,
    ) {
      const names =
        options.pointers ??
        (options.pointer === undefined ? [runtime.config.defaultPointer] : [options.pointer]);
      const pointers = yield* Effect.forEach(names, (pointerName) =>
        resolvePointer(pointerName, options),
      );

      return {
        divergence: options.onDiverged ?? "error",
        mode,
        pointers,
        remote: options.remote ?? "origin",
      } satisfies ResolvedSyncOptions;
    });

    const syncUnlocked: (
      options: ResolvedSyncOptions,
      source: GitStoreChangeSource,
    ) => Effect.Effect<GitSyncResult, GitStoreError> = Effect.fn("GitStoreSync.syncUnlocked")(function* (
      options: ResolvedSyncOptions,
      source: GitStoreChangeSource,
    ) {
      const results: Array<GitPointerSyncResult> = [];
      const remoteBeforeFetch = new Map<string, ObjectId | null>();
      const remoteHeads = new Map<string, ObjectId | null>();
      const fetchesRemote =
        options.mode === "fetch" || options.mode === "pull" || options.mode === "full";

      if (fetchesRemote) {
        for (const pointer of options.pointers) {
          remoteBeforeFetch.set(
            pointer.ref,
            yield* refs.read(remoteTrackingRef(options.remote, pointer.remoteRef)),
          );
          const remoteHead = yield* remote.lsRemote({
            cwd: runtime.config.cwd,
            ref: pointer.remoteRef,
            remote: options.remote,
          });

          remoteHeads.set(pointer.ref, remoteHead);
          if (remoteHead !== null) {
            yield* remote.fetch({
              cwd: runtime.config.cwd,
              ref: pointer.remoteRef,
              remote: options.remote,
            });
          }
        }
      }

      for (const pointer of options.pointers) {
        const localBefore = yield* refs.read(pointer.ref);
        const remoteBefore = fetchesRemote
          ? (remoteHeads.get(pointer.ref) ?? null)
          : yield* remote.lsRemote({
              cwd: runtime.config.cwd,
              ref: pointer.remoteRef,
              remote: options.remote,
            });
        const trackedBefore = remoteBeforeFetch.get(pointer.ref);
        const remoteDeleted =
          fetchesRemote &&
          trackedBefore !== undefined &&
          trackedBefore !== null &&
          remoteBefore === null;
        const base = resultBase(pointer, localBefore, remoteDeleted ? trackedBefore : remoteBefore);

        if (remoteDeleted) {
          results.push({
            ...base,
            localAfter: localBefore ?? undefined,
            status: "remote-deleted",
          });
          continue;
        }

        if (localBefore === null && remoteBefore === null) {
          results.push({
            ...base,
            status: "missing-remote-gitdb-ref",
          });
          continue;
        }

        if (localBefore === remoteBefore) {
          results.push({
            ...base,
            localAfter: localBefore ?? undefined,
            remoteAfter: remoteBefore ?? undefined,
            status: "up-to-date",
          });
          continue;
        }

        if (options.mode === "fetch") {
          results.push({
            ...base,
            localAfter: localBefore ?? undefined,
            remoteAfter: remoteBefore ?? undefined,
            status: "up-to-date",
          });
          continue;
        }

        if (
          localBefore === null &&
          remoteBefore !== null &&
          (options.mode === "pull" || options.mode === "full")
        ) {
          yield* refTx.update(pointer.ref, remoteBefore, { expected: null });
          yield* changes.poll({ ref: pointer.ref, source });
          results.push({
            ...base,
            localAfter: remoteBefore,
            remoteAfter: remoteBefore,
            status: "fast-forwarded",
          });
          continue;
        }

        if (
          localBefore !== null &&
          remoteBefore === null &&
          (options.mode === "push" || options.mode === "full")
        ) {
          yield* pushPointer(pointer, options.remote, localBefore, null);
          yield* changes.poll({ ref: pointer.ref, source });
          results.push({
            ...base,
            localAfter: localBefore,
            remoteAfter: localBefore,
            status: "pushed",
          });
          continue;
        }

        if (localBefore === null || remoteBefore === null) {
          results.push({
            ...base,
            localAfter: localBefore ?? undefined,
            remoteAfter: remoteBefore ?? undefined,
            status: "rejected",
          });
          continue;
        }

        const localDescendsFromRemote = yield* objects.isAncestor(remoteBefore, localBefore);
        const remoteDescendsFromLocal = yield* objects.isAncestor(localBefore, remoteBefore);

        if (remoteDescendsFromLocal && (options.mode === "pull" || options.mode === "full")) {
          yield* refTx.update(pointer.ref, remoteBefore, { expected: localBefore });
          yield* changes.poll({ ref: pointer.ref, source });
          results.push({
            ...base,
            localAfter: remoteBefore,
            remoteAfter: remoteBefore,
            status: "fast-forwarded",
          });
          continue;
        }

        if (remoteDescendsFromLocal && options.mode === "push") {
          results.push({
            ...base,
            localAfter: localBefore,
            remoteAfter: remoteBefore,
            status: "rejected",
          });
          continue;
        }

        if (localDescendsFromRemote && (options.mode === "push" || options.mode === "full")) {
          yield* pushPointer(pointer, options.remote, localBefore, remoteBefore);
          yield* changes.poll({ ref: pointer.ref, source });
          results.push({
            ...base,
            localAfter: localBefore,
            remoteAfter: localBefore,
            status: "pushed",
          });
          continue;
        }

        if (localDescendsFromRemote && options.mode === "pull") {
          results.push({
            ...base,
            localAfter: localBefore,
            remoteAfter: remoteBefore,
            status: "up-to-date",
          });
          continue;
        }

        const mergeBase = yield* objects.mergeBase(localBefore, remoteBefore);

        if (
          options.divergence === "rebase" &&
          mergeBase !== null &&
          (options.mode === "full" || options.mode === "push")
        ) {
          const rebased = yield* rebaseDivergedPointer(pointer, options.remote, {
            localBefore,
            mergeBase,
            remoteBefore,
          });

          yield* changes.poll({ ref: pointer.ref, source });
          results.push({
            ...base,
            localAfter: rebased,
            remoteAfter: rebased,
            status: "rebased",
          });
          continue;
        }

        return yield* new GitSyncConflictError({
          local: localBefore,
          mergeBase: mergeBase ?? undefined,
          message: `Sync conflict for ${pointer.pointer}: local ${localBefore}, remote ${remoteBefore}`,
          ref: pointer.ref,
          remote: remoteBefore,
        });
      }

      return {
        pointers: results,
        remote: options.remote,
      };
    });

    const pushPointer: (
      pointer: ResolvedPointer,
      remoteName: string,
      target: ObjectId,
      expected: ObjectId | null,
    ) => Effect.Effect<void, GitStoreError> = Effect.fn("GitStoreSync.pushPointer")(function* (
      pointer: ResolvedPointer,
      remoteName: string,
      target: ObjectId,
      expected: ObjectId | null,
    ) {
      yield* remote.push({
        cwd: runtime.config.cwd,
        expected,
        ref: pointer.remoteRef,
        remote: remoteName,
        target,
      });
    });

    const fetch = Effect.fn("GitStoreSync.fetch")(function* (options: GitSyncOptions = {}) {
      const resolved = yield* resolve(options, "fetch");

      return yield* semaphore.withPermit(syncUnlocked(resolved, "fetch"));
    });

    const pull = Effect.fn("GitStoreSync.pull")(function* (options: GitSyncOptions = {}) {
      const resolved = yield* resolve(options, "pull");

      return yield* semaphore.withPermit(syncUnlocked(resolved, "pull"));
    });

    const push = Effect.fn("GitStoreSync.push")(function* (options: GitSyncOptions = {}) {
      const resolved = yield* resolve(options, "push");

      return yield* semaphore.withPermit(syncUnlocked(resolved, "push"));
    });

    const sync = Effect.fn("GitStoreSync.sync")(function* (options: GitSyncOptions = {}) {
      const resolved = yield* resolve(options, options.mode ?? "full");

      return yield* semaphore.withPermit(syncUnlocked(resolved, "sync"));
    });

    const applyChangesToTree: (
      root: ReturnType<typeof loadMutableTree>,
      changes: ChangeSet,
    ) => Effect.Effect<void, GitStoreError> = Effect.fn("GitStoreSync.applyChangesToTree")(function* (
      root: ReturnType<typeof loadMutableTree>,
      changes: ChangeSet,
    ) {
      for (const change of changesInSet(changes)) {
        if (change.newObjectId === undefined) {
          yield* applyMutation(objects, root, change.path, { kind: "delete" });
          continue;
        }

        yield* applyMutation(objects, root, change.path, {
          bytes: yield* objects.readBlob(change.newObjectId),
          kind: "put",
        });
      }
    });

    const localSnapshotsSince: (
      pointer: ResolvedPointer,
      input: {
        readonly fromExclusive: ObjectId;
        readonly toInclusive: ObjectId;
      },
    ) => Effect.Effect<ReadonlyArray<Snapshot>, GitStoreError> = Effect.fn(
      "GitStoreSync.localSnapshotsSince",
    )(function* (
      pointer: ResolvedPointer,
      input: {
        readonly fromExclusive: ObjectId;
        readonly toInclusive: ObjectId;
      },
    ) {
      const snapshots: Array<Snapshot> = [];
      let current = input.toInclusive;

      while (current !== input.fromExclusive) {
        const snapshot = commitToSnapshot(yield* objects.readCommit(current));
        snapshots.push(snapshot);

        const parent = snapshot.parents[0];
        if (parent === undefined) {
          return yield* new GitSyncConflictError({
            local: input.toInclusive,
            message: `Sync conflict for ${pointer.pointer}: local ${input.toInclusive}, remote ${input.fromExclusive}`,
            ref: pointer.ref,
            remote: input.fromExclusive,
          });
        }

        current = parent;
      }

      return snapshots.reverse();
    });

    const rebaseDivergedPointer: (
      pointer: ResolvedPointer,
      remoteName: string,
      input: {
        readonly localBefore: ObjectId;
        readonly mergeBase: ObjectId;
        readonly remoteBefore: ObjectId;
      },
    ) => Effect.Effect<ObjectId, GitStoreError> = Effect.fn(
      "GitStoreSync.rebaseDivergedPointer",
    )(function* (
      pointer: ResolvedPointer,
      remoteName: string,
      input: {
        readonly localBefore: ObjectId;
        readonly mergeBase: ObjectId;
        readonly remoteBefore: ObjectId;
      },
    ) {
      const localChanges = yield* diff(input.mergeBase, input.localBefore);
      const remoteChanges = yield* diff(input.mergeBase, input.remoteBefore);

      if (hasMergeConflict(localChanges, remoteChanges)) {
        return yield* new GitSyncConflictError({
          local: input.localBefore,
          mergeBase: input.mergeBase,
          message: `Sync conflict for ${pointer.pointer}: local ${input.localBefore}, remote ${input.remoteBefore}`,
          ref: pointer.ref,
          remote: input.remoteBefore,
        });
      }

      const localSnapshots = yield* localSnapshotsSince(pointer, {
        fromExclusive: input.mergeBase,
        toInclusive: input.localBefore,
      });
      let rebasedSnapshotId = input.remoteBefore;

      for (const snapshot of localSnapshots) {
        const originalParent = snapshot.parents[0] ?? input.mergeBase;
        const changes = yield* diff(originalParent, snapshot.id);
        const base = commitToSnapshot(yield* objects.readCommit(rebasedSnapshotId));
        const root = loadMutableTree(base.root);

        yield* applyChangesToTree(root, changes);

        const tree = yield* writeMutableTree(objects, root);
        rebasedSnapshotId = yield* commits.writeCommitObject({
          author: snapshot.author,
          committer: snapshot.committer,
          message: snapshot.message ?? `Rebase GitDB pointer ${pointer.pointer}`,
          parents: [rebasedSnapshotId],
          tree,
        });
      }

      yield* refTx.update(pointer.ref, rebasedSnapshotId, { expected: input.localBefore });
      yield* pushPointer(pointer, remoteName, rebasedSnapshotId, input.remoteBefore);

      return rebasedSnapshotId;
    });

    const diff: (
      left: ObjectId,
      right: ObjectId,
    ) => Effect.Effect<ChangeSet, GitStoreError> = Effect.fn("GitStoreSync.diff")(function* (
      left: ObjectId,
      right: ObjectId,
    ) {
      const leftSnapshot = commitToSnapshot(yield* objects.readCommit(left));
      const rightSnapshot = commitToSnapshot(yield* objects.readCommit(right));
      const leftFiles = yield* flattenTree(leftSnapshot.root);
      const rightFiles = yield* flattenTree(rightSnapshot.root);
      const added: Array<Change> = [];
      const deleted: Array<Change> = [];
      const modified: Array<Change> = [];

      for (const [path, objectId] of [...rightFiles.entries()].sort(([x], [y]) =>
        x.localeCompare(y),
      )) {
        const oldObjectId = leftFiles.get(path);

        if (oldObjectId === undefined) {
          added.push({ newObjectId: objectId, path: path as Change["path"] });
        } else if (oldObjectId !== objectId) {
          modified.push({ newObjectId: objectId, oldObjectId, path: path as Change["path"] });
        }
      }

      for (const [path, objectId] of [...leftFiles.entries()].sort(([x], [y]) =>
        x.localeCompare(y),
      )) {
        if (!rightFiles.has(path)) {
          deleted.push({ oldObjectId: objectId, path: path as Change["path"] });
        }
      }

      return { added, deleted, modified };
    });

    const flattenTree: (
      rootTree: ObjectId,
      prefix?: string,
    ) => Effect.Effect<Map<string, ObjectId>, GitStoreError> = Effect.fn(
      "GitStoreSync.flattenTree",
    )(function* (
      rootTree: ObjectId,
      prefix = "",
    ) {
      const output = new Map<string, ObjectId>();

      for (const entry of yield* objects.readTree(rootTree)) {
        const entryPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

        if (entry.type === "tree") {
          for (const [nestedPath, objectId] of yield* flattenTree(entry.objectId, entryPath)) {
            output.set(nestedPath, objectId);
          }
        } else {
          output.set(entryPath, entry.objectId);
        }
      }

      return output;
    });

    return GitStoreSync.of({
      fetch,
      pull,
      push,
      sync,
    });
  }),
);

const resultBase = (
  pointer: ResolvedPointer,
  localBefore: ObjectId | null,
  remoteBefore: ObjectId | null,
): Omit<GitPointerSyncResult, "status"> => ({
  localBefore: localBefore ?? undefined,
  pointer: pointer.pointer,
  ref: pointer.ref,
  remoteBefore: remoteBefore ?? undefined,
  remoteRef: pointer.remoteRef,
});

const commitToSnapshot = (
  commit: import("./ObjectStore.ts").CommitObject,
): Snapshot => ({
  author: commit.author,
  committer: commit.committer,
  createdAt: commit.committer?.date,
  id: commit.id,
  message: commit.message,
  parents: commit.parents,
  root: commit.tree,
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
