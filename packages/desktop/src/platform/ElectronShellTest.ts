import { Effect, Layer } from "effect";
import { ElectronShell } from "./ElectronShell.ts";

export type ElectronShellCall =
  | { readonly targetPath: string; readonly type: "openPath" }
  | { readonly targetPath: string; readonly type: "showItemInFolder" }
  | { readonly targetUrl: string; readonly type: "openExternal" };

export const makeElectronShellTest = (calls: Array<ElectronShellCall> = []) =>
  Layer.succeed(ElectronShell)({
    openExternal: (targetUrl) =>
      Effect.sync(() => {
        calls.push({ targetUrl, type: "openExternal" });
      }),
    openPath: (targetPath) =>
      Effect.sync(() => {
        calls.push({ targetPath, type: "openPath" });
      }),
    showItemInFolder: (targetPath) =>
      Effect.sync(() => {
        calls.push({ targetPath, type: "showItemInFolder" });
      }),
  });

export const ElectronShellTest = makeElectronShellTest();
