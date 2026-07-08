import { AppConfigState } from "@cycle/contracts/schemas/app";
import { Config, ConfigProvider, Effect } from "effect";
import { AppConfigError } from "./AppConfigError.ts";

export const parseAppConfig = (value: unknown): Effect.Effect<AppConfigState, AppConfigError> =>
  Config.schema(AppConfigState)
    .parse(ConfigProvider.fromUnknown(value))
    .pipe(Effect.map(normalizeAppConfigState))
    .pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "App config did not match the expected schema.",
            operation: "AppConfig.parse",
          }),
      ),
    );

const normalizeAppConfigState = (config: AppConfigState): AppConfigState => ({
  ...config,
  agentProviders: {
    preferences: config.agentProviders.preferences.map((preference) => ({
      ...preference,
      maxConcurrentRuns: preference.maxConcurrentRuns ?? null,
    })),
  },
});
