import { Git } from "@cycle/git";
import { Context, Effect, Layer, Ref, Semaphore } from "effect";
import {
  BranchCollisionError,
  BranchNameError,
  BranchPublishError,
  WorktreeStateConflictError,
  WorktreeLeaseConflictError,
  WorktreeNotFoundError,
  WorktreeStoreError,
} from "./WorktreeErrors.ts";
import type { BranchAssociation, ObjectId, WorktreeRecord } from "./WorktreeSchemas.ts";
import { WorktreeStore } from "./WorktreeStore.ts";
import {
  implementationBranchName,
  refForBranch,
  resolveBranchCollision,
} from "./internal/branch.ts";
import { newBranchAssociationId } from "./internal/ids.ts";

export type BranchPublication = {
  readonly association: BranchAssociation;
  readonly branchName: string;
  readonly branchRef: string;
};

export type WorktreeBranchPublisherShape = {
  readonly publish: (input: {
    readonly desiredBranchName?: string | undefined;
    readonly fencingToken?: number | undefined;
    readonly handoverId?: string | undefined;
    readonly record: WorktreeRecord;
    readonly targetSha: ObjectId;
  }) => Effect.Effect<
    BranchPublication,
    | BranchNameError
    | BranchCollisionError
    | BranchPublishError
    | WorktreeStoreError
    | WorktreeStateConflictError
    | WorktreeLeaseConflictError
    | WorktreeNotFoundError
  >;
};

export class WorktreeBranchPublisher extends Context.Service<
  WorktreeBranchPublisher,
  WorktreeBranchPublisherShape
>()("@cycle/git-worktrees/WorktreeBranchPublisher") {}

export const WorktreeBranchPublisherLive = Layer.effect(
  WorktreeBranchPublisher,
  Effect.gen(function* () {
    const git = yield* Git;
    const store = yield* WorktreeStore;
    const semaphores = yield* Ref.make(new Map<string, Semaphore.Semaphore>());

    const semaphoreFor = Effect.fn("WorktreeBranchPublisher.semaphoreFor")(function* (key: string) {
      const created = yield* Semaphore.make(1);
      return yield* Ref.modify(semaphores, (state) => {
        const existing = state.get(key);
        return existing === undefined
          ? [created, new Map(state).set(key, created)]
          : [existing, state];
      });
    });

    const listBranches = (repositoryPath: string) =>
      git.listLocalBranches(repositoryPath).pipe(
        Effect.mapError(
          (cause) =>
            new BranchPublishError({
              cause,
              message: "Git branch publication command failed: git for-each-ref",
              operation: "git for-each-ref",
              path: repositoryPath,
            }),
        ),
      );

    const checkBranchName = (repositoryPath: string, branchName: string) =>
      git.checkBranchName(repositoryPath, branchName).pipe(
        Effect.mapError(
          (cause) =>
            new BranchNameError({
              branchName,
              cause,
              message: `Invalid branch name: ${branchName}`,
              path: repositoryPath,
            }),
        ),
      );

    const publish = Effect.fn("WorktreeBranchPublisher.publish")(function* (input: {
      readonly desiredBranchName?: string | undefined;
      readonly fencingToken?: number | undefined;
      readonly handoverId?: string | undefined;
      readonly record: WorktreeRecord;
      readonly targetSha: ObjectId;
    }) {
      const ticketId = input.record.ticketId;
      if (ticketId === undefined) {
        return yield* new BranchNameError({
          branchName: input.desiredBranchName ?? "",
          message: "Implementation branch publication requires a ticket id.",
          repositoryId: input.record.repositoryId,
          worktreeId: input.record.worktreeId,
        });
      }

      const desiredBranchName =
        input.desiredBranchName ??
        input.record.desiredBranchName ??
        implementationBranchName({
          ticketId,
          ticketSlugSource: input.record.ticketSlugSource,
          ticketType: input.record.ticketType,
        });
      const branchSemaphore = yield* semaphoreFor(
        `${input.record.repositoryId}:${desiredBranchName}`,
      );

      return yield* branchSemaphore.withPermit(
        Effect.gen(function* () {
          yield* checkBranchName(input.record.repositoryPath, desiredBranchName);
          const existingBranches = yield* listBranches(input.record.repositoryPath);
          const existingAssociation = yield* store.findBranchAssociationByBranch(
            input.record.repositoryId,
            desiredBranchName,
          );
          const collision = yield* resolveBranchCollision({
            desiredBranchName,
            existingAssociations:
              existingAssociation === null
                ? []
                : [
                    {
                      branchName: existingAssociation.branchName,
                      ticketId: existingAssociation.ticketId,
                    },
                  ],
            existingBranches,
            repositoryId: input.record.repositoryId,
            ticketId,
          });
          yield* checkBranchName(input.record.repositoryPath, collision.branchName);
          yield* git
            .updateRef(input.record.repositoryPath, {
              ref: refForBranch(collision.branchName),
              target: input.targetSha,
            })
            .pipe(
              Effect.mapError(
                (cause) =>
                  new BranchPublishError({
                    cause,
                    message: "Git branch publication command failed: git update-ref",
                    operation: "git update-ref",
                    path: input.record.repositoryPath,
                  }),
              ),
            );

          const timestamp = new Date().toISOString();
          const association: BranchAssociation = {
            baseSha: input.record.baseSha,
            branchAssociationId: newBranchAssociationId(),
            branchName: collision.branchName,
            branchRef: refForBranch(collision.branchName),
            createdAt: timestamp,
            headSha: input.targetSha,
            jobId: input.record.jobId,
            repositoryId: input.record.repositoryId,
            status: "active",
            ticketId,
            updatedAt: timestamp,
            worktreeId: input.record.worktreeId,
            ...(input.handoverId === undefined ? {} : { handoverId: input.handoverId as never }),
          };
          const persisted = yield* store.publishBranchAssociation({
            association,
            fencingToken: input.fencingToken,
            worktreeId: input.record.worktreeId,
          });

          return {
            association: persisted,
            branchName: persisted.branchName,
            branchRef: persisted.branchRef,
          };
        }),
      );
    });

    return WorktreeBranchPublisher.of({
      publish,
    });
  }),
);
