import { deflateSync, inflateSync } from "node:zlib";
import { Cache, Crypto, Effect } from "effect";
import type { ObjectId } from "../schemas/index.ts";
import { GitAdapterError } from "../errors/index.ts";
import { bytesFromString, bytesToString, concatBytes } from "../internals/bytes.ts";
import { sha1Hex } from "../internals/hash.ts";
import { readPackedObject } from "./GitPackObject.ts";
import {
  errorMessage,
  looseObjectPath,
  mapFsError,
  objectCacheKey,
  type FilesystemRuntime,
  type FilesystemRuntimeBase,
  type GitObject,
} from "./GitFilesystemTypes.ts";

export const readObject = (
  runtime: FilesystemRuntime,
  gitDir: string,
  id: ObjectId,
  expectedType?: GitObject["type"],
): Effect.Effect<GitObject, GitAdapterError> =>
  Cache.get(runtime.objects, objectCacheKey(gitDir, id)).pipe(
    Effect.flatMap((object) => {
      if (expectedType !== undefined && object.type !== expectedType) {
        return Effect.fail(
          new GitAdapterError({
            operation: "filesystem readObject",
            message: `Object ${id} expected ${expectedType} but contained ${object.type}`,
          }),
        );
      }

      return Effect.succeed(object);
    }),
  );

export const readObjectUncached = (
  runtime: FilesystemRuntimeBase,
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
        return yield* new GitAdapterError({
          operation: "filesystem readObject",
          message: `Object not found: ${id}`,
        });
      }

      return packed;
    }

    const readResult = yield* runtime.fs.readFile(objectPath).pipe(
      Effect.map((bytes) => ({ bytes, type: "loose" }) as const),
      Effect.catch((cause) =>
        readPackedObject(runtime, gitDir, id).pipe(
          Effect.flatMap((packed) =>
            packed === null
              ? Effect.fail(mapFsError("filesystem readObject", objectPath)(cause))
              : Effect.succeed({ object: packed, type: "packed" } as const),
          ),
        ),
      ),
    );

    if (readResult.type === "packed") return readResult.object;

    const compressed = readResult.bytes;
    const raw = yield* inflate(compressed, "filesystem readObject");
    const headerEnd = raw.indexOf(0);

    if (headerEnd === -1) {
      return yield* new GitAdapterError({
        operation: "filesystem readObject",
        message: `Object ${id} has no header terminator`,
      });
    }

    const header = bytesToString(raw.subarray(0, headerEnd));
    const match = /^(blob|commit|tree) (\d+)$/u.exec(header);

    if (match === null) {
      return yield* new GitAdapterError({
        operation: "filesystem readObject",
        message: `Object ${id} has an invalid header: ${header}`,
      });
    }

    const type = match[1] as GitObject["type"];
    const size = Number.parseInt(match[2], 10);
    const payload = raw.subarray(headerEnd + 1);

    if (payload.byteLength !== size) {
      return yield* new GitAdapterError({
        operation: "filesystem readObject",
        message: `Object ${id} expected ${size} bytes but contained ${payload.byteLength}`,
      });
    }

    return { payload, type };
  });

export const writeObject = (
  runtime: FilesystemRuntime,
  gitDir: string,
  type: GitObject["type"],
  payload: Uint8Array,
): Effect.Effect<ObjectId, GitAdapterError> =>
  Effect.gen(function* () {
    const objectBytes = concatBytes([bytesFromString(`${type} ${payload.byteLength}\0`), payload]);
    const id = yield* sha1Hex(objectBytes).pipe(
      Effect.provideService(Crypto.Crypto, runtime.crypto),
    );
    const objectPath = looseObjectPath(runtime, gitDir, id);
    const objectDirectory = runtime.path.dirname(objectPath);
    const exists = yield* runtime.fs
      .exists(objectPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (exists) return id;

    const compressed = yield* deflate(objectBytes, "filesystem writeObject");
    const lockPath = `${objectPath}.${Date.now().toString()}.tmp`;

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
                  ? Effect.void
                  : Effect.fail(mapFsError("filesystem writeObject", objectPath)(cause)),
              ),
            ),
          ),
        ),
      ),
    );
    yield* Cache.set(runtime.objects, objectCacheKey(gitDir, id), { payload, type });

    return id;
  });

const inflate = (
  bytes: Uint8Array,
  operation: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.try({
    try: () => new Uint8Array(inflateSync(bytes)),
    catch: (cause) =>
      new GitAdapterError({
        operation,
        message: "Could not inflate Git object",
        cause,
      }),
  });

const deflate = (
  bytes: Uint8Array,
  operation: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.try({
    try: () => new Uint8Array(deflateSync(bytes)),
    catch: (cause) =>
      new GitAdapterError({
        operation,
        message: errorMessage(cause),
        cause,
      }),
  });
