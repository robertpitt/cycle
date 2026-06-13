import { Effect } from "effect";
import { makeCycleApiClientEffect, type CycleApiClient } from "../client.ts";
import { cycle } from "../commands/root.ts";
import { CliRuntime, type CliRuntimeShape } from "./CliRuntime.ts";
import { type CliFailure, normalizeFailure } from "./errors.ts";

export type CommandOutput = {
  readonly human: string;
  readonly json: unknown;
};

export const commandEffect = (
  execute: (api: CycleApiClient, runtime: CliRuntimeShape) => Promise<CommandOutput>,
) =>
  Effect.gen(function* () {
    const runtime = yield* CliRuntime;
    const root = yield* cycle;
    const api = yield* makeCycleApiClientEffect({
      apiUrlFlag: optionToUndefined(root.apiUrl),
      cwd: runtime.cwd,
      env: runtime.env,
      fetch: runtime.fetch,
      requestId: optionToUndefined(root.requestId),
      tokenFlag: optionToUndefined(root.token),
    }).pipe(Effect.mapError(normalizeFailure));
    const output = yield* Effect.tryPromise({
      try: () => execute(api, runtime),
      catch: normalizeFailure,
    });

    yield* writeSuccess(runtime, root.json, output);
  });

const writeSuccess = (
  runtime: CliRuntimeShape,
  json: boolean,
  output: CommandOutput,
): Effect.Effect<void> =>
  Effect.promise(() =>
    runtime.writeStdout(json ? `${JSON.stringify(output.json)}\n` : `${output.human}\n`),
  );

export const writeFailure = (
  runtime: CliRuntimeShape,
  json: boolean,
  failure: CliFailure,
): Effect.Effect<void> =>
  Effect.promise(() =>
    runtime.writeStderr(
      json
        ? `${JSON.stringify({
            error: {
              code: failure.code,
              details: failure.details ?? {},
              message: failure.message,
              requestId: failure.requestId,
            },
          })}\n`
        : `${failure.code}: ${failure.message}\n`,
    ),
  );

export const optionToUndefined = <A>(option: {
  readonly _tag: string;
  readonly value?: A;
}): A | undefined => (option._tag === "Some" ? option.value : undefined);

export const rootJsonFlag = (argv: ReadonlyArray<string>): boolean => argv.includes("--json");
