import { Context, Effect, FileSystem, Layer, Path, Ref, Scope } from "effect";
import {
  causeMessage,
  FilesystemProtocolError,
  RefLockUnavailableError,
  type GitStoreError,
} from "../GitStoreErrors.ts";

export type WriteDurableOptions = {
  readonly mode?: number;
  readonly operation: string;
  readonly targetPath: string;
  readonly tempPath: string;
};

export type LockFile = {
  readonly disarm: Effect.Effect<void>;
  readonly file: FileSystem.File;
  readonly lockPath: string;
};

export type GitFilesShape = {
  readonly durableWriteTemp: (
    bytes: Uint8Array,
    options: WriteDurableOptions,
  ) => Effect.Effect<void, GitStoreError>;
  readonly ensureParentDirectory: (
    filePath: string,
    operation: string,
  ) => Effect.Effect<void, GitStoreError>;
  readonly openLock: (
    lockPath: string,
    ref: string,
  ) => Effect.Effect<LockFile, GitStoreError, Scope.Scope>;
  readonly removeFile: (path: string, operation: string) => Effect.Effect<void, GitStoreError>;
};

export class GitFiles extends Context.Service<GitFiles, GitFilesShape>()(
  "@cycle/git-store/internal/GitFiles",
) {}

export const GitFilesLive = Layer.effect(
  GitFiles,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const ensureParentDirectory = Effect.fn("GitFiles.ensureParentDirectory")(function* (
      filePath: string,
      operation: string,
    ) {
      const directory = path.dirname(filePath);

      yield* fs.makeDirectory(directory, { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `${operation} failed for ${directory}: ${causeMessage(cause)}`,
              operation,
              path: directory,
            }),
        ),
      );
    });

    const removeFile = Effect.fn("GitFiles.removeFile")(function* (
      filePath: string,
      operation: string,
    ) {
      yield* fs.remove(filePath, { force: true }).pipe(
        Effect.mapError(
          (cause) =>
            new FilesystemProtocolError({
              cause,
              message: `${operation} failed for ${filePath}: ${causeMessage(cause)}`,
              operation,
              path: filePath,
            }),
        ),
      );
    });

    const durableWriteTemp = Effect.fn("GitFiles.durableWriteTemp")(function* (
      bytes: Uint8Array,
      options: WriteDurableOptions,
    ) {
      yield* ensureParentDirectory(options.targetPath, options.operation);
      yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs
            .open(options.tempPath, {
              flag: "wx",
              mode: options.mode ?? 0o444,
            })
            .pipe(
              Effect.mapError(
                (cause) =>
                  new FilesystemProtocolError({
                    cause,
                    message: `${options.operation} failed for ${options.tempPath}: ${causeMessage(cause)}`,
                    operation: options.operation,
                    path: options.tempPath,
                  }),
              ),
            );

          yield* file.writeAll(bytes).pipe(
            Effect.mapError(
              (cause) =>
                new FilesystemProtocolError({
                  cause,
                  message: `${options.operation} failed for ${options.tempPath}: ${causeMessage(cause)}`,
                  operation: options.operation,
                  path: options.tempPath,
                }),
            ),
          );
          yield* file.sync.pipe(
            Effect.mapError(
              (cause) =>
                new FilesystemProtocolError({
                  cause,
                  message: `${options.operation} failed for ${options.tempPath}: ${causeMessage(cause)}`,
                  operation: options.operation,
                  path: options.tempPath,
                }),
            ),
          );
          yield* fs.rename(options.tempPath, options.targetPath).pipe(
            Effect.mapError(
              (cause) =>
                new FilesystemProtocolError({
                  cause,
                  message: `${options.operation} failed for ${options.targetPath}: ${causeMessage(cause)}`,
                  operation: options.operation,
                  path: options.targetPath,
                }),
            ),
          );
        }),
      ).pipe(
        Effect.catch((error) =>
          removeFile(options.tempPath, options.operation).pipe(
            Effect.catch(() => Effect.void),
            Effect.flatMap(() => Effect.fail(error)),
          ),
        ),
      );
    });

    const openLock = Effect.fn("GitFiles.openLock")(function* (lockPath: string, ref: string) {
      yield* ensureParentDirectory(lockPath, "open ref lock");
      const armed = yield* Ref.make(true);
      const file = yield* fs.open(lockPath, { flag: "wx", mode: 0o644 }).pipe(
        Effect.mapError(
          (cause) =>
            new RefLockUnavailableError({
              cause,
              lockPath,
              message: `Ref lock is unavailable for ${ref}: ${causeMessage(cause)}`,
              ref,
            }),
        ),
      );

      yield* Effect.addFinalizer(() =>
        Ref.get(armed).pipe(
          Effect.flatMap((isArmed) =>
            isArmed
              ? fs.remove(lockPath, { force: true }).pipe(Effect.catch(() => Effect.void))
              : Effect.void,
          ),
        ),
      );

      return {
        disarm: Ref.set(armed, false),
        file,
        lockPath,
      };
    });

    return GitFiles.of({
      durableWriteTemp,
      ensureParentDirectory,
      openLock,
      removeFile,
    });
  }),
);
