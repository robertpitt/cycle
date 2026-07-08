import { Schema } from "effect";

export const RepositoryOpenInput = Schema.Struct({
  displayName: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional human-readable repository name." }),
  ),
  path: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional filesystem path to a repository worktree to register and open.",
    }),
  ),
  repositoryId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional stable repository id for an existing configured repository.",
    }),
  ),
  syncOnOpen: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether Cycle should synchronize repository projections after opening.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for opening or registering a repository with Cycle.",
    identifier: "@cycle/contracts/RepositoryOpenInput",
    title: "RepositoryOpenInput",
  }),
);
export type RepositoryOpenInput = typeof RepositoryOpenInput.Type;
