import type { BrowserWindow, BrowserWindowConstructorOptions, WebPreferences } from "electron";
import { Context, Effect, Scope } from "effect";
import type { ElectronError } from "../errors/ElectronError.ts";

export type ElectronBrowserWindow = BrowserWindow;

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

export type BrowserWindowsService = {
  readonly all: Effect.Effect<ReadonlyArray<ElectronBrowserWindow>>;
  readonly destroyAll: Effect.Effect<void>;
  readonly make: (
    options: BrowserWindowConstructorOptions,
  ) => Effect.Effect<ElectronBrowserWindow, ElectronError, Scope.Scope>;
};

export class BrowserWindows extends Context.Service<BrowserWindows, BrowserWindowsService>()(
  "@cycle/desktop/BrowserWindows",
) {}
