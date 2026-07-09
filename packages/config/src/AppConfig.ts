import { Context, Crypto, Effect, Layer, Option, Semaphore } from "effect";
import { AppConfigFile, AppConfigFileLive } from "./AppConfigFile.ts";
import { AppConfigError } from "./ConfigErrors.ts";
import {
  AppConfigState,
  decodeAppConfigJson,
  encodeAppConfigJson,
  parseAppConfig,
} from "./AppConfigSchemas.ts";

export type AppConfigService = {
  readonly configPath: Effect.Effect<string, AppConfigError>;
  readonly read: Effect.Effect<AppConfigState, AppConfigError>;
  readonly update: (
    mutator: (current: AppConfigState) => AppConfigState,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly updateEffect: <E, R>(
    mutator: (current: AppConfigState) => Effect.Effect<AppConfigState, E, R>,
  ) => Effect.Effect<AppConfigState, AppConfigError | E, R>;
};

export class AppConfig extends Context.Service<AppConfig, AppConfigService>()(
  "@cycle/config/AppConfig",
) {
  static get layer() {
    return AppConfigLayer;
  }

  static get layerLive() {
    return AppConfigLive;
  }
}

const toAppConfigError = (operation: string, message: string) => (cause: unknown) =>
  new AppConfigError({ cause, message, operation });

export const AppConfigLayer = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const file = yield* AppConfigFile;
    const crypto = yield* Crypto.Crypto;
    const semaphore = yield* Semaphore.make(1);
    const provideCrypto = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>): Effect.Effect<A, E> =>
      effect.pipe(Effect.provideService(Crypto.Crypto, crypto));

    const readUnlocked = Effect.gen(function* () {
      const persisted = yield* file.read.pipe(
        Effect.mapError(toAppConfigError("AppConfig.readFile", "Unable to read app config.")),
      );
      const config = yield* provideCrypto(
        Option.match(persisted, {
          onNone: () => parseAppConfig({}),
          onSome: decodeAppConfigJson,
        }),
      );
      const canonical = yield* encodeAppConfigJson(config);

      if (Option.isNone(persisted) || persisted.value !== canonical) {
        yield* file
          .write(canonical)
          .pipe(
            Effect.mapError(
              toAppConfigError("AppConfig.writeCanonical", "Unable to write app config."),
            ),
          );
      }

      return config;
    });

    const replaceUnlocked = Effect.fn("AppConfig.replaceUnlocked")(function* (
      next: AppConfigState,
    ) {
      const canonical = yield* encodeAppConfigJson(next);
      yield* file
        .write(canonical)
        .pipe(Effect.mapError(toAppConfigError("AppConfig.write", "Unable to write app config.")));
      return next;
    });

    const read = semaphore.withPermit(readUnlocked);

    const updateEffect = Effect.fn("AppConfig.updateEffect")(function* <E, R>(
      mutator: (current: AppConfigState) => Effect.Effect<AppConfigState, E, R>,
    ) {
      return yield* semaphore.withPermit(
        Effect.gen(function* () {
          const current = yield* readUnlocked;
          const next = yield* mutator(current);
          return yield* replaceUnlocked(next);
        }),
      );
    });

    const update = Effect.fn("AppConfig.update")(function* (
      mutator: (current: AppConfigState) => AppConfigState,
    ) {
      return yield* updateEffect((current) =>
        Effect.try({
          catch: toAppConfigError("AppConfig.update", "Unable to update app config."),
          try: () => mutator(current),
        }),
      );
    });

    return AppConfig.of({
      configPath: file.path.pipe(
        Effect.mapError(toAppConfigError("AppConfig.path", "Unable to resolve app config path.")),
      ),
      read,
      update,
      updateEffect,
    });
  }),
);

export const AppConfigLive = AppConfigLayer.pipe(Layer.provide(AppConfigFileLive));
