import { Effect } from "effect";
import { ElectronApp } from "../platform/ElectronApp.ts";
import { DesktopBootstrap } from "../shared/Bootstrap.ts";
import { registerDesktopIpc, startDesktopThemeLifecycle } from "./DesktopIpc.ts";
import { DesktopWindow } from "./DesktopWindow.ts";
import { ElectronPreferences } from "./ElectronPreferences.ts";

export type DesktopStartupWorkflow<
  RReady = never,
  RSyncTheme = never,
  RRegisterIpc = never,
  RThemeLifecycle = never,
  RAppLifecycle = never,
  RCreateWindow = never,
  RBootstrap = never,
  RShutdown = never,
  RDestroy = never,
> = {
  readonly awaitShutdown: Effect.Effect<void, unknown, RShutdown>;
  readonly createMainWindow: Effect.Effect<void, unknown, RCreateWindow>;
  readonly destroyAllWindows: Effect.Effect<void, unknown, RDestroy>;
  readonly registerIpcHandlers: Effect.Effect<void, unknown, RRegisterIpc>;
  readonly startAppLifecycleSupervision: Effect.Effect<void, unknown, RAppLifecycle>;
  readonly startBootstrapSupervision: Effect.Effect<void, unknown, RBootstrap>;
  readonly startThemeLifecycleSupervision: Effect.Effect<void, unknown, RThemeLifecycle>;
  readonly syncThemePreference: Effect.Effect<unknown, unknown, RSyncTheme>;
  readonly waitForElectronReady: Effect.Effect<void, unknown, RReady>;
};

export const runDesktopStartupWorkflow = <
  RReady,
  RSyncTheme,
  RRegisterIpc,
  RThemeLifecycle,
  RAppLifecycle,
  RCreateWindow,
  RBootstrap,
  RShutdown,
  RDestroy,
>(
  workflow: DesktopStartupWorkflow<
    RReady,
    RSyncTheme,
    RRegisterIpc,
    RThemeLifecycle,
    RAppLifecycle,
    RCreateWindow,
    RBootstrap,
    RShutdown,
    RDestroy
  >,
): Effect.Effect<
  void,
  unknown,
  | RReady
  | RSyncTheme
  | RRegisterIpc
  | RThemeLifecycle
  | RAppLifecycle
  | RCreateWindow
  | RBootstrap
  | RShutdown
  | RDestroy
> =>
  Effect.gen(function* () {
    yield* workflow.waitForElectronReady;
    yield* workflow.syncThemePreference;
    yield* workflow.registerIpcHandlers;
    yield* workflow.startThemeLifecycleSupervision;
    yield* workflow.startAppLifecycleSupervision;
    yield* workflow.createMainWindow;
    yield* workflow.startBootstrapSupervision;
    yield* workflow.awaitShutdown;
  }).pipe(Effect.ensuring(workflow.destroyAllWindows.pipe(Effect.catchCause(() => Effect.void))));

export const runDesktop = Effect.fnUntraced(function* () {
  const app = yield* ElectronApp;
  const bootstrap = yield* DesktopBootstrap;
  const desktopWindow = yield* DesktopWindow;
  const preferences = yield* ElectronPreferences;

  yield* runDesktopStartupWorkflow({
    awaitShutdown: app.awaitShutdown,
    createMainWindow: desktopWindow.createMainWindow(),
    destroyAllWindows: desktopWindow.destroyAll(),
    registerIpcHandlers: registerDesktopIpc(),
    startAppLifecycleSupervision: app.startLifecycleSupervision({
      onActivate: () =>
        Effect.gen(function* () {
          const hasOpenWindows = yield* desktopWindow.hasOpenWindows();
          if (hasOpenWindows) {
            yield* desktopWindow.focusMainWindow();
            return;
          }
          yield* desktopWindow.createMainWindow();
        }),
    }),
    startBootstrapSupervision: bootstrap.start(),
    startThemeLifecycleSupervision: startDesktopThemeLifecycle(),
    syncThemePreference: preferences.syncThemePreference(),
    waitForElectronReady: app.whenReady(),
  });
});
