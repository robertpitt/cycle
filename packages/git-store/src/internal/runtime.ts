import { Context } from "effect";
import type { GitStoreConfig, GitStoreKey } from "../GitStoreSchemas.ts";

export type GitStoreRuntimeShape = {
  readonly config: GitStoreConfig;
  readonly key: GitStoreKey;
};

export class GitStoreRuntime extends Context.Service<GitStoreRuntime, GitStoreRuntimeShape>()(
  "@cycle/git-store/internal/GitStoreRuntime",
) {}
