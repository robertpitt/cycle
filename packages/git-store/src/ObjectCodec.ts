import { Context, Crypto, Effect, Encoding, Layer } from "effect";
import { InvalidObjectIdError, ObjectDecodeError, ObjectEncodingError } from "./GitStoreErrors.ts";
import type { GitObjectType, ObjectId } from "./GitStoreSchemas.ts";
import * as GitObject from "./internal/git-object.ts";
import { deflate, inflateObject } from "./internal/compression.ts";
import { validateObjectId } from "./internal/refs.ts";

export type ObjectCodecShape = {
  readonly canonicalBytes: (type: GitObjectType, body: Uint8Array) => Uint8Array;
  readonly decodeObjectBytes: (
    bytes: Uint8Array,
    objectId?: string,
  ) => Effect.Effect<GitObject.GitObject, ObjectDecodeError>;
  readonly encodeLooseObject: (
    type: GitObjectType,
    body: Uint8Array,
  ) => Effect.Effect<Uint8Array, ObjectEncodingError>;
  readonly hash: (
    type: GitObjectType,
    body: Uint8Array,
  ) => Effect.Effect<ObjectId, ObjectEncodingError | InvalidObjectIdError>;
  readonly inflateLooseObject: (
    bytes: Uint8Array,
    objectId?: string,
  ) => Effect.Effect<GitObject.GitObject, ObjectDecodeError>;
};

export class ObjectCodec extends Context.Service<ObjectCodec, ObjectCodecShape>()(
  "@cycle/git-store/ObjectCodec",
) {}

export const ObjectCodecLive = Layer.effect(
  ObjectCodec,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;

    const hash = Effect.fn("ObjectCodec.hash")(function* (type: GitObjectType, body: Uint8Array) {
      const canonical = GitObject.canonicalBytes(type, body);
      const digest = yield* crypto.digest("SHA-1", canonical).pipe(
        Effect.mapError(
          (cause) =>
            new ObjectEncodingError({
              cause,
              message: "Could not compute Git object SHA-1",
            }),
        ),
      );

      return yield* validateObjectId(Encoding.encodeHex(digest).toLowerCase());
    });

    const encodeLooseObject = Effect.fn("ObjectCodec.encodeLooseObject")(function* (
      type: GitObjectType,
      body: Uint8Array,
    ) {
      return yield* deflate(GitObject.canonicalBytes(type, body));
    });

    const inflateLooseObject = Effect.fn("ObjectCodec.inflateLooseObject")(function* (
      bytes: Uint8Array,
      objectId?: string,
    ) {
      const inflated = yield* inflateObject(bytes, objectId);

      return yield* GitObject.decodeObjectBytes(inflated, objectId);
    });

    return ObjectCodec.of({
      canonicalBytes: GitObject.canonicalBytes,
      decodeObjectBytes: GitObject.decodeObjectBytes,
      encodeLooseObject,
      hash,
      inflateLooseObject,
    });
  }),
);
