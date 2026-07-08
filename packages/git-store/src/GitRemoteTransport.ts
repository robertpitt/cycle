import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";
import { GitRemoteError, type GitStoreError } from "./GitStoreErrors.ts";
import type { ObjectId } from "./GitStoreSchemas.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import { validateObjectId } from "./internal/refs.ts";
import { firstLine, splitWhitespacePair } from "./internal/strings.ts";

const execFileAsync = promisify(execFile);

export type GitRemoteRefInput = {
  readonly cwd?: string;
  readonly ref: string;
  readonly remote: string;
};

export type GitRemoteFetchInput = GitRemoteRefInput;

export type GitRemotePushInput = GitRemoteRefInput & {
  readonly expected: ObjectId | null;
  readonly target: ObjectId;
};

export type GitRemoteTransportShape = {
  readonly fetch: (input: GitRemoteFetchInput) => Effect.Effect<void, GitStoreError>;
  readonly lsRemote: (input: GitRemoteRefInput) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly push: (input: GitRemotePushInput) => Effect.Effect<void, GitStoreError>;
};

export class GitRemoteTransport extends Context.Service<
  GitRemoteTransport,
  GitRemoteTransportShape
>()("@cycle/git-store/GitRemoteTransport") {}

export const GitRemoteTransportLive = Layer.effect(
  GitRemoteTransport,
  Effect.gen(function* () {
    const runtime = yield* GitStoreRuntime;

    const cwdFor = (cwd?: string) => cwd ?? runtime.config.cwd;

    const lsRemote = Effect.fn("GitRemoteTransport.lsRemote")(function* (input: GitRemoteRefInput) {
      const output = yield* runGit(cwdFor(input.cwd), ["ls-remote", input.remote, input.ref], {
        operation: "ls-remote",
        ref: input.ref,
        remote: input.remote,
      });
      const line = firstLine(output.stdout.trim());

      if (line === "") return null;

      const [target] = splitWhitespacePair(line);

      return yield* validateObjectId(target);
    });

    const fetch = Effect.fn("GitRemoteTransport.fetch")(function* (input: GitRemoteFetchInput) {
      const trackingRef = remoteTrackingRef(input.remote, input.ref);

      yield* runGit(
        cwdFor(input.cwd),
        ["fetch", "--no-tags", input.remote, `+${input.ref}:${trackingRef}`],
        {
          operation: "fetch",
          ref: input.ref,
          remote: input.remote,
        },
      );
    });

    const push = Effect.fn("GitRemoteTransport.push")(function* (input: GitRemotePushInput) {
      yield* runGit(
        cwdFor(input.cwd),
        [
          "push",
          `--force-with-lease=${input.ref}:${input.expected ?? ""}`,
          input.remote,
          `${input.target}:${input.ref}`,
        ],
        {
          operation: "push",
          ref: input.ref,
          remote: input.remote,
        },
      );
    });

    return GitRemoteTransport.of({
      fetch,
      lsRemote,
      push,
    });
  }),
);

const runGit = (
  cwd: string,
  args: ReadonlyArray<string>,
  input: Pick<GitRemoteRefInput, "ref" | "remote"> & { readonly operation: string },
): Effect.Effect<{ readonly stderr: string; readonly stdout: string }, GitRemoteError> =>
  Effect.tryPromise({
    try: () => execFileAsync("git", [...args], { cwd, maxBuffer: 10 * 1024 * 1024 }),
    catch: (cause) => {
      const details = gitFailureDetails(cause);

      return new GitRemoteError({
        cause,
        message:
          details.stderr === undefined || details.stderr.length === 0
            ? `git ${input.operation} failed for ${input.remote}/${input.ref}`
            : details.stderr,
        operation: input.operation,
        ref: input.ref,
        remote: input.remote,
        ...details,
      });
    },
  });

const gitFailureDetails = (
  cause: unknown,
): { readonly status?: number; readonly stderr?: string; readonly stdout?: string } => {
  if (cause === null || typeof cause !== "object") return {};

  const record = cause as {
    readonly code?: unknown;
    readonly stderr?: unknown;
    readonly stdout?: unknown;
  };
  const status = typeof record.code === "number" ? record.code : undefined;
  const stderr = typeof record.stderr === "string" ? record.stderr.trim() : undefined;
  const stdout = typeof record.stdout === "string" ? record.stdout.trim() : undefined;

  return {
    ...(status === undefined ? {} : { status }),
    ...(stderr === undefined ? {} : { stderr }),
    ...(stdout === undefined ? {} : { stdout }),
  };
};

export const remoteTrackingRef = (remote: string, ref: string): string =>
  `refs/remotes/${remote}/${ref.startsWith("refs/") ? ref.slice("refs/".length) : ref}`;
