import { deflateSync, inflateSync } from "node:zlib";
import { Effect } from "effect";
import { ObjectEncodingError, ObjectDecodeError, PackObjectParseError } from "../GitStoreErrors.ts";

export type PackInflateAttempt =
  | {
      readonly _tag: "failure";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "incomplete";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "success";
      readonly bytes: Uint8Array;
    };

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

export const inflatePackDataAttempt = (bytes: Uint8Array): Effect.Effect<PackInflateAttempt> =>
  Effect.sync(() => {
    try {
      return {
        _tag: "success",
        bytes: new Uint8Array(inflateSync(bytes)),
      };
    } catch (cause) {
      return isIncompleteInflate(cause)
        ? { _tag: "incomplete", cause }
        : { _tag: "failure", cause };
    }
  });

export const inflatePackData = (
  bytes: Uint8Array,
  path: string,
): Effect.Effect<Uint8Array, PackObjectParseError> =>
  inflatePackDataAttempt(bytes).pipe(
    Effect.flatMap((result) => {
      if (result._tag === "success") return Effect.succeed(result.bytes);

      return Effect.fail(
        new PackObjectParseError({
          cause: result.cause,
          message: `Could not inflate packed object data: ${path}`,
          path,
        }),
      );
    }),
  );

const isIncompleteInflate = (cause: unknown): boolean =>
  typeof cause === "object" &&
  cause !== null &&
  "code" in cause &&
  (cause as { readonly code?: unknown }).code === "Z_BUF_ERROR";
