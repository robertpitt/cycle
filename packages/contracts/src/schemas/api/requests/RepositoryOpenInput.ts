import { Schema } from "effect";

export const RepositoryOpenInput = Schema.Struct({
  displayName: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional human-readable repository name." }),
  ),
  gitDir: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional path to the repository git directory." }),
  ),
  metadata: Schema.optional(Schema.Unknown).pipe(
    Schema.annotateKey({
      description: "Adapter-owned repository metadata preserved as an explicit extension field.",
    }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Stable repository id used by Cycle." }),
  ),
  store: Schema.Unknown.pipe(
    Schema.annotateKey({
      description:
        "Storage adapter configuration. Shape is adapter-owned and intentionally opaque.",
    }),
  ),
  syncOnOpen: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether Cycle should synchronize repository projections after opening.",
    }),
  ),
  worktreePath: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional path to the repository worktree." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for opening or registering a repository with Cycle.",
    identifier: "@cycle/contracts/RepositoryOpenInput",
    title: "RepositoryOpenInput",
  }),
);
export type RepositoryOpenInput = typeof RepositoryOpenInput.Type;
