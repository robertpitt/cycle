import {
  RepositoryCommitStyle,
  RepositoryRecord,
  type AppConfigError,
} from "@cycle/config/app-config";
import { Context, Effect, Schema } from "effect";

export const UpsertRepositoryPathInput = Schema.Struct({
  displayName: Schema.optional(Schema.String),
  path: Schema.String,
});
export type UpsertRepositoryPathInput = typeof UpsertRepositoryPathInput.Type;

export const InitializeRepositoryPathInput = UpsertRepositoryPathInput;
export type InitializeRepositoryPathInput = typeof InitializeRepositoryPathInput.Type;

export const RepositoryPreferencesPatch = Schema.Struct({
  autoSync: Schema.optional(Schema.Boolean),
  commitStyle: Schema.optional(RepositoryCommitStyle),
  sidebarExpanded: Schema.optional(Schema.Boolean),
});
export type RepositoryPreferencesPatch = typeof RepositoryPreferencesPatch.Type;

export const UpdateRepositoryPreferencesInput = Schema.Struct({
  id: Schema.String,
  preferences: RepositoryPreferencesPatch,
});
export type UpdateRepositoryPreferencesInput = typeof UpdateRepositoryPreferencesInput.Type;

export const SelectRepositoryFolderResult = Schema.Union([
  Schema.Struct({
    repository: RepositoryRecord,
    status: Schema.Literal("added"),
  }),
  Schema.Struct({
    status: Schema.Literal("cancelled"),
  }),
  Schema.Struct({
    message: Schema.String,
    path: Schema.String,
    status: Schema.Literal("not-git"),
  }),
]);
export type SelectRepositoryFolderResult = typeof SelectRepositoryFolderResult.Type;

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
