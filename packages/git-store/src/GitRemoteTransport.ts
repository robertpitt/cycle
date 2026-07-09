import { GitCommands } from "@cycle/git/commands/GitCommands";
import { Context, Effect, Layer } from "effect";
import { GitRemoteError, type GitStoreError } from "./GitStoreErrors.ts";
import type { ObjectId } from "./GitStoreSchemas.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";

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
    const git = yield* GitCommands;

    const cwdFor = (cwd?: string) => cwd ?? runtime.config.cwd;

    const lsRemote = Effect.fn("GitRemoteTransport.lsRemote")(function* (input: GitRemoteRefInput) {
      const target = yield* git
        .lsRemoteRef(cwdFor(input.cwd), {
          ref: input.ref,
          remote: input.remote,
        })
        .pipe(Effect.mapError((cause) => mapRemoteError(input, "ls-remote", cause)));

      return target as ObjectId | null;
    });

    const fetch = Effect.fn("GitRemoteTransport.fetch")(function* (input: GitRemoteFetchInput) {
      yield* git
        .fetchRef(cwdFor(input.cwd), {
          ref: input.ref,
          remote: input.remote,
        })
        .pipe(Effect.mapError((cause) => mapRemoteError(input, "fetch", cause)));
    });

    const push = Effect.fn("GitRemoteTransport.push")(function* (input: GitRemotePushInput) {
      yield* git
        .push(cwdFor(input.cwd), {
          forceWithLease: [{ expected: input.expected, ref: input.ref }],
          refspecs: [`${input.target}:${input.ref}`],
          remote: input.remote,
        })
        .pipe(Effect.mapError((cause) => mapRemoteError(input, "push", cause)));
    });

    return GitRemoteTransport.of({
      fetch,
      lsRemote,
      push,
    });
  }),
);

const gitFailureDetails = (cause: unknown): {
  readonly message?: string;
  readonly status?: number;
  readonly stderr?: string;
  readonly stdout?: string;
} => {
  if (cause === null || typeof cause !== "object") return {};

  const record = cause as {
    readonly message?: unknown;
    readonly status?: unknown;
    readonly stderr?: unknown;
    readonly stdout?: unknown;
  };
  const message = typeof record.message === "string" ? record.message : undefined;
  const status = typeof record.status === "number" ? record.status : undefined;
  const stderr = typeof record.stderr === "string" ? record.stderr.trim() : undefined;
  const stdout = typeof record.stdout === "string" ? record.stdout.trim() : undefined;

  return {
    ...(message === undefined ? {} : { message }),
    ...(status === undefined ? {} : { status }),
    ...(stderr === undefined ? {} : { stderr }),
    ...(stdout === undefined ? {} : { stdout }),
  };
};

const mapRemoteError = (
  input: GitRemoteRefInput,
  operation: string,
  cause: unknown,
): GitRemoteError => {
  const details = gitFailureDetails(cause);

  return new GitRemoteError({
    cause,
    message:
      details.message ??
      details.stderr ??
      `git ${operation} failed for ${input.remote}/${input.ref}`,
    operation,
    ref: input.ref,
    remote: input.remote,
    ...(details.status === undefined ? {} : { status: details.status }),
    ...(details.stderr === undefined ? {} : { stderr: details.stderr }),
    ...(details.stdout === undefined ? {} : { stdout: details.stdout }),
  });
};
