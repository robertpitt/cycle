import { Cache, Crypto, FileSystem, Option, Path } from "effect";
import type { ObjectId } from "../schemas/index.ts";
import { gitAdapterError, type GitAdapterError } from "../errors/index.ts";

export type GitObject = {
  readonly payload: Uint8Array;
  readonly type: "blob" | "commit" | "tree";
};

export type CommitSummary = {
  readonly committerTime?: number;
  readonly id: ObjectId;
  readonly parents: ReadonlyArray<ObjectId>;
  readonly tree: ObjectId;
};

export type ParsedPackIndex = {
  readonly bytes: Uint8Array;
  readonly indexPath: string;
  readonly namesOffset: number;
  readonly objectCount: number;
  readonly offsetsOffset: number;
};

export type FilesystemRuntimeBase = {
  readonly crypto: Crypto.Crypto;
  readonly fs: FileSystem.FileSystem;
  readonly packFiles?: Cache.Cache<string, Uint8Array, GitAdapterError>;
  readonly packIndexes?: Cache.Cache<string, ParsedPackIndex, GitAdapterError>;
  readonly path: Path.Path;
};

export type FilesystemRuntime = FilesystemRuntimeBase & {
  readonly commitSummaries: Cache.Cache<string, CommitSummary, GitAdapterError>;
  readonly objects: Cache.Cache<string, GitObject, GitAdapterError>;
  readonly packFiles: Cache.Cache<string, Uint8Array, GitAdapterError>;
  readonly packIndexes: Cache.Cache<string, ParsedPackIndex, GitAdapterError>;
  readonly packedRefs: Cache.Cache<string, Map<string, ObjectId>, GitAdapterError>;
};

export const looseObjectPath = (runtime: FilesystemRuntime, gitDir: string, id: ObjectId): string =>
  runtime.path.join(gitDir, "objects", id.slice(0, 2), id.slice(2));

export const looseRefPath = (runtime: FilesystemRuntime, gitDir: string, ref: string): string =>
  runtime.path.join(gitDir, ...ref.split("/"));

export const packedRefsPath = (runtime: FilesystemRuntime, gitDir: string): string =>
  runtime.path.join(gitDir, "packed-refs");

export const packedRefsCacheKey = (file: string, info: FileSystem.File.Info): string => {
  const mtime = Option.match(info.mtime, {
    onNone: () => "",
    onSome: (date) => String(date.getTime()),
  });

  return `${file}\0${info.size.toString()}\0${mtime}`;
};

export const decodePackedRefsCacheKey = (key: string): string => key.slice(0, key.indexOf("\0"));

export const objectCacheKey = (gitDir: string, id: ObjectId): string => `${gitDir}\0${id}`;

export const decodeObjectCacheKey = (
  key: string,
): { readonly gitDir: string; readonly id: ObjectId } => {
  const separator = key.lastIndexOf("\0");

  return {
    gitDir: key.slice(0, separator),
    id: key.slice(separator + 1),
  };
};

export const mapFsError =
  (operation: string, target: string) =>
  (cause: unknown): GitAdapterError =>
    gitAdapterError(operation, `${operation} failed for ${target}: ${errorMessage(cause)}`, {
      cause,
    });

export const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
