import { Config, ConfigProvider, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig, AppConfigLive } from "./AppConfig.ts";
import { DEFAULT_API_HOST, DEFAULT_API_PORT } from "./AppConfigSchemas.ts";
import { CycleApiConnectionError } from "./ConfigErrors.ts";
import {
  type CycleApiConnectionInput,
  type CycleApiConnectionResult,
  type CycleApiConnectionSource,
} from "./CycleApiConnectionSchemas.ts";
import { optionalConfigRedacted, optionalConfigString } from "./ConfigSources.ts";
import { RuntimeDiscovery, RuntimeDiscoveryLive } from "./RuntimeDiscovery.ts";
import { makeRedactedToken, redactedTokenValue } from "./internal/token.ts";
import { trimNonEmpty } from "./internal/strings.ts";

export type CycleApiConnectionService = {
  readonly current: Effect.Effect<CycleApiConnectionResult, CycleApiConnectionError>;
  readonly resolve: (
    input?: CycleApiConnectionInput,
  ) => Effect.Effect<CycleApiConnectionResult, CycleApiConnectionError>;
};

export class CycleApiConnection extends Context.Service<
  CycleApiConnection,
  CycleApiConnectionService
>()("@cycle/config/CycleApiConnection") {
  static get layer() {
    return CycleApiConnectionLayer;
  }

  static get layerLive() {
    return CycleApiConnectionLive;
  }
}

const defaultBaseUrl = `http://${DEFAULT_API_HOST}:${DEFAULT_API_PORT}`;

const RuntimeConnectionConfig = Config.all({
  apiToken: optionalConfigRedacted("CYCLE_API_TOKEN"),
  apiUrl: optionalConfigString("CYCLE_API_URL"),
  defaultApiUrl: optionalConfigString("CYCLE_API_URL_DEFAULT"),
});

const connectionError = (code: CycleApiConnectionError["code"], message: string, cause?: unknown) =>
  new CycleApiConnectionError({
    ...(cause === undefined ? {} : { cause }),
    code,
    message,
  });

const tokenFromInput = (
  token: CycleApiConnectionInput["apiToken"],
):
  | { readonly value: Redacted.Redacted<string>; readonly source: CycleApiConnectionSource }
  | undefined => {
  const value =
    token === undefined
      ? undefined
      : trimNonEmpty(Redacted.isRedacted(token) ? redactedTokenValue(token) : token);
  return value === undefined ? undefined : { source: "explicit", value: makeRedactedToken(value) };
};

const normalizeBaseUrl = Effect.fn("CycleApiConnection.normalizeBaseUrl")(function* (
  value: string,
) {
  const url = yield* Schema.decodeUnknownEffect(Schema.URLFromString)(value).pipe(
    Effect.mapError((cause) =>
      connectionError("INVALID_API_URL", "Cycle API URL must be a valid HTTP or HTTPS URL.", cause),
    ),
  );
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return yield* connectionError("INVALID_API_URL", "Cycle API URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/+$/u, "");
});

export const resolveCycleApiConnection = Effect.fn("resolveCycleApiConnection")(function* (
  input: CycleApiConnectionInput = {},
) {
  const appConfig = yield* AppConfig;
  const runtimeDiscovery = yield* RuntimeDiscovery;
  const runtimeConfig = yield* RuntimeConnectionConfig.pipe(
    Effect.mapError((cause) =>
      connectionError(
        "INVALID_ENVIRONMENT",
        "Cycle API environment configuration is invalid.",
        cause,
      ),
    ),
  );

  const explicitBaseUrl = trimNonEmpty(input.apiUrl);
  const configuredBaseUrl = explicitBaseUrl ?? runtimeConfig.apiUrl;
  const runtimeState =
    configuredBaseUrl === undefined
      ? yield* runtimeDiscovery.read.pipe(
          Effect.mapError((cause) =>
            connectionError(
              "DISCOVERY_INVALID",
              "Unable to read Cycle API runtime discovery.",
              cause,
            ),
          ),
        )
      : Option.none();

  const configuredToken =
    tokenFromInput(input.apiToken) ??
    (runtimeConfig.apiToken === undefined
      ? undefined
      : { source: "env" as const, value: runtimeConfig.apiToken });
  const appConfigState =
    configuredToken === undefined
      ? yield* appConfig.read.pipe(
          Effect.mapError((cause) =>
            connectionError(
              "API_UNAVAILABLE",
              "No Cycle API URL/token was supplied and no local app config token was found.",
              cause,
            ),
          ),
        )
      : undefined;

  if (appConfigState !== undefined && !appConfigState.api.enabled) {
    return yield* connectionError("API_DISABLED", "The local Cycle API is disabled.");
  }

  const resolvedToken =
    configuredToken ??
    (appConfigState === undefined
      ? undefined
      : { source: "appConfig" as const, value: appConfigState.api.staticToken });
  if (resolvedToken === undefined) {
    return yield* connectionError(
      "API_UNAVAILABLE",
      "No Cycle API URL/token was supplied and no local app config token was found.",
    );
  }

  const appConfigBaseUrl =
    appConfigState === undefined || appConfigState.api.port === "auto"
      ? undefined
      : `http://${appConfigState.api.host}:${appConfigState.api.port}`;
  const baseUrlSource: CycleApiConnectionSource =
    explicitBaseUrl !== undefined
      ? "explicit"
      : runtimeConfig.apiUrl !== undefined
        ? "env"
        : Option.isSome(runtimeState)
          ? "runtimeDiscovery"
          : runtimeConfig.defaultApiUrl !== undefined
            ? "env"
            : appConfigBaseUrl !== undefined
              ? "appConfig"
              : "default";
  const candidateBaseUrl =
    configuredBaseUrl ??
    (Option.isSome(runtimeState) ? runtimeState.value.baseUrl : undefined) ??
    runtimeConfig.defaultApiUrl ??
    appConfigBaseUrl ??
    defaultBaseUrl;

  return {
    baseUrl: yield* normalizeBaseUrl(candidateBaseUrl),
    source: { baseUrl: baseUrlSource, token: resolvedToken.source },
    token: resolvedToken.value,
  } satisfies CycleApiConnectionResult;
});

export const CycleApiConnectionLayer = Layer.effect(
  CycleApiConnection,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const runtimeDiscovery = yield* RuntimeDiscovery;
    const configProvider = yield* ConfigProvider.ConfigProvider;
    const resolve = (input: CycleApiConnectionInput = {}) =>
      resolveCycleApiConnection(input).pipe(
        Effect.provideService(AppConfig, appConfig),
        Effect.provideService(RuntimeDiscovery, runtimeDiscovery),
        Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
      );
    return CycleApiConnection.of({ current: resolve(), resolve });
  }),
);

export const CycleApiConnectionLive = CycleApiConnectionLayer.pipe(
  Layer.provide(Layer.merge(AppConfigLive, RuntimeDiscoveryLive)),
);
