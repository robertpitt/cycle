import { discoverCycleApiEffect, type CycleApiDiscoveryResult } from "@cycle/config/discovery";
import { NodeServices } from "@effect/platform-node";
import { Crypto, Effect, FileSystem, Path } from "effect";

export type CliDiscoveryInput = {
  readonly apiUrlFlag?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly tokenFlag?: string;
};

export type CliDiscoveryResult = CycleApiDiscoveryResult;

export const discoverApi = async (input: CliDiscoveryInput): Promise<CliDiscoveryResult> =>
  Effect.runPromise(discoverApiEffect(input).pipe(Effect.provide(NodeServices.layer)));

export const discoverApiEffect = (
  input: CliDiscoveryInput,
): Effect.Effect<
  CliDiscoveryResult,
  CliDiscoveryError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  discoverCycleApiEffect({
    apiToken: input.tokenFlag,
    apiUrl: input.apiUrlFlag,
    env: input.env,
  }).pipe(
    Effect.mapError(
      (error): CliDiscoveryError => ({
        _tag: "CliDiscoveryError",
        code: error.code,
        message: error.message,
      }),
    ),
  );

export type CliDiscoveryError = {
  readonly _tag: "CliDiscoveryError";
  readonly code: "API_UNAVAILABLE";
  readonly message: string;
};
