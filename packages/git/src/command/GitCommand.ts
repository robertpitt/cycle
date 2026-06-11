import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Context, Effect, Stream } from "effect";
import { gitAdapterError, type GitAdapterError, type GitTransportError } from "../errors/index.ts";
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

type GitRunError = GitAdapterError | GitTransportError;

type GitCommandContext = {
  readonly gitDir?: string;
  readonly operationArgs?: ReadonlyArray<string>;
};

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
      stderr: result === undefined ? undefined : sanitizeStderr(bytesToString(result.stderr)),
    })) as (args: ReadonlyArray<string>, result: GitRunResult | undefined, cause: unknown) => E,
): Effect.Effect<GitRunResult, E> =>
  runGit(spawner, cwd, ["--git-dir", gitDir, ...args], options, makeError, {
    gitDir,
    operationArgs: args,
  });

export const gitRaw = <E extends GitRunError = GitAdapterError>(
  spawner: ChildProcessSpawnerService,
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
      stderr: result === undefined ? undefined : sanitizeStderr(bytesToString(result.stderr)),
    })) as (args: ReadonlyArray<string>, result: GitRunResult | undefined, cause: unknown) => E,
): Effect.Effect<GitRunResult, E> => runGit(spawner, cwd, args, options, makeError);

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

const runGit = <E extends GitRunError>(
  spawner: ChildProcessSpawnerService,
  cwd: string,
  args: ReadonlyArray<string>,
  options: GitRunOptions,
  makeError: (args: ReadonlyArray<string>, result: GitRunResult | undefined, cause: unknown) => E,
  context: GitCommandContext = {},
): Effect.Effect<GitRunResult, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      const operationArgs = context.operationArgs ?? args;
      const baseAnnotations = gitLogAnnotations(cwd, context.gitDir, operationArgs);

      yield* Effect.logDebug("git command starting").pipe(Effect.annotateLogs(baseAnnotations));

      const command = ChildProcess.make("git", args, {
        cwd,
        env: options.env,
        extendEnv: true,
        stdin: inputToStream(options.input),
      });
      const handle = yield* spawner
        .spawn(command)
        .pipe(Effect.mapError((cause) => makeError(operationArgs, undefined, cause)));
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [collectBytes(handle.stdout), collectBytes(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      ).pipe(Effect.mapError((cause) => makeError(operationArgs, undefined, cause)));
      const result: GitRunResult = {
        status: Number(exitCode),
        stderr,
        stdout,
      };
      const resultAnnotations = gitLogAnnotations(cwd, context.gitDir, operationArgs, result);

      if (result.status !== 0 && !options.allowFailure) {
        yield* Effect.logWarning("git command failed").pipe(Effect.annotateLogs(resultAnnotations));

        return yield* Effect.fail(makeError(operationArgs, result, undefined));
      }

      yield* Effect.logDebug("git command completed").pipe(Effect.annotateLogs(resultAnnotations));

      return result;
    }),
  );

export const sanitizeStderr = (stderr: string, maxLength = 2_048): string => {
  const normalized = stderr
    .replace(/\p{C}+/gu, " ")
    .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]+@/gu, "$1<redacted>@")
    .replace(/\b(token|password|secret|credential)=\S+/giu, "$1=<redacted>")
    .trim();

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
};

const gitLogAnnotations = (
  cwd: string,
  gitDir: string | undefined,
  args: ReadonlyArray<string>,
  result?: GitRunResult,
): Record<string, unknown> => ({
  cwd,
  gitDir: gitDir ?? null,
  operation: formatOperation(args),
  ref: refFromArgs(args),
  remote: remoteFromArgs(args),
  status: result?.status ?? null,
  stderr: result === undefined ? null : sanitizeStderr(bytesToString(result.stderr)),
  stderrBytes: result?.stderr.byteLength ?? 0,
});

const refFromArgs = (args: ReadonlyArray<string>): string | null => {
  const [command, ...rest] = args;

  switch (command) {
    case "for-each-ref":
      return rest.at(-1) ?? null;
    case "show-ref":
      return rest.at(-1) ?? null;
    case "update-ref":
      return rest[0] === "-d" ? (rest[1] ?? null) : (rest[0] ?? null);
    default:
      return null;
  }
};

const remoteFromArgs = (args: ReadonlyArray<string>): string | null => {
  const [command, remote] = args;

  return command === "fetch" || command === "push" ? (remote ?? null) : null;
};
