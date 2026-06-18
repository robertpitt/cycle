import { GitRepository, type GitRepositoryServiceShape } from "@cycle/git";
import { Crypto, Effect, Layer, Path } from "effect";
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

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const textEncoder = new TextEncoder();

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
    const crypto = yield* Crypto.Crypto;
    const gitRepository = yield* GitRepository;
    const path = yield* Path.Path;

    const repositoryId = (repositoryPath: string) =>
      crypto.digest("SHA-256", textEncoder.encode(repositoryPath)).pipe(
        Effect.map((digest) => `repo_${bytesToHex(digest).slice(0, 16)}`),
        Effect.mapError((cause) =>
          appConfigError("LocalWorkspace.repositoryId", "Unable to derive repository id.", cause),
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
        const id = yield* repositoryId(normalizedPath);
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
