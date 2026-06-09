import { deflateSync, inflateSync } from "node:zlib";
import { Cache, Clock, Crypto, Effect, FileSystem, Layer, Option, Path } from "effect";
import type { ObjectId, Ref as GitRef, TreeEntry } from "../domain/index.ts";
import {
  gitAdapterError,
  remoteFetchError,
  remotePushError,
  type GitAdapterError,
} from "../errors/index.ts";
import { bytesFromString, bytesToString, concatBytes } from "../internals/bytes.ts";
import { sha1Hex } from "../internals/hash.ts";
import { formatIdentity, normalizeIdentity } from "../internals/identity.ts";
import { Git, type GitService, type GitStore } from "./Git.ts";
import { parseCommit } from "./GitObjectCodec.ts";
import { parsePackIndex, readPackedObject, type ParsedPackIndex } from "./GitPack.ts";

type Runtime = {
  readonly commitSummaries: Cache.Cache<string, CommitSummary, GitAdapterError>;
  readonly crypto: Crypto.Crypto;
  readonly fs: FileSystem.FileSystem;
  readonly objects: Cache.Cache<string, GitObject, GitAdapterError>;
  readonly packFiles: Cache.Cache<string, Uint8Array, GitAdapterError>;
  readonly packIndexes: Cache.Cache<string, ParsedPackIndex, GitAdapterError>;
  readonly packedRefs: Cache.Cache<string, Map<string, ObjectId>, GitAdapterError>;
  readonly path: Path.Path;
};

type RuntimeBase = {
  readonly crypto: Crypto.Crypto;
  readonly fs: FileSystem.FileSystem;
  readonly packFiles?: Cache.Cache<string, Uint8Array, GitAdapterError>;
  readonly packIndexes?: Cache.Cache<string, ParsedPackIndex, GitAdapterError>;
  readonly path: Path.Path;
};

type GitObject = {
  readonly payload: Uint8Array;
  readonly type: "blob" | "commit" | "tree";
};

type CommitSummary = {
  readonly committerTime?: number;
  readonly id: ObjectId;
  readonly parents: ReadonlyArray<ObjectId>;
  readonly tree: ObjectId;
};

export const layer = Layer.effect(
  Git,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fsRuntime: RuntimeBase = { crypto, fs, path };
    const packFiles = yield* Cache.make<string, Uint8Array, GitAdapterError>({
      capacity: 8,
      lookup: (packPath) =>
        fs
          .readFile(packPath)
          .pipe(Effect.mapError(mapFsError("filesystem pack read", packPath))),
    });
    const packIndexes = yield* Cache.make<string, ParsedPackIndex, GitAdapterError>({
      capacity: 64,
      lookup: (indexPath) =>
        fs.readFile(indexPath).pipe(
          Effect.mapError(mapFsError("filesystem pack index", indexPath)),
          Effect.flatMap((bytes) => parsePackIndex(bytes, indexPath)),
        ),
    });
    const packedRefs = yield* Cache.make<string, Map<string, ObjectId>, GitAdapterError>({
      capacity: 64,
      lookup: (key) => readPackedRefsFile(fsRuntime, decodePackedRefsCacheKey(key)),
    });
    const runtimeBase: RuntimeBase = { crypto, fs, packFiles, packIndexes, path };
    const objects = yield* Cache.make<string, GitObject, GitAdapterError>({
      capacity: 8192,
      lookup: (key) => {
        const decoded = decodeObjectCacheKey(key);

        return readObjectUncached(runtimeBase, decoded.gitDir, decoded.id);
      },
    });
    const commitSummaries = yield* Cache.make<string, CommitSummary, GitAdapterError>({
      capacity: 8192,
      lookup: (key) => {
        const decoded = decodeObjectCacheKey(key);
        const runtime: Runtime = {
          ...runtimeBase,
          commitSummaries,
          objects,
          packFiles,
          packIndexes,
          packedRefs,
        };

        return readObject(runtime, { cwd: "", gitDir: decoded.gitDir }, decoded.id, "commit").pipe(
          Effect.flatMap((object) => parseCommitSummary(decoded.id, object.payload)),
        );
      },
    });
    const runtime: Runtime = {
      ...runtimeBase,
      commitSummaries,
      objects,
      packFiles,
      packIndexes,
      packedRefs,
    };

    const service: GitService = {
      deleteRef: (store, input) =>
        Effect.gen(function* () {
          const actual = yield* readRef(runtime, store, input.ref);

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

          yield* deleteLooseRef(runtime, store, input.ref);
        }),
      fetch: (_store, input) =>
        Effect.fail(
          remoteFetchError(
            input.remote,
            "filesystem fetch",
            "GitFilesystem does not implement Git transport; use GitCli for fetch",
          ),
        ),
      isAncestor: (store, ancestor, descendant) => isAncestor(runtime, store, ancestor, descendant),
      isCommit: (store, id) =>
        readObject(runtime, store, id).pipe(
          Effect.map((object) => object.type === "commit"),
          Effect.catch(() => Effect.succeed(false)),
        ),
      listRefs: (store, prefix) =>
        Effect.gen(function* () {
          const loose = yield* readLooseRefs(runtime, store);
          const packed = yield* readPackedRefs(runtime, store);
          const refs = new Map<string, ObjectId>(packed);

          for (const ref of loose) {
            refs.set(ref.name, ref.target);
          }

          return [...refs]
            .filter(([name]) => name.startsWith(prefix))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, target]) => ({ name, target }));
        }),
      mergeBase: (store, a, b) => mergeBase(runtime, store, a, b),
      push: (_store, input) =>
        Effect.fail(
          remotePushError(
            input.remote,
            "filesystem push",
            "GitFilesystem does not implement Git transport; use GitCli for push",
          ),
        ),
      readBlob: (store, id) =>
        readObject(runtime, store, id, "blob").pipe(Effect.map((object) => object.payload)),
      readCommit: (store, id) =>
        readObject(runtime, store, id, "commit").pipe(
          Effect.flatMap((object) => parseCommit(id, bytesToString(object.payload))),
        ),
      readRef: (store, name) => readRef(runtime, store, name),
      readTree: (store, id) =>
        readObject(runtime, store, id, "tree").pipe(
          Effect.flatMap((object) => parseTree(object.payload)),
        ),
      updateRef: (store, input) =>
        Effect.gen(function* () {
          const actual = yield* readRef(runtime, store, input.ref);

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

          yield* writeLooseRef(runtime, store, input.ref, input.target);
        }),
      writeBlob: (store, bytes) => writeObject(runtime, store, "blob", bytes),
      writeCommit: (store, input) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const author = normalizeIdentity(input.author, now);
          const committer = normalizeIdentity(input.committer ?? input.author, now);
          const parents = input.parents ?? [];
          const headers = [
            `tree ${input.tree}`,
            ...parents.map((parent) => `parent ${parent}`),
            `author ${formatIdentity(author)}`,
            `committer ${formatIdentity(committer)}`,
          ];
          const message = input.message ?? "Update GitDB snapshot";
          const payload = bytesFromString(`${headers.join("\n")}\n\n${message}\n`);

          const id = yield* writeObject(runtime, store, "commit", payload);

          yield* Cache.set(runtime.commitSummaries, objectCacheKey(store.gitDir, id), {
            committerTime: committer.timestamp,
            id,
            parents,
            tree: input.tree,
          });

          return id;
        }),
      writeTree: (store, entries) =>
        Effect.gen(function* () {
          const parts: Array<Uint8Array> = [];

          for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
            parts.push(bytesFromString(`${gitTreeMode(entry.mode)} ${entry.name}\0`));
            parts.push(yield* hexToBytes(entry.objectId, "filesystem writeTree"));
          }

          return yield* writeObject(runtime, store, "tree", concatBytes(parts));
        }),
    };

    return service;
  }),
);

export const Live = layer;

const looseObjectPath = (runtime: Runtime, store: GitStore, id: ObjectId): string =>
  runtime.path.join(store.gitDir, "objects", id.slice(0, 2), id.slice(2));

const looseRefPath = (runtime: Runtime, store: GitStore, ref: string): string =>
  runtime.path.join(store.gitDir, ...ref.split("/"));

const packedRefsPath = (runtime: Runtime, store: GitStore): string =>
  runtime.path.join(store.gitDir, "packed-refs");

const packedRefsCacheKey = (file: string, info: FileSystem.File.Info): string => {
  const mtime = Option.match(info.mtime, {
    onNone: () => "",
    onSome: (date) => String(date.getTime()),
  });

  return `${file}\0${info.size.toString()}\0${mtime}`;
};

const decodePackedRefsCacheKey = (key: string): string => key.slice(0, key.indexOf("\0"));

const objectCacheKey = (gitDir: string, id: ObjectId): string => `${gitDir}\0${id}`;

const decodeObjectCacheKey = (
  key: string,
): { readonly gitDir: string; readonly id: ObjectId } => {
  const separator = key.lastIndexOf("\0");

  return {
    gitDir: key.slice(0, separator),
    id: key.slice(separator + 1),
  };
};

const mapFsError =
  (operation: string, target: string) =>
  (cause: unknown): GitAdapterError =>
    gitAdapterError(operation, `${operation} failed for ${target}: ${errorMessage(cause)}`, {
      cause,
    });

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const inflate = (
  bytes: Uint8Array,
  operation: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.try({
    try: () => new Uint8Array(inflateSync(bytes)),
    catch: (cause) => gitAdapterError(operation, "Could not inflate Git object", { cause }),
  });

const deflate = (
  bytes: Uint8Array,
  operation: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.try({
    try: () => new Uint8Array(deflateSync(bytes)),
    catch: (cause) => gitAdapterError(operation, "Could not deflate Git object", { cause }),
  });

const readObject = (
  runtime: Runtime,
  store: GitStore,
  id: ObjectId,
  expectedType?: GitObject["type"],
): Effect.Effect<GitObject, GitAdapterError> =>
  Cache.get(runtime.objects, objectCacheKey(store.gitDir, id)).pipe(
    Effect.flatMap((object) => {
      if (expectedType !== undefined && object.type !== expectedType) {
        return Effect.fail(
          gitAdapterError(
            "filesystem readObject",
            `Object ${id} expected ${expectedType} but contained ${object.type}`,
          ),
        );
      }

      return Effect.succeed(object);
    }),
  );

const readObjectUncached = (
  runtime: RuntimeBase,
  gitDir: string,
  id: ObjectId,
): Effect.Effect<GitObject, GitAdapterError> =>
  Effect.gen(function* () {
    const objectPath = runtime.path.join(gitDir, "objects", id.slice(0, 2), id.slice(2));
    const exists = yield* runtime.fs
      .exists(objectPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) {
      const packed = yield* readPackedObject(runtime, gitDir, id);

      if (packed === null) {
        return yield* Effect.fail(
          gitAdapterError("filesystem readObject", `Object not found: ${id}`),
        );
      }

      return packed;
    }

    const compressed = yield* runtime.fs
      .readFile(objectPath)
      .pipe(Effect.mapError(mapFsError("filesystem readObject", objectPath)));
    const raw = yield* inflate(compressed, "filesystem readObject");
    const headerEnd = raw.indexOf(0);

    if (headerEnd === -1) {
      return yield* Effect.fail(
        gitAdapterError("filesystem readObject", `Object ${id} has no header terminator`),
      );
    }

    const header = bytesToString(raw.subarray(0, headerEnd));
    const match = /^(blob|commit|tree) (\d+)$/u.exec(header);

    if (match === null) {
      return yield* Effect.fail(
        gitAdapterError("filesystem readObject", `Object ${id} has an invalid header: ${header}`),
      );
    }

    const type = match[1] as GitObject["type"];
    const size = Number.parseInt(match[2], 10);
    const payload = raw.subarray(headerEnd + 1);

    if (payload.byteLength !== size) {
      return yield* Effect.fail(
        gitAdapterError(
          "filesystem readObject",
          `Object ${id} expected ${size} bytes but contained ${payload.byteLength}`,
        ),
      );
    }

    return { payload, type };
  });

const writeObject = (
  runtime: Runtime,
  store: GitStore,
  type: GitObject["type"],
  payload: Uint8Array,
): Effect.Effect<ObjectId, GitAdapterError> =>
  Effect.gen(function* () {
    const objectBytes = concatBytes([bytesFromString(`${type} ${payload.byteLength}\0`), payload]);
    const id = yield* sha1Hex(objectBytes).pipe(
      Effect.provideService(Crypto.Crypto, runtime.crypto),
    );
    const objectPath = looseObjectPath(runtime, store, id);
    const objectDirectory = runtime.path.dirname(objectPath);
    const exists = yield* runtime.fs
      .exists(objectPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (exists) return id;

    const compressed = yield* deflate(objectBytes, "filesystem writeObject");
    const now = yield* Clock.currentTimeMillis;
    const lockPath = `${objectPath}.${now}.tmp`;

    yield* runtime.fs
      .makeDirectory(objectDirectory, { recursive: true })
      .pipe(Effect.mapError(mapFsError("filesystem writeObject", objectDirectory)));
    yield* runtime.fs
      .writeFile(lockPath, compressed, { flag: "wx", mode: 0o444 })
      .pipe(Effect.mapError(mapFsError("filesystem writeObject", lockPath)));
    yield* runtime.fs.rename(lockPath, objectPath).pipe(
      Effect.catch((cause) =>
        runtime.fs.remove(lockPath, { force: true }).pipe(
          Effect.catch(() => Effect.void),
          Effect.flatMap(() =>
            runtime.fs.exists(objectPath).pipe(
              Effect.catch(() => Effect.succeed(false)),
              Effect.flatMap((currentExists) =>
                currentExists
                  ? Effect.succeed(undefined)
                  : Effect.fail(mapFsError("filesystem writeObject", objectPath)(cause)),
              ),
            ),
          ),
        ),
      ),
    );
    yield* Cache.set(runtime.objects, objectCacheKey(store.gitDir, id), { payload, type });

    return id;
  });

const readRef = (
  runtime: Runtime,
  store: GitStore,
  ref: string,
  seen: ReadonlySet<string> = new Set(),
): Effect.Effect<ObjectId | null, GitAdapterError> =>
  Effect.gen(function* () {
    if (seen.has(ref)) {
      return yield* Effect.fail(
        gitAdapterError("filesystem readRef", `Symbolic ref cycle detected at ${ref}`),
      );
    }

    const loose = yield* readLooseRef(runtime, store, ref);

    if (loose !== null) {
      if (loose.startsWith("ref: ")) {
        return yield* readRef(
          runtime,
          store,
          loose.slice("ref: ".length).trim(),
          new Set([...seen, ref]),
        );
      }

      return loose;
    }

    const packed = yield* readPackedRefs(runtime, store);

    return packed.get(ref) ?? null;
  });

const readLooseRef = (
  runtime: Runtime,
  store: GitStore,
  ref: string,
): Effect.Effect<string | null, GitAdapterError> =>
  Effect.gen(function* () {
    const refPath = looseRefPath(runtime, store, ref);
    const exists = yield* runtime.fs
      .exists(refPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) return null;

    const raw = yield* runtime.fs
      .readFileString(refPath)
      .pipe(Effect.mapError(mapFsError("filesystem readRef", refPath)));
    const value = raw.trim();

    return value.length === 0 ? null : value;
  });

const writeLooseRef = (
  runtime: Runtime,
  store: GitStore,
  ref: string,
  target: ObjectId,
): Effect.Effect<void, GitAdapterError> =>
  Effect.gen(function* () {
    const refPath = looseRefPath(runtime, store, ref);
    const lockPath = `${refPath}.lock`;

    yield* runtime.fs
      .makeDirectory(runtime.path.dirname(refPath), { recursive: true })
      .pipe(Effect.mapError(mapFsError("filesystem updateRef", refPath)));
    yield* runtime.fs
      .writeFileString(lockPath, `${target}\n`, { flag: "wx", mode: 0o644 })
      .pipe(Effect.mapError(mapFsError("filesystem updateRef", lockPath)));
    yield* runtime.fs.rename(lockPath, refPath).pipe(
      Effect.catch((cause) =>
        runtime.fs.remove(lockPath, { force: true }).pipe(
          Effect.catch(() => Effect.void),
          Effect.flatMap(() => Effect.fail(mapFsError("filesystem updateRef", refPath)(cause))),
        ),
      ),
    );
  });

const deleteLooseRef = (
  runtime: Runtime,
  store: GitStore,
  ref: string,
): Effect.Effect<void, GitAdapterError> => {
  const refPath = looseRefPath(runtime, store, ref);

  return runtime.fs
    .remove(refPath, { force: true })
    .pipe(Effect.mapError(mapFsError("filesystem deleteRef", refPath)));
};

const readLooseRefs = (
  runtime: Runtime,
  store: GitStore,
): Effect.Effect<ReadonlyArray<GitRef>, GitAdapterError> =>
  Effect.gen(function* () {
    const refsRoot = runtime.path.join(store.gitDir, "refs");
    const exists = yield* runtime.fs
      .exists(refsRoot)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) return [];

    const entries = yield* runtime.fs
      .readDirectory(refsRoot, { recursive: true })
      .pipe(Effect.mapError(mapFsError("filesystem listRefs", refsRoot)));
    const refs: Array<GitRef> = [];

    for (const entry of entries) {
      if (entry.endsWith(".lock")) continue;

      const fullPath = runtime.path.join(refsRoot, entry);
      const info = yield* runtime.fs.stat(fullPath).pipe(Effect.catch(() => Effect.succeed(null)));

      if (info?.type !== "File") continue;

      const name = `refs/${entry.split(runtime.path.sep).join("/")}`;
      const target = yield* readRef(runtime, store, name);

      if (target !== null) {
        refs.push({ name, target });
      }
    }

    return refs;
  });

const readPackedRefs = (
  runtime: Runtime,
  store: GitStore,
): Effect.Effect<Map<string, ObjectId>, GitAdapterError> =>
  Effect.gen(function* () {
    const file = packedRefsPath(runtime, store);
    const exists = yield* runtime.fs.exists(file).pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) return new Map();

    const info = yield* runtime.fs
      .stat(file)
      .pipe(Effect.mapError(mapFsError("filesystem packed-refs", file)));

    if (info.type !== "File") return new Map();

    return yield* Cache.get(runtime.packedRefs, packedRefsCacheKey(file, info));
  });

const readPackedRefsFile = (
  runtime: RuntimeBase,
  file: string,
): Effect.Effect<Map<string, ObjectId>, GitAdapterError> =>
  Effect.gen(function* () {
    const refs = new Map<string, ObjectId>();

    const raw = yield* runtime.fs
      .readFileString(file)
      .pipe(Effect.mapError(mapFsError("filesystem packed-refs", file)));

    for (const line of raw.split("\n")) {
      if (line === "" || line.startsWith("#") || line.startsWith("^")) continue;

      const [target, name] = line.trim().split(" ");

      if (target !== undefined && name !== undefined) {
        refs.set(name, target);
      }
    }

    return refs;
  });

const parseTree = (payload: Uint8Array): Effect.Effect<ReadonlyArray<TreeEntry>, GitAdapterError> =>
  Effect.gen(function* () {
    const entries: Array<TreeEntry> = [];
    let offset = 0;

    while (offset < payload.byteLength) {
      const modeEnd = payload.indexOf(0x20, offset);

      if (modeEnd === -1) {
        return yield* Effect.fail(
          gitAdapterError("filesystem readTree", "Tree entry is missing mode separator"),
        );
      }

      const nameEnd = payload.indexOf(0, modeEnd + 1);

      if (nameEnd === -1) {
        return yield* Effect.fail(
          gitAdapterError("filesystem readTree", "Tree entry is missing name terminator"),
        );
      }

      const objectStart = nameEnd + 1;
      const objectEnd = objectStart + 20;

      if (objectEnd > payload.byteLength) {
        return yield* Effect.fail(
          gitAdapterError("filesystem readTree", "Tree entry is missing object id bytes"),
        );
      }

      const mode = bytesToString(payload.subarray(offset, modeEnd));
      const name = bytesToString(payload.subarray(modeEnd + 1, nameEnd));
      const objectId = bytesToHex(payload.subarray(objectStart, objectEnd));

      entries.push({
        mode: storeTreeMode(mode),
        name,
        objectId,
        type: mode === "40000" || mode === "040000" ? "tree" : "blob",
      });
      offset = objectEnd;
    }

    return entries;
  });

const isAncestor = (
  runtime: Runtime,
  store: GitStore,
  ancestor: ObjectId,
  descendant: ObjectId,
): Effect.Effect<boolean, GitAdapterError> =>
  Effect.gen(function* () {
    if (ancestor === descendant) return true;

    const seen = new Set<ObjectId>();
    const queue = new CommitSummaryHeap();
    const start = yield* readCommitSummary(runtime, store, descendant).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );

    if (start !== null) queue.push(start);

    while (queue.size > 0) {
      const current = queue.pop();

      if (current === undefined || seen.has(current.id)) continue;
      if (current.id === ancestor) return true;

      seen.add(current.id);

      for (const parentId of current.parents) {
        if (seen.has(parentId)) continue;

        const parent = yield* readCommitSummary(runtime, store, parentId).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (parent !== null) {
          queue.push(parent);
        }
      }
    }

    return false;
  });

const mergeBase = (
  runtime: Runtime,
  store: GitStore,
  a: ObjectId,
  b: ObjectId,
): Effect.Effect<ObjectId | null, GitAdapterError> =>
  Effect.gen(function* () {
    const aAncestors = yield* collectAncestors(runtime, store, a);
    const queue = new CommitSummaryHeap();
    const seen = new Set<ObjectId>();
    const start = yield* readCommitSummary(runtime, store, b).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );

    if (start !== null) queue.push(start);

    while (queue.size > 0) {
      const current = queue.pop();

      if (current === undefined || seen.has(current.id)) continue;
      if (aAncestors.has(current.id)) return current.id;

      seen.add(current.id);

      for (const parentId of current.parents) {
        if (seen.has(parentId)) continue;

        const parent = yield* readCommitSummary(runtime, store, parentId).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (parent !== null) {
          queue.push(parent);
        }
      }
    }

    return null;
  });

const collectAncestors = (
  runtime: Runtime,
  store: GitStore,
  start: ObjectId,
): Effect.Effect<Set<ObjectId>, GitAdapterError> =>
  Effect.gen(function* () {
    const output = new Set<ObjectId>();
    const queue = new CommitSummaryHeap();
    const startSummary = yield* readCommitSummary(runtime, store, start).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );

    if (startSummary !== null) queue.push(startSummary);

    while (queue.size > 0) {
      const current = queue.pop();

      if (current === undefined || output.has(current.id)) continue;

      output.add(current.id);

      for (const parentId of current.parents) {
        if (output.has(parentId)) continue;

        const parent = yield* readCommitSummary(runtime, store, parentId).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );

        if (parent !== null) {
          queue.push(parent);
        }
      }
    }

    return output;
  });

const readCommitSummary = (
  runtime: Runtime,
  store: GitStore,
  id: ObjectId,
): Effect.Effect<CommitSummary, GitAdapterError> =>
  Cache.get(runtime.commitSummaries, objectCacheKey(store.gitDir, id));

const parseCommitSummary = (
  id: ObjectId,
  payload: Uint8Array,
): Effect.Effect<CommitSummary, GitAdapterError> => {
  const raw = bytesToString(payload);
  const separator = raw.indexOf("\n\n");
  const headerText = separator === -1 ? raw : raw.slice(0, separator);
  const parents: Array<ObjectId> = [];
  let committerTime: number | undefined;
  let tree: ObjectId | undefined;

  for (const line of headerText.split("\n")) {
    if (line.startsWith("tree ")) {
      tree = line.slice("tree ".length);
    } else if (line.startsWith("parent ")) {
      parents.push(line.slice("parent ".length));
    } else if (line.startsWith("committer ")) {
      committerTime = parseGitIdentityTimestamp(line.slice("committer ".length));
    }
  }

  if (tree === undefined) {
    return Effect.fail(
      gitAdapterError("filesystem commit summary", `Commit ${id} does not contain a tree`),
    );
  }

  return Effect.succeed({ committerTime, id, parents, tree });
};

const parseGitIdentityTimestamp = (raw: string): number | undefined => {
  const match = / (\d+) [+-]\d{4}$/u.exec(raw);

  return match === null ? undefined : Number.parseInt(match[1], 10);
};

class CommitSummaryHeap {
  private readonly values: Array<CommitSummary> = [];

  get size(): number {
    return this.values.length;
  }

  push(value: CommitSummary): void {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): CommitSummary | undefined {
    const first = this.values[0];
    const last = this.values.pop();

    if (first === undefined || last === undefined) return first;
    if (this.values.length > 0) {
      this.values[0] = last;
      this.sinkDown(0);
    }

    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      if (compareCommitSummary(this.values[index], this.values[parent]) <= 0) return;

      this.swap(index, parent);
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let largest = index;

      if (
        left < this.values.length &&
        compareCommitSummary(this.values[left], this.values[largest]) > 0
      ) {
        largest = left;
      }

      if (
        right < this.values.length &&
        compareCommitSummary(this.values[right], this.values[largest]) > 0
      ) {
        largest = right;
      }

      if (largest === index) return;

      this.swap(index, largest);
      index = largest;
    }
  }

  private swap(a: number, b: number): void {
    const left = this.values[a];
    const right = this.values[b];

    if (left === undefined || right === undefined) return;

    this.values[a] = right;
    this.values[b] = left;
  }
}

const compareCommitSummary = (a: CommitSummary, b: CommitSummary): number => {
  const byTime = (a.committerTime ?? 0) - (b.committerTime ?? 0);

  return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
};

const hexToBytes = (hex: string, operation: string): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.try({
    try: () => {
      if (!/^[0-9a-fA-F]{40}$/u.test(hex)) {
        throw new Error(`Invalid Git object id: ${hex}`);
      }

      const bytes = new Uint8Array(20);

      for (let index = 0; index < hex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
      }

      return bytes;
    },
    catch: (cause) => gitAdapterError(operation, errorMessage(cause), { cause }),
  });

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const gitTreeMode = (mode: string): string => (mode === "040000" ? "40000" : mode);

const storeTreeMode = (mode: string): string => (mode === "40000" ? "040000" : mode);
