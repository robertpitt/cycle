import { deflateSync, inflateSync } from "node:zlib";
import { Effect } from "effect";
import { ObjectEncodingError, ObjectDecodeError, PackObjectParseError } from "../GitStoreErrors.ts";

export const deflate = (bytes: Uint8Array): Effect.Effect<Uint8Array, ObjectEncodingError> =>
  Effect.try({
    try: () => new Uint8Array(deflateSync(bytes)),
    catch: (cause) =>
      new ObjectEncodingError({
        cause,
        message: cause instanceof Error ? cause.message : "Could not deflate Git object",
      }),
  });

export const inflateObject = (
  bytes: Uint8Array,
  objectId?: string,
): Effect.Effect<Uint8Array, ObjectDecodeError> =>
  Effect.try({
    try: () => new Uint8Array(inflateSync(bytes)),
    catch: (cause) =>
      new ObjectDecodeError({
        cause,
        message: "Could not inflate Git object",
        objectId,
      }),
  });

export const inflatePackData = (
  bytes: Uint8Array,
  path: string,
): Effect.Effect<Uint8Array, PackObjectParseError> =>
  Effect.try({
    try: () => new Uint8Array(inflateSync(bytes)),
    catch: (cause) =>
      new PackObjectParseError({
        cause,
        message: `Could not inflate packed object data: ${path}`,
        path,
      }),
  });
