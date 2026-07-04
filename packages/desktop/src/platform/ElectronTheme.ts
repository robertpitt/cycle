import { Context, Effect, Schema, Scope } from "effect";
import type { ElectronError } from "../errors/ElectronError.ts";

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
