import { Cache, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import type { ObjectId } from "../schemas/index.ts";
import {
  gitAdapterError,
  remoteFetchError,
  remotePushError,
  type GitAdapterError,
} from "../errors/index.ts";
import { bytesToString } from "../internals/bytes.ts";
import { Git, type GitService } from "./Git.ts";
import {
  isAncestor,
  mergeBase,
  parseCommitSummary,
  rootCommits,
  writeFilesystemCommit,
} from "./GitFilesystemCommit.ts";
import { readObject, readObjectUncached, writeObject } from "./GitFilesystemObject.ts";
import {
  deleteLooseRef,
  readLooseRefs,
  readPackedRefs,
  readPackedRefsFileFromCacheKey,
  readRef,
  writeLooseRef,
} from "./GitFilesystemRef.ts";
import { readFilesystemTree, writeFilesystemTree } from "./GitFilesystemTree.ts";
import {
  decodeObjectCacheKey,
  type CommitSummary,
  type FilesystemRuntime,
  type FilesystemRuntimeBase,
  type GitObject,
  type ParsedPackIndex,
} from "./GitFilesystemTypes.ts";
import { parseCommit } from "./GitObjectCodec.ts";
import { parsePackIndex } from "./GitPackIndex.ts";

export const layer = Layer.effect(
  Git,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fsRuntime: FilesystemRuntimeBase = { crypto, fs, path };
    const packFiles = yield* Cache.make<string, Uint8Array, GitAdapterError>({
      capacity: 8,
      lookup: (packPath) =>
        fs
          .readFile(packPath)
          .pipe(Effect.mapError((cause) => gitAdapterError("filesystem pack read", String(cause)))),
    });
    const packIndexes = yield* Cache.make<string, ParsedPackIndex, GitAdapterError>({
      capacity: 64,
      lookup: (indexPath) =>
        fs.readFile(indexPath).pipe(
          Effect.mapError((cause) => gitAdapterError("filesystem pack index", String(cause))),
          Effect.flatMap((bytes) => parsePackIndex(bytes, indexPath)),
        ),
    });
    const packedRefs = yield* Cache.make<string, Map<string, ObjectId>, GitAdapterError>({
      capacity: 64,
      lookup: (key) => readPackedRefsFileFromCacheKey(fsRuntime, key),
    });
    const runtimeBase: FilesystemRuntimeBase & {
      readonly packFiles: typeof packFiles;
      readonly packIndexes: typeof packIndexes;
    } = { crypto, fs, packFiles, packIndexes, path };
    const objects = yield* Cache.make<string, GitObject, GitAdapterError>({
      capacity: 8192,
      lookup: (key) => {
        const decoded = decodeObjectCacheKey(key);

        return readObjectUncached(runtimeBase, decoded.gitDir, decoded.id);
      },
    });
    let commitSummaries!: Cache.Cache<string, CommitSummary, GitAdapterError>;

    commitSummaries = yield* Cache.make<string, CommitSummary, GitAdapterError>({
      capacity: 8192,
      lookup: (key) => {
        const decoded = decodeObjectCacheKey(key);
        const runtime = makeRuntime(runtimeBase, objects, commitSummaries, packedRefs);

        return readObject(runtime, decoded.gitDir, decoded.id, "commit").pipe(
          Effect.flatMap((object) => parseCommitSummary(decoded.id, object.payload)),
        );
      },
    });
    const runtime = makeRuntime(runtimeBase, objects, commitSummaries, packedRefs);

    const service: GitService = {
      deleteRef: (store, input) =>
        Effect.gen(function* () {
          const actual = yield* readRef(runtime, store.gitDir, input.ref);

          if ("expected" in input && actual !== (input.expected ?? null)) {
            return yield* Effect.fail(
              gitAdapterError(
                "filesystem deleteRef",
                `ref ${input.ref} expected ${input.expected ?? "<missing>"} but was ${
                  actual ?? "<missing>"
                }`,
              ),
            );
          }

          yield* deleteLooseRef(runtime, store.gitDir, input.ref);
        }),
      fetch: (_store, input) =>
        Effect.fail(
          remoteFetchError(
            input.remote,
            "filesystem fetch",
            "GitFilesystem does not implement Git transport; use GitCli for fetch",
          ),
        ),
      isAncestor: (store, ancestor, descendant) =>
        isAncestor(runtime, store.gitDir, ancestor, descendant),
      isCommit: (store, id) =>
        readObject(runtime, store.gitDir, id).pipe(
          Effect.map((object) => object.type === "commit"),
          Effect.catch(() => Effect.succeed(false)),
        ),
      listRefs: (store, prefix) =>
        Effect.gen(function* () {
          const loose = yield* readLooseRefs(runtime, store.gitDir);
          const packed = yield* readPackedRefs(runtime, store.gitDir);
          const refs = new Map<string, ObjectId>(packed);

          for (const ref of loose) {
            refs.set(ref.name, ref.target);
          }

          return [...refs]
            .filter(([name]) => name.startsWith(prefix))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, target]) => ({ name, target }));
        }),
      mergeBase: (store, a, b) => mergeBase(runtime, store.gitDir, a, b),
      push: (_store, input) =>
        Effect.fail(
          remotePushError(
            input.remote,
            "filesystem push",
            "GitFilesystem does not implement Git transport; use GitCli for push",
          ),
        ),
      readBlob: (store, id) =>
        readObject(runtime, store.gitDir, id, "blob").pipe(Effect.map((object) => object.payload)),
      readCommit: (store, id) =>
        readObject(runtime, store.gitDir, id, "commit").pipe(
          Effect.flatMap((object) => parseCommit(id, bytesToString(object.payload))),
        ),
      readRef: (store, name) => readRef(runtime, store.gitDir, name),
      rootCommits: (store, start) => rootCommits(runtime, store.gitDir, start),
      readTree: (store, id) =>
        readObject(runtime, store.gitDir, id, "tree").pipe(
          Effect.flatMap((object) => readFilesystemTree(object.payload)),
        ),
      updateRef: (store, input) =>
        Effect.gen(function* () {
          const actual = yield* readRef(runtime, store.gitDir, input.ref);

          if ("expected" in input && actual !== (input.expected ?? null)) {
            return yield* Effect.fail(
              gitAdapterError(
                "filesystem updateRef",
                `ref ${input.ref} expected ${input.expected ?? "<missing>"} but was ${
                  actual ?? "<missing>"
                }`,
              ),
            );
          }

          yield* writeLooseRef(runtime, store.gitDir, input.ref, input.target);
        }),
      writeBlob: (store, bytes) => writeObject(runtime, store.gitDir, "blob", bytes),
      writeCommit: (store, input) => writeFilesystemCommit(runtime, store.gitDir, input),
      writeTree: (store, entries) => writeFilesystemTree(runtime, store.gitDir, entries),
    };

    return service;
  }),
);

export const Live = layer;

const makeRuntime = (
  base: FilesystemRuntimeBase & {
    readonly packFiles: FilesystemRuntime["packFiles"];
    readonly packIndexes: FilesystemRuntime["packIndexes"];
  },
  objects: FilesystemRuntime["objects"],
  commitSummaries: FilesystemRuntime["commitSummaries"],
  packedRefs: FilesystemRuntime["packedRefs"],
): FilesystemRuntime => ({
  ...base,
  commitSummaries,
  objects,
  packedRefs,
});
