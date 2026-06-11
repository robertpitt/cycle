import { GitRepository as GitRepositoryServiceTag } from "./GitRepository.ts";
import * as GitRepositoryLive from "./GitRepositoryLive.ts";

export * as GitRepositoryLive from "./GitRepositoryLive.ts";
export type { GitRepositoryServiceShape } from "./GitRepository.ts";

export const GitRepository = Object.assign(GitRepositoryServiceTag, GitRepositoryLive);
