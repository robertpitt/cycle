import { ChildProcessSpawner } from "effect/unstable/process";
import { Context, Effect, Layer } from "effect";
import {
  formatGitFailure,
  formatOperation,
  gitRaw,
  sanitizeStderr,
  type GitRunOptions,
  type GitRunResult,
} from "./GitCommand.ts";
import {
  GitBranchError,
  GitBranchNameError,
  GitCommitError,
  GitIndexError,
  GitRefError,
  GitRemoteLookupError,
  GitRepositoryError,
  GitRevisionError,
  GitStatusError,
  GitWorktreeError,
  RemoteFetchError,
  RemotePushError,
} from "./GitErrors.ts";
import type { ObjectId } from "./GitSchemas.ts";
import { bytesToString } from "./internals/bytes.ts";

export type GitStatusOptions = {
  readonly z?: boolean | undefined;
};

export type GitRevListInput =
  | {
      readonly range: {
        readonly fromExclusive: string;
        readonly toInclusive: string;
      };
    }
  | {
      readonly roots: {
        readonly start: string;
      };
    };

export type GitUpdateRefCommandInput = {
  readonly expected?: ObjectId | null | undefined;
  readonly ref: string;
  readonly target: ObjectId;
};

export type GitDeleteRefCommandInput = {
  readonly expected?: ObjectId | null | undefined;
  readonly ref: string;
};

export type GitCommitCommandInput = {
  readonly allowEmpty?: boolean | undefined;
  readonly env?: Record<string, string | undefined> | undefined;
  readonly message: string;
  readonly userEmail?: string | undefined;
  readonly userName?: string | undefined;
};

export type GitCommitResult = {
  readonly cwd: string;
  readonly message: string;
  readonly sha: ObjectId;
};

export type GitWorktreeAddDetachedInput = {
  readonly baseSha: ObjectId;
  readonly worktreePath: string;
};

export type GitWorktreeAddResult = {
  readonly baseSha: ObjectId;
  readonly headSha: ObjectId;
  readonly repositoryPath: string;
  readonly worktreePath: string;
};

export type GitWorktreeRemoveInput = {
  readonly allowFailure?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly worktreePath: string;
};

export type GitLsRemoteRefInput = {
  readonly ref: string;
  readonly remote: string;
};

export type GitFetchRefInput = {
  readonly ref: string;
  readonly remote: string;
  readonly trackingRef?: string | undefined;
};

export type GitPushCommandInput = {
  readonly forceWithLease?:
    | ReadonlyArray<{
        readonly expected?: string | null | undefined;
        readonly ref: string;
      }>
    | undefined;
  readonly refspecs: ReadonlyArray<string>;
  readonly remote: string;
};

export type GitCommandsShape = {
  readonly absoluteGitDir: (cwd: string) => Effect.Effect<string, GitRepositoryError>;
  readonly addAll: (cwd: string) => Effect.Effect<void, GitIndexError>;
  readonly branchRef: (branchName: string) => string;
  readonly checkBranchName: (
    cwd: string,
    branchName: string,
  ) => Effect.Effect<string, GitBranchNameError>;
  readonly commit: (
    cwd: string,
    input: GitCommitCommandInput,
  ) => Effect.Effect<GitCommitResult, GitCommitError | GitRevisionError>;
  readonly commonGitDir: (cwd: string) => Effect.Effect<string, GitRepositoryError>;
  readonly currentBranch: (cwd: string) => Effect.Effect<string | null, GitBranchError>;
  readonly deleteRef: (
    cwd: string,
    input: GitDeleteRefCommandInput,
  ) => Effect.Effect<void, GitRefError>;
  readonly fetchRef: (
    cwd: string,
    input: GitFetchRefInput,
  ) => Effect.Effect<void, RemoteFetchError>;
  readonly head: (cwd: string) => Effect.Effect<ObjectId, GitRevisionError>;
  readonly isAncestor: (
    cwd: string,
    ancestor: ObjectId,
    descendant: ObjectId,
  ) => Effect.Effect<boolean, GitRevisionError>;
  readonly listLocalBranches: (cwd: string) => Effect.Effect<ReadonlyArray<string>, GitBranchError>;
  readonly lsRemoteRef: (
    cwd: string,
    input: GitLsRemoteRefInput,
  ) => Effect.Effect<ObjectId | null, GitRemoteLookupError>;
  readonly push: (cwd: string, input: GitPushCommandInput) => Effect.Effect<void, RemotePushError>;
  readonly resolveCommit: (cwd: string, ref: string) => Effect.Effect<ObjectId, GitRevisionError>;
  readonly revList: (
    cwd: string,
    input: GitRevListInput,
  ) => Effect.Effect<ReadonlyArray<ObjectId>, GitRevisionError>;
  readonly showTopLevel: (cwd: string) => Effect.Effect<string, GitRepositoryError>;
  readonly statusPorcelain: (
    cwd: string,
    options?: GitStatusOptions,
  ) => Effect.Effect<string, GitStatusError>;
  readonly updateRef: (
    cwd: string,
    input: GitUpdateRefCommandInput,
  ) => Effect.Effect<void, GitRefError>;
  readonly worktreeAddDetached: (
    repositoryPath: string,
    input: GitWorktreeAddDetachedInput,
  ) => Effect.Effect<GitWorktreeAddResult, GitRevisionError | GitWorktreeError>;
  readonly worktreeRemove: (
    repositoryPath: string,
    input: GitWorktreeRemoveInput,
  ) => Effect.Effect<void, GitWorktreeError>;
};

export class GitCommands extends Context.Service<GitCommands, GitCommandsShape>()(
  "@cycle/git/GitCommands",
) {}

type CliFailureInput = {
  readonly args: ReadonlyArray<string>;
  readonly cause: unknown;
  readonly cwd: string;
  readonly operation: string;
  readonly result: GitRunResult | undefined;
};

const fullObjectIdPattern = /^[0-9a-fA-F]{40}$/u;

const stripTrailingLineEndings = (value: string): string => value.replace(/(?:\r?\n)+$/u, "");

const stderrString = (result: GitRunResult | undefined): string | undefined =>
  result === undefined ? undefined : sanitizeStderr(bytesToString(result.stderr));

const stdoutString = (result: GitRunResult | undefined): string | undefined =>
  result === undefined ? undefined : sanitizeStderr(bytesToString(result.stdout), 2_048);

const commonFailure = (input: CliFailureInput) => ({
  args: [...input.args],
  cause: input.cause,
  cwd: input.cwd,
  message: formatGitFailure(input.args, input.result, input.cause),
  operation: input.operation,
  status: input.result?.status,
  stderr: stderrString(input.result),
  stdout: stdoutString(input.result),
});

const validateObjectId = <E>(
  value: string,
  makeError: (value: string) => E,
): Effect.Effect<ObjectId, E> => {
  const normalized = value.trim().toLowerCase();

  return fullObjectIdPattern.test(normalized)
    ? Effect.succeed(normalized as ObjectId)
    : Effect.fail(makeError(value));
};

export const remoteTrackingRef = (remote: string, ref: string): string =>
  `refs/remotes/${remote}/${ref.startsWith("refs/") ? ref.slice("refs/".length) : ref}`;

export const branchRef = (branchName: string): string => `refs/heads/${branchName}`;

export const layer = Layer.effect(
  GitCommands,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const runRevision = (
      cwd: string,
      args: ReadonlyArray<string>,
      options: GitRunOptions = {},
    ) =>
      gitRaw(spawner, cwd, args, options, (failedArgs, result, cause) =>
        new GitRevisionError(commonFailure({
          args: failedArgs,
          cause,
          cwd,
          operation: formatOperation(failedArgs),
          result,
        })),
      );

    const revisionObjectId = (cwd: string, args: ReadonlyArray<string>) =>
      runRevision(cwd, args).pipe(
        Effect.flatMap((result) =>
          validateObjectId(bytesToString(result.stdout), (value) =>
            new GitRevisionError({
              args: [...args],
              cwd,
              message: `Git revision did not resolve to a full object id: ${value.trim()}`,
              operation: formatOperation(args),
              stdout: sanitizeStderr(value),
            }),
          ),
        ),
      );

    const showTopLevel = Effect.fn("GitCommands.showTopLevel")(function* (cwd: string) {
      const args = ["rev-parse", "--show-toplevel"];
      const result = yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitRepositoryError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd,
            operation: formatOperation(failedArgs),
            result,
          }),
          path: cwd,
        }),
      );

      return stripTrailingLineEndings(bytesToString(result.stdout)).trim();
    });

    const commonGitDir = Effect.fn("GitCommands.commonGitDir")(function* (cwd: string) {
      const args = ["rev-parse", "--git-common-dir"];
      const result = yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitRepositoryError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd,
            operation: formatOperation(failedArgs),
            result,
          }),
          path: cwd,
        }),
      );

      return stripTrailingLineEndings(bytesToString(result.stdout)).trim();
    });

    const absoluteGitDir = Effect.fn("GitCommands.absoluteGitDir")(function* (cwd: string) {
      const args = ["rev-parse", "--absolute-git-dir"];
      const result = yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitRepositoryError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd,
            operation: formatOperation(failedArgs),
            result,
          }),
          path: cwd,
        }),
      );

      return stripTrailingLineEndings(bytesToString(result.stdout)).trim();
    });

    const resolveCommit = Effect.fn("GitCommands.resolveCommit")(function* (
      cwd: string,
      ref: string,
    ) {
      return yield* revisionObjectId(cwd, ["rev-parse", `${ref}^{commit}`]);
    });

    const head = Effect.fn("GitCommands.head")(function* (cwd: string) {
      return yield* revisionObjectId(cwd, ["rev-parse", "HEAD"]);
    });

    const currentBranch = Effect.fn("GitCommands.currentBranch")(function* (cwd: string) {
      const args = ["branch", "--show-current"];
      const result = yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitBranchError(commonFailure({
          args: failedArgs,
          cause,
          cwd,
          operation: formatOperation(failedArgs),
          result,
        })),
      );
      const branchName = stripTrailingLineEndings(bytesToString(result.stdout)).trim();

      return branchName.length === 0 ? null : branchName;
    });

    const statusPorcelain = Effect.fn("GitCommands.statusPorcelain")(function* (
      cwd: string,
      options: GitStatusOptions = {},
    ) {
      const args = ["status", "--porcelain=v1", ...(options.z === true ? ["-z"] : [])];
      const result = yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitStatusError(commonFailure({
          args: failedArgs,
          cause,
          cwd,
          operation: formatOperation(failedArgs),
          result,
        })),
      );
      const stdout = bytesToString(result.stdout);

      return options.z === true ? stdout : stripTrailingLineEndings(stdout);
    });

    const revList = Effect.fn("GitCommands.revList")(function* (
      cwd: string,
      input: GitRevListInput,
    ) {
      const args =
        "range" in input
          ? ["rev-list", `${input.range.fromExclusive}..${input.range.toInclusive}`]
          : ["rev-list", "--max-parents=0", input.roots.start];
      const result = yield* runRevision(cwd, args);

      return yield* Effect.forEach(
        bytesToString(result.stdout)
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        (line) =>
          validateObjectId(line, (value) =>
            new GitRevisionError({
              args,
              cwd,
              message: `git rev-list returned an invalid object id: ${value}`,
              operation: formatOperation(args),
              stdout: sanitizeStderr(bytesToString(result.stdout)),
            }),
          ),
      );
    });

    const isAncestor = Effect.fn("GitCommands.isAncestor")(function* (
      cwd: string,
      ancestor: ObjectId,
      descendant: ObjectId,
    ) {
      const args = ["merge-base", "--is-ancestor", ancestor, descendant];
      const result = yield* runRevision(cwd, args, { allowFailure: true });

      if (result.status === 0) return true;
      if (result.status === 1) return false;

      return yield* new GitRevisionError({
        ...commonFailure({
          args,
          cause: undefined,
          cwd,
          operation: formatOperation(args),
          result,
        }),
        message: sanitizeStderr(bytesToString(result.stderr)) || "git merge-base failed",
      });
    });

    const listLocalBranches = Effect.fn("GitCommands.listLocalBranches")(function* (cwd: string) {
      const args = ["for-each-ref", "--format=%(refname:short)", "refs/heads/"];
      const result = yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitBranchError(commonFailure({
          args: failedArgs,
          cause,
          cwd,
          operation: formatOperation(failedArgs),
          result,
        })),
      );

      return bytesToString(result.stdout)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    });

    const checkBranchName = Effect.fn("GitCommands.checkBranchName")(function* (
      cwd: string,
      branchName: string,
    ) {
      const args = ["check-ref-format", "--branch", branchName];

      yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitBranchNameError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd,
            operation: formatOperation(failedArgs),
            result,
          }),
          branchName,
          message: `Invalid branch name: ${branchName}`,
        }),
      );

      return branchName;
    });

    const updateRef = Effect.fn("GitCommands.updateRef")(function* (
      cwd: string,
      input: GitUpdateRefCommandInput,
    ) {
      const args = ["update-ref", input.ref, input.target];

      if ("expected" in input) {
        args.push(input.expected ?? "");
      }

      yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitRefError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd,
            operation: formatOperation(failedArgs),
            result,
          }),
          ref: input.ref,
        }),
      );
    });

    const deleteRef = Effect.fn("GitCommands.deleteRef")(function* (
      cwd: string,
      input: GitDeleteRefCommandInput,
    ) {
      const args = ["update-ref", "-d", input.ref];

      if ("expected" in input) {
        args.push(input.expected ?? "");
      }

      yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitRefError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd,
            operation: formatOperation(failedArgs),
            result,
          }),
          ref: input.ref,
        }),
      );
    });

    const addAll = Effect.fn("GitCommands.addAll")(function* (cwd: string) {
      const args = ["add", "-A"];

      yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitIndexError(commonFailure({
          args: failedArgs,
          cause,
          cwd,
          operation: formatOperation(failedArgs),
          result,
        })),
      );
    });

    const commit = Effect.fn("GitCommands.commit")(function* (
      cwd: string,
      input: GitCommitCommandInput,
    ) {
      const configArgs = [
        ...(input.userName === undefined ? [] : ["-c", `user.name=${input.userName}`]),
        ...(input.userEmail === undefined ? [] : ["-c", `user.email=${input.userEmail}`]),
      ];
      const args = [
        ...configArgs,
        "commit",
        ...(input.allowEmpty === true ? ["--allow-empty"] : []),
        "-m",
        input.message,
      ];

      yield* gitRaw(spawner, cwd, args, { env: input.env }, (failedArgs, result, cause) =>
        new GitCommitError(commonFailure({
          args: failedArgs,
          cause,
          cwd,
          operation: "git commit",
          result,
        })),
      );

      return {
        cwd,
        message: input.message,
        sha: yield* head(cwd),
      };
    });

    const worktreeAddDetached = Effect.fn("GitCommands.worktreeAddDetached")(function* (
      repositoryPath: string,
      input: GitWorktreeAddDetachedInput,
    ) {
      const args = ["worktree", "add", "--detach", input.worktreePath, input.baseSha];

      yield* gitRaw(spawner, repositoryPath, args, {}, (failedArgs, result, cause) =>
        new GitWorktreeError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd: repositoryPath,
            operation: formatOperation(failedArgs),
            result,
          }),
          path: input.worktreePath,
        }),
      );

      const headSha = yield* head(input.worktreePath);
      if (headSha !== input.baseSha) {
        return yield* new GitWorktreeError({
          args,
          cwd: repositoryPath,
          message: "Created worktree HEAD does not match requested base SHA.",
          operation: "git worktree add",
          path: input.worktreePath,
        });
      }

      return {
        baseSha: input.baseSha,
        headSha,
        repositoryPath,
        worktreePath: input.worktreePath,
      };
    });

    const worktreeRemove = Effect.fn("GitCommands.worktreeRemove")(function* (
      repositoryPath: string,
      input: GitWorktreeRemoveInput,
    ) {
      const args = [
        "worktree",
        "remove",
        ...(input.force === true ? ["--force"] : []),
        input.worktreePath,
      ];

      yield* gitRaw(
        spawner,
        repositoryPath,
        args,
        { allowFailure: input.allowFailure === true },
        (failedArgs, result, cause) =>
          new GitWorktreeError({
            ...commonFailure({
              args: failedArgs,
              cause,
              cwd: repositoryPath,
              operation: formatOperation(failedArgs),
              result,
            }),
            path: input.worktreePath,
          }),
      );
    });

    const lsRemoteRef = Effect.fn("GitCommands.lsRemoteRef")(function* (
      cwd: string,
      input: GitLsRemoteRefInput,
    ) {
      const args = ["ls-remote", input.remote, input.ref];
      const result = yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new GitRemoteLookupError({
          ...commonFailure({
            args: failedArgs,
            cause,
            cwd,
            operation: formatOperation(failedArgs),
            result,
          }),
          ref: input.ref,
          remote: input.remote,
        }),
      );
      const line = bytesToString(result.stdout)
        .split("\n")
        .map((value) => value.trim())
        .find((value) => value.length > 0);

      if (line === undefined) return null;

      const target = line.split(/\s/u, 1)[0] ?? "";

      return yield* validateObjectId(target, (value) =>
        new GitRemoteLookupError({
          args,
          cwd,
          message: `git ls-remote returned an invalid object id: ${value}`,
          operation: formatOperation(args),
          ref: input.ref,
          remote: input.remote,
          stdout: sanitizeStderr(bytesToString(result.stdout)),
        }),
      );
    });

    const fetchRef = Effect.fn("GitCommands.fetchRef")(function* (
      cwd: string,
      input: GitFetchRefInput,
    ) {
      const trackingRef = input.trackingRef ?? remoteTrackingRef(input.remote, input.ref);
      const args = ["fetch", "--no-tags", input.remote, `+${input.ref}:${trackingRef}`];

      yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new RemoteFetchError({
          cause,
          message: formatGitFailure(failedArgs, result, cause),
          operation: formatOperation(failedArgs),
          remote: input.remote,
          status: result?.status,
          stderr: stderrString(result),
        }),
      );
    });

    const push = Effect.fn("GitCommands.push")(function* (
      cwd: string,
      input: GitPushCommandInput,
    ) {
      const args = [
        "push",
        ...(input.forceWithLease ?? []).map(
          (lease) => `--force-with-lease=${lease.ref}:${lease.expected ?? ""}`,
        ),
        input.remote,
        ...input.refspecs,
      ];

      yield* gitRaw(spawner, cwd, args, {}, (failedArgs, result, cause) =>
        new RemotePushError({
          cause,
          message: formatGitFailure(failedArgs, result, cause),
          operation: formatOperation(failedArgs),
          remote: input.remote,
          status: result?.status,
          stderr: stderrString(result),
        }),
      );
    });

    return GitCommands.of({
      absoluteGitDir,
      addAll,
      branchRef,
      checkBranchName,
      commit,
      commonGitDir,
      currentBranch,
      deleteRef,
      fetchRef,
      head,
      isAncestor,
      listLocalBranches,
      lsRemoteRef,
      push,
      resolveCommit,
      revList,
      showTopLevel,
      statusPorcelain,
      updateRef,
      worktreeAddDetached,
      worktreeRemove,
    });
  }),
);

export const Live = layer;
