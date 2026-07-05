import { Cache, Effect } from "effect";
import type { ObjectId, Ref as GitRef } from "./GitSchemas.ts";
import { GitAdapterError } from "./GitErrors.ts";
import {
  decodePackedRefsCacheKey,
  looseRefPath,
  mapFsError,
  packedRefsCacheKey,
  packedRefsPath,
  type FilesystemRuntime,
  type FilesystemRuntimeBase,
} from "./GitFilesystemTypes.ts";

export const readRef = (
  runtime: FilesystemRuntime,
  gitDir: string,
  ref: string,
  seen: ReadonlySet<string> = new Set(),
): Effect.Effect<ObjectId | null, GitAdapterError> =>
  Effect.gen(function* () {
    if (seen.has(ref)) {
      return yield* new GitAdapterError({
        operation: "filesystem readRef",
        message: `Symbolic ref cycle detected at ${ref}`,
      });
    }

    const loose = yield* readLooseRef(runtime, gitDir, ref);

    if (loose !== null) {
      if (loose.startsWith("ref: ")) {
        return yield* readRef(
          runtime,
          gitDir,
          loose.slice("ref: ".length).trim(),
          new Set([...seen, ref]),
        );
      }

      return loose;
    }

    const packed = yield* readPackedRefs(runtime, gitDir);

    return packed.get(ref) ?? null;
  });

export const writeLooseRef = (
  runtime: FilesystemRuntime,
  gitDir: string,
  ref: string,
  target: ObjectId,
): Effect.Effect<void, GitAdapterError> =>
  Effect.gen(function* () {
    const refPath = looseRefPath(runtime, gitDir, ref);
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

export const deleteLooseRef = (
  runtime: FilesystemRuntime,
  gitDir: string,
  ref: string,
): Effect.Effect<void, GitAdapterError> => {
  const refPath = looseRefPath(runtime, gitDir, ref);

  return runtime.fs
    .remove(refPath, { force: true })
    .pipe(Effect.mapError(mapFsError("filesystem deleteRef", refPath)));
};

export const readLooseRefs = (
  runtime: FilesystemRuntime,
  gitDir: string,
): Effect.Effect<ReadonlyArray<GitRef>, GitAdapterError> =>
  Effect.gen(function* () {
    const refsRoot = runtime.path.join(gitDir, "refs");
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
      const target = yield* readRef(runtime, gitDir, name);

      if (target !== null) {
        refs.push({ name, target });
      }
    }

    return refs;
  });

export const readPackedRefs = (
  runtime: FilesystemRuntime,
  gitDir: string,
): Effect.Effect<Map<string, ObjectId>, GitAdapterError> =>
  Effect.gen(function* () {
    const file = packedRefsPath(runtime, gitDir);
    const exists = yield* runtime.fs.exists(file).pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) return new Map();

    const info = yield* runtime.fs
      .stat(file)
      .pipe(Effect.mapError(mapFsError("filesystem packed-refs", file)));

    if (info.type !== "File") return new Map();

    return yield* Cache.get(runtime.packedRefs, packedRefsCacheKey(file, info));
  });

const readPackedRefsFile = (
  runtime: FilesystemRuntimeBase,
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

export const readPackedRefsFileFromCacheKey = (
  runtime: FilesystemRuntimeBase,
  key: string,
): Effect.Effect<Map<string, ObjectId>, GitAdapterError> =>
  readPackedRefsFile(runtime, decodePackedRefsCacheKey(key));

const readLooseRef = (
  runtime: FilesystemRuntime,
  gitDir: string,
  ref: string,
): Effect.Effect<string | null, GitAdapterError> =>
  Effect.gen(function* () {
    const refPath = looseRefPath(runtime, gitDir, ref);
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
