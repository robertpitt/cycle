import { inflateSync } from "node:zlib";
import { Cache, Effect, FileSystem, Path } from "effect";
import { gitAdapterError, type GitAdapterError } from "../errors/index.ts";

export type PackedObject = {
  readonly payload: Uint8Array;
  readonly type: "blob" | "commit" | "tree";
};

type Runtime = {
  readonly fs: FileSystem.FileSystem;
  readonly packFiles?: Cache.Cache<string, Uint8Array, GitAdapterError>;
  readonly packIndexes?: Cache.Cache<string, ParsedPackIndex, GitAdapterError>;
  readonly path: Path.Path;
};

type PackLocation = {
  readonly objectOffset: number;
  readonly packPath: string;
};

export type ParsedPackIndex = {
  readonly bytes: Uint8Array;
  readonly indexPath: string;
  readonly namesOffset: number;
  readonly objectCount: number;
  readonly offsetsOffset: number;
};

type ParsedPackedObject =
  | {
      readonly dataOffset: number;
      readonly objectOffset: number;
      readonly size: number;
      readonly type: PackedObject["type"];
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
  runtime: Runtime,
  gitDir: string,
  id: string,
): Effect.Effect<PackedObject | null, GitAdapterError> =>
  Effect.gen(function* () {
    const location = yield* findPackedObject(runtime, gitDir, id);

    if (location === null) return null;

    const pack = yield* readPackFile(runtime, location.packPath);

    return yield* readPackObjectAt(runtime, gitDir, location.packPath, pack, location.objectOffset);
  });

const findPackedObject = (
  runtime: Runtime,
  gitDir: string,
  id: string,
): Effect.Effect<PackLocation | null, GitAdapterError> =>
  Effect.gen(function* () {
    const packDirectory = runtime.path.join(gitDir, "objects", "pack");
    const exists = yield* runtime.fs
      .exists(packDirectory)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) return null;

    const entries = yield* runtime.fs
      .readDirectory(packDirectory)
      .pipe(Effect.mapError(mapFsError("filesystem pack index", packDirectory)));

    for (const entry of entries.filter((name) => name.endsWith(".idx")).sort()) {
      const indexPath = runtime.path.join(packDirectory, entry);
      const index = yield* readPackIndex(runtime, indexPath);
      const objectOffset = yield* lookupIndexOffset(index, id, indexPath);

      if (objectOffset !== null) {
        return {
          objectOffset,
          packPath: runtime.path.join(packDirectory, `${entry.slice(0, -".idx".length)}.pack`),
        };
      }
    }

    return null;
  });

const lookupIndexOffset = (
  index: ParsedPackIndex,
  id: string,
  indexPath: string,
): Effect.Effect<number | null, GitAdapterError> =>
  Effect.gen(function* () {
    const view = dataView(index.bytes);
    const fanoutOffset = 8;
    const objectCount = index.objectCount;
    const firstByte = Number.parseInt(id.slice(0, 2), 16);
    const target = objectIdBytes(id);

    if (target === null) {
      return yield* Effect.fail(
        gitAdapterError("filesystem pack index", `Invalid object id for pack lookup: ${id}`),
      );
    }

    const start =
      firstByte === 0 ? 0 : view.getUint32(fanoutOffset + (firstByte - 1) * 4);
    const end = view.getUint32(fanoutOffset + firstByte * 4);
    const namesOffset = index.namesOffset;
    const offsetsOffset = index.offsetsOffset;
    let low = start;
    let high = end - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const order = compareObjectIdAt(index.bytes, namesOffset + middle * 20, target);

      if (order === 0) {
        const offset = view.getUint32(offsetsOffset + middle * 4);

        if ((offset & 0x80000000) === 0) return offset;

        const largeOffsetIndex = offset & 0x7fffffff;
        const largeOffsetsOffset = offsetsOffset + objectCount * 4 + largeOffsetIndex * 8;
        const highBits = view.getUint32(largeOffsetsOffset);
        const lowBits = view.getUint32(largeOffsetsOffset + 4);
        const largeOffset = highBits * 2 ** 32 + lowBits;

        if (largeOffset > Number.MAX_SAFE_INTEGER) {
          return yield* Effect.fail(
            gitAdapterError(
              "filesystem pack index",
              `Pack offset is larger than Number.MAX_SAFE_INTEGER: ${indexPath}`,
            ),
          );
        }

        return largeOffset;
      }

      if (order < 0) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return null;
  });

export const readPackIndex = (
  runtime: Runtime,
  indexPath: string,
): Effect.Effect<ParsedPackIndex, GitAdapterError> =>
  runtime.packIndexes !== undefined
    ? Cache.get(runtime.packIndexes, indexPath)
    : runtime.fs
        .readFile(indexPath)
        .pipe(
          Effect.mapError(mapFsError("filesystem pack index", indexPath)),
          Effect.flatMap((bytes) => parsePackIndex(bytes, indexPath)),
        );

export const parsePackIndex = (
  bytes: Uint8Array,
  indexPath: string,
): Effect.Effect<ParsedPackIndex, GitAdapterError> =>
  Effect.gen(function* () {
    const view = dataView(bytes);

    if (
      bytes.byteLength < 8 + 256 * 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0x74 ||
      bytes[2] !== 0x4f ||
      bytes[3] !== 0x63
    ) {
      return yield* Effect.fail(
        gitAdapterError("filesystem pack index", `Unsupported pack index format: ${indexPath}`),
      );
    }

    const version = view.getUint32(4);

    if (version !== 2) {
      return yield* Effect.fail(
        gitAdapterError(
          "filesystem pack index",
          `Unsupported pack index v${version}: ${indexPath}`,
        ),
      );
    }

    const fanoutOffset = 8;
    const objectCount = view.getUint32(fanoutOffset + 255 * 4);
    const namesOffset = fanoutOffset + 256 * 4;
    const crcOffset = namesOffset + objectCount * 20;
    const offsetsOffset = crcOffset + objectCount * 4;

    return {
      bytes,
      indexPath,
      namesOffset,
      objectCount,
      offsetsOffset,
    };
  });

const readPackFile = (
  runtime: Runtime,
  packPath: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  runtime.packFiles !== undefined
    ? Cache.get(runtime.packFiles, packPath)
    : runtime.fs
        .readFile(packPath)
        .pipe(Effect.mapError(mapFsError("filesystem pack read", packPath)));

const readPackObjectAt = (
  runtime: Runtime,
  gitDir: string,
  packPath: string,
  pack: Uint8Array,
  offset: number,
  seenOffsets: ReadonlySet<number> = new Set(),
): Effect.Effect<PackedObject, GitAdapterError> =>
  Effect.gen(function* () {
    if (seenOffsets.has(offset)) {
      return yield* Effect.fail(
        gitAdapterError("filesystem pack read", `Pack delta cycle detected at offset ${offset}`),
      );
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
    let base: PackedObject | null;

    if (parsed.type === "ofs-delta") {
      base = yield* readPackObjectAt(runtime, gitDir, packPath, pack, parsed.baseOffset, nextSeen);
    } else if (parsed.type === "ref-delta") {
      base = yield* readPackedObject(runtime, gitDir, parsed.baseObjectId);
    } else {
      return yield* Effect.fail(
        gitAdapterError("filesystem pack read", `Unexpected packed object type ${parsed.type}`),
      );
    }

    if (base === null) {
      return yield* Effect.fail(
        gitAdapterError(
          "filesystem pack read",
          `Delta base object not found for object at offset ${offset}`,
        ),
      );
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
      return yield* Effect.fail(
        gitAdapterError("filesystem pack read", `Object offset is outside pack: ${packPath}`),
      );
    }

    const typeCode = (byte >> 4) & 0x07;
    let size = byte & 0x0f;
    let shift = 4;

    while ((byte & 0x80) !== 0) {
      byte = pack[offset++];

      if (byte === undefined) {
        return yield* Effect.fail(
          gitAdapterError("filesystem pack read", `Object header is truncated: ${packPath}`),
        );
      }

      size += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    }

    const type = packObjectType(typeCode);

    if (type === null) {
      return yield* Effect.fail(
        gitAdapterError("filesystem pack read", `Unsupported packed object type ${typeCode}`),
      );
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
        return yield* Effect.fail(
          gitAdapterError("filesystem pack read", `Ref-delta header is truncated: ${packPath}`),
        );
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
      return yield* Effect.fail(
        gitAdapterError("filesystem pack read", `Ofs-delta header is truncated: ${packPath}`),
      );
    }

    let distance = byte & 0x7f;

    while ((byte & 0x80) !== 0) {
      byte = pack[offset++];

      if (byte === undefined) {
        return yield* Effect.fail(
          gitAdapterError("filesystem pack read", `Ofs-delta header is truncated: ${packPath}`),
        );
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
  Effect.try({
    try: () => {
      const inflated = new Uint8Array(inflateSync(compressed));

      if (inflated.byteLength !== expectedSize) {
        throw new Error(`Expected ${expectedSize} bytes but inflated ${inflated.byteLength}`);
      }

      return inflated;
    },
    catch: (cause) =>
      gitAdapterError("filesystem pack read", `Could not inflate packed object: ${packPath}`, {
        cause,
      }),
  });

const applyDelta = (
  base: Uint8Array,
  delta: Uint8Array,
  packPath: string,
): Effect.Effect<Uint8Array, GitAdapterError> =>
  Effect.gen(function* () {
    const baseSize = readDeltaSize(delta, 0);
    const resultSize = readDeltaSize(delta, baseSize.nextOffset);

    if (baseSize.size !== base.byteLength) {
      return yield* Effect.fail(
        gitAdapterError(
          "filesystem pack read",
          `Delta base size mismatch in ${packPath}: expected ${base.byteLength}, got ${baseSize.size}`,
        ),
      );
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
          return yield* Effect.fail(
            gitAdapterError("filesystem pack read", `Delta copy is outside bounds in ${packPath}`),
          );
        }

        output.set(base.subarray(copy.offset, end), writeOffset);
        readOffset = copy.nextOffset;
        writeOffset += copy.size;
      } else if (instruction !== 0) {
        const size = instruction & 0x7f;
        const end = readOffset + size;

        if (end > delta.byteLength || writeOffset + size > output.byteLength) {
          return yield* Effect.fail(
            gitAdapterError(
              "filesystem pack read",
              `Delta insert is outside bounds in ${packPath}`,
            ),
          );
        }

        output.set(delta.subarray(readOffset, end), writeOffset);
        readOffset = end;
        writeOffset += size;
      } else {
        return yield* Effect.fail(
          gitAdapterError("filesystem pack read", `Invalid delta instruction in ${packPath}`),
        );
      }
    }

    if (writeOffset !== output.byteLength) {
      return yield* Effect.fail(
        gitAdapterError(
          "filesystem pack read",
          `Delta result size mismatch in ${packPath}: expected ${output.byteLength}, got ${writeOffset}`,
        ),
      );
    }

    return output;
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

const packObjectType = (type: number): PackedObject["type"] | "ofs-delta" | "ref-delta" | null => {
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

const dataView = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const mapFsError =
  (operation: string, target: string) =>
  (cause: unknown): GitAdapterError =>
    gitAdapterError(operation, `${operation} failed for ${target}: ${errorMessage(cause)}`, {
      cause,
    });

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const objectIdBytes = (id: string): Uint8Array | null => {
  if (!/^[0-9a-fA-F]{40}$/u.test(id)) return null;

  const bytes = new Uint8Array(20);

  for (let index = 0; index < id.length; index += 2) {
    bytes[index / 2] = Number.parseInt(id.slice(index, index + 2), 16);
  }

  return bytes;
};

const compareObjectIdAt = (bytes: Uint8Array, offset: number, target: Uint8Array): number => {
  for (let index = 0; index < target.byteLength; index += 1) {
    const left = bytes[offset + index] ?? -1;
    const right = target[index] ?? -1;

    if (left !== right) return left - right;
  }

  return 0;
};
