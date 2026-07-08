import { Context, Effect, FileSystem, Layer, Ref, Semaphore } from "effect";
import {
  FilesystemProtocolError,
  RefExpectedValueConflictError,
  causeMessage,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type { ObjectId } from "./GitStoreSchemas.ts";
import { GitFiles } from "./internal/GitFiles.ts";
import { validateObjectId, validateRefName } from "./internal/refs.ts";
import { bytesFromString } from "./internal/bytes.ts";
import { RefReader } from "./RefReader.ts";
import { LooseRefStore } from "./LooseRefStore.ts";

export type RefUpdateOptions = {
  readonly expected?: ObjectId | null;
};

export type RefTransactionShape = {
  readonly delete: (ref: string, options?: RefUpdateOptions) => Effect.Effect<void, GitStoreError>;
  readonly update: (
    ref: string,
    target: string,
    options?: RefUpdateOptions,
  ) => Effect.Effect<void, GitStoreError>;
};

export class RefTransaction extends Context.Service<RefTransaction, RefTransactionShape>()(
  "@cycle/git-store/RefTransaction",
) {}

export const RefTransactionLive = Layer.effect(
  RefTransaction,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* GitFiles;
    const reader = yield* RefReader;
    const loose = yield* LooseRefStore;
    const semaphores = yield* Ref.make(new Map<string, Semaphore.Semaphore>());

    const semaphoreFor = (ref: string) =>
      Ref.modify(semaphores, (map) => {
        const existing = map.get(ref);

        if (existing !== undefined) return [existing, map] as const;

        const next = Semaphore.makeUnsafe(1);
        const copy = new Map(map);
        copy.set(ref, next);

        return [next, copy] as const;
      });

    const assertExpected = (
      ref: string,
      current: ObjectId | null,
      expected: ObjectId | null | undefined,
    ): Effect.Effect<void, GitStoreError> =>
      expected === undefined || current === expected
        ? Effect.void
        : Effect.fail(
            new RefExpectedValueConflictError({
              actual: current,
              expected,
              message: `Ref ${ref} expected ${expected ?? "missing"} but found ${current ?? "missing"}`,
              ref,
            }),
          );

    const updateUnlocked = Effect.fn("RefTransaction.updateUnlocked")(function* (
      ref: string,
      target: string,
      options: RefUpdateOptions = {},
    ) {
      const validRef = yield* validateRefName(ref);
      const validTarget = yield* validateObjectId(target);
      const before = yield* reader.read(validRef);

      yield* assertExpected(validRef, before, options.expected);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const refPath = loose.pathFor(validRef);
          const lock = yield* files.openLock(`${refPath}.lock`, validRef);
          const afterLock = yield* reader.read(validRef);

          yield* assertExpected(validRef, afterLock, options.expected);
          yield* lock.file.writeAll(bytesFromString(`${validTarget}\n`)).pipe(
            Effect.mapError(
              (cause) =>
                new FilesystemProtocolError({
                  cause,
                  message: `write ref lock failed for ${lock.lockPath}: ${causeMessage(cause)}`,
                  operation: "write ref lock",
                  path: lock.lockPath,
                }),
            ),
          );
          yield* lock.file.sync.pipe(
            Effect.mapError(
              (cause) =>
                new FilesystemProtocolError({
                  cause,
                  message: `sync ref lock failed for ${lock.lockPath}: ${causeMessage(cause)}`,
                  operation: "sync ref lock",
                  path: lock.lockPath,
                }),
            ),
          );
          yield* Effect.uninterruptibleMask(() =>
            fs.rename(lock.lockPath, refPath).pipe(
              Effect.mapError(
                (cause) =>
                  new FilesystemProtocolError({
                    cause,
                    message: `rename ref lock failed for ${refPath}: ${causeMessage(cause)}`,
                    operation: "rename ref lock",
                    path: refPath,
                  }),
              ),
              Effect.flatMap(() => lock.disarm),
            ),
          );
        }),
      );
    });

    const deleteUnlocked = Effect.fn("RefTransaction.deleteUnlocked")(function* (
      ref: string,
      options: RefUpdateOptions = {},
    ) {
      const validRef = yield* validateRefName(ref);
      const before = yield* reader.read(validRef);

      yield* assertExpected(validRef, before, options.expected);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const refPath = loose.pathFor(validRef);
          const lock = yield* files.openLock(`${refPath}.lock`, validRef);
          const afterLock = yield* reader.read(validRef);

          yield* assertExpected(validRef, afterLock, options.expected);
          yield* Effect.uninterruptibleMask(() =>
            fs.remove(refPath, { force: true }).pipe(
              Effect.mapError(
                (cause) =>
                  new FilesystemProtocolError({
                    cause,
                    message: `delete loose ref failed for ${refPath}: ${causeMessage(cause)}`,
                    operation: "delete loose ref",
                    path: refPath,
                  }),
              ),
              Effect.flatMap(() => lock.disarm),
            ),
          );
        }),
      );
    });

    const update = Effect.fn("RefTransaction.update")(function* (
      ref: string,
      target: string,
      options: RefUpdateOptions = {},
    ) {
      const semaphore = yield* semaphoreFor(ref);

      return yield* semaphore.withPermit(updateUnlocked(ref, target, options));
    });

    const delete_ = Effect.fn("RefTransaction.delete")(function* (
      ref: string,
      options: RefUpdateOptions = {},
    ) {
      const semaphore = yield* semaphoreFor(ref);

      return yield* semaphore.withPermit(deleteUnlocked(ref, options));
    });

    return RefTransaction.of({
      delete: delete_,
      update,
    });
  }),
);
