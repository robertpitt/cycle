import { Effect } from "effect";
import { ElectronApp } from "../platform/ElectronApp.ts";
import { DesktopBootstrap } from "../shared/Bootstrap.ts";
import { registerDesktopIpc } from "./DesktopIpc.ts";
import { DesktopWindow } from "./DesktopWindow.ts";

export const runDesktop = Effect.fnUntraced(function* () {
  const app = yield* ElectronApp;
  const bootstrap = yield* DesktopBootstrap;
  const desktopWindow = yield* DesktopWindow;

  yield* app.whenReady();
  yield* registerDesktopIpc();
  yield* desktopWindow.createMainWindow();
  yield* bootstrap.start();

  yield* app.startLifecycleSupervision({
    onActivate: () =>
      Effect.gen(function* () {
        const hasOpenWindows = yield* desktopWindow.hasOpenWindows();
        if (hasOpenWindows) {
          yield* desktopWindow.focusMainWindow();
          return;
        }
        yield* desktopWindow.createMainWindow();
      }),
  });

  yield* app.awaitShutdown;
  yield* desktopWindow.destroyAll();
});
