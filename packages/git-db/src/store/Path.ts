import { Effect, Schema } from "effect";
import * as GitSchemas from "@cycle/git/schemas";
import {
  InvalidIdentifierError,
  InvalidNamespaceError,
  InvalidPathError,
  InvalidPointerNameError,
} from "../errors/index.ts";
import * as IdentifierSchema from "../schemas/Identifier.ts";
import * as PathSchema from "../schemas/Path.ts";

export const normalizeNamespace = (
  namespace: string,
  allowBranchNamespace = false,
): Effect.Effect<string, InvalidNamespaceError> => {
  const normalized = namespace.replace(/\/+$/u, "");

  return Schema.decodeUnknownEffect(GitSchemas.namespace(allowBranchNamespace))(normalized).pipe(
    Effect.mapError(() => namespaceError(namespace, normalized, allowBranchNamespace)),
  );
};

export const validateDatabaseName = (
  database: string,
): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.DatabaseName)(database).pipe(
    Effect.mapError(
      () =>
        new InvalidIdentifierError({
          kind: "database",
          value: database,
          message: `Invalid ${"database"}: ${database}`,
        }),
    ),
  );

export const validateRemoteName = (remote: string): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.RemoteName)(remote).pipe(
    Effect.mapError(
      () =>
        new InvalidIdentifierError({
          kind: "remote",
          value: remote,
          message: `Invalid ${"remote"}: ${remote}`,
        }),
    ),
  );

export const validatePointerName = (
  pointer: string,
): Effect.Effect<string, InvalidPointerNameError> =>
  Schema.decodeUnknownEffect(GitSchemas.PointerName)(pointer).pipe(
    Effect.mapError(
      () =>
        new InvalidPointerNameError({
          pointer: pointer,
          message: `Invalid pointer name: ${pointer}`,
        }),
    ),
  );

export const isValidPointerName = GitSchemas.isValidPointerName;

export const normalizeStorePath = (path: string): Effect.Effect<string, InvalidPathError> => {
  if (path === "" || path === "/") {
    return Effect.succeed("");
  }

  const withoutEdges = path.replace(/^\/+/u, "").replace(/\/+$/u, "");
  const normalized = withoutEdges.split("/").join("/");

  return Schema.decodeUnknownEffect(PathSchema.StorePath)(normalized).pipe(
    Effect.mapError(
      () =>
        new InvalidPathError({
          path: path,
          message: `Invalid store path ${path}: invalid store path`,
        }),
    ),
  );
};

export const rejectEmptyMutationPath = (path: string): Effect.Effect<string, InvalidPathError> =>
  Schema.decodeUnknownEffect(PathSchema.MutationPath)(path).pipe(
    Effect.mapError(
      () =>
        new InvalidPathError({
          path: path,
          message: `Invalid store path ${path}: ${"cannot mutate the snapshot root path"}`,
        }),
    ),
  );

export const joinStorePath = PathSchema.joinStorePath;

export const isPotentialObjectId = GitSchemas.isPotentialObjectId;

const namespaceError = (
  original: string,
  normalized: string,
  allowBranchNamespace: boolean,
): InvalidNamespaceError => {
  if (!normalized.startsWith("refs/")) {
    return new InvalidNamespaceError({
      namespace: original,
      message: `Invalid namespace ${original}: ${"namespace must start with refs/"}`,
    });
  }

  if (!allowBranchNamespace && normalized.startsWith("refs/heads")) {
    return new InvalidNamespaceError({
      namespace: original,
      message: `Invalid namespace ${original}: ${"application pointers must not use refs/heads unless explicitly enabled"}`,
    });
  }

  return new InvalidNamespaceError({
    namespace: original,
    message: `Invalid namespace ${original}: ${"namespace is not a valid Git ref path"}`,
  });
};
