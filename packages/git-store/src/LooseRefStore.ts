import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { FilesystemProtocolError, causeMessage, type GitStoreError } from "./GitStoreErrors.ts";
import type { ObjectId, RefName } from "./GitStoreSchemas.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import { validateObjectId, validateRefName } from "./internal/refs.ts";
import { splitPath, toSlashPath } from "./internal/strings.ts";

export type LooseRef = {
  readonly name: RefName;
  readonly target: ObjectId;
};

export type LooseRefStoreShape = {
  readonly list: (prefix?: string) => Effect.Effect<ReadonlyArray<LooseRef>, GitStoreError>;
  readonly pathFor: (ref: RefName) => string;
  readonly readRaw: (ref: string) => Effect.Effect<string | null, GitStoreError>;
  readonly symbolicTarget: (ref: string) => Effect.Effect<RefName | null, GitStoreError>;
};

export class LooseRefStore extends Context.Service<LooseRefStore, LooseRefStoreShape>()(
  "@cycle/git-store/LooseRefStore",
) {}

export const LooseRefStoreLive = Layer.effect(
  LooseRefStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const runtime = yield* GitStoreRuntime;

    const pathFor = (ref: RefName): string =>
      path.join(runtime.config.commonGitDir, ...splitPath(ref));

    const readRaw = Effect.fn("LooseRefStore.readRaw")(function* (ref: string) {
      const valid = yield* validateRefName(ref);
      const refPath = pathFor(valid);
      const exists = yield* fs.exists(refPath).pipe(Effect.catch(() => Effect.succeed(false)));

      if (!exists) return null;

      const raw = yield* fs.readFileString(refPath).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `read loose ref failed for ${refPath}: ${causeMessage(cause)}`,
              operation: "read loose ref",
              path: refPath,
            }),
        ),
      );

      const value = raw.trim();

      return value.length === 0 ? null : value;
    });

    const symbolicTarget = Effect.fn("LooseRefStore.symbolicTarget")(function* (ref: string) {
      const raw = yield* readRaw(ref);

      if (raw === null || !raw.startsWith("ref: ")) return null;

      return yield* validateRefName(raw.slice("ref: ".length).trim());
    });

    const list = Effect.fn("LooseRefStore.list")(function* (prefix = "refs/") {
      const refsRoot = path.join(runtime.config.commonGitDir, "refs");
      const exists = yield* fs.exists(refsRoot).pipe(Effect.catch(() => Effect.succeed(false)));

      if (!exists) return [];

      const entries = yield* fs.readDirectory(refsRoot, { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `list loose refs failed for ${refsRoot}: ${causeMessage(cause)}`,
              operation: "list loose refs",
              path: refsRoot,
            }),
        ),
      );
      const refs: Array<LooseRef> = [];

      for (const entry of entries.sort()) {
        if (entry.endsWith(".lock")) continue;

        const fullPath = path.join(refsRoot, entry);
        const stat = yield* fs.stat(fullPath).pipe(Effect.catch(() => Effect.succeed(null)));

        if (stat?.type !== "File") continue;

        const ref = `refs/${toSlashPath(entry, path.sep)}`;
        if (!ref.startsWith(prefix)) continue;

        const raw = yield* readRaw(ref);
        if (raw === null || raw.startsWith("ref: ")) continue;

        refs.push({
          name: yield* validateRefName(ref),
          target: yield* validateObjectId(raw),
        });
      }

      return refs;
    });

    return LooseRefStore.of({
      list,
      pathFor,
      readRaw,
      symbolicTarget,
    });
  }),
);
