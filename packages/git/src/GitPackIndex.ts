import { Cache, Effect } from "effect";
import { GitAdapterError } from "./GitErrors.ts";
import type { FilesystemRuntimeBase, ParsedPackIndex } from "./GitFilesystemTypes.ts";
import { compareObjectIdAt, dataView, mapPackFsError, objectIdBytes } from "./GitPackBytes.ts";

export type PackLocation = {
  readonly objectOffset: number;
  readonly packPath: string;
};

export const findPackedObject = (
  runtime: FilesystemRuntimeBase,
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
      .pipe(Effect.mapError(mapPackFsError("filesystem pack index", packDirectory)));

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

export const readPackIndex = (
  runtime: FilesystemRuntimeBase,
  indexPath: string,
): Effect.Effect<ParsedPackIndex, GitAdapterError> =>
  runtime.packIndexes !== undefined
    ? Cache.get(runtime.packIndexes, indexPath)
    : runtime.fs.readFile(indexPath).pipe(
        Effect.mapError(mapPackFsError("filesystem pack index", indexPath)),
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
      return yield* new GitAdapterError({
        operation: "filesystem pack index",
        message: `Unsupported pack index format: ${indexPath}`,
      });
    }

    const version = view.getUint32(4);

    if (version !== 2) {
      return yield* new GitAdapterError({
        operation: "filesystem pack index",
        message: `Unsupported pack index v${version}: ${indexPath}`,
      });
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

const lookupIndexOffset = (
  index: ParsedPackIndex,
  id: string,
  indexPath: string,
): Effect.Effect<number | null, GitAdapterError> =>
  Effect.gen(function* () {
    const view = dataView(index.bytes);
    const fanoutOffset = 8;
    const target = objectIdBytes(id);

    if (target === null) {
      return yield* new GitAdapterError({
        operation: "filesystem pack index",
        message: `Invalid object id for pack lookup: ${id}`,
      });
    }

    const firstByte = Number.parseInt(id.slice(0, 2), 16);
    const start = firstByte === 0 ? 0 : view.getUint32(fanoutOffset + (firstByte - 1) * 4);
    const end = view.getUint32(fanoutOffset + firstByte * 4);
    let low = start;
    let high = end - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const order = compareObjectIdAt(index.bytes, index.namesOffset + middle * 20, target);

      if (order === 0) {
        return yield* indexOffsetAt(index, middle, indexPath);
      }

      if (order < 0) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return null;
  });

const indexOffsetAt = (
  index: ParsedPackIndex,
  objectIndex: number,
  indexPath: string,
): Effect.Effect<number, GitAdapterError> => {
  const view = dataView(index.bytes);
  const offset = view.getUint32(index.offsetsOffset + objectIndex * 4);

  if ((offset & 0x80000000) === 0) return Effect.succeed(offset);

  const largeOffsetIndex = offset & 0x7fffffff;
  const largeOffsetsOffset = index.offsetsOffset + index.objectCount * 4 + largeOffsetIndex * 8;
  const highBits = view.getUint32(largeOffsetsOffset);
  const lowBits = view.getUint32(largeOffsetsOffset + 4);
  const largeOffset = highBits * 2 ** 32 + lowBits;

  return largeOffset > Number.MAX_SAFE_INTEGER
    ? Effect.fail(
        new GitAdapterError({
          operation: "filesystem pack index",
          message: `Pack offset is larger than Number.MAX_SAFE_INTEGER: ${indexPath}`,
        }),
      )
    : Effect.succeed(largeOffset);
};
