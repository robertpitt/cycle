import { Effect, Schema } from "effect";
import {
  InvalidObjectIdError,
  InvalidPathError,
  InvalidPointerNameError,
  InvalidRefNameError,
} from "../GitStoreErrors.ts";
import {
  DatabaseName,
  isObjectId,
  PointerName,
  RefName,
  StorePath,
  MutationPath,
  type ObjectId,
} from "../GitStoreSchemas.ts";
import { stripTrailingSlashes, stripWrappingSlashes } from "./strings.ts";

export const normalizeObjectId = (value: string): Effect.Effect<ObjectId, InvalidObjectIdError> => {
  return validateObjectId(value.toLowerCase());
};

export const validateObjectId = (value: string): Effect.Effect<ObjectId, InvalidObjectIdError> => {
  const normalized = value.toLowerCase();

  return isObjectId(normalized)
    ? Effect.succeed(normalized as ObjectId)
    : Effect.fail(
        new InvalidObjectIdError({
          message: `Invalid object id: ${value}`,
          objectId: value,
        }),
      );
};

export const validateRefName = (value: string): Effect.Effect<RefName, InvalidRefNameError> =>
  Schema.decodeUnknownEffect(RefName)(value).pipe(
    Effect.mapError(
      () =>
        new InvalidRefNameError({
          message: `Invalid ref name: ${value}`,
          ref: value,
        }),
    ),
  );

export const validatePointerName = (
  value: string,
): Effect.Effect<PointerName, InvalidPointerNameError> =>
  Schema.decodeUnknownEffect(PointerName)(value).pipe(
    Effect.mapError(
      () =>
        new InvalidPointerNameError({
          message: `Invalid pointer name: ${value}`,
          pointer: value,
        }),
    ),
  );

export const validateDatabaseName = (
  value: string,
): Effect.Effect<DatabaseName, InvalidPointerNameError> =>
  Schema.decodeUnknownEffect(DatabaseName)(value).pipe(
    Effect.mapError(
      () =>
        new InvalidPointerNameError({
          message: `Invalid database name: ${value}`,
          pointer: value,
        }),
    ),
  );

export const normalizeNamespace = (value: string): Effect.Effect<RefName, InvalidRefNameError> => {
  const normalized = stripTrailingSlashes(value);

  return validateRefName(normalized);
};

export const pointerRef = (
  namespace: RefName,
  database: DatabaseName,
  pointer: PointerName,
): RefName => `${namespace}/${database}/${pointer}` as RefName;

export const normalizeStorePath = (value: string): Effect.Effect<StorePath, InvalidPathError> => {
  if (value === "" || value === "/") return Effect.succeed("" as StorePath);

  const normalized = stripWrappingSlashes(value);

  return Schema.decodeUnknownEffect(StorePath)(normalized).pipe(
    Effect.mapError(
      () =>
        new InvalidPathError({
          message: `Invalid store path: ${value}`,
          path: value,
        }),
    ),
  );
};

export const normalizeMutationPath = (
  value: string,
): Effect.Effect<MutationPath, InvalidPathError> =>
  normalizeStorePath(value).pipe(
    Effect.flatMap((path) =>
      Schema.decodeUnknownEffect(MutationPath)(path).pipe(
        Effect.mapError(
          () =>
            new InvalidPathError({
              message: "Cannot mutate the snapshot root path",
              path: value,
            }),
        ),
      ),
    ),
  );
