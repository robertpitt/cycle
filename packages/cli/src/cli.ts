import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Result } from "effect";
import { Command } from "effect/unstable/cli";
import { cycleCommand } from "./commands/index.ts";
import {
  CliRuntime,
  defaultCliRuntime,
  exitCodes,
  runtimeFromIo,
  type CliIo,
  type CliRuntimeShape,
} from "./services/CliRuntime.ts";
import { normalizeFailure } from "./services/errors.ts";
import { rootJsonFlag, writeFailure } from "./services/command.ts";

export type { CliIo };
export type { CliFailure } from "./services/errors.ts";
export { CliRuntime } from "./services/CliRuntime.ts";
export { cycleCommand } from "./commands/index.ts";

export const runCycleCliEffect = (
  argv?: ReadonlyArray<string>,
  io?: CliIo,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    let exitCode: number = exitCodes.success;
    const baseRuntime =
      io === undefined ? yield* defaultCliRuntime(argv) : runtimeFromIo(argv ?? [], io);
    const runtime: CliRuntimeShape = {
      ...baseRuntime,
      setExitCode: (code) => {
        exitCode = code;
        baseRuntime.setExitCode?.(code);
      },
    };
    const program = Command.runWith(cycleCommand, { version: "0.1.0" })(runtime.argv).pipe(
      Effect.provide(Layer.succeed(CliRuntime, runtime)),
      Effect.result,
    );
    const result = yield* program;

    if (Result.isFailure(result)) {
      const failure = normalizeFailure(result.failure);
      yield* writeFailure(runtime, rootJsonFlag(runtime.argv), failure);
      return failure.exitCode;
    }

    return exitCode;
  }).pipe(Effect.provide(NodeServices.layer));

export const runCycleCli = (argv: ReadonlyArray<string> = [], io?: CliIo): Promise<number> =>
  Effect.runPromise(runCycleCliEffect(argv, io));
