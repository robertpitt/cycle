import * as GitCommands from "@cycle/git/commands/GitCommands";
import { GitRepositoryLive } from "@cycle/git/repository/GitRepository";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, LayerMap } from "effect";
import { WorktreeBranchPublisherLive } from "./WorktreeBranchPublisher.ts";
import { WorktreeConfigLive, makeWorktreeConfigLayer } from "./WorktreeConfig.ts";
import { WorktreeFinalizerLive } from "./WorktreeFinalizer.ts";
import { WorktreeHandoverLive, WorktreeHandoverTargetNoopLive } from "./WorktreeHandover.ts";
import { WorktreeLifecycleLive } from "./WorktreeLifecycle.ts";
import { WorktreePathsLive } from "./WorktreePaths.ts";
import { WorktreeReconciler, WorktreeReconcilerLive } from "./WorktreeReconciler.ts";
import { WorktreeRemotePublisherLive } from "./WorktreeRemotePublisher.ts";
import type { RepositoryId, WorktreeRuntimeConfig } from "./WorktreeSchemas.ts";
import { WorktreeSetupLive } from "./WorktreeSetup.ts";
import { WorktreeStoreSqliteConfiguredLive } from "./WorktreeStore.ts";

export type WorktreeRepositoryInstanceDescriptor = {
  readonly config?: WorktreeRuntimeConfig | undefined;
  readonly repositoryId: string;
  readonly repositoryPath: string;
};

export type WorktreeRepositoryInstanceKey = string;

export const encodeWorktreeRepositoryInstanceKey = (
  descriptor: WorktreeRepositoryInstanceDescriptor,
): WorktreeRepositoryInstanceKey => JSON.stringify(descriptor);

export const decodeWorktreeRepositoryInstanceKey = (
  key: WorktreeRepositoryInstanceKey,
): WorktreeRepositoryInstanceDescriptor => JSON.parse(key) as WorktreeRepositoryInstanceDescriptor;

export const makeRepositoryWorktreeLayer = (descriptor: WorktreeRepositoryInstanceDescriptor) => {
  const config =
    descriptor.config === undefined
      ? WorktreeConfigLive
      : makeWorktreeConfigLayer(descriptor.config);
  const base = Layer.mergeAll(
    WorktreePathsLive,
    WorktreeStoreSqliteConfiguredLive,
    WorktreeSetupLive,
    WorktreeFinalizerLive,
  ).pipe(Layer.provide(config));
  const lifecycle = WorktreeLifecycleLive.pipe(Layer.provideMerge(base));
  const branchPublisher = WorktreeBranchPublisherLive.pipe(Layer.provideMerge(lifecycle));
  const remotePublisher = WorktreeRemotePublisherLive.pipe(Layer.provideMerge(branchPublisher));
  const handover = WorktreeHandoverLive.pipe(
    Layer.provideMerge(Layer.mergeAll(remotePublisher, WorktreeHandoverTargetNoopLive)),
  );
  const reconciler = WorktreeReconcilerLive.pipe(Layer.provideMerge(handover));
  const backgroundReconciliation = Layer.effectDiscard(
    Effect.gen(function* () {
      const service = yield* WorktreeReconciler;
      const loop = Effect.gen(function* () {
        yield* Effect.sleep("5 minutes");
        yield* service
          .reconcileRepository(descriptor.repositoryId as RepositoryId)
          .pipe(Effect.catch(() => Effect.void));
      }).pipe(Effect.forever);

      yield* loop.pipe(Effect.forkScoped);
    }),
  );

  return backgroundReconciliation.pipe(Layer.provideMerge(reconciler));
};

export class WorktreeInstances extends LayerMap.Service<WorktreeInstances>()(
  "@cycle/git-worktrees/WorktreeInstances",
  {
    idleTimeToLive: "5 minutes",
    lookup: (key: WorktreeRepositoryInstanceKey) =>
      Layer.fresh(makeRepositoryWorktreeLayer(decodeWorktreeRepositoryInstanceKey(key))).pipe(
        Layer.provide(Layer.mergeAll(NodeServices.layer, GitRepositoryLive, GitCommands.Live)),
      ),
  },
) {}

export const WorktreeInstancesLive = WorktreeInstances.layer;
