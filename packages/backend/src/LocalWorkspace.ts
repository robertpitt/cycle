import { RepositoryCommitStyle, RepositoryRecord } from "@cycle/config/app-config";
import {
  AppConfig,
  AppConfigError,
  defaultRepositoryPreferences,
  type RepositoryRecord as RepositoryRecordType,
} from "@cycle/config/app-config";
import { GitRepository, type GitRepositoryServiceShape } from "@cycle/git";
import { GitDb, Store as GitDbStore } from "@cycle/git-db";
import { Context, Effect, Layer, Path, Schema } from "effect";

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
  ) => Effect.Effect<RepositoryRecordType, AppConfigError>;
  readonly listRepositories: () => Effect.Effect<
    ReadonlyArray<RepositoryRecordType>,
    AppConfigError
  >;
  readonly markRepositoryOpened: (
    id: string,
  ) => Effect.Effect<RepositoryRecordType | null, AppConfigError>;
  readonly removeRepository: (
    id: string,
  ) => Effect.Effect<ReadonlyArray<RepositoryRecordType>, AppConfigError>;
  readonly updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ) => Effect.Effect<RepositoryRecordType | null, AppConfigError>;
  readonly upsertRepositoryPath: (
    input: UpsertRepositoryPathInput,
  ) => Effect.Effect<RepositoryRecordType, AppConfigError>;
};

export class LocalWorkspace extends Context.Service<LocalWorkspace, LocalWorkspaceService>()(
  "@cycle/backend/LocalWorkspace",
) {}

const ensureGitRepository = (gitRepository: GitRepositoryServiceShape, repositoryPath: string) =>
  gitRepository.ensure(repositoryPath).pipe(
    Effect.mapError(
      (cause) =>
        new AppConfigError({
          cause,
          message: "This project is not git initialised. Initialise it to import.",
          operation: "LocalWorkspace.git",
        }),
    ),
  );

const initializeGitRepository = (
  gitRepository: GitRepositoryServiceShape,
  repositoryPath: string,
) =>
  gitRepository.init(repositoryPath).pipe(
    Effect.mapError(
      (cause) =>
        new AppConfigError({
          cause,
          message: "Unable to initialise Git repository.",
          operation: "LocalWorkspace.gitInit",
        }),
    ),
  );

export const LocalWorkspaceLive = Layer.effect(
  LocalWorkspace,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const gitRepository = yield* GitRepository;
    const path = yield* Path.Path;

    const repositoryIdentity = (repositoryPath: string) =>
      Effect.gen(function* () {
        const metadata = yield* gitRepository.metadata(repositoryPath);
        const store = yield* GitDbStore.StoreService.pipe(
          Effect.provide(
            GitDb.GitDbLive({
              cwd: repositoryPath,
              database: "cycle",
              gitDir: metadata.gitDir,
            }),
          ),
        );

        return yield* store.ensureRepositoryIdentity({
          remote: metadata.defaultRemote,
        });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new AppConfigError({
              cause,
              message: "Unable to derive repository id.",
              operation: "LocalWorkspace.repositoryIdentity",
            }),
        ),
      );

    const normalizeRepositoryPath = (repositoryPath: string): string =>
      path.resolve(repositoryPath);

    const displayNameForPath = (repositoryPath: string): string => {
      const baseName = path.basename(repositoryPath);
      return baseName === "" ? repositoryPath : baseName;
    };

    const listRepositories = () =>
      appConfig.read().pipe(Effect.map((config) => config.localWorkspace.repositories));

    const upsertRepositoryPath = (input: UpsertRepositoryPathInput) =>
      Effect.gen(function* () {
        const normalizedPath = normalizeRepositoryPath(input.path);
        yield* ensureGitRepository(gitRepository, normalizedPath);
        const identity = yield* repositoryIdentity(normalizedPath);
        const id = identity.repositoryId;
        const now = new Date().toISOString();
        const repositories = yield* listRepositories();
        const collision = repositories.find(
          (repository) =>
            repository.id === id &&
            repository.path !== normalizedPath &&
            repository.gitDbRootCommitId !== identity.rootCommitId,
        );

        if (collision !== undefined) {
          return yield* new AppConfigError({
            cause: {
              existingPath: collision.path,
              existingRoot: collision.gitDbRootCommitId,
              nextPath: normalizedPath,
              nextRoot: identity.rootCommitId,
            },
            message: `Repository id collision for ${id}.`,
            operation: "LocalWorkspace.repositoryIdentity",
          });
        }

        const existing = repositories.find(
          (repository) => repository.path === normalizedPath || repository.id === id,
        );
        const nextRepository: RepositoryRecordType =
          existing === undefined
            ? {
                addedAt: now,
                displayName: input.displayName?.trim() || displayNameForPath(normalizedPath),
                gitDbRootCommitId: identity.rootCommitId,
                id,
                path: normalizedPath,
                preferences: defaultRepositoryPreferences(),
              }
            : {
                ...existing,
                displayName: input.displayName?.trim() || existing.displayName,
                gitDbRootCommitId: identity.rootCommitId,
                id,
                path: normalizedPath,
              };

        const updated = yield* appConfig.update((current) => ({
          ...current,
          localWorkspace: {
            repositories:
              existing === undefined
                ? [...current.localWorkspace.repositories, nextRepository]
                : current.localWorkspace.repositories.map((repository) =>
                    repository.id === existing.id ? nextRepository : repository,
                  ),
          },
        }));

        return (
          updated.localWorkspace.repositories.find((repository) => repository.id === id) ??
          nextRepository
        );
      });

    return LocalWorkspace.of({
      initializeRepositoryPath: (input: InitializeRepositoryPathInput) =>
        Effect.gen(function* () {
          const normalizedPath = normalizeRepositoryPath(input.path);
          yield* initializeGitRepository(gitRepository, normalizedPath);
          return yield* upsertRepositoryPath({
            displayName: input.displayName,
            path: normalizedPath,
          });
        }),
      listRepositories,
      markRepositoryOpened: (id) =>
        Effect.gen(function* () {
          const openedAt = new Date().toISOString();
          const updated = yield* appConfig.update((current) => ({
            ...current,
            localWorkspace: {
              repositories: current.localWorkspace.repositories.map((repository) =>
                repository.id === id ? { ...repository, lastOpenedAt: openedAt } : repository,
              ),
            },
          }));
          return (
            updated.localWorkspace.repositories.find((repository) => repository.id === id) ?? null
          );
        }),
      removeRepository: (id) =>
        appConfig
          .update((current) => ({
            ...current,
            localWorkspace: {
              repositories: current.localWorkspace.repositories.filter(
                (repository) => repository.id !== id,
              ),
            },
          }))
          .pipe(Effect.map((config) => config.localWorkspace.repositories)),
      updateRepositoryPreferences: (input: UpdateRepositoryPreferencesInput) =>
        Effect.gen(function* () {
          const updated = yield* appConfig.update((current) => ({
            ...current,
            localWorkspace: {
              repositories: current.localWorkspace.repositories.map((repository) =>
                repository.id === input.id
                  ? {
                      ...repository,
                      preferences: {
                        ...repository.preferences,
                        ...input.preferences,
                      },
                    }
                  : repository,
              ),
            },
          }));

          return (
            updated.localWorkspace.repositories.find((repository) => repository.id === input.id) ??
            null
          );
        }),
      upsertRepositoryPath,
    });
  }),
);

export const LocalWorkspaceTest = (service: LocalWorkspaceService) =>
  Layer.succeed(LocalWorkspace, LocalWorkspace.of(service));
