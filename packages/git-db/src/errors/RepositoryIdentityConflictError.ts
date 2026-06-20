import { Schema } from "effect";

export class RepositoryIdentityConflictError extends Schema.TaggedErrorClass<RepositoryIdentityConflictError>(
  "@cycle/git-db/RepositoryIdentityConflictError",
)("RepositoryIdentityConflictError", {
  localRoot: Schema.optional(Schema.String),
  message: Schema.String,
  pointer: Schema.String,
  reason: Schema.String,
  remoteRoot: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  roots: Schema.optional(Schema.Array(Schema.String)),
}) {}

export const repositoryIdentityConflict = (input: {
  readonly localRoot?: string;
  readonly pointer: string;
  readonly reason: string;
  readonly remoteRoot?: string;
  readonly repositoryId?: string;
  readonly roots?: ReadonlyArray<string>;
}): RepositoryIdentityConflictError =>
  new RepositoryIdentityConflictError({
    ...input,
    message: repositoryIdentityConflictMessage(input),
    roots: input.roots === undefined ? undefined : [...input.roots],
  });

const repositoryIdentityConflictMessage = (input: {
  readonly localRoot?: string;
  readonly pointer: string;
  readonly reason: string;
  readonly remoteRoot?: string;
  readonly repositoryId?: string;
  readonly roots?: ReadonlyArray<string>;
}): string => {
  if (input.reason === "multiple-roots") {
    return `Repository identity conflict for ${input.pointer}: multiple roots ${
      input.roots?.join(", ") ?? "<unknown>"
    }`;
  }

  if (input.reason === "root-mismatch") {
    return `Repository identity conflict for ${input.pointer}: local root ${
      input.localRoot ?? "<missing>"
    }, remote root ${input.remoteRoot ?? "<missing>"}`;
  }

  if (input.reason === "id-collision") {
    return `Repository identity collision for ${input.repositoryId ?? "<unknown>"}`;
  }

  return `Repository identity conflict for ${input.pointer}: ${input.reason}`;
};
