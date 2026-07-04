import { shell } from "electron";
import { Effect, Layer } from "effect";
import { ElectronShell } from "./ElectronShell.ts";
import { ElectronError } from "../errors/ElectronError.ts";

export const ElectronShellLive = Layer.succeed(ElectronShell)({
  openExternal: (targetUrl) =>
    Effect.tryPromise({
      try: () => shell.openExternal(targetUrl).then(() => undefined),
      catch: (cause) =>
        new ElectronError({
          category: "electron",
          cause,
          message: cause instanceof Error ? cause.message : "shell.openExternal failed.",
          operation: "shell.openExternal",
        }),
    }),
  openPath: (targetPath) =>
    Effect.tryPromise({
      try: async () => {
        const message = await shell.openPath(targetPath);
        if (message !== "") throw new Error(message);
      },
      catch: (cause) =>
        new ElectronError({
          category: "electron",
          cause,
          message: cause instanceof Error ? cause.message : "shell.openPath failed.",
          operation: "shell.openPath",
        }),
    }),
  showItemInFolder: (targetPath) => Effect.sync(() => shell.showItemInFolder(targetPath)),
});
