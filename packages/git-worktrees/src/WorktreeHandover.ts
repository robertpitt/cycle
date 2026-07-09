import { Context, Effect, Layer } from "effect";
import {
  HandoverTargetError,
  WorktreeStateConflictError,
  type WorktreeError,
} from "./WorktreeErrors.ts";
import type { WorktreeHandoverRecord, WorktreePushPolicy } from "./WorktreeSchemas.ts";
import { WorktreeBranchPublisher } from "./WorktreeBranchPublisher.ts";
import { WorktreeConfig } from "./WorktreeConfig.ts";
import { WorktreeFinalizer } from "./WorktreeFinalizer.ts";
import { WorktreeLifecycle } from "./WorktreeLifecycle.ts";
import { WorktreeRemotePublisher } from "./WorktreeRemotePublisher.ts";
import { WorktreeStore } from "./WorktreeStore.ts";
import { newWorktreeHandoverId } from "./internal/ids.ts";

export type HandoverTargetInput = {
  readonly branchName?: string | undefined;
  readonly commits: ReadonlyArray<string>;
  readonly dedupeKey: string;
  readonly handoverId: string;
  readonly jobId: string;
  readonly remoteRef?: string | undefined;
  readonly repositoryId: string;
  readonly summary?: string | undefined;
  readonly targetStatus?: string | undefined;
  readonly ticketId?: string | undefined;
  readonly validation?: string | undefined;
  readonly worktreeId: string;
};

export type HandoverTargetResult = {
  readonly commentId?: string | undefined;
  readonly pullRequestUrl?: string | undefined;
};

export type WorktreeHandoverTargetShape = {
  readonly attachBranch: (input: HandoverTargetInput) => Effect.Effect<void, HandoverTargetError>;
  readonly createPullRequest: (
    input: HandoverTargetInput,
  ) => Effect.Effect<HandoverTargetResult, HandoverTargetError>;
  readonly publishComment: (
    input: HandoverTargetInput,
  ) => Effect.Effect<HandoverTargetResult, HandoverTargetError>;
  readonly transitionTicket: (
    input: HandoverTargetInput,
  ) => Effect.Effect<void, HandoverTargetError>;
};

export class WorktreeHandoverTarget extends Context.Service<
  WorktreeHandoverTarget,
  WorktreeHandoverTargetShape
>()("@cycle/git-worktrees/WorktreeHandoverTarget") {}

export const WorktreeHandoverTargetNoopLive = Layer.succeed(
  WorktreeHandoverTarget,
  WorktreeHandoverTarget.of({
    attachBranch: () => Effect.void,
    createPullRequest: () => Effect.succeed({}),
    publishComment: () => Effect.succeed({}),
    transitionTicket: () => Effect.void,
  }),
);

export type WorktreeHandoverShape = {
  readonly handover: (input: {
    readonly allowEmpty?: boolean | undefined;
    readonly actor: string;
    readonly handoverId?: string | undefined;
    readonly message: string;
    readonly pushPolicy?: WorktreePushPolicy | undefined;
    readonly summary?: string | undefined;
    readonly targetStatus?: string | undefined;
    readonly validation?: string | undefined;
    readonly worktreeId: string;
  }) => Effect.Effect<WorktreeHandoverRecord, WorktreeError>;
};

export class WorktreeHandover extends Context.Service<WorktreeHandover, WorktreeHandoverShape>()(
  "@cycle/git-worktrees/WorktreeHandover",
) {}

const leaseDeadline = (durationMs: number): string =>
  new Date(Date.now() + durationMs).toISOString();

export const WorktreeHandoverLive = Layer.effect(
  WorktreeHandover,
  Effect.gen(function* () {
    const branchPublisher = yield* WorktreeBranchPublisher;
    const config = yield* WorktreeConfig;
    const finalizer = yield* WorktreeFinalizer;
    const lifecycle = yield* WorktreeLifecycle;
    const remotePublisher = yield* WorktreeRemotePublisher;
    const store = yield* WorktreeStore;
    const target = yield* WorktreeHandoverTarget;

    const handover = Effect.fn("WorktreeHandover.handover")(function* (input: {
      readonly allowEmpty?: boolean | undefined;
      readonly actor: string;
      readonly handoverId?: string | undefined;
      readonly message: string;
      readonly pushPolicy?: WorktreePushPolicy | undefined;
      readonly summary?: string | undefined;
      readonly targetStatus?: string | undefined;
      readonly validation?: string | undefined;
      readonly worktreeId: string;
    }) {
      const record = yield* store.get(input.worktreeId as never);
      if (record.status !== "ready") {
        return yield* new WorktreeStateConflictError({
          currentStatus: record.status,
          expectedStatus: "ready",
          message: "Only ready worktrees can be handed over.",
          repositoryId: record.repositoryId,
          worktreeId: record.worktreeId,
        });
      }
      const handoverId = (input.handoverId ?? newWorktreeHandoverId()) as never;
      const lease = yield* store.acquireLease({
        actor: input.actor,
        heartbeatDeadline: leaseDeadline(config.config.leaseDurationMs),
        ownerId: `handover:${handoverId}`,
        purpose: "handover",
        worktreeId: record.worktreeId,
      });

      return yield* Effect.acquireUseRelease(
        Effect.succeed(lease),
        (lease) =>
          Effect.gen(function* () {
            const now = new Date().toISOString();
            let handoverRecord = yield* store.createHandover({
              commits: [],
              completedSteps: [],
              createdAt: now,
              currentStep: "prepare_output",
              handoverId,
              jobId: record.jobId,
              repositoryId: record.repositoryId,
              status: "in_progress",
              summary: input.summary,
              targetStatus: input.targetStatus,
              ticketId: record.ticketId,
              updatedAt: now,
              validation: input.validation,
              worktreeId: record.worktreeId,
            });

            const finalized = yield* finalizer.finalize({
              allowEmpty: input.allowEmpty,
              message: input.message,
              record,
            });
            handoverRecord = yield* store.updateHandoverStep({
              commits: finalized.commits,
              completedStep: "prepare_output",
              currentStep: "publish_branch",
              fencingToken: lease.fencingToken,
              handoverId,
              worktreeId: record.worktreeId,
            });

            const publication =
              record.mode === "implementation"
                ? yield* branchPublisher.publish({
                    fencingToken: lease.fencingToken,
                    handoverId,
                    record,
                    targetSha: finalized.headSha,
                  })
                : undefined;
            handoverRecord = yield* store.updateHandoverStep({
              branchAssociationId: publication?.association.branchAssociationId,
              branchName: publication?.branchName,
              completedStep: "publish_branch",
              currentStep: "push_branch",
              fencingToken: lease.fencingToken,
              handoverId,
              worktreeId: record.worktreeId,
            });

            const push =
              publication === undefined
                ? ({ pushed: false, policy: "disabled" as const } as const)
                : yield* remotePublisher.push({
                    association: publication.association,
                    policy: input.pushPolicy,
                    record,
                  });
            const pushedRemoteName = "remoteName" in push ? push.remoteName : undefined;
            const pushedRemoteRef = "remoteRef" in push ? push.remoteRef : undefined;
            handoverRecord = yield* store.updateHandoverStep({
              completedStep: "push_branch",
              currentStep: "deliver_handover",
              fencingToken: lease.fencingToken,
              handoverId,
              remoteName: pushedRemoteName,
              remoteRef: pushedRemoteRef,
              worktreeId: record.worktreeId,
            });

            const targetInput: HandoverTargetInput = {
              branchName: publication?.branchName,
              commits: finalized.commits,
              dedupeKey: `${handoverId}:deliver`,
              handoverId,
              jobId: record.jobId,
              remoteRef: pushedRemoteRef,
              repositoryId: record.repositoryId,
              summary: input.summary,
              targetStatus: input.targetStatus ?? "needs-review",
              ticketId: record.ticketId,
              validation: input.validation,
              worktreeId: record.worktreeId,
            };
            yield* target.attachBranch(targetInput);
            const comment = yield* target.publishComment(targetInput);
            yield* target.transitionTicket(targetInput);
            const pullRequest = yield* target.createPullRequest(targetInput);

            handoverRecord = yield* store.updateHandoverStep({
              commentId: comment.commentId,
              completedStep: "deliver_handover",
              currentStep: "remove_worktree",
              fencingToken: lease.fencingToken,
              handoverId,
              pullRequestUrl: pullRequest.pullRequestUrl,
              worktreeId: record.worktreeId,
            });

            yield* lifecycle.cleanup({
              actor: input.actor,
              fencingToken: lease.fencingToken,
              record,
            });
            handoverRecord = yield* store.updateHandoverStep({
              completedStep: "remove_worktree",
              fencingToken: lease.fencingToken,
              handoverId,
              status: "completed",
              worktreeId: record.worktreeId,
            });
            return handoverRecord;
          }).pipe(
            Effect.catch((error) =>
              store
                .updateHandoverStep({
                  fencingToken: lease.fencingToken,
                  handoverId,
                  lastError: {
                    message: error instanceof Error ? error.message : String(error),
                    tag:
                      typeof error === "object" && error !== null && "_tag" in error
                        ? String(error._tag)
                        : undefined,
                  },
                  status: "failed",
                  worktreeId: record.worktreeId,
                })
                .pipe(
                  Effect.catch(() => Effect.void),
                  Effect.andThen(Effect.fail(error)),
                ),
            ),
          ),
        (lease) =>
          store
            .releaseLease(lease.leaseId, lease.fencingToken)
            .pipe(Effect.catch(() => Effect.void)),
      );
    });

    return WorktreeHandover.of({
      handover,
    });
  }),
);
