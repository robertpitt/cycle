import { Schema } from "effect";

export const RepositoryRemote = Schema.Struct({
  name: Schema.String.pipe(Schema.annotateKey({ description: "Git remote name." })),
  url: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Remote URL when available." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Git remote configured for a repository.",
    identifier: "@cycle/contracts/RepositoryRemote",
    title: "RepositoryRemote",
  }),
);
export type RepositoryRemote = typeof RepositoryRemote.Type;
