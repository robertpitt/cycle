import { nativeTheme } from "electron";
import { Cause, Effect, Layer } from "effect";
import { DesktopRuntime } from "./DesktopRuntime.ts";
import { electronError } from "./ElectronError.ts";
import {
  ElectronTheme,
  type ElectronThemeLifecycleHandlers,
  type ElectronThemeSource,
  type ElectronThemeState,
} from "./ElectronTheme.ts";

const readThemeState = (): ElectronThemeState => {
  const shouldUseDarkColors = nativeTheme.shouldUseDarkColors;

  return {
    resolvedMode: shouldUseDarkColors ? "dark" : "light",
    shouldUseDarkColors,
    source: nativeTheme.themeSource,
  };
};

const logSupervisionFailure = (event: string, cause: Cause.Cause<unknown>): Effect.Effect<void> =>
  Effect.logError("electron theme lifecycle handler failed").pipe(
    Effect.annotateLogs({
      cause: Cause.pretty(cause),
      event,
      service: "desktop",
      source: "electron-theme",
    }),
  );

export const ElectronThemeLive = Layer.effect(
  ElectronTheme,
  Effect.gen(function* () {
    const runtime = yield* DesktopRuntime;

    const runHandler = (name: string, handler: Effect.Effect<void, unknown>): void => {
      runtime.run(
        `electron-theme.${name}`,
        handler.pipe(Effect.catchCause((cause) => logSupervisionFailure(name, cause))),
      );
    };

    return {
      current: Effect.sync(readThemeState),
      setSource: (source: ElectronThemeSource) =>
        Effect.try({
          try: () => {
            nativeTheme.themeSource = source;
            return readThemeState();
          },
          catch: (cause) => electronError("nativeTheme.themeSource", cause),
        }),
      startLifecycleSupervision: (handlers: ElectronThemeLifecycleHandlers) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const onUpdated = (): void => {
              runHandler("updated", handlers.onUpdated(readThemeState()));
            };

            nativeTheme.on("updated", onUpdated);
            return onUpdated;
          }),
          (onUpdated) =>
            Effect.sync(() => {
              nativeTheme.off("updated", onUpdated);
            }),
        ).pipe(Effect.asVoid),
    };
  }),
);
