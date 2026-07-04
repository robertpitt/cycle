import { Schema } from "effect";
import { RepositoryRemote } from "./RepositoryRemote.ts";

export const RepositoryMetadata = Schema.Struct({
  currentBranch: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Current git branch when available." }),
  ),
  defaultRemote: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default git remote name when available." }),
  ),
  defaultRemoteUrl: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default git remote URL when available." }),
  ),
  gitDir: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Path to the repository git directory." }),
  ),
  inspectedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when metadata was inspected." }),
  ),
  remotes: Schema.Array(RepositoryRemote).pipe(
    Schema.annotateKey({ description: "Git remotes configured for the repository." }),
  ),
  worktreePath: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Path to the repository worktree." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Git metadata detected for a repository.",
    identifier: "@cycle/contracts/RepositoryMetadata",
    title: "RepositoryMetadata",
  }),
);
export type RepositoryMetadata = typeof RepositoryMetadata.Type;
