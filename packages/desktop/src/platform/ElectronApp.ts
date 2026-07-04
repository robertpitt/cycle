import { Context, Effect, Scope } from "effect";
import type { ElectronError } from "../errors/ElectronError.ts";

export type ElectronAppLifecycleHandlers = {
  readonly onActivate: () => Effect.Effect<void, unknown>;
};

export type ElectronAppService = {
  readonly appPath: Effect.Effect<string>;
  readonly awaitShutdown: Effect.Effect<void>;
  readonly getPath: (name: "home") => Effect.Effect<string>;
  readonly platform: NodeJS.Platform;
  readonly quit: () => Effect.Effect<void>;
  readonly startLifecycleSupervision: (
    handlers: ElectronAppLifecycleHandlers,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly whenReady: () => Effect.Effect<void, ElectronError>;
};

export class ElectronApp extends Context.Service<ElectronApp, ElectronAppService>()(
  "@cycle/desktop/ElectronApp",
) {}
