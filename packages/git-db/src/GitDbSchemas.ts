import { Schema } from "effect";
import {
  BranchNamespace,
  Identity,
  IdentityInput,
  ObjectId,
  PointerName,
  TreeEntryType,
} from "@cycle/git/schemas";

const filter = (expected: string, predicate: (value: string) => boolean) =>
  Schema.makeFilter<string>((value) => predicate(value) || expected, { expected });

export const safeSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export const isValidPathSegment = (segment: string): boolean =>
  segment.length > 0 &&
  segment !== "." &&
  segment !== ".." &&
  !segment.endsWith(".lock") &&
  !segment.includes("/");

export const isSafeSegment = (value: string): boolean =>
  safeSegmentPattern.test(value) && isValidPathSegment(value);

export const SafeSegment = Schema.String.check(
  Schema.isPattern(safeSegmentPattern, {
    expected:
      "a non-empty identifier segment containing letters, numbers, dots, underscores, or hyphens",
  }),
  filter("a valid path segment", isValidPathSegment),
);
export type SafeSegment = typeof SafeSegment.Type;

export const DatabaseName = SafeSegment;
export type DatabaseName = typeof DatabaseName.Type;

export const RemoteName = SafeSegment;
export type RemoteName = typeof RemoteName.Type;

export const isValidStorePath = (path: string): boolean =>
  path === "" ||
  (!path.includes("\\") && !path.includes("\0") && path.split("/").every(isValidPathSegment));

export const StorePath = Schema.String.check(filter("a normalized store path", isValidStorePath));
export type StorePath = typeof StorePath.Type;

export const MutationPath = StorePath.check(
  filter("a non-root mutation path", (path) => path !== ""),
);
export type MutationPath = typeof MutationPath.Type;

export const joinStorePath = (...parts: ReadonlyArray<string>): string =>
  parts.filter(Boolean).join("/");

export const Change = Schema.Struct({
  newObjectId: Schema.optional(ObjectId),
  oldObjectId: Schema.optional(ObjectId),
  path: Schema.String,
});
export type Change = typeof Change.Type;

export const ChangeSet = Schema.Struct({
  added: Schema.Array(Change),
  deleted: Schema.Array(Change),
  modified: Schema.Array(Change),
});
export type ChangeSet = typeof ChangeSet.Type;

export const CommitOptions = Schema.Struct({
  author: Schema.optional(IdentityInput),
  committer: Schema.optional(IdentityInput),
  expectedSnapshot: Schema.optional(Schema.NullOr(ObjectId)),
  message: Schema.optional(Schema.String),
  pointer: Schema.optional(PointerName),
});
export type CommitOptions = typeof CommitOptions.Type;

export const DivergenceMode = Schema.Literals([
  "error",
  "keep-local",
  "keep-remote",
  "merge",
  "rebase",
]);
export type DivergenceMode = typeof DivergenceMode.Type;

export const Entry = Schema.Struct({
  mode: Schema.String,
  name: Schema.String,
  objectId: ObjectId,
  path: StorePath,
  type: TreeEntryType,
});
export type Entry = typeof Entry.Type;

export const HistoryOptions = Schema.Struct({
  from: Schema.optional(ObjectId),
  max: Schema.optional(Schema.Number),
  path: Schema.optional(StorePath),
  since: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
  until: Schema.optional(Schema.Union([Schema.Date, Schema.String])),
});
export type HistoryOptions = typeof HistoryOptions.Type;

export const MovePointerOptions = Schema.Struct({
  expectedSnapshot: Schema.optional(Schema.NullOr(ObjectId)),
});
export type MovePointerOptions = typeof MovePointerOptions.Type;

export const PointerSyncStatus = Schema.Literals([
  "diverged",
  "fast-forwarded",
  "merged",
  "missing-remote-gitdb-ref",
  "pushed",
  "rebased",
  "rejected",
  "remote-deleted",
  "up-to-date",
]);
export type PointerSyncStatus = typeof PointerSyncStatus.Type;

export const PointerSyncResult = Schema.Struct({
  localAfter: Schema.optional(ObjectId),
  localBefore: Schema.optional(ObjectId),
  pointer: PointerName,
  remoteAfter: Schema.optional(ObjectId),
  remoteBefore: Schema.optional(ObjectId),
  status: PointerSyncStatus,
});
export type PointerSyncResult = typeof PointerSyncResult.Type;

export const ReadOptions = Schema.Struct({
  from: Schema.optional(ObjectId),
});
export type ReadOptions = typeof ReadOptions.Type;

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

export const SyncMode = Schema.Literals(["fetch", "full", "pull", "push"]);
export type SyncMode = typeof SyncMode.Type;

export const SyncOptions = Schema.Struct({
  mode: Schema.optional(SyncMode),
  onDiverged: Schema.optional(DivergenceMode),
  pointers: Schema.optional(Schema.Array(PointerName)),
  remote: Schema.optional(RemoteName),
});
export type SyncOptions = typeof SyncOptions.Type;

export const SyncResult = Schema.Struct({
  pointers: Schema.Array(PointerSyncResult),
  remote: RemoteName,
});
export type SyncResult = typeof SyncResult.Type;

export const Options = Schema.Struct({
  allowBranchNamespace: Schema.optional(Schema.Boolean),
  cwd: Schema.optional(Schema.String),
  database: Schema.optional(Schema.String),
  defaultPointer: Schema.optional(Schema.String),
  gitDir: Schema.optional(Schema.String),
  namespace: Schema.optional(Schema.String),
  verifyGitDir: Schema.optional(Schema.Boolean),
});
export type Options = typeof Options.Type;

export class Store extends Schema.Class<Store>("@cycle/git-db/Store")({
  cwd: Schema.String,
  database: DatabaseName,
  defaultPointer: PointerName,
  gitDir: Schema.String,
  namespace: BranchNamespace,
}) {
  get refPrefix(): string {
    return `${this.namespace}/${this.database}`;
  }
}
