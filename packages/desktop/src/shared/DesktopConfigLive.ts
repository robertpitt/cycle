import { Effect, Layer } from "effect";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { electronConfigurationError, type ElectronError } from "../platform/ElectronError.ts";
import { DesktopConfig } from "./DesktopConfig.ts";

const readRendererUrl = (): Effect.Effect<string | undefined, ElectronError> =>
  Effect.sync(() => process.env["ELECTRON_RENDERER_URL"]).pipe(
    Effect.flatMap((value) => {
      if (value === undefined || value === "") return Effect.succeed(undefined);

      return Effect.try({
        try: () => {
          const url = new URL(value);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("Renderer URL must use http or https.");
          }
          return url.toString();
        },
        catch: (cause) =>
          electronConfigurationError(
            "DesktopConfig.rendererUrl",
            "ELECTRON_RENDERER_URL is not a valid renderer URL.",
            cause,
          ),
      });
    }),
  );

export const DesktopConfigLive = Layer.effect(
  DesktopConfig,
  Effect.gen(function* () {
    const mainDirectory = dirname(fileURLToPath(import.meta.url));
    const rendererUrl = yield* readRendererUrl();

    return {
      mode: rendererUrl === undefined ? "production" : "development",
      preloadScript: join(mainDirectory, "../preload/index.cjs"),
      rendererIndexHtml: join(mainDirectory, "../renderer/index.html"),
      rendererUrl,
    };
  }),
);
