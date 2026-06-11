import { Context, Effect } from "effect";
import type { GitRepositoryError } from "../errors/index.ts";
import type {
  GitRepositoryInspection,
  GitRepositoryMetadata,
  GitRepositoryRef,
} from "../schemas/index.ts";

export type GitRepositoryServiceShape = {
  readonly ensure: (repositoryPath: string) => Effect.Effect<GitRepositoryRef, GitRepositoryError>;
  readonly init: (repositoryPath: string) => Effect.Effect<GitRepositoryRef, GitRepositoryError>;
  readonly inspect: (
    repositoryPath: string,
  ) => Effect.Effect<GitRepositoryInspection, GitRepositoryError>;
  readonly metadata: (
    repositoryPath: string,
  ) => Effect.Effect<GitRepositoryMetadata, GitRepositoryError>;
  readonly resolveGitDir: (repositoryPath: string) => Effect.Effect<string, GitRepositoryError>;
};

export class GitRepository extends Context.Service<GitRepository, GitRepositoryServiceShape>()(
  "@cycle/git/GitRepository",
) {}
