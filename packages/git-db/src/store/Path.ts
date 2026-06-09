import { Crypto, Effect, Schema } from "effect";
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
import { sha1Hex } from "../internals/hash.ts";
import * as IdentifierSchema from "../schemas/Identifier.ts";
import * as ObjectIdSchema from "../schemas/ObjectId.ts";
import * as PathSchema from "../schemas/Path.ts";
import * as RefSchema from "../schemas/Ref.ts";

export const normalizeNamespace = (
  namespace: string,
  allowBranchNamespace = false,
): Effect.Effect<string, InvalidNamespaceError> => {
  const normalized = namespace.replace(/\/+$/u, "");

  return Schema.decodeUnknownEffect(RefSchema.namespace(allowBranchNamespace))(normalized).pipe(
    Effect.mapError(() => namespaceError(namespace, normalized, allowBranchNamespace)),
  );
};

export const validateDatabaseName = (
  database: string,
): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.DatabaseName)(database).pipe(
    Effect.mapError(() => invalidIdentifier("database", database)),
  );

export const validateCollectionName = (
  name: string,
): Effect.Effect<string, InvalidIdentifierError | InvalidPathError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.CollectionName)(name).pipe(
    Effect.mapError(() =>
      IdentifierSchema.isSafeSegment(name)
        ? invalidPath(name, "collection names must not start with .")
        : invalidIdentifier("collection", name),
    ),
  );

export const validateIndexName = (name: string): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.IndexName)(name).pipe(
    Effect.mapError(() => invalidIdentifier("index", name)),
  );

export const validateDocumentId = (id: string): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.DocumentId)(id).pipe(
    Effect.mapError(() => invalidIdentifier("document id", id)),
  );

export const validateIndexKey = (key: string): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.IndexKey)(key).pipe(
    Effect.mapError(() => invalidIdentifier("index key", key)),
  );

export const validateRemoteName = (remote: string): Effect.Effect<string, InvalidIdentifierError> =>
  Schema.decodeUnknownEffect(IdentifierSchema.RemoteName)(remote).pipe(
    Effect.mapError(() => invalidIdentifier("remote", remote)),
  );

export const validatePointerName = (
  pointer: string,
): Effect.Effect<string, InvalidPointerNameError> =>
  Schema.decodeUnknownEffect(RefSchema.PointerName)(pointer).pipe(
    Effect.mapError(() => invalidPointerName(pointer)),
  );

export const isValidPointerName = RefSchema.isValidPointerName;

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

export const collectionRootPath = (
  collection: string,
): Effect.Effect<string, InvalidIdentifierError | InvalidPathError> =>
  validateCollectionName(collection).pipe(Effect.map((name) => joinStorePath("collections", name)));

export const collectionMetaPath = (
  collection: string,
): Effect.Effect<string, InvalidIdentifierError | InvalidPathError> =>
  collectionRootPath(collection).pipe(Effect.map((root) => joinStorePath(root, ".meta.json")));

export const documentPath = (
  collection: string,
  id: string,
  shardLength = 2,
): Effect.Effect<string, InvalidIdentifierError | InvalidPathError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const name = yield* validateCollectionName(collection);
    const documentId = yield* validateDocumentId(id);
    const root = joinStorePath("collections", name);

    if (shardLength <= 0) {
      return joinStorePath(root, `${documentId}.json`);
    }

    const shard = yield* hashShard(documentId, shardLength);

    return joinStorePath(root, shard, `${documentId}.json`);
  });

export const indexEntryPath = (
  collection: string,
  index: string,
  key: string,
  documentId: string,
): Effect.Effect<string, InvalidIdentifierError | InvalidPathError> =>
  Effect.gen(function* () {
    return joinStorePath(
      "indexes",
      yield* validateCollectionName(collection),
      yield* validateIndexName(index),
      yield* validateIndexKey(key),
      yield* validateDocumentId(documentId),
    );
  });

export const hashShard = (value: string, length = 2): Effect.Effect<string, never, Crypto.Crypto> =>
  sha1Hex(value).pipe(Effect.map((hash) => hash.slice(0, length)));

export const idFromDocumentPath = (path: string): string | null => {
  const filename = path.split("/").at(-1);

  if (!filename?.endsWith(".json") || filename === ".meta.json") {
    return null;
  }

  return filename.slice(0, -".json".length);
};

export const isPotentialObjectId = ObjectIdSchema.isPotentialObjectId;

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
