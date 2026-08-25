import { Effect, Schema } from "effect";
import { DatabaseSqliteError } from "../../DatabaseErrors.ts";

const codecFailure = (operation: string, cause: unknown): DatabaseSqliteError =>
  new DatabaseSqliteError({
    cause,
    message: `Projection codec failed: ${operation}`,
    operation,
  });

export const decodeJson = <S extends Schema.Top>(
  operation: string,
  schema: S,
  value: string,
): Effect.Effect<S["Type"], DatabaseSqliteError, S["DecodingServices"]> =>
  Effect.try({
    try: () => JSON.parse(value) as unknown,
    catch: (cause) => codecFailure(operation, cause),
  }).pipe(
    Effect.flatMap((json) =>
      Schema.decodeUnknownEffect(schema)(json, {
        errors: "all",
        onExcessProperty: "error",
      }),
    ),
    Effect.mapError((cause) =>
      cause instanceof DatabaseSqliteError ? cause : codecFailure(operation, cause),
    ),
  ) as Effect.Effect<S["Type"], DatabaseSqliteError, S["DecodingServices"]>;

export const encodeJson = <S extends Schema.Top>(
  operation: string,
  schema: S,
  value: S["Type"],
): Effect.Effect<string, DatabaseSqliteError, S["EncodingServices"]> =>
  Schema.encodeUnknownEffect(schema)(value, { errors: "all" }).pipe(
    Effect.flatMap((encoded) =>
      Effect.try({
        try: () => JSON.stringify(encoded),
        catch: (cause) => codecFailure(operation, cause),
      }),
    ),
    Effect.mapError((cause) =>
      cause instanceof DatabaseSqliteError ? cause : codecFailure(operation, cause),
    ),
  ) as Effect.Effect<string, DatabaseSqliteError, S["EncodingServices"]>;

export const decodeValue = <S extends Schema.Top>(
  operation: string,
  schema: S,
  value: unknown,
): Effect.Effect<S["Type"], DatabaseSqliteError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(value, {
    errors: "all",
    onExcessProperty: "error",
  }).pipe(Effect.mapError((cause) => codecFailure(operation, cause))) as Effect.Effect<
    S["Type"],
    DatabaseSqliteError,
    S["DecodingServices"]
  >;
