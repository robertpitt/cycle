import { BrowserWindow, type BrowserWindowConstructorOptions, type WebPreferences } from "electron";
import { Context, Effect, Layer, Scope } from "effect";
import { ElectronError } from "./errors/ElectronError.ts";

export type SecureWebPreferences = Omit<
  WebPreferences,
  "allowRunningInsecureContent" | "contextIsolation" | "nodeIntegration" | "sandbox" | "webSecurity"
> & {
  readonly preload: string;
};

export const secureWebPreferences = (preferences: SecureWebPreferences): WebPreferences => ({
  ...preferences,
  allowRunningInsecureContent: false,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
});

export type ElectronWindowService = {
  readonly all: Effect.Effect<ReadonlyArray<BrowserWindow>>;
  readonly destroyAll: Effect.Effect<void>;
  readonly make: (
    options: BrowserWindowConstructorOptions,
  ) => Effect.Effect<BrowserWindow, ElectronError, Scope.Scope>;
};

export class ElectronWindow extends Context.Service<ElectronWindow, ElectronWindowService>()(
  "@cycle/desktop/ElectronWindow",
) {}

export const ElectronWindowLive = Layer.succeed(ElectronWindow)({
  all: Effect.sync(() => BrowserWindow.getAllWindows()),
  destroyAll: Effect.sync(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.destroy();
    }
  }),
  make: (options) =>
    Effect.acquireRelease(
      Effect.try({
        try: () => new BrowserWindow(options),
        catch: (cause) =>
          new ElectronError({
            category: "electron",
            cause,
            message: cause instanceof Error ? cause.message : "BrowserWindow.constructor failed.",
            operation: "BrowserWindow.constructor",
          }),
      }),
      (window) =>
        Effect.sync(() => {
          if (!window.isDestroyed()) window.destroy();
        }),
    ),
});
