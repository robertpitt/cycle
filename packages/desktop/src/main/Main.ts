import { Effect } from "effect";
import { DesktopLive } from "./AppLayer.ts";
import { runDesktop } from "./MainProgram.ts";

const main = Effect.scoped(runDesktop()).pipe(Effect.provide(DesktopLive));

Effect.runPromise(main).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
