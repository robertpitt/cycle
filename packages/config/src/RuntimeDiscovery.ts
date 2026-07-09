import { ConfigProvider, Context, Effect, FileSystem, Layer, Option, Path } from "effect";
import { RuntimeDiscoveryError } from "./ConfigErrors.ts";
import {
  decodeRuntimeDiscoveryJson,
  encodeRuntimeDiscoveryJson,
  type RuntimeDiscoveryFile,
} from "./RuntimeDiscoverySchemas.ts";
import { writeTextAtomic } from "./internal/atomicFile.ts";
import { runtimeDiscoveryPath as resolveRuntimeDiscoveryPath } from "./internal/paths.ts";

export const defaultRuntimeDiscoveryPath = resolveRuntimeDiscoveryPath;

export type RuntimeDiscoveryService = {
  readonly path: Effect.Effect<string, RuntimeDiscoveryError>;
  readonly read: Effect.Effect<Option.Option<RuntimeDiscoveryFile>, RuntimeDiscoveryError>;
  readonly remove: Effect.Effect<void, RuntimeDiscoveryError>;
  readonly write: (file: RuntimeDiscoveryFile) => Effect.Effect<void, RuntimeDiscoveryError>;
};

export class RuntimeDiscovery extends Context.Service<RuntimeDiscovery, RuntimeDiscoveryService>()(
  "@cycle/config/RuntimeDiscovery",
) {
  static get layer() {
    return RuntimeDiscoveryLive;
  }
}

const toDiscoveryError = (operation: string, message: string) => (cause: unknown) =>
  new RuntimeDiscoveryError({ cause, message, operation });

export const RuntimeDiscoveryLive = Layer.effect(
  RuntimeDiscovery,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const configProvider = yield* ConfigProvider.ConfigProvider;
    const resolvedPath = defaultRuntimeDiscoveryPath.pipe(
      Effect.provideService(Path.Path, path),
      Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
      Effect.mapError(
        toDiscoveryError("RuntimeDiscovery.path", "Unable to resolve runtime discovery path."),
      ),
    );
    const provideFileServices = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, E> =>
      effect.pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );

    const read = Effect.gen(function* () {
      const targetPath = yield* resolvedPath;
      const text = yield* fs.readFileString(targetPath, "utf8").pipe(
        Effect.map(Option.some),
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
        Effect.mapError(
          toDiscoveryError("RuntimeDiscovery.read", "Unable to read runtime discovery file."),
        ),
      );
      return yield* Option.match(text, {
        onNone: () => Effect.succeedNone,
        onSome: (value) => decodeRuntimeDiscoveryJson(value).pipe(Effect.map(Option.some)),
      });
    });

    const write = Effect.fn("RuntimeDiscovery.write")(function* (file: RuntimeDiscoveryFile) {
      const targetPath = yield* resolvedPath;
      const text = yield* encodeRuntimeDiscoveryJson(file);
      yield* provideFileServices(
        writeTextAtomic(targetPath, text, { directoryMode: 0o700, fileMode: 0o600 }),
      ).pipe(
        Effect.mapError(
          toDiscoveryError("RuntimeDiscovery.write", "Unable to write runtime discovery file."),
        ),
      );
    });

    const remove = resolvedPath.pipe(
      Effect.flatMap((targetPath) => fs.remove(targetPath, { force: true })),
      Effect.mapError(
        toDiscoveryError("RuntimeDiscovery.remove", "Unable to remove runtime discovery file."),
      ),
    );

    return RuntimeDiscovery.of({ path: resolvedPath, read, remove, write });
  }),
);
