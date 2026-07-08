import { Cache, Context, Effect, FileSystem, Layer, Path } from "effect";
import {
  FilesystemProtocolError,
  PackIndexParseError,
  UnsupportedPackFormatError,
  causeMessage,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type { ObjectId } from "./GitStoreSchemas.ts";
import { dataView, hexToBytes } from "./internal/bytes.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";

export type ParsedPackIndex = {
  readonly bytes: Uint8Array;
  readonly indexPath: string;
  readonly namesOffset: number;
  readonly objectCount: number;
  readonly offsetsOffset: number;
};

export type PackLocation = {
  readonly objectOffset: number;
  readonly packPath: string;
};

type PackIndexEntry = {
  readonly entry: string;
  readonly index: ParsedPackIndex;
  readonly packPath: string;
};

type PackDirectoryKey = {
  readonly entries: ReadonlyArray<string>;
  readonly packDirectory: string;
};

export type PackIndexStoreShape = {
  readonly findPackedObject: (id: ObjectId) => Effect.Effect<PackLocation | null, GitStoreError>;
  readonly readPackIndex: (indexPath: string) => Effect.Effect<ParsedPackIndex, GitStoreError>;
};

export class PackIndexStore extends Context.Service<PackIndexStore, PackIndexStoreShape>()(
  "@cycle/git-store/PackIndexStore",
) {}

export const PackIndexStoreLive = Layer.effect(
  PackIndexStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const runtime = yield* GitStoreRuntime;
    const indexCache = yield* Cache.make<string, ParsedPackIndex, GitStoreError>({
      capacity: 64,
      lookup: (indexPath) =>
        fs.readFile(indexPath).pipe(
          Effect.mapError(
            (cause) =>
              new FilesystemProtocolError({
                cause,
                message: `read pack index failed for ${indexPath}: ${causeMessage(cause)}`,
                operation: "read pack index",
                path: indexPath,
              }),
          ),
          Effect.flatMap((bytes) => parsePackIndex(bytes, indexPath)),
        ),
    });

    const readPackIndex = Effect.fn("PackIndexStore.readPackIndex")(function* (indexPath: string) {
      return yield* Cache.get(indexCache, indexPath);
    });

    const directoryCache = yield* Cache.make<string, ReadonlyArray<PackIndexEntry>, GitStoreError>({
      capacity: 8,
      lookup: (key) => {
        const decoded = decodePackDirectoryKey(key);

        return Effect.forEach(decoded.entries, (entry) => {
          const indexPath = path.join(decoded.packDirectory, entry);

          return readPackIndex(indexPath).pipe(
            Effect.map((index) => ({
              entry,
              index,
              packPath: path.join(
                decoded.packDirectory,
                `${entry.slice(0, -".idx".length)}.pack`,
              ),
            })),
          );
        });
      },
    });

    const findPackedObject = Effect.fn("PackIndexStore.findPackedObject")(function* (id: ObjectId) {
      const packDirectory = path.join(runtime.config.commonGitDir, "objects", "pack");
      const exists = yield* fs
        .exists(packDirectory)
        .pipe(Effect.catch(() => Effect.succeed(false)));

      if (!exists) return null;

      const entries = (yield* fs.readDirectory(packDirectory).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `list pack directory failed for ${packDirectory}: ${causeMessage(cause)}`,
              operation: "list pack directory",
              path: packDirectory,
            }),
        ),
      ))
        .filter((name) => name.endsWith(".idx"))
        .sort();

      if (entries.length === 0) return null;

      const indexes = yield* Cache.get(
        directoryCache,
        encodePackDirectoryKey({ entries, packDirectory }),
      );

      for (const { index, packPath } of indexes) {
        const objectOffset = yield* lookupIndexOffset(index, id);

        if (objectOffset !== null) {
          return {
            objectOffset,
            packPath,
          };
        }
      }

      return null;
    });

    return PackIndexStore.of({
      findPackedObject,
      readPackIndex,
    });
  }),
);

const parsePackIndex = (
  bytes: Uint8Array,
  indexPath: string,
): Effect.Effect<ParsedPackIndex, GitStoreError> =>
  Effect.gen(function* () {
    const view = dataView(bytes);

    if (
      bytes.byteLength < 8 + 256 * 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0x74 ||
      bytes[2] !== 0x4f ||
      bytes[3] !== 0x63
    ) {
      return yield* new UnsupportedPackFormatError({
        message: `Unsupported pack index format: ${indexPath}`,
        path: indexPath,
      });
    }

    const version = view.getUint32(4);

    if (version !== 2) {
      return yield* new UnsupportedPackFormatError({
        message: `Unsupported pack index v${version}: ${indexPath}`,
        path: indexPath,
      });
    }

    const fanoutOffset = 8;
    const objectCount = view.getUint32(fanoutOffset + 255 * 4);
    const namesOffset = fanoutOffset + 256 * 4;
    const crcOffset = namesOffset + objectCount * 20;
    const offsetsOffset = crcOffset + objectCount * 4;
    const minimumSize = offsetsOffset + objectCount * 4 + 40;

    if (bytes.byteLength < minimumSize) {
      return yield* new PackIndexParseError({
        message: `Truncated pack index: ${indexPath}`,
        path: indexPath,
      });
    }

    return {
      bytes,
      indexPath,
      namesOffset,
      objectCount,
      offsetsOffset,
    };
  });

const encodePackDirectoryKey = (key: PackDirectoryKey): string => JSON.stringify(key);

const decodePackDirectoryKey = (key: string): PackDirectoryKey =>
  JSON.parse(key) as PackDirectoryKey;

const lookupIndexOffset = (
  index: ParsedPackIndex,
  id: ObjectId,
): Effect.Effect<number | null, GitStoreError> =>
  Effect.gen(function* () {
    const view = dataView(index.bytes);
    const fanoutOffset = 8;
    const target = hexToBytes(id);

    if (target === null) {
      return yield* new PackIndexParseError({
        message: `Invalid object id for pack lookup: ${id}`,
        path: index.indexPath,
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

      if (order === 0) return yield* indexOffsetAt(index, middle);
      if (order < 0) low = middle + 1;
      else high = middle - 1;
    }

    return null;
  });

const indexOffsetAt = (
  index: ParsedPackIndex,
  objectIndex: number,
): Effect.Effect<number, GitStoreError> => {
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
        new PackIndexParseError({
          message: `Pack offset exceeds Number.MAX_SAFE_INTEGER: ${index.indexPath}`,
          path: index.indexPath,
        }),
      )
    : Effect.succeed(largeOffset);
};

const compareObjectIdAt = (bytes: Uint8Array, offset: number, target: Uint8Array): number => {
  for (let index = 0; index < target.byteLength; index += 1) {
    const left = bytes[offset + index] ?? -1;
    const right = target[index] ?? -1;

    if (left !== right) return left - right;
  }

  return 0;
};
