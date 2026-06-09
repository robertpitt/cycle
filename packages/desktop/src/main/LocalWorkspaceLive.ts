import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);

const repositoryId = (repositoryPath: string): string =>
  `repo_${createHash("sha256").update(repositoryPath).digest("hex").slice(0, 16)}`;

const normalizeRepositoryPath = (repositoryPath: string): string => resolve(repositoryPath);

const displayNameForPath = (repositoryPath: string): string =>
  basename(repositoryPath) === "" ? repositoryPath : basename(repositoryPath);

const ensureGitRepository = (repositoryPath: string) =>
  Effect.tryPromise({
    try: async () => {
      const gitEntry = await stat(resolve(repositoryPath, ".git"));
      if (!gitEntry.isDirectory() && !gitEntry.isFile()) {
        throw new Error(".git exists but is not a file or directory.");
      }
    },
    catch: (cause) =>
      appConfigError(
        "LocalWorkspace.git",
        "This project is not git initialised. Initialise it to import.",
        cause,
      ),
  });

const initializeGitRepository = (repositoryPath: string) =>
  Effect.tryPromise({
    try: async () => {
      const entry = await stat(repositoryPath);
      if (!entry.isDirectory()) {
        throw new Error("Selected path is not a directory.");
      }

      await execFileAsync("git", ["init"], {
        cwd: repositoryPath,
      });
    },
    catch: (cause) =>
      appConfigError("LocalWorkspace.gitInit", "Unable to initialise Git repository.", cause),
  });

export const LocalWorkspaceLive = Layer.effect(
  LocalWorkspace,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;

    const listRepositories = () =>
      appConfig.read().pipe(Effect.map((config) => config.localWorkspace.repositories));

    const upsertRepositoryPath = (input: UpsertRepositoryPathInput) =>
      Effect.gen(function* () {
        const normalizedPath = normalizeRepositoryPath(input.path);
        yield* ensureGitRepository(normalizedPath);
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
          yield* initializeGitRepository(normalizedPath);
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
