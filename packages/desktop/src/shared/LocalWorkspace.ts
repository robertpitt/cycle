import { Context, Effect } from "effect";
import type { AppConfigError, RepositoryPreferences, RepositoryRecord } from "./AppConfig.ts";

export type UpsertRepositoryPathInput = {
  readonly displayName?: string;
  readonly path: string;
};

export type InitializeRepositoryPathInput = UpsertRepositoryPathInput;

export type UpdateRepositoryPreferencesInput = {
  readonly id: string;
  readonly preferences: Partial<RepositoryPreferences>;
};

export type SelectRepositoryFolderResult =
  | {
      readonly status: "added";
      readonly repository: RepositoryRecord;
    }
  | {
      readonly status: "cancelled";
    }
  | {
      readonly status: "not-git";
      readonly message: string;
      readonly path: string;
    };

export type LocalWorkspaceService = {
  readonly initializeRepositoryPath: (
    input: InitializeRepositoryPathInput,
  ) => Effect.Effect<RepositoryRecord, AppConfigError>;
  readonly listRepositories: () => Effect.Effect<ReadonlyArray<RepositoryRecord>, AppConfigError>;
  readonly markRepositoryOpened: (
    id: string,
  ) => Effect.Effect<RepositoryRecord | null, AppConfigError>;
  readonly removeRepository: (
    id: string,
  ) => Effect.Effect<ReadonlyArray<RepositoryRecord>, AppConfigError>;
  readonly updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ) => Effect.Effect<RepositoryRecord | null, AppConfigError>;
  readonly upsertRepositoryPath: (
    input: UpsertRepositoryPathInput,
  ) => Effect.Effect<RepositoryRecord, AppConfigError>;
};

export class LocalWorkspace extends Context.Service<LocalWorkspace, LocalWorkspaceService>()(
  "@cycle/desktop/LocalWorkspace",
) {}
