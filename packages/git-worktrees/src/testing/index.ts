import { makeInMemorySqliteLayer } from "@cycle/sqlite/testing";
import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { GitRepositoryLive } from "@cycle/git/repository/GitRepository";
import { WorktreeBranchPublisherLive } from "../WorktreeBranchPublisher.ts";
import { makeWorktreeConfigLayer } from "../WorktreeConfig.ts";
import { WorktreeFinalizerLive } from "../WorktreeFinalizer.ts";
import { WorktreeHandoverLive, WorktreeHandoverTargetNoopLive } from "../WorktreeHandover.ts";
import { WorktreeLifecycleLive } from "../WorktreeLifecycle.ts";
import { WorktreePathsLive } from "../WorktreePaths.ts";
import { WorktreeReconcilerLive } from "../WorktreeReconciler.ts";
import { WorktreeRemotePublisherLive } from "../WorktreeRemotePublisher.ts";
import type { WorktreeRuntimeConfig } from "../WorktreeSchemas.ts";
import { WorktreeSetupLive } from "../WorktreeSetup.ts";
import { WorktreeStoreSqliteLive, worktreeStoreMigrations } from "../WorktreeStore.ts";

export const makeTestWorktreeConfig = (
  overrides: Partial<WorktreeRuntimeConfig> &
    Pick<WorktreeRuntimeConfig, "databasePath" | "storageRoot">,
): WorktreeRuntimeConfig => ({
  backupAggregateBytes: 100 * 1024 * 1024,
  backupFileBytes: 20 * 1024 * 1024,
  cleanupPolicy: "delete_after_handover",
  defaultPushPolicy: "disabled",
  leaseDurationMs: 60_000,
  maxActiveWorktreesPerRepository: 16,
  maxReconciliationConcurrency: 2,
  maxSetupConcurrency: 2,
  pushTimeoutMs: 10_000,
  setupTimeoutMs: 30_000,
  ...overrides,
});

export const makeWorktreeStoreSqliteTestLayer = () =>
  WorktreeStoreSqliteLive.pipe(
    Layer.provide(
      makeInMemorySqliteLayer({
        migrations: worktreeStoreMigrations,
      }),
    ),
  );

export const makeWorktreesTestLayer = (config: WorktreeRuntimeConfig) => {
  const configLayer = makeWorktreeConfigLayer(config);
  const base = Layer.mergeAll(
    WorktreePathsLive,
    makeWorktreeStoreSqliteTestLayer(),
    WorktreeSetupLive,
    WorktreeFinalizerLive,
  ).pipe(Layer.provide(configLayer));
  const lifecycle = WorktreeLifecycleLive.pipe(Layer.provideMerge(base));
  const branchPublisher = WorktreeBranchPublisherLive.pipe(Layer.provideMerge(lifecycle));
  const remotePublisher = WorktreeRemotePublisherLive.pipe(Layer.provideMerge(branchPublisher));
  const handover = WorktreeHandoverLive.pipe(
    Layer.provideMerge(Layer.mergeAll(remotePublisher, WorktreeHandoverTargetNoopLive)),
  );

  return WorktreeReconcilerLive.pipe(
    Layer.provideMerge(handover),
    Layer.provide(Layer.mergeAll(NodeServices.layer, GitRepositoryLive)),
  );
};
