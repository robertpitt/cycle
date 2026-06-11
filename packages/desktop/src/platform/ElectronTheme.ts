import { Context, Effect, Scope } from "effect";
import type { ElectronError } from "./ElectronError.ts";

export const electronThemeSources = ["system", "light", "dark"] as const;
export type ElectronThemeSource = (typeof electronThemeSources)[number];
export type ElectronThemeResolvedMode = "light" | "dark";

export type ElectronThemeState = {
  readonly resolvedMode: ElectronThemeResolvedMode;
  readonly shouldUseDarkColors: boolean;
  readonly source: ElectronThemeSource;
};

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
