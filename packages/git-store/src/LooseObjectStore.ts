import { Context, Crypto, Effect, Encoding, FileSystem, Layer, Path } from "effect";
import {
  FilesystemProtocolError,
  ObjectNotFoundError,
  type GitStoreError,
  causeMessage,
} from "./GitStoreErrors.ts";
import type { GitObjectType, ObjectId } from "./GitStoreSchemas.ts";
import { GitFiles } from "./internal/GitFiles.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import type { GitObject } from "./internal/git-object.ts";
import { ObjectCodec } from "./ObjectCodec.ts";

export type LooseObjectStoreShape = {
  readonly looseObjectPath: (id: ObjectId) => string;
  readonly readObject: (id: ObjectId) => Effect.Effect<GitObject, GitStoreError>;
  readonly writeObject: (
    type: GitObjectType,
    body: Uint8Array,
  ) => Effect.Effect<ObjectId, GitStoreError>;
};

export class LooseObjectStore extends Context.Service<LooseObjectStore, LooseObjectStoreShape>()(
  "@cycle/git-store/LooseObjectStore",
) {}

export const LooseObjectStoreLive = Layer.effect(
  LooseObjectStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const files = yield* GitFiles;
    const codec = yield* ObjectCodec;
    const runtime = yield* GitStoreRuntime;

    const looseObjectPath = (id: ObjectId): string =>
      path.join(runtime.config.commonGitDir, "objects", id.slice(0, 2), id.slice(2));

    const readObject = Effect.fn("LooseObjectStore.readObject")(function* (id: ObjectId) {
      const filePath = looseObjectPath(id);
      const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));

      if (!exists) {
        return yield* new ObjectNotFoundError({
          message: `Object not found: ${id}`,
          objectId: id,
        });
      }

      const compressed = yield* fs.readFile(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `read loose object failed for ${filePath}: ${causeMessage(cause)}`,
              operation: "read loose object",
              path: filePath,
            }),
        ),
      );

      return yield* codec.inflateLooseObject(compressed, id);
    });

    const writeObject = Effect.fn("LooseObjectStore.writeObject")(function* (
      type: GitObjectType,
      body: Uint8Array,
    ) {
      const id = yield* codec.hash(type, body);
      const finalPath = looseObjectPath(id);
      const exists = yield* fs.exists(finalPath).pipe(Effect.catch(() => Effect.succeed(false)));

      if (exists) return id;

      const compressed = yield* codec.encodeLooseObject(type, body);
      const random = yield* crypto.randomBytes(8).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `write loose object failed for ${finalPath}: ${causeMessage(cause)}`,
              operation: "write loose object",
              path: finalPath,
            }),
        ),
      );
      const nonce = Encoding.encodeHex(random).toLowerCase();
      const tempPath = `${finalPath}.${nonce}.tmp`;

      yield* files
        .durableWriteTemp(compressed, {
          mode: 0o444,
          operation: "write loose object",
          targetPath: finalPath,
          tempPath,
        })
        .pipe(
          Effect.catch((error) =>
            fs.exists(finalPath).pipe(
              Effect.catch(() => Effect.succeed(false)),
              Effect.flatMap((currentExists) =>
                currentExists ? Effect.succeed(id) : Effect.fail(error),
              ),
            ),
          ),
        );

      return id;
    });

    return LooseObjectStore.of({
      looseObjectPath,
      readObject,
      writeObject,
    });
  }),
);
