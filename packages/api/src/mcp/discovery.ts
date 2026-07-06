import {
  discoverCycleApiEffect as discoverCanonicalCycleApiEffect,
  type CycleApiDiscoveryInput,
  type CycleApiDiscoveryResult,
} from "@cycle/config/discovery";
import { NodeServices } from "@effect/platform-node";
import { Crypto, Effect, FileSystem, Path } from "effect";

export type CycleMcpApiDiscoveryInput = CycleApiDiscoveryInput;

export type CycleMcpApiDiscoveryResult = CycleApiDiscoveryResult;

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
> =>
  discoverCanonicalCycleApiEffect(input).pipe(
    Effect.mapError(
      (error): CycleMcpDiscoveryError => ({
        _tag: "CycleMcpDiscoveryError",
        code: error.code,
        message: error.message,
      }),
    ),
  );

export type CycleMcpDiscoveryError = {
  readonly _tag: "CycleMcpDiscoveryError";
  readonly code: "API_UNAVAILABLE";
  readonly message: string;
};
