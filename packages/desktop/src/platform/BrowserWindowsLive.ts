import { BrowserWindow } from "electron";
import { Effect, Layer } from "effect";
import { BrowserWindows } from "./BrowserWindows.ts";
import { ElectronError } from "../errors/ElectronError.ts";

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
