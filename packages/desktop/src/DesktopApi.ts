import { BackendRuntime, BackendServicesLive } from "@cycle/backend";
import { defaultRuntimeDiscoveryPath } from "@cycle/config";
import { defaultLayer as CycleLoggingLive } from "@cycle/logging";
import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer } from "effect";

export const desktopApiRuntimeDiscoveryPath = defaultRuntimeDiscoveryPath;

export type DesktopApiService = {
  readonly start: () => Effect.Effect<void, unknown>;
};

export class DesktopApi extends Context.Service<DesktopApi, DesktopApiService>()(
  "@cycle/desktop/DesktopApi",
) {}

const DesktopApiBackendLive = BackendServicesLive().pipe(
  Layer.provide([NodeServices.layer, CycleLoggingLive({ packageName: "desktop" })]),
);

export const DesktopApiLive = Layer.effect(
  DesktopApi,
  Effect.gen(function* () {
    const backend = yield* BackendRuntime;

    return DesktopApi.of({
      start: () => {
        const runtimeFile = process.env.CYCLE_API_RUNTIME_FILE;
        return backend.start(runtimeFile === undefined ? {} : { runtimeFile }).pipe(Effect.asVoid);
      },
    });
  }),
).pipe(Layer.provide(DesktopApiBackendLive));
