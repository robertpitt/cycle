import { Effect, Schema } from "effect";
import * as GitSchemas from "@cycle/git/schemas";
import {
  invalidIdentifier,
  invalidNamespace,
  invalidPath,
  invalidPointerName,
  type InvalidIdentifierError,
  type InvalidNamespaceError,
  type InvalidPathError,
  type InvalidPointerNameError,
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
    Effect.mapError(() => invalidIdentifier("database", database)),
  );

export const validateRemoteName = (remote: string): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.RemoteName)(remote).pipe(
    Effect.mapError(() => invalidIdentifier("remote", remote)),
  );

export const validatePointerName = (
  pointer: string,
): Effect.Effect<string, InvalidPointerNameError> =>
  Schema.decodeUnknownEffect(GitSchemas.PointerName)(pointer).pipe(
    Effect.mapError(() => invalidPointerName(pointer)),
  );

export const isValidPointerName = GitSchemas.isValidPointerName;

export const normalizeStorePath = (path: string): Effect.Effect<string, InvalidPathError> => {
  if (path === "" || path === "/") {
    return Effect.succeed("");
  }

  const withoutEdges = path.replace(/^\/+/u, "").replace(/\/+$/u, "");
  const normalized = withoutEdges.split("/").join("/");

  return Schema.decodeUnknownEffect(PathSchema.StorePath)(normalized).pipe(
    Effect.mapError(() => invalidPath(path)),
  );
};

export const rejectEmptyMutationPath = (path: string): Effect.Effect<string, InvalidPathError> =>
  Schema.decodeUnknownEffect(PathSchema.MutationPath)(path).pipe(
    Effect.mapError(() => invalidPath(path, "cannot mutate the snapshot root path")),
  );

export const joinStorePath = PathSchema.joinStorePath;

export const isPotentialObjectId = GitSchemas.isPotentialObjectId;

const namespaceError = (
  original: string,
  normalized: string,
  allowBranchNamespace: boolean,
): InvalidNamespaceError => {
  if (!normalized.startsWith("refs/")) {
    return invalidNamespace(original, "namespace must start with refs/");
  }

  if (!allowBranchNamespace && normalized.startsWith("refs/heads")) {
    return invalidNamespace(
      original,
      "application pointers must not use refs/heads unless explicitly enabled",
    );
  }

  return invalidNamespace(original, "namespace is not a valid Git ref path");
};
