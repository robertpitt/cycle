import { Context, Effect, Layer, Scope } from "effect";
import { BrowserWindow } from "electron";
import { ElectronError } from "./errors/ElectronError.ts";
import { ElectronWindow, secureWebPreferences } from "./ElectronWindow.ts";
import { DesktopConfig } from "./shared/DesktopConfig.ts";
import { ElectronRuntime } from "./ElectronRuntime.ts";

export type DesktopWindowService = {
  readonly createMainWindow: Effect.Effect<void, ElectronError>;
  readonly destroyAll: Effect.Effect<void>;
  readonly focusMainWindow: Effect.Effect<void>;
  readonly hasOpenWindows: Effect.Effect<boolean>;
};

export class DesktopWindow extends Context.Service<DesktopWindow, DesktopWindowService>()(
  "@cycle/desktop/DesktopWindow",
) {}

let mainWindow: BrowserWindow | null = null;

export const currentDesktopWindow = (): BrowserWindow | null => mainWindow;

const releaseWindow = (window: BrowserWindow): Effect.Effect<void> =>
  Effect.sync(() => {
    if (!window.isDestroyed()) window.destroy();
    if (mainWindow === window) mainWindow = null;
  });

export const DesktopWindowLive = Layer.effect(
  DesktopWindow,
  Effect.gen(function* () {
    const electronWindow = yield* ElectronWindow;
    const desktopConfig = yield* DesktopConfig;
    const runtime = yield* ElectronRuntime;
    const scope = yield* Effect.scope;

    const createMainWindow: Effect.Effect<void, ElectronError> = Effect.gen(function* () {
      const window = yield* electronWindow
        .make({
          backgroundColor: "#f8fafc",
          height: 900,
          minHeight: 680,
          minWidth: 960,
          show: false,
          title: "Cycle",
          webPreferences: secureWebPreferences({
            devTools: desktopConfig.mode === "development",
            preload: desktopConfig.preloadScript,
          }),
          width: 1320,
        })
        .pipe(Effect.provideService(Scope.Scope, scope));

      mainWindow = window;

      window.once("ready-to-show", () => {
        if (!window.isDestroyed()) window.show();
      });

      window.webContents.on("render-process-gone", (_event, details) => {
        runtime.run(
          "desktop-window.render-process-gone",
          Effect.logError("renderer process exited").pipe(
            Effect.annotateLogs({
              exitCode: details.exitCode,
              reason: details.reason,
              component: "desktop-window",
              service: "desktop",
            }),
          ),
        );
      });

      window.webContents.on("did-fail-load", (_event, code, description, validatedUrl) => {
        runtime.run(
          "desktop-window.did-fail-load",
          Effect.logError("renderer load failed").pipe(
            Effect.annotateLogs({
              code,
              component: "desktop-window",
              description,
              service: "desktop",
              validatedUrl,
            }),
          ),
        );
      });

      window.on("closed", () => {
        if (mainWindow === window) mainWindow = null;
      });

      yield* Effect.tryPromise({
        try: () =>
          desktopConfig.rendererUrl === undefined
            ? window.loadFile(desktopConfig.rendererIndexHtml)
            : window.loadURL(desktopConfig.rendererUrl),
        catch: (cause) =>
          new ElectronError({
            category: "electron",
            cause,
            message: cause instanceof Error ? cause.message : "BrowserWindow.load failed.",
            operation: "BrowserWindow.load",
          }),
      }).pipe(
        Effect.catch((error: ElectronError) =>
          releaseWindow(window).pipe(Effect.andThen(Effect.fail(error))),
        ),
      );

      if (!window.isDestroyed() && !window.isVisible()) {
        window.show();
      }
    });
    const destroyAll = electronWindow.destroyAll.pipe(
      Effect.andThen(
        Effect.sync(() => {
          mainWindow = null;
        }),
      ),
    );
    const focusMainWindow = Effect.sync(() => {
      if (mainWindow === null) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    });
    const hasOpenWindows = electronWindow.all.pipe(Effect.map((windows) => windows.length > 0));

    return {
      createMainWindow,
      destroyAll,
      focusMainWindow,
      hasOpenWindows,
    };
  }),
);
