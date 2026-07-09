import { ConfigProvider, Context, Effect, FileSystem, Layer, Option, Path } from "effect";
import { AppConfigFileError } from "./ConfigErrors.ts";
import { writeTextAtomic } from "./internal/atomicFile.ts";
import { appConfigPath } from "./internal/paths.ts";

export type AppConfigFileService = {
  readonly path: Effect.Effect<string, AppConfigFileError>;
  readonly read: Effect.Effect<Option.Option<string>, AppConfigFileError>;
  readonly write: (text: string) => Effect.Effect<void, AppConfigFileError>;
};

export class AppConfigFile extends Context.Service<AppConfigFile, AppConfigFileService>()(
  "@cycle/config/AppConfigFile",
) {
  static get layer() {
    return AppConfigFileLive;
  }
}

const toFileError =
  (operation: string, message: string): ((cause: unknown) => AppConfigFileError) =>
  (cause) =>
    new AppConfigFileError({
      cause,
      message,
      operation,
    });

export const AppConfigFileLive = Layer.effect(
  AppConfigFile,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const configProvider = yield* ConfigProvider.ConfigProvider;
    const resolvedPath = appConfigPath.pipe(
      Effect.provideService(Path.Path, path),
      Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
      Effect.mapError(toFileError("AppConfigFile.path", "Unable to resolve app config path.")),
    );
    const provideFileServices = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, E> =>
      effect.pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );

    const read = resolvedPath.pipe(
      Effect.flatMap((targetPath) =>
        fs.readFileString(targetPath, "utf8").pipe(
          Effect.map(Option.some),
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
          Effect.mapError(toFileError("AppConfigFile.read", "Unable to read app config file.")),
        ),
      ),
    );

    const write = Effect.fn("AppConfigFile.write")(function* (text: string) {
      const targetPath = yield* resolvedPath;
      yield* provideFileServices(
        writeTextAtomic(targetPath, text, { directoryMode: 0o700, fileMode: 0o600 }),
      ).pipe(
        Effect.mapError(toFileError("AppConfigFile.write", "Unable to write app config file.")),
      );
    });

    return AppConfigFile.of({
      path: resolvedPath,
      read,
      write,
    });
  }),
);
