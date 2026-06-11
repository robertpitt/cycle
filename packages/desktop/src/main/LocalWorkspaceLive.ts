import { GitRepository, type GitRepositoryServiceShape } from "@cycle/git";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { Effect, Layer } from "effect";
import {
  AppConfig,
  appConfigError,
  defaultRepositoryPreferences,
  type RepositoryRecord,
} from "../shared/AppConfig.ts";
import {
  LocalWorkspace,
  type InitializeRepositoryPathInput,
  type UpdateRepositoryPreferencesInput,
  type UpsertRepositoryPathInput,
} from "../shared/LocalWorkspace.ts";

const repositoryId = (repositoryPath: string): string =>
  `repo_${createHash("sha256").update(repositoryPath).digest("hex").slice(0, 16)}`;

const normalizeRepositoryPath = (repositoryPath: string): string => resolve(repositoryPath);

const displayNameForPath = (repositoryPath: string): string =>
  basename(repositoryPath) === "" ? repositoryPath : basename(repositoryPath);

const ensureGitRepository = (gitRepository: GitRepositoryServiceShape, repositoryPath: string) =>
  gitRepository
    .ensure(repositoryPath)
    .pipe(
      Effect.mapError((cause) =>
        appConfigError(
          "LocalWorkspace.git",
          "This project is not git initialised. Initialise it to import.",
          cause,
        ),
      ),
    );

const initializeGitRepository = (
  gitRepository: GitRepositoryServiceShape,
  repositoryPath: string,
) =>
  gitRepository
    .init(repositoryPath)
    .pipe(
      Effect.mapError((cause) =>
        appConfigError("LocalWorkspace.gitInit", "Unable to initialise Git repository.", cause),
      ),
    );

export const LocalWorkspaceLive = Layer.effect(
  LocalWorkspace,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const gitRepository = yield* GitRepository;

    const listRepositories = () =>
      appConfig.read().pipe(Effect.map((config) => config.localWorkspace.repositories));

    const upsertRepositoryPath = (input: UpsertRepositoryPathInput) =>
      Effect.gen(function* () {
        const normalizedPath = normalizeRepositoryPath(input.path);
        yield* ensureGitRepository(gitRepository, normalizedPath);
        const id = repositoryId(normalizedPath);
        const now = new Date().toISOString();
        const existing = (yield* listRepositories()).find(
          (repository) => repository.path === normalizedPath || repository.id === id,
        );
        const nextRepository: RepositoryRecord =
          existing === undefined
            ? {
                addedAt: now,
                displayName: input.displayName?.trim() || displayNameForPath(normalizedPath),
                id,
                path: normalizedPath,
                preferences: defaultRepositoryPreferences(),
              }
            : {
                ...existing,
                displayName: input.displayName?.trim() || existing.displayName,
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

    return {
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
    };
  }),
);
