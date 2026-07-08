import { Effect, ManagedRuntime } from "effect";
import { DesktopLive } from "./AppLayer.ts";
import { runDesktop } from "./MainProgram.ts";

const runtime = ManagedRuntime.make(DesktopLive);
const main = Effect.scoped(runDesktop);

runtime
  .runPromise(main)
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => runtime.dispose())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
