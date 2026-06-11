import { Context, Effect } from "effect";
import type {
  CommitObject,
  DeleteRefInput,
  FetchInput,
  ObjectId,
  PushInput,
  Ref as GitRef,
  TreeEntry,
  UpdateRefInput,
  WriteCommitInput,
} from "../schemas/index.ts";
import type {
  GitAdapterError,
  GitTransportError,
  RemoteFetchError,
  RemotePushError,
} from "../errors/index.ts";

export type GitStore = {
  readonly cwd: string;
  readonly gitDir: string;
};

export type GitService = {
  readonly deleteRef: (
    store: GitStore,
    input: DeleteRefInput,
  ) => Effect.Effect<void, GitAdapterError>;
  readonly fetch: (store: GitStore, input: FetchInput) => Effect.Effect<void, RemoteFetchError>;
  readonly isAncestor: (
    store: GitStore,
    ancestor: ObjectId,
    descendant: ObjectId,
  ) => Effect.Effect<boolean, GitAdapterError>;
  readonly isCommit: (store: GitStore, id: string) => Effect.Effect<boolean, GitAdapterError>;
  readonly listRefs: (
    store: GitStore,
    prefix: string,
  ) => Effect.Effect<ReadonlyArray<GitRef>, GitAdapterError>;
  readonly mergeBase: (
    store: GitStore,
    a: ObjectId,
    b: ObjectId,
  ) => Effect.Effect<ObjectId | null, GitAdapterError>;
  readonly push: (store: GitStore, input: PushInput) => Effect.Effect<void, RemotePushError>;
  readonly readBlob: (store: GitStore, id: ObjectId) => Effect.Effect<Uint8Array, GitAdapterError>;
  readonly readCommit: (
    store: GitStore,
    id: ObjectId,
  ) => Effect.Effect<CommitObject, GitAdapterError>;
  readonly readRef: (
    store: GitStore,
    name: string,
  ) => Effect.Effect<ObjectId | null, GitAdapterError>;
  readonly readTree: (
    store: GitStore,
    id: ObjectId,
  ) => Effect.Effect<ReadonlyArray<TreeEntry>, GitAdapterError>;
  readonly updateRef: (
    store: GitStore,
    input: UpdateRefInput,
  ) => Effect.Effect<void, GitAdapterError>;
  readonly writeBlob: (
    store: GitStore,
    bytes: Uint8Array,
  ) => Effect.Effect<ObjectId, GitAdapterError>;
  readonly writeCommit: (
    store: GitStore,
    input: WriteCommitInput,
  ) => Effect.Effect<ObjectId, GitAdapterError>;
  readonly writeTree: (
    store: GitStore,
    entries: ReadonlyArray<TreeEntry>,
  ) => Effect.Effect<ObjectId, GitAdapterError>;
};

export class Git extends Context.Service<Git, GitService>()("@cycle/git/Git") {}

export type GitError = GitAdapterError;
export type { GitTransportError };
