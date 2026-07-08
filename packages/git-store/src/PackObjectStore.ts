import { Cache, Context, Effect, FileSystem, Layer } from "effect";
import {
  FilesystemProtocolError,
  PackObjectParseError,
  causeMessage,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type { GitObjectType, ObjectId } from "./GitStoreSchemas.ts";
import { bytesToHex } from "./internal/bytes.ts";
import { inflatePackData } from "./internal/compression.ts";
import type { GitObject } from "./internal/git-object.ts";
import { PackIndexStore } from "./PackIndexStore.ts";

type ParsedPackedObject =
  | {
      readonly dataOffset: number;
      readonly objectOffset: number;
      readonly size: number;
      readonly type: GitObjectType;
    }
  | {
      readonly baseOffset: number;
      readonly dataOffset: number;
      readonly objectOffset: number;
      readonly size: number;
      readonly type: "ofs-delta";
    }
  | {
      readonly baseObjectId: ObjectId;
      readonly dataOffset: number;
      readonly objectOffset: number;
      readonly size: number;
      readonly type: "ref-delta";
    };

export type PackObjectStoreShape = {
  readonly readObject: (id: ObjectId) => Effect.Effect<GitObject | null, GitStoreError>;
};

export class PackObjectStore extends Context.Service<PackObjectStore, PackObjectStoreShape>()(
  "@cycle/git-store/PackObjectStore",
) {}

export const PackObjectStoreLive = Layer.effect(
  PackObjectStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const indexStore = yield* PackIndexStore;
    const packCache = yield* Cache.make<string, Uint8Array, GitStoreError>({
      capacity: 16,
      lookup: (packPath) =>
        fs.readFile(packPath).pipe(
          Effect.mapError(
            (cause) =>
              new FilesystemProtocolError({
                cause,
                message: `read pack file failed for ${packPath}: ${causeMessage(cause)}`,
                operation: "read pack file",
                path: packPath,
              }),
          ),
        ),
    });

    const readObjectAt = (
      packPath: string,
      pack: Uint8Array,
      offset: number,
      seenOffsets: ReadonlySet<number> = new Set(),
    ): Effect.Effect<GitObject, GitStoreError> =>
      Effect.gen(function* () {
        if (seenOffsets.has(offset)) {
          return yield* new PackObjectParseError({
            message: `Pack delta cycle detected at offset ${offset}`,
            path: packPath,
          });
        }

        const parsed = yield* parsePackedObjectHeader(pack, offset, packPath);
        const inflated = yield* inflatePackData(pack.subarray(parsed.dataOffset), packPath);

        if (inflated.byteLength !== parsed.size) {
          return yield* new PackObjectParseError({
            message: `Expected ${parsed.size} bytes but inflated ${inflated.byteLength}: ${packPath}`,
            path: packPath,
          });
        }

        if (
          parsed.type === "blob" ||
          parsed.type === "commit" ||
          parsed.type === "tree" ||
          parsed.type === "tag"
        ) {
          return {
            body: inflated,
            type: parsed.type,
          };
        }

        const nextSeen = new Set([...seenOffsets, offset]);
        const base =
          parsed.type === "ofs-delta"
            ? yield* readObjectAt(packPath, pack, parsed.baseOffset, nextSeen)
            : parsed.type === "ref-delta"
              ? yield* readObjectById(parsed.baseObjectId)
              : null;

        if (base === null) {
          return yield* new PackObjectParseError({
            message: `Delta base object not found at offset ${offset}`,
            path: packPath,
          });
        }

        return {
          body: yield* applyDelta(base.body, inflated, packPath),
          type: base.type,
        };
      });

    const readObjectById = (id: ObjectId): Effect.Effect<GitObject | null, GitStoreError> =>
      Effect.gen(function* () {
        const location = yield* indexStore.findPackedObject(id);

        if (location === null) return null;

        const pack = yield* Cache.get(packCache, location.packPath);

        return yield* readObjectAt(location.packPath, pack, location.objectOffset);
      });

    const readObject = Effect.fn("PackObjectStore.readObject")(function* (id: ObjectId) {
      return yield* readObjectById(id);
    });

    return PackObjectStore.of({ readObject });
  }),
);

const parsePackedObjectHeader = (
  pack: Uint8Array,
  objectOffset: number,
  packPath: string,
): Effect.Effect<ParsedPackedObject, GitStoreError> =>
  Effect.gen(function* () {
    let offset = objectOffset;
    let byte = pack[offset++];

    if (byte === undefined) {
      return yield* new PackObjectParseError({
        message: `Object offset is outside pack: ${packPath}`,
        path: packPath,
      });
    }

    const typeCode = (byte >> 4) & 0x07;
    let size = byte & 0x0f;
    let shift = 4;

    while ((byte & 0x80) !== 0) {
      byte = pack[offset++];

      if (byte === undefined) {
        return yield* new PackObjectParseError({
          message: `Object header is truncated: ${packPath}`,
          path: packPath,
        });
      }

      size += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    }

    const type = packObjectType(typeCode);

    if (type === null) {
      return yield* new PackObjectParseError({
        message: `Unsupported packed object type ${typeCode}`,
        path: packPath,
      });
    }

    if (type === "ofs-delta") {
      const result = yield* readOffsetDeltaBase(pack, objectOffset, offset, packPath);

      return {
        baseOffset: result.baseOffset,
        dataOffset: result.nextOffset,
        objectOffset,
        size,
        type,
      };
    }

    if (type === "ref-delta") {
      const baseEnd = offset + 20;

      if (baseEnd > pack.byteLength) {
        return yield* new PackObjectParseError({
          message: `Ref-delta header is truncated: ${packPath}`,
          path: packPath,
        });
      }

      return {
        baseObjectId: bytesToHex(pack.subarray(offset, baseEnd)) as ObjectId,
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
): Effect.Effect<{ readonly baseOffset: number; readonly nextOffset: number }, GitStoreError> =>
  Effect.gen(function* () {
    let byte = pack[offset++];

    if (byte === undefined) {
      return yield* new PackObjectParseError({
        message: `Ofs-delta header is truncated: ${packPath}`,
        path: packPath,
      });
    }

    let distance = byte & 0x7f;

    while ((byte & 0x80) !== 0) {
      byte = pack[offset++];

      if (byte === undefined) {
        return yield* new PackObjectParseError({
          message: `Ofs-delta header is truncated: ${packPath}`,
          path: packPath,
        });
      }

      distance = (distance + 1) * 128 + (byte & 0x7f);
    }

    return {
      baseOffset: objectOffset - distance,
      nextOffset: offset,
    };
  });

const packObjectType = (type: number): GitObjectType | "ofs-delta" | "ref-delta" | null => {
  switch (type) {
    case 1:
      return "commit";
    case 2:
      return "tree";
    case 3:
      return "blob";
    case 4:
      return "tag";
    case 6:
      return "ofs-delta";
    case 7:
      return "ref-delta";
    default:
      return null;
  }
};

const applyDelta = (
  base: Uint8Array,
  delta: Uint8Array,
  packPath: string,
): Effect.Effect<Uint8Array, GitStoreError> =>
  Effect.gen(function* () {
    const baseSize = readDeltaSize(delta, 0);
    const resultSize = readDeltaSize(delta, baseSize.nextOffset);

    if (baseSize.size !== base.byteLength) {
      return yield* new PackObjectParseError({
        message: `Delta base size mismatch in ${packPath}: expected ${base.byteLength}, got ${baseSize.size}`,
        path: packPath,
      });
    }

    const output = new Uint8Array(resultSize.size);
    let readOffset = resultSize.nextOffset;
    let writeOffset = 0;

    while (readOffset < delta.byteLength) {
      const instruction = delta[readOffset++];

      if (instruction === undefined) break;

      if ((instruction & 0x80) !== 0) {
        const copy = readCopyInstruction(delta, readOffset, instruction);
        const end = copy.offset + copy.size;

        if (end > base.byteLength || writeOffset + copy.size > output.byteLength) {
          return yield* new PackObjectParseError({
            message: `Delta copy is outside bounds in ${packPath}`,
            path: packPath,
          });
        }

        output.set(base.subarray(copy.offset, end), writeOffset);
        readOffset = copy.nextOffset;
        writeOffset += copy.size;
      } else if (instruction !== 0) {
        const size = instruction & 0x7f;
        const end = readOffset + size;

        if (end > delta.byteLength || writeOffset + size > output.byteLength) {
          return yield* new PackObjectParseError({
            message: `Delta insert is outside bounds in ${packPath}`,
            path: packPath,
          });
        }

        output.set(delta.subarray(readOffset, end), writeOffset);
        readOffset = end;
        writeOffset += size;
      } else {
        return yield* new PackObjectParseError({
          message: `Invalid delta instruction in ${packPath}`,
          path: packPath,
        });
      }
    }

    return writeOffset === output.byteLength
      ? output
      : yield* new PackObjectParseError({
          message: `Delta result size mismatch in ${packPath}: expected ${output.byteLength}, got ${writeOffset}`,
          path: packPath,
        });
  });

const readDeltaSize = (
  delta: Uint8Array,
  offset: number,
): { readonly nextOffset: number; readonly size: number } => {
  let size = 0;
  let shift = 0;
  let byte = 0;

  do {
    byte = delta[offset++] ?? 0;
    size += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while ((byte & 0x80) !== 0);

  return { nextOffset: offset, size };
};

const readCopyInstruction = (
  delta: Uint8Array,
  offset: number,
  instruction: number,
): { readonly nextOffset: number; readonly offset: number; readonly size: number } => {
  let copyOffset = 0;
  let copySize = 0;

  if ((instruction & 0x01) !== 0) copyOffset += delta[offset++] ?? 0;
  if ((instruction & 0x02) !== 0) copyOffset += (delta[offset++] ?? 0) * 2 ** 8;
  if ((instruction & 0x04) !== 0) copyOffset += (delta[offset++] ?? 0) * 2 ** 16;
  if ((instruction & 0x08) !== 0) copyOffset += (delta[offset++] ?? 0) * 2 ** 24;
  if ((instruction & 0x10) !== 0) copySize += delta[offset++] ?? 0;
  if ((instruction & 0x20) !== 0) copySize += (delta[offset++] ?? 0) * 2 ** 8;
  if ((instruction & 0x40) !== 0) copySize += (delta[offset++] ?? 0) * 2 ** 16;

  return {
    nextOffset: offset,
    offset: copyOffset,
    size: copySize === 0 ? 0x10000 : copySize,
  };
};
