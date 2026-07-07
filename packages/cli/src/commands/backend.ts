import { BackendServicesLive, startBackend } from "@cycle/backend";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { cycle } from "./root.ts";
import { CliRuntime } from "../services/CliRuntime.ts";

export const backend = Command.make("backend").pipe(
  Command.withSubcommands([
    Command.make("start", {}, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* CliRuntime;
          const root = yield* cycle;
          const handle = yield* startBackend().pipe(Effect.provide(BackendServicesLive()));
          const payload = {
            baseUrl: handle.baseUrl,
            mcpUrl: handle.mcpUrl,
            runtimeFile: handle.runtimeFile,
            startedAt: handle.startedAt,
          };

          yield* Effect.tryPromise({
            try: () =>
              runtime.writeStdout(
                root.json
                  ? `${JSON.stringify({ data: payload })}\n`
                  : `Cycle backend listening at ${handle.baseUrl ?? "disabled"}\n`,
              ),
            catch: () => undefined,
          }).pipe(Effect.catch(() => Effect.void));

          yield* Effect.never;
        }),
      ),
    ).pipe(Command.withDescription("Start the local Cycle backend.")),
  ]),
);
