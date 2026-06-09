import { BrowserWindow } from "electron";
import { Effect, Layer } from "effect";
import { BrowserWindows } from "./BrowserWindows.ts";
import { electronError } from "./ElectronError.ts";

export const BrowserWindowsLive = Layer.succeed(BrowserWindows)({
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
        catch: (cause) => electronError("BrowserWindow.constructor", cause),
      }),
      (window) =>
        Effect.sync(() => {
          if (!window.isDestroyed()) window.destroy();
        }),
    ),
});
