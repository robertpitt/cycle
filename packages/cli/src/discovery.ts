import {
  AppConfigLive,
  cycleApiConnectionToken,
  envProvider,
  resolveCycleApiConnection,
  RuntimeDiscoveryLive,
  type CycleApiConnectionInput,
} from "@cycle/config";
import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Crypto, Effect, FileSystem, Layer, Path } from "effect";

export type CliDiscoveryInput = {
  readonly apiUrlFlag?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly tokenFlag?: string;
};

export type CliDiscoveryResult = {
  readonly baseUrl: string;
  readonly token: string;
};

export const discoverApi = async (input: CliDiscoveryInput): Promise<CliDiscoveryResult> =>
  Effect.runPromise(discoverApiEffect(input).pipe(Effect.provide(NodeServices.layer)));

export const discoverApiEffect = (
  input: CliDiscoveryInput,
): Effect.Effect<
  CliDiscoveryResult,
  CliDiscoveryError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  resolveCycleApiConnection({
    apiToken: input.tokenFlag,
    apiUrl: input.apiUrlFlag,
  } satisfies CycleApiConnectionInput).pipe(
    Effect.provide(Layer.merge(AppConfigLive, RuntimeDiscoveryLive)),
    Effect.provideService(ConfigProvider.ConfigProvider, envProvider(input.env)),
    Effect.map(
      (connection): CliDiscoveryResult => ({
        baseUrl: connection.baseUrl,
        token: cycleApiConnectionToken(connection),
      }),
    ),
    Effect.mapError(
      (error): CliDiscoveryError => ({
        _tag: "CliDiscoveryError",
        code: "API_UNAVAILABLE",
        message: error.message,
      }),
    ),
  );

export type CliDiscoveryError = {
  readonly _tag: "CliDiscoveryError";
  readonly code: "API_UNAVAILABLE";
  readonly message: string;
};
