import { Context, Effect, Schema, Scope, Cause, Layer } from "effect";
import { nativeTheme } from "electron";
import { ElectronRuntime } from "./ElectronRuntime.ts";
import { ElectronError } from "./errors/ElectronError.ts";

export const electronThemeSources = ["system", "light", "dark"] as const;
export const ElectronThemeSource = Schema.Literals(electronThemeSources);
export type ElectronThemeSource = typeof ElectronThemeSource.Type;
export const ElectronThemeResolvedMode = Schema.Literals(["light", "dark"]);
export type ElectronThemeResolvedMode = typeof ElectronThemeResolvedMode.Type;

export const ElectronThemeState = Schema.Struct({
  resolvedMode: ElectronThemeResolvedMode,
  shouldUseDarkColors: Schema.Boolean,
  source: ElectronThemeSource,
});
export type ElectronThemeState = typeof ElectronThemeState.Type;

export type ElectronThemeLifecycleHandlers = {
  readonly onUpdated: (state: ElectronThemeState) => Effect.Effect<void, unknown>;
};

export type ElectronThemeService = {
  readonly current: Effect.Effect<ElectronThemeState>;
  readonly setSource: (
    source: ElectronThemeSource,
  ) => Effect.Effect<ElectronThemeState, ElectronError>;
  readonly startLifecycleSupervision: (
    handlers: ElectronThemeLifecycleHandlers,
  ) => Effect.Effect<void, never, Scope.Scope>;
};

export class ElectronTheme extends Context.Service<ElectronTheme, ElectronThemeService>()(
  "@cycle/desktop/ElectronTheme",
) {}

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
    const runtime = yield* ElectronRuntime;

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
          catch: (cause) =>
            new ElectronError({
              category: "electron",
              cause,
              message: cause instanceof Error ? cause.message : "nativeTheme.themeSource failed.",
              operation: "nativeTheme.themeSource",
            }),
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
