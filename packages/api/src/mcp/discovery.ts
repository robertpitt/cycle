import {
  AppConfigLive,
  cycleApiConnectionToken,
  envProvider,
  resolveCycleApiConnection,
  RuntimeDiscoveryLive,
  type ConfigSourceEnv,
  type CycleApiConnectionInput,
} from "@cycle/config";
import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Crypto, Effect, FileSystem, Layer, Path } from "effect";

export type CycleMcpApiDiscoveryInput = CycleApiConnectionInput & {
  readonly env?: ConfigSourceEnv;
};

export type CycleMcpApiDiscoveryResult = {
  readonly baseUrl: string;
  readonly token: string;
};

export const discoverCycleApi = (
  input: CycleMcpApiDiscoveryInput,
): Promise<CycleMcpApiDiscoveryResult> =>
  Effect.runPromise(discoverCycleApiEffect(input).pipe(Effect.provide(NodeServices.layer)));

export const discoverCycleApiEffect = (
  input: CycleMcpApiDiscoveryInput,
): Effect.Effect<
  CycleMcpApiDiscoveryResult,
  CycleMcpDiscoveryError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => {
  const effect = resolveCycleApiConnection({
    apiToken: input.apiToken,
    apiUrl: input.apiUrl,
  }).pipe(
    Effect.provide(Layer.merge(AppConfigLive, RuntimeDiscoveryLive)),
    Effect.map(
      (connection): CycleMcpApiDiscoveryResult => ({
        baseUrl: connection.baseUrl,
        token: cycleApiConnectionToken(connection),
      }),
    ),
    Effect.mapError(
      (error): CycleMcpDiscoveryError => ({
        _tag: "CycleMcpDiscoveryError",
        code: "API_UNAVAILABLE",
        message: error.message,
      }),
    ),
  );

  return input.env === undefined
    ? effect
    : effect.pipe(Effect.provideService(ConfigProvider.ConfigProvider, envProvider(input.env)));
};

export type CycleMcpDiscoveryError = {
  readonly _tag: "CycleMcpDiscoveryError";
  readonly code: "API_UNAVAILABLE";
  readonly message: string;
};
