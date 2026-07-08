import { Effect, Layer } from "effect";
import { AppConfig } from "../AppConfig.ts";
import { defaultAppConfig, type AppConfigState } from "@cycle/contracts/schemas/app";

export const AppConfigTest = (
  initial: AppConfigState = defaultAppConfig(),
): Layer.Layer<AppConfig> => {
  let state = initial;

  return Layer.succeed(
    AppConfig,
    AppConfig.of({
      configPath: Effect.succeed("test-app-config.json"),
      getThemePreference: Effect.sync(() => state.theme.preference),
      read: Effect.sync(() => state),
      replace: (next) =>
        Effect.sync(() => {
          state = next;
          return state;
        }),
      setInterfaceDensity: (density) =>
        Effect.sync(() => {
          state = {
            ...state,
            theme: {
              ...state.theme,
              density,
            },
          };
          return state;
        }),
      setThemePreference: (preference) =>
        Effect.sync(() => {
          state = {
            ...state,
            theme: {
              ...state.theme,
              preference,
            },
          };
          return state;
        }),
      update: (mutator) =>
        Effect.sync(() => {
          state = mutator(state);
          return state;
        }),
    }),
  );
};
