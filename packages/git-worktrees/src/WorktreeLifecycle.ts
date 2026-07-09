import { GitCommands } from "@cycle/git/commands/GitCommands";
import { Context, Effect, FileSystem, Layer, Path, Schedule } from "effect";
import {
  WorktreeCreateError,
  WorktreeLeaseConflictError,
  WorktreeNotFoundError,
  WorktreePathPolicyError,
  WorktreeSetupError,
  WorktreeStateConflictError,
  WorktreeStoreError,
} from "./WorktreeErrors.ts";
import {
  type AgentRunId,
  type JobId,
  type RepositoryId,
  type TicketId,
  type WorktreeLease,
  type WorktreeMode,
  type WorktreeRecord,
  type WorktreeSetupProfile,
} from "./WorktreeSchemas.ts";
import { WorktreeConfig } from "./WorktreeConfig.ts";
import { WorktreePaths, type WorktreePathPolicy } from "./WorktreePaths.ts";
import { WorktreeSetup } from "./WorktreeSetup.ts";
import { WorktreeStore } from "./WorktreeStore.ts";
import { implementationBranchName } from "./internal/branch.ts";
import { newWorktreeId } from "./internal/ids.ts";

export type CreateWorktreeInput = {
  readonly baseRef?: string | undefined;
  readonly jobId: JobId;
  readonly mode: WorktreeMode;
  readonly pathPolicy?: WorktreePathPolicy | undefined;
  readonly remoteName?: string | undefined;
  readonly repositoryId: RepositoryId;
  readonly repositoryPath: string;
  readonly setupProfile?: WorktreeSetupProfile | undefined;
  readonly ticketId?: TicketId | undefined;
  readonly ticketSlugSource?: string | undefined;
  readonly ticketType?: string | undefined;
};

export type AgentWorktreeContext = {
  readonly authorityMode: "implementation-worktree" | "disposable-worktree";
  readonly baseSha: string;
  readonly branchName?: string | undefined;
  readonly jobId: JobId;
  readonly lease: WorktreeLease;
  readonly repositoryId: RepositoryId;
  readonly setupProfileId?: string | undefined;
  readonly ticketId?: TicketId | undefined;
  readonly worktreeId: string;
  readonly workspacePath: string;
};

export type WorktreeLifecycleShape = {
  readonly acquireForAgentRun: (input: {
    readonly actor: string;
    readonly agentRunId: AgentRunId;
    readonly ownerId: string;
    readonly worktreeId: string;
  }) => Effect.Effect<
    AgentWorktreeContext,
    | WorktreeStoreError
    | WorktreeNotFoundError
    | WorktreeLeaseConflictError
    | WorktreeStateConflictError
  >;
  readonly cleanup: (input: {
    readonly actor: string;
    readonly fencingToken?: number | undefined;
    readonly record: WorktreeRecord;
  }) => Effect.Effect<
    WorktreeRecord,
    | WorktreeCreateError
    | WorktreeStoreError
    | WorktreeNotFoundError
    | WorktreeStateConflictError
    | WorktreeLeaseConflictError
    | WorktreePathPolicyError
  >;
  readonly create: (
    input: CreateWorktreeInput,
  ) => Effect.Effect<
    WorktreeRecord,
    | WorktreeCreateError
    | WorktreeStoreError
    | WorktreeLeaseConflictError
    | WorktreeNotFoundError
    | WorktreeStateConflictError
    | WorktreePathPolicyError
    | WorktreeSetupError
  >;
  readonly retain: (input: {
    readonly actor: string;
    readonly reason: string;
    readonly record: WorktreeRecord;
  }) => Effect.Effect<
    WorktreeRecord,
    | WorktreeStoreError
    | WorktreeNotFoundError
    | WorktreeStateConflictError
    | WorktreeLeaseConflictError
  >;
};

export class WorktreeLifecycle extends Context.Service<WorktreeLifecycle, WorktreeLifecycleShape>()(
  "@cycle/git-worktrees/WorktreeLifecycle",
) {}

const leaseDeadline = (durationMs: number): string =>
  new Date(Date.now() + durationMs).toISOString();

export const WorktreeLifecycleLive = Layer.effect(
  WorktreeLifecycle,
  Effect.gen(function* () {
    const config = yield* WorktreeConfig;
    const paths = yield* WorktreePaths;
    const setup = yield* WorktreeSetup;
    const store = yield* WorktreeStore;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const git = yield* GitCommands;

    const mapGitCreateError = (operation: string, path: string, cause: unknown) =>
      new WorktreeCreateError({
        cause,
        message: `Git worktree command failed: ${operation}`,
        operation,
        path,
      });

    const release = (lease: WorktreeLease) =>
      store.releaseLease(lease.leaseId, lease.fencingToken).pipe(Effect.catch(() => Effect.void));

    const create = Effect.fn("WorktreeLifecycle.create")(function* (input: CreateWorktreeInput) {
      const repository = yield* paths
        .resolveRepository({
          repositoryId: input.repositoryId,
          repositoryPath: input.repositoryPath,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new WorktreeCreateError({
                cause,
                message: cause.message,
                operation: "resolveRepository",
                path: input.repositoryPath,
                repositoryId: input.repositoryId,
              }),
          ),
        );
      const baseRef = input.baseRef ?? "HEAD";
      const baseSha = yield* paths.resolveBaseSha(repository.primaryPath, baseRef).pipe(
        Effect.mapError(
          (cause) =>
            new WorktreeCreateError({
              cause,
              message: cause.message,
              operation: "resolveBaseSha",
              path: repository.primaryPath,
              repositoryId: input.repositoryId,
            }),
        ),
      );
      const worktreeId = newWorktreeId();
      const allocatedPath = yield* paths.allocateWorktreePath({
        repositoryId: input.repositoryId,
        worktreeId,
      });
      const worktreePath = yield* paths.validateWorktreePath({
        candidatePath: allocatedPath,
        policy: input.pathPolicy,
        repository,
      });
      const desiredBranchName =
        input.mode === "implementation" && input.ticketId !== undefined
          ? implementationBranchName({
              ticketId: input.ticketId,
              ticketSlugSource: input.ticketSlugSource,
              ticketType: input.ticketType,
            })
          : undefined;
      const timestamp = new Date().toISOString();
      yield* store.createWorktreeRecord({
        baseRef,
        baseSha,
        cleanupPolicy: config.config.cleanupPolicy,
        commonGitDir: repository.commonGitDir,
        createdAt: timestamp,
        gitDir: repository.gitDir,
        jobId: input.jobId,
        mode: input.mode,
        path: worktreePath,
        remoteName: input.remoteName,
        repositoryId: input.repositoryId,
        repositoryPath: repository.primaryPath,
        setupDirtyPolicy: input.setupProfile?.dirtyPolicy ?? "require_clean",
        setupProfileId: input.setupProfile?.profileId,
        status: "creating",
        storageRoot: config.config.storageRoot,
        ticketId: input.ticketId,
        ticketSlugSource: input.ticketSlugSource,
        ticketType: input.ticketType,
        updatedAt: timestamp,
        worktreeId,
        desiredBranchName,
      });

      const acquire = store.acquireLease({
        actor: "worktree-lifecycle",
        heartbeatDeadline: leaseDeadline(config.config.leaseDurationMs),
        ownerId: `create:${worktreeId}`,
        purpose: "create",
        worktreeId,
      });

      return yield* Effect.acquireUseRelease(
        acquire,
        (lease) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              yield* fs.makeDirectory(path.dirname(worktreePath), { recursive: true }).pipe(
                Effect.mapError(
                  (cause) =>
                    new WorktreeCreateError({
                      cause,
                      message: "Unable to create worktree parent directory.",
                      operation: "mkdir",
                      path: path.dirname(worktreePath),
                      repositoryId: input.repositoryId,
                      worktreeId,
                    }),
                ),
              );
              yield* restore(
                git
                  .worktreeAddDetached(repository.primaryPath, {
                    baseSha,
                    worktreePath,
                  })
                  .pipe(
                    Effect.mapError((cause) =>
                      mapGitCreateError("git worktree add", worktreePath, cause),
                    ),
                  ),
              );
              let record = yield* store.transitionWithEvent({
                actor: "worktree-lifecycle",
                eventType: "worktree.initialising",
                expectedStatus: "creating",
                fencingToken: lease.fencingToken,
                nextStatus: "initialising",
                worktreeId,
              });
              const setupRun = yield* restore(setup.run({ profile: input.setupProfile, record }));
              yield* store.createSetupRun(setupRun);
              record = yield* store.recordSetupResult({
                fencingToken: lease.fencingToken,
                run: setupRun,
                worktreeId,
              });
              return yield* store.transitionWithEvent({
                actor: "worktree-lifecycle",
                eventType: "worktree.ready",
                expectedStatus: "initialising",
                fencingToken: lease.fencingToken,
                nextStatus: "ready",
                payload: {
                  readySha: setupRun.readySha,
                  setupRunId: setupRun.setupRunId,
                },
                worktreeId,
              });
            }).pipe(
              Effect.catchTags({
                WorktreeCreateError: (error) =>
                  store
                    .transitionWithEvent({
                      actor: "worktree-lifecycle",
                      eventType: "worktree.create_failed",
                      expectedStatus: "creating",
                      fencingToken: lease.fencingToken,
                      nextStatus: "failed",
                      payload: { message: error.message },
                      worktreeId,
                    })
                    .pipe(
                      Effect.catch(() => Effect.void),
                      Effect.andThen(Effect.fail(error)),
                    ),
                WorktreeSetupError: (error) =>
                  store
                    .transitionWithEvent({
                      actor: "worktree-lifecycle",
                      eventType: "worktree.setup_failed",
                      expectedStatus: "initialising",
                      fencingToken: lease.fencingToken,
                      nextStatus: "failed",
                      payload: { message: error.message },
                      worktreeId,
                    })
                    .pipe(
                      Effect.catch(() => Effect.void),
                      Effect.andThen(Effect.fail(error)),
                    ),
              }),
            ),
          ),
        release,
      );
    });

    const acquireForAgentRun = Effect.fn("WorktreeLifecycle.acquireForAgentRun")(function* (input: {
      readonly actor: string;
      readonly agentRunId: AgentRunId;
      readonly ownerId: string;
      readonly worktreeId: string;
    }) {
      const record = yield* store.get(input.worktreeId as never);
      if (record.status !== "ready") {
        return yield* new WorktreeStateConflictError({
          currentStatus: record.status,
          expectedStatus: "ready",
          message: "Agent runs can only acquire ready worktrees.",
          repositoryId: record.repositoryId,
          worktreeId: record.worktreeId,
        });
      }
      const lease = yield* store.acquireLease({
        actor: input.actor,
        heartbeatDeadline: leaseDeadline(config.config.leaseDurationMs),
        ownerId: input.ownerId,
        purpose: "agent",
        worktreeId: record.worktreeId,
      });
      return {
        authorityMode:
          record.mode === "implementation"
            ? ("implementation-worktree" as const)
            : ("disposable-worktree" as const),
        baseSha: record.baseSha,
        branchName: record.desiredBranchName,
        jobId: record.jobId,
        lease,
        repositoryId: record.repositoryId,
        setupProfileId: record.setupProfileId,
        ticketId: record.ticketId,
        worktreeId: record.worktreeId,
        workspacePath: record.path,
      };
    });

    const cleanup = Effect.fn("WorktreeLifecycle.cleanup")(function* (input: {
      readonly actor: string;
      readonly fencingToken?: number | undefined;
      readonly record: WorktreeRecord;
    }) {
      const record =
        input.record.status === "removing"
          ? input.record
          : yield* store.transitionWithEvent({
              actor: input.actor,
              eventType: "worktree.removing",
              expectedStatus: input.record.status,
              fencingToken: input.fencingToken,
              nextStatus: "removing",
              worktreeId: input.record.worktreeId,
            });

      yield* git
        .worktreeRemove(record.repositoryPath, {
          allowFailure: true,
          force: true,
          worktreePath: record.path,
        })
        .pipe(
          Effect.mapError((cause) =>
            mapGitCreateError("git worktree remove", record.path, cause),
          ),
          Effect.retry(
            Schedule.exponential("100 millis").pipe(
              Schedule.jittered,
              Schedule.both(Schedule.recurs(2)),
            ),
          ),
        );
      yield* fs.remove(record.path, { force: true, recursive: true }).pipe(
        Effect.retry(
          Schedule.exponential("100 millis").pipe(
            Schedule.jittered,
            Schedule.both(Schedule.recurs(2)),
          ),
        ),
        Effect.mapError(
          (cause) =>
            new WorktreeCreateError({
              cause,
              message: "Unable to remove worktree directory.",
              operation: "cleanup",
              path: record.path,
              repositoryId: record.repositoryId,
              worktreeId: record.worktreeId,
            }),
        ),
      );

      return yield* store.transitionWithEvent({
        actor: input.actor,
        eventType: "worktree.removed",
        expectedStatus: "removing",
        fencingToken: input.fencingToken,
        nextStatus: "removed",
        worktreeId: record.worktreeId,
      });
    });

    const retain = Effect.fn("WorktreeLifecycle.retain")(function* (input: {
      readonly actor: string;
      readonly reason: string;
      readonly record: WorktreeRecord;
    }) {
      return yield* store.transitionWithEvent({
        actor: input.actor,
        eventType: "worktree.retained",
        expectedStatus: input.record.status,
        nextStatus: "retained",
        payload: { reason: input.reason },
        worktreeId: input.record.worktreeId,
      });
    });

    return WorktreeLifecycle.of({
      acquireForAgentRun,
      cleanup,
      create,
      retain,
    });
  }),
);
