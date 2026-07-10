import { Context, Effect, Layer } from "effect";
import { WorktreeStoreError, type WorktreeError } from "./WorktreeErrors.ts";
import { WorktreeHandover } from "./WorktreeHandover.ts";
import {
  type AgentWorktreeContext,
  type CreateWorktreeInput,
  WorktreeLifecycle,
  type WorktreeLifecycleShape,
} from "./WorktreeLifecycle.ts";
import { WorktreeReconciler, type WorktreeReconciliationResult } from "./WorktreeReconciler.ts";
import type { RepositoryId, WorktreeHandoverRecord, WorktreeRecord } from "./WorktreeSchemas.ts";
import { WorktreeStore } from "./WorktreeStore.ts";
import type { WorktreeHandoverShape } from "./WorktreeHandover.ts";
import {
  WorktreeInstances,
  WorktreeInstancesLive,
  type WorktreeRepositoryInstanceDescriptor,
  encodeWorktreeRepositoryInstanceKey,
} from "./WorktreeInstances.ts";

export type WorktreesShape = {
  readonly acquireForAgentRun: (
    descriptor: WorktreeRepositoryInstanceDescriptor,
    input: Parameters<WorktreeLifecycleShape["acquireForAgentRun"]>[0],
  ) => Effect.Effect<AgentWorktreeContext, WorktreeError>;
  readonly create: (
    descriptor: WorktreeRepositoryInstanceDescriptor,
    input: CreateWorktreeInput,
  ) => Effect.Effect<WorktreeRecord, WorktreeError>;
  readonly cleanup: (
    descriptor: WorktreeRepositoryInstanceDescriptor,
    input: Parameters<WorktreeLifecycleShape["cleanup"]>[0],
  ) => Effect.Effect<WorktreeRecord, WorktreeError>;
  readonly handover: (
    descriptor: WorktreeRepositoryInstanceDescriptor,
    input: Parameters<WorktreeHandoverShape["handover"]>[0],
  ) => Effect.Effect<WorktreeHandoverRecord, WorktreeError>;
  readonly get: (
    descriptor: WorktreeRepositoryInstanceDescriptor,
    worktreeId: string,
  ) => Effect.Effect<WorktreeRecord, WorktreeError>;
  readonly findHandover: (
    descriptor: WorktreeRepositoryInstanceDescriptor,
    handoverId: string,
  ) => Effect.Effect<WorktreeHandoverRecord | null, WorktreeError>;
  readonly reconcileRepository: (
    descriptor: WorktreeRepositoryInstanceDescriptor,
    repositoryId: RepositoryId,
  ) => Effect.Effect<WorktreeReconciliationResult, WorktreeError>;
};

export class Worktrees extends Context.Service<Worktrees, WorktreesShape>()(
  "@cycle/git-worktrees/Worktrees",
) {}

const isWorktreeError = (cause: unknown): cause is WorktreeError => {
  if (typeof cause !== "object" || cause === null || !("_tag" in cause)) return false;
  const tag = String(cause._tag);
  return (
    tag.startsWith("Worktree") ||
    tag.startsWith("Branch") ||
    tag.startsWith("RemotePush") ||
    tag.startsWith("Handover") ||
    tag === "NoWorktreeChangesError"
  );
};

const normalizeFacadeError =
  (operation: string) =>
  (cause: unknown): WorktreeError =>
    isWorktreeError(cause)
      ? cause
      : new WorktreeStoreError({
          cause,
          message: `Unable to acquire git-worktrees runtime for ${operation}.`,
          operation,
        });

export const WorktreesLive = Layer.effect(
  Worktrees,
  Effect.gen(function* () {
    const instances = yield* WorktreeInstances;
    const layerFor = (descriptor: WorktreeRepositoryInstanceDescriptor) =>
      instances.get(encodeWorktreeRepositoryInstanceKey(descriptor));
    const withRepositoryLayer = <A, E, R>(
      descriptor: WorktreeRepositoryInstanceDescriptor,
      operation: string,
      effect: Effect.Effect<A, E, R>,
    ) =>
      effect.pipe(
        Effect.provide(layerFor(descriptor)),
        Effect.mapError(normalizeFacadeError(operation)),
      );

    const create = Effect.fn("Worktrees.create")(function* (
      descriptor: WorktreeRepositoryInstanceDescriptor,
      input: CreateWorktreeInput,
    ) {
      return yield* withRepositoryLayer(
        descriptor,
        "create",
        Effect.flatMap(WorktreeLifecycle, (lifecycle) => lifecycle.create(input)),
      );
    });

    const cleanup = Effect.fn("Worktrees.cleanup")(function* (
      descriptor: WorktreeRepositoryInstanceDescriptor,
      input: Parameters<WorktreeLifecycleShape["cleanup"]>[0],
    ) {
      return yield* withRepositoryLayer(
        descriptor,
        "cleanup",
        Effect.flatMap(WorktreeLifecycle, (lifecycle) => lifecycle.cleanup(input)),
      );
    });

    const acquireForAgentRun = Effect.fn("Worktrees.acquireForAgentRun")(function* (
      descriptor: WorktreeRepositoryInstanceDescriptor,
      input: Parameters<WorktreeLifecycleShape["acquireForAgentRun"]>[0],
    ) {
      return yield* withRepositoryLayer(
        descriptor,
        "acquireForAgentRun",
        Effect.flatMap(WorktreeLifecycle, (lifecycle) => lifecycle.acquireForAgentRun(input)),
      );
    });

    const handover = Effect.fn("Worktrees.handover")(function* (
      descriptor: WorktreeRepositoryInstanceDescriptor,
      input: Parameters<WorktreeHandoverShape["handover"]>[0],
    ) {
      return yield* withRepositoryLayer(
        descriptor,
        "handover",
        Effect.flatMap(WorktreeHandover, (service) => service.handover(input)),
      );
    });

    const get = Effect.fn("Worktrees.get")(function* (
      descriptor: WorktreeRepositoryInstanceDescriptor,
      worktreeId: string,
    ) {
      return yield* withRepositoryLayer(
        descriptor,
        "get",
        Effect.flatMap(WorktreeStore, (store) => store.get(worktreeId as never)),
      );
    });

    const findHandover = Effect.fn("Worktrees.findHandover")(function* (
      descriptor: WorktreeRepositoryInstanceDescriptor,
      handoverId: string,
    ) {
      return yield* withRepositoryLayer(
        descriptor,
        "findHandover",
        Effect.flatMap(WorktreeStore, (store) => store.findHandover(handoverId as never)),
      );
    });

    const reconcileRepository = Effect.fn("Worktrees.reconcileRepository")(function* (
      descriptor: WorktreeRepositoryInstanceDescriptor,
      repositoryId: RepositoryId,
    ) {
      return yield* withRepositoryLayer(
        descriptor,
        "reconcileRepository",
        Effect.flatMap(WorktreeReconciler, (reconciler) =>
          reconciler.reconcileRepository(repositoryId),
        ),
      );
    });

    return Worktrees.of({
      acquireForAgentRun,
      cleanup,
      create,
      findHandover,
      get,
      handover,
      reconcileRepository,
    });
  }),
).pipe(Layer.provide(WorktreeInstancesLive));
