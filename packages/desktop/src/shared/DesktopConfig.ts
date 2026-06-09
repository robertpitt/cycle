import { Context } from "effect";

export type DesktopMode = "development" | "production";

export type DesktopConfigService = {
  readonly mode: DesktopMode;
  readonly preloadScript: string;
  readonly rendererIndexHtml: string;
  readonly rendererUrl: string | undefined;
};

export class DesktopConfig extends Context.Service<DesktopConfig, DesktopConfigService>()(
  "@cycle/desktop/DesktopConfig",
) {}
