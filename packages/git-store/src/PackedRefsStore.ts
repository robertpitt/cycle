import { Cache, Context, Effect, FileSystem, Layer, Option, Path } from "effect";
import { FilesystemProtocolError, causeMessage, type GitStoreError } from "./GitStoreErrors.ts";
import type { ObjectId, RefName } from "./GitStoreSchemas.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import { validateObjectId, validateRefName } from "./internal/refs.ts";
import { splitLines, splitSpacePair } from "./internal/strings.ts";

export type PackedRefsStoreShape = {
  readonly list: (
    prefix?: string,
  ) => Effect.Effect<
    ReadonlyArray<{ readonly name: RefName; readonly target: ObjectId }>,
    GitStoreError
  >;
  readonly read: (ref: string) => Effect.Effect<ObjectId | null, GitStoreError>;
};

export class PackedRefsStore extends Context.Service<PackedRefsStore, PackedRefsStoreShape>()(
  "@cycle/git-store/PackedRefsStore",
) {}

export const PackedRefsStoreLive = Layer.effect(
  PackedRefsStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const runtime = yield* GitStoreRuntime;
    const cache = yield* Cache.make<string, Map<string, ObjectId>, GitStoreError>({
      capacity: 8,
      lookup: (key) => parsePackedRefsFile(fs, decodeCacheKey(key)),
    });

    const packedRefsPath = path.join(runtime.config.commonGitDir, "packed-refs");

    const cacheKey = Effect.fn("PackedRefsStore.cacheKey")(function* () {
      const exists = yield* fs
        .exists(packedRefsPath)
        .pipe(Effect.catch(() => Effect.succeed(false)));

      if (!exists) return null;

      const stat = yield* fs.stat(packedRefsPath).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `stat packed refs failed for ${packedRefsPath}: ${causeMessage(cause)}`,
              operation: "stat packed refs",
              path: packedRefsPath,
            }),
        ),
      );
      const mtime = Option.match(stat.mtime, {
        onNone: () => "",
        onSome: (date) => date.getTime().toString(),
      });

      return `${packedRefsPath}\0${stat.size.toString()}\0${mtime}`;
    });

    const current = Effect.fn("PackedRefsStore.current")(function* () {
      const key = yield* cacheKey();

      return key === null ? new Map<string, ObjectId>() : yield* Cache.get(cache, key);
    });

    const read = Effect.fn("PackedRefsStore.read")(function* (ref: string) {
      yield* validateRefName(ref);

      return (yield* current()).get(ref) ?? null;
    });

    const list = Effect.fn("PackedRefsStore.list")(function* (prefix = "refs/") {
      const refs = yield* current();

      return [...refs.entries()]
        .filter(([name]) => name.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, target]) => ({
          name: name as RefName,
          target,
        }));
    });

    return PackedRefsStore.of({ list, read });
  }),
);

const decodeCacheKey = (key: string): string => key.slice(0, key.indexOf("\0"));

const parsePackedRefsFile = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<Map<string, ObjectId>, GitStoreError> =>
  Effect.gen(function* () {
    const raw = yield* fs.readFileString(file).pipe(
      Effect.mapError(
        (cause) =>
          new FilesystemProtocolError({
            cause,
            message: `read packed refs failed for ${file}: ${causeMessage(cause)}`,
            operation: "read packed refs",
            path: file,
          }),
      ),
    );
    const refs = new Map<string, ObjectId>();

    for (const line of splitLines(raw)) {
      if (line === "" || line.startsWith("#") || line.startsWith("^")) continue;

      const [target, name] = splitSpacePair(line.trim());

      if (name !== undefined) {
        refs.set(yield* validateRefName(name), yield* validateObjectId(target));
      }
    }

    return refs;
  });
