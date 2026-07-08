import { Context, Effect, Layer } from "effect";
import { InvalidRefNameError, type GitStoreError } from "./GitStoreErrors.ts";
import type { ObjectId, RefName } from "./GitStoreSchemas.ts";
import { validateObjectId, validateRefName } from "./internal/refs.ts";
import { LooseRefStore } from "./LooseRefStore.ts";
import { PackedRefsStore } from "./PackedRefsStore.ts";

export type RefTarget = {
  readonly name: RefName;
  readonly target: ObjectId;
};

export type RefReaderShape = {
  readonly exists: (ref: string) => Effect.Effect<boolean, GitStoreError>;
  readonly list: (prefix?: string) => Effect.Effect<ReadonlyArray<RefTarget>, GitStoreError>;
  readonly read: (ref: string) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly resolve: (ref: string) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly symbolicTarget: (ref: string) => Effect.Effect<RefName | null, GitStoreError>;
};

export class RefReader extends Context.Service<RefReader, RefReaderShape>()(
  "@cycle/git-store/RefReader",
) {}

export const RefReaderLive = Layer.effect(
  RefReader,
  Effect.gen(function* () {
    const loose = yield* LooseRefStore;
    const packed = yield* PackedRefsStore;

    const readLoop = (
      ref: string,
      seen: ReadonlySet<string>,
    ): Effect.Effect<ObjectId | null, GitStoreError> =>
      Effect.gen(function* () {
        const valid = yield* validateRefName(ref);

        if (seen.has(valid)) {
          return yield* new InvalidRefNameError({
            message: `Symbolic ref cycle detected at ${ref}`,
            ref,
          });
        }

        const looseValue = yield* loose.readRaw(valid);

        if (looseValue !== null) {
          if (looseValue.startsWith("ref: ")) {
            return yield* readLoop(
              looseValue.slice("ref: ".length).trim(),
              new Set([...seen, valid]),
            );
          }

          return yield* validateObjectId(looseValue);
        }

        return yield* packed.read(valid);
      });

    const read = Effect.fn("RefReader.read")(function* (ref: string) {
      return yield* readLoop(ref, new Set());
    });

    const exists = Effect.fn("RefReader.exists")(function* (ref: string) {
      return (yield* read(ref)) !== null;
    });

    const list = Effect.fn("RefReader.list")(function* (prefix = "refs/") {
      const merged = new Map<string, RefTarget>();

      for (const item of yield* packed.list(prefix)) {
        merged.set(item.name, item);
      }

      for (const item of yield* loose.list(prefix)) {
        merged.set(item.name, item);
      }

      return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
    });

    return RefReader.of({
      exists,
      list,
      read,
      resolve: read,
      symbolicTarget: loose.symbolicTarget,
    });
  }),
);
