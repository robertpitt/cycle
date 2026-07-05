import { inflateSync } from "node:zlib";
import { Cache, Effect } from "effect";
import { GitAdapterError } from "./GitErrors.ts";
import type { FilesystemRuntimeBase, GitObject } from "./GitFilesystemTypes.ts";
import { bytesToHex, mapPackFsError } from "./GitPackBytes.ts";
import { applyDelta } from "./GitPackDelta.ts";
import { findPackedObject } from "./GitPackIndex.ts";

type ParsedPackedObject =
  | {
      readonly dataOffset: number;
      readonly objectOffset: number;
      readonly size: number;
      readonly type: GitObject["type"];
    }
  | {
      readonly baseOffset: number;
      readonly dataOffset: number;
      readonly objectOffset: number;
      readonly size: number;
      readonly type: "ofs-delta";
    }
  | {
      readonly baseObjectId: string;
      readonly dataOffset: number;
      readonly objectOffset: number;
      readonly size: number;
      readonly type: "ref-delta";
    };

export const readPackedObject = (
  runtime: FilesystemRuntimeBase,
  gitDir: string,
  id: string,
): Effect.Effect<GitObject | null, GitAdapterError> =>
  Effect.gen(function* () {
    const location = yield* findPackedObject(runtime, gitDir, id);

    if (location === null) return null;

    const pack = yield* readPackFile(runtime, location.packPath);

    return yield* readPackObjectAt(runtime, gitDir, location.packPath, pack, location.objectOffset);
  });

const readPackFile = (
  runtime: FilesystemRuntimeBase,
  packPath: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  runtime.packFiles !== undefined
    ? Cache.get(runtime.packFiles, packPath)
    : runtime.fs
        .readFile(packPath)
        .pipe(Effect.mapError(mapPackFsError("filesystem pack read", packPath)));

const readPackObjectAt = (
  runtime: FilesystemRuntimeBase,
  gitDir: string,
  packPath: string,
  pack: Uint8Array,
  offset: number,
  seenOffsets: ReadonlySet<number> = new Set(),
): Effect.Effect<GitObject, GitAdapterError> =>
  Effect.gen(function* () {
    if (seenOffsets.has(offset)) {
      return yield* new GitAdapterError({
        operation: "filesystem pack read",
        message: `Pack delta cycle detected at offset ${offset}`,
      });
    }

    const parsed = yield* parsePackedObjectHeader(pack, offset, packPath);
    const inflated = yield* inflatePackData(
      pack.subarray(parsed.dataOffset),
      parsed.size,
      packPath,
    );

    if (parsed.type === "blob" || parsed.type === "commit" || parsed.type === "tree") {
      return {
        payload: inflated,
        type: parsed.type,
      };
    }

    const nextSeen = new Set([...seenOffsets, offset]);
    const base =
      parsed.type === "ofs-delta"
        ? yield* readPackObjectAt(runtime, gitDir, packPath, pack, parsed.baseOffset, nextSeen)
        : parsed.type === "ref-delta"
          ? yield* readPackedObject(runtime, gitDir, parsed.baseObjectId)
          : null;

    if (base === null) {
      return yield* new GitAdapterError({
        operation: "filesystem pack read",
        message: `Delta base object not found for object at offset ${offset}`,
      });
    }

    return {
      payload: yield* applyDelta(base.payload, inflated, packPath),
      type: base.type,
    };
  });

const parsePackedObjectHeader = (
  pack: Uint8Array,
  objectOffset: number,
  packPath: string,
): Effect.Effect<ParsedPackedObject, GitAdapterError> =>
  Effect.gen(function* () {
    let offset = objectOffset;
    let byte = pack[offset++];

    if (byte === undefined) {
      return yield* new GitAdapterError({
        operation: "filesystem pack read",
        message: `Object offset is outside pack: ${packPath}`,
      });
    }

    const typeCode = (byte >> 4) & 0x07;
    let size = byte & 0x0f;
    let shift = 4;

    while ((byte & 0x80) !== 0) {
      byte = pack[offset++];

      if (byte === undefined) {
        return yield* new GitAdapterError({
          operation: "filesystem pack read",
          message: `Object header is truncated: ${packPath}`,
        });
      }

      size += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    }

    const type = packObjectType(typeCode);

    if (type === null) {
      return yield* new GitAdapterError({
        operation: "filesystem pack read",
        message: `Unsupported packed object type ${typeCode}`,
      });
    }

    if (type === "ofs-delta") {
      const result = readOffsetDeltaBase(pack, objectOffset, offset, packPath);

      return yield* Effect.map(result, ({ baseOffset, nextOffset }) => ({
        baseOffset,
        dataOffset: nextOffset,
        objectOffset,
        size,
        type,
      }));
    }

    if (type === "ref-delta") {
      const baseEnd = offset + 20;

      if (baseEnd > pack.byteLength) {
        return yield* new GitAdapterError({
          operation: "filesystem pack read",
          message: `Ref-delta header is truncated: ${packPath}`,
        });
      }

      return {
        baseObjectId: bytesToHex(pack.subarray(offset, baseEnd)),
        dataOffset: baseEnd,
        objectOffset,
        size,
        type,
      };
    }

    return {
      dataOffset: offset,
      objectOffset,
      size,
      type,
    };
  });

const readOffsetDeltaBase = (
  pack: Uint8Array,
  objectOffset: number,
  offset: number,
  packPath: string,
): Effect.Effect<{ readonly baseOffset: number; readonly nextOffset: number }, GitAdapterError> =>
  Effect.gen(function* () {
    let byte = pack[offset++];

    if (byte === undefined) {
      return yield* new GitAdapterError({
        operation: "filesystem pack read",
        message: `Ofs-delta header is truncated: ${packPath}`,
      });
    }

    let distance = byte & 0x7f;

    while ((byte & 0x80) !== 0) {
      byte = pack[offset++];

      if (byte === undefined) {
        return yield* new GitAdapterError({
          operation: "filesystem pack read",
          message: `Ofs-delta header is truncated: ${packPath}`,
        });
      }

      distance = (distance + 1) * 128 + (byte & 0x7f);
    }

    return {
      baseOffset: objectOffset - distance,
      nextOffset: offset,
    };
  });

const inflatePackData = (
  compressed: Uint8Array,
  expectedSize: number,
  packPath: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.flatMap(
    Effect.try({
      try: () => new Uint8Array(inflateSync(compressed)),
      catch: (cause) =>
        new GitAdapterError({
          operation: "filesystem pack read",
          message: `Could not inflate packed object: ${packPath}`,
          cause,
        }),
    }),
    (inflated) => {
      if (inflated.byteLength === expectedSize) {
        return Effect.succeed(inflated);
      }

      return Effect.fail(
        new GitAdapterError({
          operation: "filesystem pack read",
          message: `Expected ${expectedSize} bytes but inflated ${inflated.byteLength}: ${packPath}`,
        }),
      );
    },
  );

const packObjectType = (type: number): GitObject["type"] | "ofs-delta" | "ref-delta" | null => {
  switch (type) {
    case 1:
      return "commit";
    case 2:
      return "tree";
    case 3:
      return "blob";
    case 6:
      return "ofs-delta";
    case 7:
      return "ref-delta";
    default:
      return null;
  }
};
