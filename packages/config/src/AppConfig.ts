import { Config, Context, Crypto, Effect, Encoding, FileSystem, Layer, Path } from "effect";
import { AppConfigError } from "./AppConfigError.ts";
import {
  DEFAULT_API_PORT,
  defaultAppConfig,
  type AppConfigState,
  type InterfaceDensity,
  type ThemePreference,
} from "@cycle/contracts/schemas/app";
import { parseAppConfig } from "./AppConfigSchema.ts";
import { salvageAppConfig } from "./internals/appConfigRecovery.ts";

export { AppConfigError } from "./AppConfigError.ts";
export { parseAppConfig } from "./AppConfigSchema.ts";

const cycleAppConfigFileName = "app-config.json";

export type AppConfigService = {
  readonly configPath: Effect.Effect<string, AppConfigError>;
  readonly getThemePreference: () => Effect.Effect<ThemePreference, AppConfigError>;
  readonly read: () => Effect.Effect<AppConfigState, AppConfigError>;
  readonly replace: (next: AppConfigState) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setThemePreference: (
    preference: ThemePreference,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setInterfaceDensity: (
    density: InterfaceDensity,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly update: (
    mutator: (current: AppConfigState) => AppConfigState,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
};

export class AppConfig extends Context.Service<AppConfig, AppConfigService>()(
  "@cycle/config/AppConfig",
) {}

const generateStaticToken = (): Effect.Effect<string, AppConfigError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto.randomBytes(32).pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to generate API token.",
            operation: "AppConfig.generateToken",
          }),
      ),
    );
    return Encoding.encodeBase64Url(bytes);
  });

const ensureApiDefaults = (
  config: AppConfigState,
): Effect.Effect<
  { readonly shouldWrite: boolean; readonly value: AppConfigState },
  AppConfigError,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    let shouldWrite = false;
    let value = config;

    if (value.api.staticToken.trim().length === 0) {
      shouldWrite = true;
      const staticToken = yield* generateStaticToken();
      value = {
        ...value,
        api: {
          ...value.api,
          staticToken,
        },
      };
    }

    if (value.api.port === "auto") {
      shouldWrite = true;
      value = {
        ...value,
        api: {
          ...value.api,
          port: DEFAULT_API_PORT,
        },
      };
    }

    return { shouldWrite, value };
  });

const backupConfigFile = (
  configPath: string,
  kind: "invalid",
): Effect.Effect<void, AppConfigError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const backupName = `app-config.${kind}-${stamp}.json`;

    yield* fs.rename(configPath, path.join(path.dirname(configPath), backupName)).pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to back up app config.",
            operation: "AppConfig.backup",
          }),
      ),
    );
  });

const writeValidatedConfig = (
  configPath: string,
  next: AppConfigState,
): Effect.Effect<AppConfigState, AppConfigError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const validated = yield* parseAppConfig(next);
    const directory = path.dirname(configPath);
    const temporaryPath = path.join(
      directory,
      `${cycleAppConfigFileName}.${globalThis.process?.pid ?? "runtime"}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`,
    );
    const serialized = `${JSON.stringify(validated, null, 2)}\n`;

    yield* fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(temporaryPath, serialized)),
      Effect.andThen(fs.rename(temporaryPath, configPath)),
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to write app config.",
            operation: "AppConfig.writeFile",
          }),
      ),
    );

    return validated;
  });

const readOrRecoverConfig = (
  configPath: string,
): Effect.Effect<
  AppConfigState,
  AppConfigError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) {
      const defaults = yield* ensureApiDefaults(defaultAppConfig());
      return yield* writeValidatedConfig(configPath, defaults.value);
    }

    const text = yield* fs.readFileString(configPath, "utf8").pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to read app config.",
            operation: "AppConfig.readFile",
          }),
      ),
    );
    const raw = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: (cause) =>
        new AppConfigError({
          cause,
          message: "App config is not valid JSON.",
          operation: "AppConfig.parseJson",
        }),
    }).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          yield* backupConfigFile(configPath, "invalid");
          const defaults = yield* ensureApiDefaults(defaultAppConfig());
          return yield* writeValidatedConfig(configPath, defaults.value);
        }),
      ),
    );

    const parsed = yield* parseAppConfig(raw).pipe(
      Effect.catch(() =>
        salvageAppConfig(raw).pipe(
          Effect.flatMap((salvaged) => writeValidatedConfig(configPath, salvaged)),
        ),
      ),
    );

    const withApiDefaults = yield* ensureApiDefaults(parsed);
    if (withApiDefaults.shouldWrite) {
      return yield* writeValidatedConfig(configPath, withApiDefaults.value);
    }
    return withApiDefaults.value;
  });

const appConfigPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const homeDirectory = yield* Config.string("HOME").pipe(
    Config.withDefault("."),
    Config.map((value) => value.trim() || "."),
  );

  return path.join(homeDirectory, ".cycle", cycleAppConfigFileName);
}).pipe(
  Effect.mapError(
    (cause) =>
      new AppConfigError({
        cause,
        message: "Unable to resolve app config path.",
        operation: "AppConfig.path",
      }),
  ),
);

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedConfigPath = yield* appConfigPath;
    const providePlatform = <A, E>(
      effect: Effect.Effect<A, E, Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, E> =>
      effect.pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );

    const read = (): Effect.Effect<AppConfigState, AppConfigError> =>
      providePlatform(readOrRecoverConfig(resolvedConfigPath));

    const replace = (next: AppConfigState): Effect.Effect<AppConfigState, AppConfigError> =>
      providePlatform(writeValidatedConfig(resolvedConfigPath, next));

    const update = (
      mutator: (current: AppConfigState) => AppConfigState,
    ): Effect.Effect<AppConfigState, AppConfigError> =>
      Effect.gen(function* () {
        const current = yield* read();
        const next = yield* Effect.try({
          try: () => mutator(current),
          catch: (cause) =>
            new AppConfigError({
              cause,
              message: "Unable to update app config.",
              operation: "AppConfig.update",
            }),
        });
        return yield* replace(next);
      });

    return {
      configPath: Effect.succeed(resolvedConfigPath),
      getThemePreference: () => read().pipe(Effect.map((config) => config.theme.preference)),
      read,
      replace,
      setThemePreference: (preference) =>
        update((current) => ({
          ...current,
          theme: {
            ...current.theme,
            preference,
          },
        })),
      setInterfaceDensity: (density) =>
        update((current) => ({
          ...current,
          theme: {
            ...current.theme,
            density,
          },
        })),
      update,
    };
  }),
);
