import { Git, GitRepository } from "@cycle/git";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import {
  WorktreePathPolicyError,
  WorktreeRepositoryError,
  WorktreeStoreError,
} from "./WorktreeErrors.ts";
import type { ObjectId, RepositoryId, WorktreeId } from "./WorktreeSchemas.ts";
import { WorktreeConfig } from "./WorktreeConfig.ts";
import { validateManagedPath } from "./internal/path-policy.ts";

export type ResolvedWorktreeRepository = {
  readonly commonGitDir: string;
  readonly gitDir: string;
  readonly primaryPath: string;
  readonly repositoryId: RepositoryId;
  readonly repositoryPath: string;
};

export type WorktreePathPolicy = {
  readonly forbiddenPaths?: readonly string[] | undefined;
  readonly gitDbStoragePath?: string | undefined;
  readonly storageRoot?: string | undefined;
};

export type WorktreePathsShape = {
  readonly allocateWorktreePath: (input: {
    readonly repositoryId: RepositoryId;
    readonly worktreeId: WorktreeId;
  }) => Effect.Effect<string, WorktreePathPolicyError | WorktreeStoreError>;
  readonly ensureStorageRoot: Effect.Effect<string, WorktreeStoreError>;
  readonly resolveRepository: (input: {
    readonly repositoryId: RepositoryId;
    readonly repositoryPath: string;
  }) => Effect.Effect<ResolvedWorktreeRepository, WorktreeRepositoryError>;
  readonly resolveBaseSha: (
    repositoryPath: string,
    baseRef: string,
  ) => Effect.Effect<ObjectId, WorktreeRepositoryError>;
  readonly validateWorktreePath: (input: {
    readonly candidatePath: string;
    readonly policy?: WorktreePathPolicy | undefined;
    readonly repository: ResolvedWorktreeRepository;
  }) => Effect.Effect<string, WorktreePathPolicyError>;
};

export class WorktreePaths extends Context.Service<WorktreePaths, WorktreePathsShape>()(
  "@cycle/git-worktrees/WorktreePaths",
) {}

const mapRepositoryError = (operation: string, path: string, cause: unknown): WorktreeRepositoryError =>
  new WorktreeRepositoryError({
    cause,
    message: `Unable to inspect Git repository for ${operation}.`,
    operation,
    path,
  });

export const WorktreePathsLive = Layer.effect(
  WorktreePaths,
  Effect.gen(function* () {
    const config = yield* WorktreeConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const repositories = yield* GitRepository;
    const git = yield* Git;

    const ensureStorageRoot = fs.makeDirectory(config.config.storageRoot, { recursive: true }).pipe(
      Effect.as(config.config.storageRoot),
      Effect.mapError(
        (cause) =>
          new WorktreeStoreError({
            cause,
            message: "Unable to create worktree storage root.",
            operation: "ensureStorageRoot",
            path: config.config.storageRoot,
          }),
      ),
    );

    const resolveRepository = Effect.fn("WorktreePaths.resolveRepository")(function* (input: {
      readonly repositoryId: RepositoryId;
      readonly repositoryPath: string;
    }) {
      const repository = yield* repositories.ensure(input.repositoryPath).pipe(
        Effect.mapError(
          (cause) =>
            new WorktreeRepositoryError({
              cause,
              message: cause.message,
              operation: cause.operation,
              path: cause.path,
              repositoryId: input.repositoryId,
            }),
        ),
      );
      const primaryPath = yield* git
        .showTopLevel(repository.cwd)
        .pipe(
          Effect.mapError((cause) =>
            mapRepositoryError("git rev-parse --show-toplevel", repository.cwd, cause),
          ),
        );
      const commonGitDirRaw = yield* git
        .commonGitDir(repository.cwd)
        .pipe(
          Effect.mapError((cause) =>
            mapRepositoryError("git rev-parse --git-common-dir", repository.cwd, cause),
          ),
        );
      const commonGitDir = path.isAbsolute(commonGitDirRaw)
        ? commonGitDirRaw
        : path.resolve(repository.cwd, commonGitDirRaw);

      return {
        commonGitDir: yield* fs
          .realPath(commonGitDir)
          .pipe(Effect.catch(() => Effect.succeed(path.resolve(commonGitDir)))),
        gitDir: yield* fs
          .realPath(repository.gitDir)
          .pipe(Effect.catch(() => Effect.succeed(path.resolve(repository.gitDir)))),
        primaryPath: yield* fs
          .realPath(primaryPath)
          .pipe(Effect.catch(() => Effect.succeed(path.resolve(primaryPath)))),
        repositoryId: input.repositoryId,
        repositoryPath: path.resolve(repository.cwd),
      };
    });

    const allocateWorktreePath = Effect.fn("WorktreePaths.allocateWorktreePath")(function* (input: {
      readonly repositoryId: RepositoryId;
      readonly worktreeId: WorktreeId;
    }) {
      const storageRoot = yield* ensureStorageRoot;
      const repositorySegment = input.repositoryId
        .replace(/[^A-Za-z0-9._-]+/gu, "-")
        .replace(/^-+|-+$/gu, "");
      return path.join(storageRoot, repositorySegment || "repository", input.worktreeId);
    });

    const validateWorktreePath = Effect.fn("WorktreePaths.validateWorktreePath")(function* (input: {
      readonly candidatePath: string;
      readonly policy?: WorktreePathPolicy | undefined;
      readonly repository: ResolvedWorktreeRepository;
    }) {
      return yield* validateManagedPath(input.candidatePath, {
        forbiddenPaths: input.policy?.forbiddenPaths,
        gitDbStoragePath: input.policy?.gitDbStoragePath,
        gitDir: input.repository.gitDir,
        primaryPath: input.repository.primaryPath,
        storageRoot: input.policy?.storageRoot ?? config.config.storageRoot,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
    });

    const resolveBaseSha = Effect.fn("WorktreePaths.resolveBaseSha")(function* (
      repositoryPath: string,
      baseRef: string,
    ) {
      const baseSha = yield* git
        .resolveCommit(repositoryPath, baseRef)
        .pipe(
          Effect.mapError((cause) => mapRepositoryError("git rev-parse", repositoryPath, cause)),
        );

      return baseSha as ObjectId;
    });

    return WorktreePaths.of({
      allocateWorktreePath,
      ensureStorageRoot,
      resolveBaseSha,
      resolveRepository,
      validateWorktreePath,
    });
  }),
);
