import { Context, Effect } from "effect";
import type { ElectronError } from "../errors/ElectronError.ts";

export type DesktopWindowService = {
  readonly createMainWindow: () => Effect.Effect<void, ElectronError>;
  readonly destroyAll: () => Effect.Effect<void>;
  readonly focusMainWindow: () => Effect.Effect<void>;
  readonly hasOpenWindows: () => Effect.Effect<boolean>;
};

export class DesktopWindow extends Context.Service<DesktopWindow, DesktopWindowService>()(
  "@cycle/desktop/DesktopWindow",
) {}
