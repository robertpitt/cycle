import { Config, ConfigProvider, Effect, Layer, Option, Path } from "effect";
import { ElectronError } from "../errors/ElectronError.ts";
import { DesktopConfig } from "./DesktopConfig.ts";

const readRendererUrl = (): Effect.Effect<string | undefined, ElectronError> =>
  Config.option(Config.string("ELECTRON_RENDERER_URL"))
    .parse(ConfigProvider.fromEnv())
    .pipe(
      Effect.map(
        Option.match({
          onNone: () => undefined,
          onSome: (value) => (value.trim().length === 0 ? undefined : value),
        }),
      ),
      Effect.mapError(
        (cause) =>
          new ElectronError({
            category: "configuration",
            cause,
            message: "Unable to read ELECTRON_RENDERER_URL.",
            operation: "DesktopConfig.rendererUrl",
          }),
      ),
      Effect.flatMap((value) => {
        if (value === undefined || value === "") return Effect.as(Effect.void, undefined);

        return Effect.try({
          try: () => {
            const url = new URL(value);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
              throw new Error("Renderer URL must use http or https.");
            }
            return url.toString();
          },
          catch: (cause) =>
            new ElectronError({
              category: "configuration",
              cause,
              message: "ELECTRON_RENDERER_URL is not a valid renderer URL.",
              operation: "DesktopConfig.rendererUrl",
            }),
        });
      }),
    );

export const DesktopConfigLive = Layer.effect(
  DesktopConfig,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainDirectory = path.dirname(yield* path.fromFileUrl(new URL(import.meta.url)));
    const rendererUrl = yield* readRendererUrl();

    return {
      mode: rendererUrl === undefined ? "production" : "development",
      preloadScript: path.join(mainDirectory, "../preload/index.cjs"),
      rendererIndexHtml: path.join(mainDirectory, "../renderer/index.html"),
      rendererUrl,
    };
  }),
);
