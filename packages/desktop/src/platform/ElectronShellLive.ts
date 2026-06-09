import { shell } from "electron";
import { Effect, Layer } from "effect";
import { ElectronShell } from "./ElectronShell.ts";
import { electronError } from "./ElectronError.ts";

export const ElectronShellLive = Layer.succeed(ElectronShell)({
  openExternal: (targetUrl) =>
    Effect.tryPromise({
      try: () => shell.openExternal(targetUrl).then(() => undefined),
      catch: (cause) => electronError("shell.openExternal", cause),
    }),
  openPath: (targetPath) =>
    Effect.tryPromise({
      try: async () => {
        const message = await shell.openPath(targetPath);
        if (message !== "") throw new Error(message);
      },
      catch: (cause) => electronError("shell.openPath", cause),
    }),
  showItemInFolder: (targetPath) => Effect.sync(() => shell.showItemInFolder(targetPath)),
});
