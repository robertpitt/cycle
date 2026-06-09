import { Context, Effect } from "effect";
import type { ElectronError } from "./ElectronError.ts";

export type ElectronShellService = {
  readonly openExternal: (targetUrl: string) => Effect.Effect<void, ElectronError>;
  readonly openPath: (targetPath: string) => Effect.Effect<void, ElectronError>;
  readonly showItemInFolder: (targetPath: string) => Effect.Effect<void>;
};

export class ElectronShell extends Context.Service<ElectronShell, ElectronShellService>()(
  "@cycle/desktop/ElectronShell",
) {}
