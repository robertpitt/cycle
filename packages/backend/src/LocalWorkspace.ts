import { RepositoryCommitStyle, RepositoryRecord } from "@cycle/config";
import { AppConfig, AppConfigError } from "@cycle/config";
import {
  defaultRepositoryPreferences,
  type LocalWorkspacePreferencesPatch,
  type RepositoryRecord as RepositoryRecordType,
} from "@cycle/config";
import { makeGitRepositoryStoreEffect } from "@cycle/database";
import { GitRepository, type GitRepositoryServiceShape } from "@cycle/git";
import { GitStores } from "@cycle/git-store";
import { logDebug, logInfo } from "@cycle/logging";
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
  readonly listRepositories: Effect.Effect<ReadonlyArray<RepositoryRecordType>, AppConfigError>;
  readonly markRepositoryOpened: (
    id: string,
  ) => Effect.Effect<RepositoryRecordType | null, AppConfigError>;
  readonly removeRepository: (
    id: string,
  ) => Effect.Effect<ReadonlyArray<RepositoryRecordType>, AppConfigError>;
  readonly updatePreferences: (
    preferences: LocalWorkspacePreferencesPatch,
  ) => Effect.Effect<void, AppConfigError>;
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

const elapsedMs = (startedAt: number): number => Number((performance.now() - startedAt).toFixed(2));

const workspaceLogFields = (fields: Readonly<Record<string, unknown>> = {}) => ({
  ...fields,
  component: "workspace",
  service: "backend",
});

const info = (message: string, fields?: Readonly<Record<string, unknown>>) =>
  logInfo("backend", message, workspaceLogFields(fields));

const debug = (message: string, fields?: Readonly<Record<string, unknown>>) =>
  logDebug("backend", message, workspaceLogFields(fields));

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
    const gitStores = yield* GitStores;
    const path = yield* Path.Path;

    const repositoryIdentity = (repositoryPath: string) =>
      Effect.gen(function* () {
        const startedAt = performance.now();
        const metadataStartedAt = performance.now();
        const metadata = yield* gitRepository.metadata(repositoryPath).pipe(
          Effect.withSpan("backend.localWorkspace.repositoryIdentity.metadata", {
            attributes: {
              "backend.repository.path": repositoryPath,
              service: "@cycle/backend",
            },
          }),
        );
        yield* debug("local workspace repository metadata inspected", {
          elapsedMs: elapsedMs(metadataStartedAt),
          gitDir: metadata.gitDir,
          path: repositoryPath,
        });

        const storeStartedAt = performance.now();
        const store = yield* makeGitRepositoryStoreEffect({
          cwd: repositoryPath,
          database: "cycle",
          gitDir: metadata.gitDir,
        }).pipe(
          Effect.provideService(GitStores, GitStores.of(gitStores)),
          Effect.withSpan("backend.localWorkspace.repositoryIdentity.store", {
            attributes: {
              "backend.repository.gitDir": metadata.gitDir,
              "backend.repository.path": repositoryPath,
              service: "@cycle/backend",
            },
          }),
        );
        yield* debug("local workspace repository identity store created", {
          elapsedMs: elapsedMs(storeStartedAt),
          gitDir: metadata.gitDir,
          path: repositoryPath,
        });

        const localIdentityStartedAt = performance.now();
        const localIdentity = yield* store.resolveIdentity().pipe(
          Effect.withSpan("backend.localWorkspace.repositoryIdentity.resolveIdentity", {
            attributes: {
              "backend.repository.gitDir": metadata.gitDir,
              "backend.repository.path": repositoryPath,
              service: "@cycle/backend",
            },
          }),
        );
        const resolveIdentityMs = elapsedMs(localIdentityStartedAt);
        if (localIdentity !== null) {
          yield* info("local workspace repository identity resolved", {
            elapsedMs: elapsedMs(startedAt),
            ensureIdentityMs: 0,
            gitDir: metadata.gitDir,
            path: repositoryPath,
            remote: metadata.defaultRemote ?? null,
            repositoryId: localIdentity.repositoryId,
            resolveIdentityMs,
            rootCommitId: localIdentity.rootCommitId,
            source: "local",
          });
          return localIdentity;
        }

        const identityStartedAt = performance.now();
        const identity = yield* store
          .ensureIdentity({
            remote: metadata.defaultRemote,
          })
          .pipe(
            Effect.withSpan("backend.localWorkspace.repositoryIdentity.ensureIdentity", {
              attributes: {
                "backend.repository.gitDir": metadata.gitDir,
                "backend.repository.path": repositoryPath,
                "backend.repository.remote": metadata.defaultRemote ?? "none",
                service: "@cycle/backend",
              },
            }),
          );
        yield* info("local workspace repository identity resolved", {
          elapsedMs: elapsedMs(startedAt),
          ensureIdentityMs: elapsedMs(identityStartedAt),
          gitDir: metadata.gitDir,
          path: repositoryPath,
          remote: metadata.defaultRemote ?? null,
          repositoryId: identity.repositoryId,
          resolveIdentityMs,
          rootCommitId: identity.rootCommitId,
          source: metadata.defaultRemote === undefined ? "created" : "remote-or-created",
        });
        return identity;
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

    const listRepositories = appConfig.read.pipe(
      Effect.map((config) => config.localWorkspace.repositories),
    );

    const upsertRepositoryPath = (input: UpsertRepositoryPathInput) =>
      Effect.gen(function* () {
        const startedAt = performance.now();
        const normalizedPath = normalizeRepositoryPath(input.path);
        yield* debug("local workspace repository path upsert started", {
          displayName: input.displayName,
          path: normalizedPath,
        });

        const ensureStartedAt = performance.now();
        yield* ensureGitRepository(gitRepository, normalizedPath).pipe(
          Effect.withSpan("backend.localWorkspace.ensureGitRepository", {
            attributes: {
              "backend.repository.path": normalizedPath,
              service: "@cycle/backend",
            },
          }),
        );
        yield* debug("local workspace git repository ensured", {
          elapsedMs: elapsedMs(ensureStartedAt),
          path: normalizedPath,
        });

        const identityStartedAt = performance.now();
        const identity = yield* repositoryIdentity(normalizedPath).pipe(
          Effect.withSpan("backend.localWorkspace.repositoryIdentity", {
            attributes: {
              "backend.repository.path": normalizedPath,
              service: "@cycle/backend",
            },
          }),
        );
        yield* info("local workspace repository identity loaded", {
          elapsedMs: elapsedMs(identityStartedAt),
          path: normalizedPath,
          repositoryId: identity.repositoryId,
          rootCommitId: identity.rootCommitId,
        });
        const id = identity.repositoryId;
        const now = new Date().toISOString();
        const listStartedAt = performance.now();
        const repositories = yield* listRepositories.pipe(
          Effect.withSpan("backend.localWorkspace.listRepositories", {
            attributes: {
              service: "@cycle/backend",
            },
          }),
        );
        yield* debug("local workspace configured repositories loaded", {
          elapsedMs: elapsedMs(listStartedAt),
          repositories: repositories.length,
        });
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

        const updateStartedAt = performance.now();
        const updated = yield* appConfig
          .update((current) => ({
            ...current,
            localWorkspace: {
              ...current.localWorkspace,
              repositories:
                existing === undefined
                  ? [...current.localWorkspace.repositories, nextRepository]
                  : current.localWorkspace.repositories.map((repository) =>
                      repository.id === existing.id ? nextRepository : repository,
                    ),
            },
          }))
          .pipe(
            Effect.withSpan("backend.localWorkspace.updateRepositoryPath", {
              attributes: {
                "backend.repository.path": normalizedPath,
                "backend.repositoryId": id,
                service: "@cycle/backend",
              },
            }),
          );
        yield* info("local workspace repository path upserted", {
          created: existing === undefined,
          elapsedMs: elapsedMs(startedAt),
          path: normalizedPath,
          repositories: updated.localWorkspace.repositories.length,
          repositoryId: id,
          updateMs: elapsedMs(updateStartedAt),
        });

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
              ...current.localWorkspace,
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
              ...current.localWorkspace,
              repositories: current.localWorkspace.repositories.filter(
                (repository) => repository.id !== id,
              ),
            },
          }))
          .pipe(Effect.map((config) => config.localWorkspace.repositories)),
      updatePreferences: (preferences) =>
        appConfig
          .update((current) => ({
            ...current,
            localWorkspace: {
              ...current.localWorkspace,
              ...preferences,
            },
          }))
          .pipe(Effect.asVoid),
      updateRepositoryPreferences: (input: UpdateRepositoryPreferencesInput) =>
        Effect.gen(function* () {
          const updated = yield* appConfig.update((current) => ({
            ...current,
            localWorkspace: {
              ...current.localWorkspace,
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
