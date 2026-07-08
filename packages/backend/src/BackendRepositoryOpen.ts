import { AppConfigError } from "@cycle/config/app-config";
import type { RepositoryRecord } from "@cycle/contracts/schemas/app";
import type { RepositoryOpenInput } from "@cycle/contracts/schemas";
import { DatabaseService, type RepositoryMetadata } from "@cycle/database";
import { GitRepository, type GitRepositoryMetadata } from "@cycle/git";
import { GitDb, Store as GitDbStore } from "@cycle/git-db";
import { mapDatabaseFailure, RepositoryOpenService, type UseCaseContext } from "@cycle/usecases";
import { Effect, Layer } from "effect";
import { LocalWorkspace } from "./LocalWorkspace.ts";

const repositoryMetadata = (metadata: GitRepositoryMetadata): RepositoryMetadata => ({
  ...(metadata.currentBranch === undefined ? {} : { currentBranch: metadata.currentBranch }),
  ...(metadata.defaultRemote === undefined ? {} : { defaultRemote: metadata.defaultRemote }),
  ...(metadata.defaultRemoteUrl === undefined
    ? {}
    : { defaultRemoteUrl: metadata.defaultRemoteUrl }),
  gitDir: metadata.gitDir,
  inspectedAt: metadata.inspectedAt,
  remotes: metadata.remotes,
  worktreePath: metadata.path,
});

const makeLocalStore = (
  repositoryPath: string,
  gitDir: string,
): Effect.Effect<GitDbStore.StoreServiceShape, unknown> =>
  GitDbStore.StoreService.pipe(
    Effect.provide(
      GitDb.GitDbFilesystem({
        cwd: repositoryPath,
        database: "cycle",
        gitDir,
      }),
    ),
  );

const repositoryById = (
  repositories: ReadonlyArray<RepositoryRecord>,
  repositoryId: string,
): RepositoryRecord | undefined =>
  repositories.find((repository) => repository.id === repositoryId);

const resolveRepository = (localWorkspace: LocalWorkspace["Service"], input: RepositoryOpenInput) =>
  Effect.gen(function* () {
    const repository =
      input.path !== undefined
        ? yield* localWorkspace.upsertRepositoryPath({
            displayName: input.displayName,
            path: input.path,
          })
        : repositoryById(yield* localWorkspace.listRepositories, input.repositoryId ?? "");

    if (repository === undefined) {
      return yield* new AppConfigError({
        message: "Repository path or registered repository id is required.",
        operation: "BackendRepositoryOpen.resolveRepository",
      });
    }

    return repository;
  });

const mapOpenFailure = (error: unknown, context: UseCaseContext<"RepositoryOpen">) =>
  mapDatabaseFailure(error, {
    requestId: context.requestId,
    repositoryId: context.repositoryId,
    useCase: context.name,
  });

export const BackendRepositoryOpenServiceLive = Layer.effect(
  RepositoryOpenService,
  Effect.gen(function* () {
    const database = yield* DatabaseService;
    const gitRepository = yield* GitRepository;
    const localWorkspace = yield* LocalWorkspace;

    return RepositoryOpenService.of({
      open: (input, context) =>
        Effect.gen(function* () {
          const repository = yield* resolveRepository(localWorkspace, input);
          const inspected = yield* gitRepository.metadata(repository.path);
          const metadata = repositoryMetadata(inspected);
          const store = yield* makeLocalStore(repository.path, metadata.gitDir ?? inspected.gitDir);

          return yield* database.openRepository({
            displayName: repository.displayName,
            gitDir: metadata.gitDir,
            metadata,
            repositoryId: repository.id,
            store,
            syncOnOpen: input.syncOnOpen ?? false,
            worktreePath: repository.path,
          });
        }).pipe(Effect.mapError((error) => mapOpenFailure(error, context))),
    });
  }),
);
