import { Schema } from "effect";

const objectIdPattern = /^[0-9a-fA-F]{40}$/u;
const potentialObjectIdPattern = /^[0-9a-fA-F]{4,64}$/u;
const invalidRefChars = /[ ~^:?*[\\]/u;

const filter = (expected: string, predicate: (value: string) => boolean) =>
  Schema.makeFilter<string>((value) => predicate(value) || expected, { expected });

export const IdentityInput = Schema.Struct({
  date: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
  email: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
});
export type IdentityInput = typeof IdentityInput.Type;

export const Identity = Schema.Struct({
  date: Schema.String,
  email: Schema.String,
  name: Schema.String,
  timestamp: Schema.Number,
  timezone: Schema.String,
});
export type Identity = typeof Identity.Type;

export const ObjectId = Schema.String.check(
  Schema.isPattern(objectIdPattern, { expected: "a 40 character hexadecimal Git object id" }),
);
export type ObjectId = typeof ObjectId.Type;

export const PotentialObjectId = Schema.String.check(
  Schema.isPattern(potentialObjectIdPattern, {
    expected: "a 4 to 64 character hexadecimal Git object id or prefix",
  }),
);
export type PotentialObjectId = typeof PotentialObjectId.Type;

export const isPotentialObjectId = (value: string): boolean => potentialObjectIdPattern.test(value);

export const CommitObject = Schema.Struct({
  author: Schema.optional(Identity),
  committer: Schema.optional(Identity),
  id: ObjectId,
  message: Schema.String,
  parents: Schema.Array(ObjectId),
  tree: ObjectId,
});
export type CommitObject = typeof CommitObject.Type;

export const WriteCommitInput = Schema.Struct({
  author: Schema.optional(IdentityInput),
  committer: Schema.optional(IdentityInput),
  message: Schema.optional(Schema.String),
  parents: Schema.optional(Schema.Array(ObjectId)),
  tree: ObjectId,
});
export type WriteCommitInput = typeof WriteCommitInput.Type;

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

export const hasInvalidRefChar = (value: string): boolean =>
  value.includes("\u0000") || invalidRefChars.test(value);

const isValidPathSegment = (segment: string): boolean =>
  segment.length > 0 &&
  segment !== "." &&
  segment !== ".." &&
  !segment.includes("\u0000") &&
  !segment.includes("/");

export const isValidRefSegment = (segment: string): boolean =>
  isValidPathSegment(segment) && !segment.endsWith(".") && !segment.startsWith(".");

export const isValidRefPath = (ref: string): boolean =>
  !ref.includes("//") &&
  !ref.includes("@{") &&
  !hasInvalidRefChar(ref) &&
  ref.split("/").every(isValidRefSegment);

export const isValidNamespace = (namespace: string, allowBranchNamespace = false): boolean =>
  namespace.startsWith("refs/") &&
  (allowBranchNamespace || !namespace.startsWith("refs/heads")) &&
  isValidRefPath(namespace);

export const Namespace = Schema.String.check(
  filter("a Git ref namespace outside refs/heads", (value) => isValidNamespace(value, false)),
);
export type Namespace = typeof Namespace.Type;

export const BranchNamespace = Schema.String.check(
  filter("a Git ref namespace", (value) => isValidNamespace(value, true)),
);
export type BranchNamespace = typeof BranchNamespace.Type;

export const namespace = (allowBranchNamespace = false) =>
  allowBranchNamespace ? BranchNamespace : Namespace;

export const RefName = Schema.String.check(filter("a valid Git ref path", isValidRefPath));
export type RefName = typeof RefName.Type;

export const isValidPointerName = (pointer: string): boolean => {
  if (
    pointer.length === 0 ||
    pointer.startsWith("/") ||
    pointer.endsWith("/") ||
    pointer.startsWith("refs/") ||
    pointer.startsWith("remotes/") ||
    pointer.startsWith("transactions/") ||
    pointer.includes("//") ||
    pointer.includes("@{") ||
    hasInvalidRefChar(pointer) ||
    pointer.endsWith(".lock")
  ) {
    return false;
  }

  return pointer.split("/").every(isValidRefSegment);
};

export const PointerName = Schema.String.check(
  filter("a relative Git ref segment for a store pointer", isValidPointerName),
);
export type PointerName = typeof PointerName.Type;

export const Ref = Schema.Struct({
  name: RefName,
  target: ObjectId,
});
export type Ref = typeof Ref.Type;

export const UpdateRefInput = Schema.Struct({
  expected: Schema.optional(Schema.NullOr(ObjectId)),
  ref: Schema.String,
  target: ObjectId,
});
export type UpdateRefInput = typeof UpdateRefInput.Type;

export const DeleteRefInput = Schema.Struct({
  expected: Schema.optional(Schema.NullOr(ObjectId)),
  ref: Schema.String,
});
export type DeleteRefInput = typeof DeleteRefInput.Type;

export const FetchInput = Schema.Struct({
  prune: Schema.optional(Schema.Boolean),
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type FetchInput = typeof FetchInput.Type;

export const PushInput = Schema.Struct({
  forceWithLease: Schema.optional(
    Schema.Array(
      Schema.Struct({
        expected: Schema.optional(Schema.NullOr(Schema.String)),
        ref: Schema.String,
      }),
    ),
  ),
  refspecs: Schema.Array(Schema.String),
  remote: Schema.String,
});
export type PushInput = typeof PushInput.Type;

export const TreeEntryType = Schema.Literals(["blob", "tree"]);
export type TreeEntryType = typeof TreeEntryType.Type;

export const TreeEntry = Schema.Struct({
  mode: Schema.String,
  name: Schema.String,
  objectId: ObjectId,
  type: TreeEntryType,
});
export type TreeEntry = typeof TreeEntry.Type;
