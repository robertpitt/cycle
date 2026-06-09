import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Context, Effect, Stream } from "effect";
import {
  gitAdapterError,
  type GitAdapterError,
  type RemoteFetchError,
  type RemotePushError,
} from "../errors/index.ts";
import { bytesToString, concatBytes, inputToStream } from "../internals/bytes.ts";

export type ChildProcessSpawnerService = Context.Service.Shape<
  typeof ChildProcessSpawner.ChildProcessSpawner
>;

export type GitRunOptions = {
  readonly allowFailure?: boolean;
  readonly env?: Record<string, string | undefined>;
  readonly input?: Uint8Array | string;
};

export type GitRunResult = {
  readonly status: number;
  readonly stderr: Uint8Array;
  readonly stdout: Uint8Array;
};

type GitRunError = GitAdapterError | RemoteFetchError | RemotePushError;

export const git = <E extends GitRunError = GitAdapterError>(
  spawner: ChildProcessSpawnerService,
  gitDir: string,
  cwd: string,
  args: ReadonlyArray<string>,
  options: GitRunOptions = {},
  makeError: (
    args: ReadonlyArray<string>,
    result: GitRunResult | undefined,
    cause: unknown,
  ) => E = ((failedArgs, result, cause) =>
    gitAdapterError(formatOperation(failedArgs), formatGitFailure(failedArgs, result, cause), {
      cause,
      status: result?.status,
      stderr: result === undefined ? undefined : bytesToString(result.stderr).trim(),
    })) as (args: ReadonlyArray<string>, result: GitRunResult | undefined, cause: unknown) => E,
): Effect.Effect<GitRunResult, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      const command = ChildProcess.make("git", ["--git-dir", gitDir, ...args], {
        cwd,
        env: options.env,
        extendEnv: true,
        stdin: inputToStream(options.input),
      });
      const handle = yield* spawner
        .spawn(command)
        .pipe(Effect.mapError((cause) => makeError(args, undefined, cause)));
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collectBytes(handle.stdout), collectBytes(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      ).pipe(Effect.mapError((cause) => makeError(args, undefined, cause)));
      const result: GitRunResult = {
        status: Number(exitCode),
        stderr,
        stdout,
      };

      if (result.status !== 0 && !options.allowFailure) {
        return yield* Effect.fail(makeError(args, result, undefined));
      }

      return result;
    }),
  );

export const formatOperation = (args: ReadonlyArray<string>): string => `git ${args.join(" ")}`;

export const formatGitFailure = (
  args: ReadonlyArray<string>,
  result: GitRunResult | undefined,
  cause: unknown,
): string => {
  if (result !== undefined) {
    return `${formatOperation(args)} failed: ${bytesToString(result.stderr).trim()}`;
  }

  return cause instanceof Error ? cause.message : `${formatOperation(args)} failed`;
};

const collectBytes = (
  stream: Stream.Stream<Uint8Array, unknown>,
): Effect.Effect<Uint8Array, unknown> =>
  Stream.runCollect(stream).pipe(Effect.map((chunks) => concatBytes(chunks)));
