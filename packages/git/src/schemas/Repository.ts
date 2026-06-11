import { Schema } from "effect";

export const GitRepositoryRef = Schema.Struct({
  cwd: Schema.String,
  gitDir: Schema.String,
});
export type GitRepositoryRef = typeof GitRepositoryRef.Type;

export const GitRepositoryRemote = Schema.Struct({
  name: Schema.String,
  url: Schema.optional(Schema.String),
});
export type GitRepositoryRemote = typeof GitRepositoryRemote.Type;

export const GitRepositoryMetadata = Schema.Struct({
  currentBranch: Schema.optional(Schema.String),
  defaultRemote: Schema.optional(Schema.String),
  defaultRemoteUrl: Schema.optional(Schema.String),
  gitDir: Schema.String,
  inspectedAt: Schema.String,
  path: Schema.String,
  remotes: Schema.Array(GitRepositoryRemote),
});
export type GitRepositoryMetadata = typeof GitRepositoryMetadata.Type;

export const GitRepositoryInspection = Schema.Union([
  Schema.Struct({
    gitDir: Schema.String,
    path: Schema.String,
    status: Schema.Literal("git"),
  }),
  Schema.Struct({
    message: Schema.String,
    path: Schema.String,
    status: Schema.Literal("not-git"),
  }),
]);
export type GitRepositoryInspection = typeof GitRepositoryInspection.Type;
