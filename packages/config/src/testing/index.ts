import { Crypto, Effect, Layer, Option, Ref } from "effect";
import { AppConfig, AppConfigLayer } from "../AppConfig.ts";
import { AppConfigFile } from "../AppConfigFile.ts";
import {
  defaultAppConfigState,
  encodeAppConfigJson,
  type AppConfigState,
} from "../AppConfigSchemas.ts";

const CryptoTest = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    digest: (_algorithm, data) => Effect.succeed(data),
    randomBytes: (size) => new Uint8Array(size),
  }),
);

const AppConfigFileTest = (
  initial: AppConfigState = defaultAppConfigState(),
): Layer.Layer<AppConfigFile> =>
  Layer.effect(
    AppConfigFile,
    Effect.gen(function* () {
      const initialContents = yield* encodeAppConfigJson(initial).pipe(Effect.orDie);
      const contents = yield* Ref.make(initialContents);
      return AppConfigFile.of({
        path: Effect.succeed("test-app-config.json"),
        read: Ref.get(contents).pipe(Effect.map(Option.some)),
        write: (text) => Ref.set(contents, text),
      });
    }),
  );

export const AppConfigTest = (
  initial: AppConfigState = defaultAppConfigState(),
): Layer.Layer<AppConfig> =>
  AppConfigLayer.pipe(Layer.provide(AppConfigFileTest(initial)), Layer.provide(CryptoTest));
