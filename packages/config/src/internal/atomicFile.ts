import { Effect, FileSystem, Path } from "effect";

export const writeTextAtomic = Effect.fn("writeTextAtomic")(function* (
  targetPath: string,
  text: string,
  options: {
    readonly directoryMode?: number;
    readonly fileMode?: number;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = path.dirname(targetPath);

  yield* fs.makeDirectory(directory, {
    recursive: true,
    ...(options.directoryMode === undefined ? {} : { mode: options.directoryMode }),
  });

  yield* Effect.scoped(
    Effect.gen(function* () {
      const temporaryPath = yield* fs.makeTempFileScoped({
        directory,
        prefix: `${path.basename(targetPath)}.`,
        suffix: ".tmp",
      });

      if (options.fileMode !== undefined) {
        yield* fs.chmod(temporaryPath, options.fileMode);
      }

      yield* fs.writeFileString(temporaryPath, text);
      yield* fs.rename(temporaryPath, targetPath);
    }),
  );
});
