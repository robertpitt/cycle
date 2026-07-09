import { Git } from "@cycle/git";
import { Context, Effect, Layer, Schedule } from "effect";
import { RemotePushError } from "./WorktreeErrors.ts";
import type { BranchAssociation, WorktreePushPolicy, WorktreeRecord } from "./WorktreeSchemas.ts";
import { WorktreeConfig } from "./WorktreeConfig.ts";

export type RemotePushResult =
  | {
      readonly policy: "disabled";
      readonly pushed: false;
    }
  | {
      readonly policy: "best_effort" | "required";
      readonly pushed: true;
      readonly remoteName: string;
      readonly remoteRef: string;
    }
  | {
      readonly error: RemotePushError;
      readonly policy: "best_effort";
      readonly pushed: false;
    };

export type WorktreeRemotePublisherShape = {
  readonly push: (input: {
    readonly association: BranchAssociation;
    readonly policy?: WorktreePushPolicy | undefined;
    readonly record: WorktreeRecord;
    readonly remoteName?: string | undefined;
  }) => Effect.Effect<RemotePushResult, RemotePushError>;
};

export class WorktreeRemotePublisher extends Context.Service<
  WorktreeRemotePublisher,
  WorktreeRemotePublisherShape
>()("@cycle/git-worktrees/WorktreeRemotePublisher") {}

const pushCategory = (stderr: string): string => {
  const lower = stderr.toLowerCase();
  if (lower.includes("authentication")) return "authentication";
  if (lower.includes("authorization") || lower.includes("permission")) return "authorization";
  if (lower.includes("not found")) return "remote_not_found";
  if (lower.includes("fetch first") || lower.includes("non-fast-forward")) return "branch_conflict";
  if (lower.includes("rejected")) return "rejected_push";
  if (lower.includes("network") || lower.includes("timeout")) return "network_failure";
  return "unknown_failure";
};

export const WorktreeRemotePublisherLive = Layer.effect(
  WorktreeRemotePublisher,
  Effect.gen(function* () {
    const git = yield* Git;
    const config = yield* WorktreeConfig;

    const push = Effect.fn("WorktreeRemotePublisher.push")(function* (input: {
      readonly association: BranchAssociation;
      readonly policy?: WorktreePushPolicy | undefined;
      readonly record: WorktreeRecord;
      readonly remoteName?: string | undefined;
    }) {
      const policy = input.policy ?? config.config.defaultPushPolicy;
      if (policy === "disabled") {
        return {
          policy,
          pushed: false,
        } as const;
      }

      const remoteName = input.remoteName ?? input.record.remoteName ?? "origin";
      const remoteRef = input.association.remoteRef ?? input.association.branchRef;
      const attempt = git
        .push(input.record.repositoryPath, {
          refspecs: [`${input.association.branchRef}:${remoteRef}`],
          remote: remoteName,
        })
        .pipe(
          Effect.timeout(config.config.pushTimeoutMs),
          Effect.as({ pushed: true } as const),
          Effect.mapError((cause) =>
            cause instanceof RemotePushError
              ? cause
              : mapPushError(cause, {
                  branchName: input.association.branchName,
                  path: input.record.repositoryPath,
                  policy,
                  remoteName,
                  repositoryId: input.record.repositoryId,
                  worktreeId: input.record.worktreeId,
                }),
          ),
          Effect.retry(
            Schedule.exponential("100 millis").pipe(
              Schedule.jittered,
              Schedule.both(Schedule.recurs(2)),
            ),
          ),
        );

      const pushed = yield* attempt.pipe(
        Effect.catchTag("RemotePushError", (error) => {
          if (policy === "best_effort") {
            return Effect.succeed({
              error,
              policy,
              pushed: false,
            } as const);
          }
          return Effect.fail(error);
        }),
      );

      if ("pushed" in pushed && pushed.pushed === false) return pushed;
      return {
        policy,
        pushed: true,
        remoteName,
        remoteRef,
      } as const;
    });

    return WorktreeRemotePublisher.of({
      push,
    });
  }),
);

const mapPushError = (
  cause: unknown,
  input: {
    readonly branchName: string;
    readonly path: string;
    readonly policy: WorktreePushPolicy;
    readonly remoteName: string;
    readonly repositoryId: string;
    readonly worktreeId: string;
  },
): RemotePushError => {
  const stderr =
    typeof cause === "object" &&
    cause !== null &&
    "stderr" in cause &&
    typeof (cause as { readonly stderr?: unknown }).stderr === "string"
      ? (cause as { readonly stderr: string }).stderr
      : "";
  const message =
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof (cause as { readonly message?: unknown }).message === "string"
      ? (cause as { readonly message: string }).message
      : "Remote push failed.";

  return new RemotePushError({
    branchName: input.branchName,
    category: pushCategory(stderr),
    cause,
    message: stderr.trim() || message,
    path: input.path,
    remoteName: input.remoteName,
    repositoryId: input.repositoryId,
    retryable: input.policy === "best_effort",
    worktreeId: input.worktreeId,
  });
};
