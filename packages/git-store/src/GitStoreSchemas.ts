import { Schema } from "effect";
import { objectIdPattern, safeSegmentPattern } from "./internal/patterns.ts";
import { splitPath } from "./internal/strings.ts";

const filter = (expected: string, predicate: (value: string) => boolean) =>
  Schema.makeFilter<string>((value) => predicate(value) || expected, { expected });

export const isObjectId = (value: string): boolean => objectIdPattern.test(value.toLowerCase());

const hasAsciiControlOrSpace = (value: string): boolean => {
  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code <= 0x20 || code === 0x7f) return true;
  }

  return false;
};

const hasRefForbiddenCharacter = (value: string): boolean => {
  for (const char of value) {
    if ("~^:?*[\\".includes(char)) return true;
  }

  return false;
};

export const isSafeSegment = (value: string): boolean =>
  safeSegmentPattern.test(value) &&
  value !== "." &&
  value !== ".." &&
  !value.startsWith(".") &&
  !value.endsWith(".") &&
  !value.endsWith(".lock") &&
  !value.includes("/") &&
  !value.includes("\\") &&
  !value.includes("\0") &&
  !value.includes("@{") &&
  !hasAsciiControlOrSpace(value) &&
  !hasRefForbiddenCharacter(value);

export const isValidStorePath = (value: string): boolean =>
  value === "" ||
  (!value.includes("\\") &&
    !value.includes("\0") &&
    splitPath(value).every((segment) => isSafeSegment(segment)));

export const isValidRefName = (value: string): boolean => {
  if (
    value === "@" ||
    !value.includes("/") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.endsWith(".") ||
    hasAsciiControlOrSpace(value) ||
    hasRefForbiddenCharacter(value)
  ) {
    return false;
  }

  return splitPath(value).every(isSafeSegment);
};

export const ObjectId = Schema.String.check(
  Schema.isPattern(objectIdPattern, { expected: "a 40 character lowercase SHA-1 object id" }),
).pipe(Schema.brand("ObjectId"));
export type ObjectId = typeof ObjectId.Type;

export const SafeSegment = Schema.String.check(
  Schema.isPattern(safeSegmentPattern, { expected: "a safe Git ref segment" }),
  filter("a safe Git ref segment", isSafeSegment),
).pipe(Schema.brand("SafeSegment"));
export type SafeSegment = typeof SafeSegment.Type;

export const PointerName = SafeSegment.pipe(Schema.brand("PointerName"));
export type PointerName = typeof PointerName.Type;

export const DatabaseName = SafeSegment.pipe(Schema.brand("DatabaseName"));
export type DatabaseName = typeof DatabaseName.Type;

export const RefName = Schema.String.check(filter("a safe full Git ref name", isValidRefName)).pipe(
  Schema.brand("RefName"),
);
export type RefName = typeof RefName.Type;

export const StorePath = Schema.String.check(
  filter("a normalized Git store path", isValidStorePath),
).pipe(Schema.brand("StorePath"));
export type StorePath = typeof StorePath.Type;

export const MutationPath = StorePath.check(
  filter("a non-root mutation path", (path) => path !== ""),
).pipe(Schema.brand("MutationPath"));
export type MutationPath = typeof MutationPath.Type;

export const GitObjectType = Schema.Literals(["blob", "tree", "commit", "tag"]);
export type GitObjectType = typeof GitObjectType.Type;

export const TreeEntryType = Schema.Literals(["blob", "tree"]);
export type TreeEntryType = typeof TreeEntryType.Type;

export const TreeEntry = Schema.Struct({
  mode: Schema.String,
  name: Schema.String,
  objectId: ObjectId,
  path: StorePath,
  type: TreeEntryType,
});
export type TreeEntry = typeof TreeEntry.Type;

export const IdentityInput = Schema.Struct({
  date: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
  email: Schema.String,
  name: Schema.String,
  timezone: Schema.optional(Schema.String),
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

export const Snapshot = Schema.Struct({
  author: Schema.optional(Identity),
  committer: Schema.optional(Identity),
  createdAt: Schema.optional(Schema.String),
  id: ObjectId,
  message: Schema.optional(Schema.String),
  parents: Schema.Array(ObjectId),
  root: ObjectId,
});
export type Snapshot = typeof Snapshot.Type;

export const Change = Schema.Struct({
  newObjectId: Schema.optional(ObjectId),
  oldObjectId: Schema.optional(ObjectId),
  path: StorePath,
});
export type Change = typeof Change.Type;

export const ChangeSet = Schema.Struct({
  added: Schema.Array(Change),
  deleted: Schema.Array(Change),
  modified: Schema.Array(Change),
});
export type ChangeSet = typeof ChangeSet.Type;

export const ReadOptions = Schema.Struct({
  from: Schema.optional(Schema.Union([ObjectId, PointerName])),
});
export type ReadOptions = typeof ReadOptions.Type;

export const HistoryOptions = Schema.Struct({
  max: Schema.optional(Schema.Number),
  path: Schema.optional(StorePath),
  since: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
  until: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
});
export type HistoryOptions = typeof HistoryOptions.Type;

export const GitStoreConfigSchema = Schema.Struct({
  commonGitDir: Schema.String,
  cwd: Schema.String,
  database: DatabaseName,
  defaultPointer: PointerName,
  gitDir: Schema.String,
  identity: Schema.optional(IdentityInput),
  namespace: RefName,
});
export type GitStoreConfig = typeof GitStoreConfigSchema.Type;

export const GitStoreOpenOptionsSchema = Schema.Struct({
  commonGitDir: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  database: Schema.optional(Schema.String),
  defaultPointer: Schema.optional(Schema.String),
  gitDir: Schema.optional(Schema.String),
  identity: Schema.optional(IdentityInput),
  namespace: Schema.optional(Schema.String),
  verifyGitDir: Schema.optional(Schema.Boolean),
});
export type GitStoreOpenOptions = typeof GitStoreOpenOptionsSchema.Type;

export type GitStoreKey = {
  readonly commonGitDir: string;
  readonly database: DatabaseName;
  readonly id: string;
  readonly namespace: RefName;
};

export const GitStoreKey = Schema.Struct({
  commonGitDir: Schema.String,
  database: DatabaseName,
  id: Schema.String,
  namespace: RefName,
});

export const joinStorePath = (...parts: ReadonlyArray<string>): string =>
  parts.filter((part) => part.length > 0).join("/");
