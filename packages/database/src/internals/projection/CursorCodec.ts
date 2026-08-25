import { Effect, Encoding, Result, Schema } from "effect";
import { DatabaseSqliteError } from "../../DatabaseErrors.ts";
import { decodeJson } from "./JsonCodec.ts";

const ProjectionCursor = Schema.Struct({
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

const cursorFailure = (cause: unknown): DatabaseSqliteError =>
  new DatabaseSqliteError({
    cause,
    message: "invalid pagination cursor",
    operation: "decodeCursor",
  });

export const encodeCursor = (offset: number): string =>
  Encoding.encodeBase64Url(JSON.stringify({ offset }));

export const decodeCursor = (
  cursor: string | undefined,
): Effect.Effect<{ readonly offset: number }, DatabaseSqliteError> => {
  if (cursor === undefined) return Effect.succeed({ offset: 0 });

  const decoded = Encoding.decodeBase64UrlString(cursor);
  if (Result.isFailure(decoded)) return Effect.succeed({ offset: 0 });

  return decodeJson("decodeCursor", ProjectionCursor, decoded.success).pipe(
    Effect.mapError(cursorFailure),
    Effect.catch(() => Effect.succeed({ offset: 0 })),
  );
};
