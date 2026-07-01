import { Config, Context, Effect, Option, Path, Sink, Stdio, Stream } from "effect";

export type CliIo = {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
  readonly setExitCode?: (exitCode: number) => void;
  readonly stderr: { readonly write: (chunk: string | Uint8Array) => unknown };
  readonly stdin: AsyncIterable<string | Uint8Array> & { readonly isTTY?: boolean };
  readonly stdout: { readonly write: (chunk: string | Uint8Array) => unknown };
};

export type CliRuntimeShape = {
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
  readonly readStdin: () => Promise<string>;
  readonly setExitCode?: (exitCode: number) => void;
  readonly stdinIsTTY: boolean;
  readonly writeStderr: (text: string) => Promise<void>;
  readonly writeStdout: (text: string) => Promise<void>;
};

export class CliRuntime extends Context.Service<CliRuntime, CliRuntimeShape>()(
  "@cycle/cli/CliRuntime",
) {}

export const exitCodes = {
  apiAuth: 3,
  apiUnavailable: 4,
  automationFailed: 8,
  conflict: 7,
  invalidUsage: 2,
  notFound: 5,
  success: 0,
  unexpected: 1,
  validation: 6,
} as const;

export const runtimeFromIo = (argv: ReadonlyArray<string>, io: CliIo): CliRuntimeShape => ({
  argv,
  cwd: io.cwd,
  env: io.env,
  ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
  readStdin: () => readAsyncIterable(io.stdin),
  ...(io.setExitCode === undefined ? {} : { setExitCode: io.setExitCode }),
  stdinIsTTY: io.stdin.isTTY === true,
  writeStderr: async (text) => {
    io.stderr.write(text);
  },
  writeStdout: async (text) => {
    io.stdout.write(text);
  },
});

export const defaultCliRuntime = (
  argv: ReadonlyArray<string> | undefined,
): Effect.Effect<CliRuntimeShape, never, Path.Path | Stdio.Stdio> =>
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio;
    const path = yield* Path.Path;
    const args = argv ?? (yield* stdio.args);
    const env = yield* readCliEnv;
    const services = yield* Effect.context<Stdio.Stdio>();

    return {
      argv: args,
      cwd: path.resolve("."),
      env,
      readStdin: () =>
        Effect.runPromiseWith(services)(
          stdio.stdin.pipe(
            Stream.decodeText(),
            Stream.runFold(
              () => "",
              (acc, chunk) => `${acc}${chunk}`,
            ),
            Effect.catch(() => Effect.succeed("")),
          ),
        ),
      stdinIsTTY: globalThis.process?.stdin?.isTTY === true,
      writeStderr: (text) => writeToSink(stdio.stderr(), text),
      writeStdout: (text) => writeToSink(stdio.stdout(), text),
    };
  });

const readCliEnv = Effect.gen(function* () {
  const entries = yield* Effect.all(
    envVariableNames.map((name) =>
      Config.option(Config.string(name)).pipe(
        Effect.map((value) => [name, Option.getOrUndefined(value)] as const),
      ),
    ),
  );

  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}).pipe(Effect.catch(() => Effect.succeed({})));

const envVariableNames = [
  "CYCLE_API_RUNTIME_FILE",
  "CYCLE_API_TOKEN",
  "CYCLE_API_URL",
  "CYCLE_API_URL_DEFAULT",
  "CYCLE_CONFIG_PATH",
  "HOME",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER",
] as const;

const writeToSink = (
  sink: Sink.Sink<void, string | Uint8Array, never, unknown>,
  text: string,
): Promise<void> =>
  Effect.runPromise(
    Stream.fromIterable([text]).pipe(
      Stream.run(sink),
      Effect.catch(() => Effect.void),
    ),
  );

const readAsyncIterable = async (input: AsyncIterable<string | Uint8Array>): Promise<string> => {
  const decoder = new TextDecoder();
  let result = "";

  for await (const chunk of input) {
    result += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
  }

  result += decoder.decode();

  return result;
};
