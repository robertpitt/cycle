import { Config, Effect, Path } from "effect";
import { optionalConfigString } from "../ConfigSources.ts";
import { trimNonEmpty } from "./strings.ts";

export const appConfigPath: Effect.Effect<string, unknown, Path.Path> = Effect.gen(function* () {
  const path = yield* Path.Path;
  const homeDirectory = yield* Config.string("HOME").pipe(
    Config.withDefault("."),
    Config.map((value) => trimNonEmpty(value) ?? "."),
  );

  return path.join(homeDirectory, ".cycle", "app-config.json");
});

export const runtimeDiscoveryPath: Effect.Effect<string, unknown, Path.Path> = Effect.gen(
  function* () {
    const path = yield* Path.Path;
    const config = yield* Config.all({
      runtimeFile: optionalConfigString("CYCLE_API_RUNTIME_FILE"),
      temp: optionalConfigString("TEMP"),
      tmp: optionalConfigString("TMP"),
      tmpdir: optionalConfigString("TMPDIR"),
      user: optionalConfigString("USER"),
      userId: optionalConfigString("CYCLE_USER_ID"),
    });

    return (
      config.runtimeFile ??
      path.join(
        config.tmpdir ?? config.tmp ?? config.temp ?? "/tmp",
        `cycle-api-${config.userId ?? config.user ?? "user"}.json`,
      )
    );
  },
);
