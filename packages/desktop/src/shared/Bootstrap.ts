import type { SyncResult } from "@cycle/git-db";
import { Context, Effect } from "effect";

export type BootstrapPhase =
  | "idle"
  | "starting"
  | "loading-repositories"
  | "opening-repository"
  | "ready"
  | "ready-with-background-sync"
  | "failed";

export type BootstrapRepositoryStage = "pending" | "opening" | "ready" | "syncing" | "failed";

export type BootstrapRepositoryStatus = {
  readonly activeSnapshotId?: string | null;
  readonly currentBranch?: string;
  readonly defaultRemote?: string;
  readonly defaultRemoteUrl?: string;
  readonly displayName: string;
  readonly error?: string;
  readonly path: string;
  readonly repositoryId: string;
  readonly stage: BootstrapRepositoryStage;
  readonly updatedAt: string;
  readonly warningCount?: number;
};

export type BootstrapStatus = {
  readonly blocking: boolean;
  readonly completedAt?: string;
  readonly error?: string;
  readonly message: string;
  readonly phase: BootstrapPhase;
  readonly repositories: ReadonlyArray<BootstrapRepositoryStatus>;
  readonly startedAt?: string;
};

export type DesktopBootstrapService = {
  readonly ensureRepositoryOpened: (repositoryId: string) => Effect.Effect<void, unknown>;
  readonly notifyRepositoryChanged: (repositoryId: string) => Effect.Effect<void>;
  readonly pushRepositoryToRemote: (repositoryId: string) => Effect.Effect<SyncResult, unknown>;
  readonly start: () => Effect.Effect<void>;
  readonly status: () => Effect.Effect<BootstrapStatus>;
  readonly syncRepositoryFromRemote: (repositoryId: string) => Effect.Effect<void, unknown>;
};

export class DesktopBootstrap extends Context.Service<DesktopBootstrap, DesktopBootstrapService>()(
  "@cycle/desktop/DesktopBootstrap",
) {}
