import {
  aggregateEventPath,
  EventStore,
  parseEventMetadataPath,
  type AppendEventInput,
  type EventChange,
  type ParsedEventPath,
} from "@cycle/git-store/events";
import type { GitStoreError } from "@cycle/git-store/errors";
import type {
  ChangeSet,
  GitStoreOpenOptions,
  HistoryOptions,
  ReadOptions,
  Snapshot,
  TreeEntry,
} from "@cycle/git-store/schemas";
import {
  type GitStoreTransaction,
  type GitStoreShape,
  type TransactionOptions,
  type TransactionResult,
} from "@cycle/git-store/store";
import { GitStores, type GitStoresShape } from "@cycle/git-store/stores";
import { GitStoreSync, type GitSyncOptions, type GitSyncResult } from "@cycle/git-store/sync";
import {
  RepositoryIdentity,
  type EnsureRepositoryIdentityOptions,
  type RepositoryIdentityInfo,
} from "@cycle/git-store/repository-identity";
import type { Document } from "@cycle/git-store/document";
import { Effect } from "effect";

export type RepositoryTransaction = GitStoreTransaction;
export type RepositoryTransactionOptions = TransactionOptions;
export type RepositoryTransactionResult<A> = TransactionResult<A>;
export type RepositorySyncOptions = GitSyncOptions;
export type RepositorySyncResult = GitSyncResult;
export type RepositorySnapshot = Snapshot;
export type RepositoryEntry = TreeEntry;
export type RepositoryEventChange = EventChange;
export type RepositoryEventPath = ParsedEventPath;

export type RepositoryStoreShape = {
  readonly aggregatePath: (input: {
    readonly aggregateId: string;
    readonly aggregateType: string;
  }) => string;
  readonly appendEvent: <TPayload>(
    tx: RepositoryTransaction,
    input: AppendEventInput<TPayload>,
  ) => Effect.Effect<string, GitStoreError>;
  readonly currentSnapshotForPointer: (
    pointer: string,
  ) => Effect.Effect<Snapshot | null, GitStoreError>;
  readonly diff: (a: string, b: string) => Effect.Effect<ChangeSet, GitStoreError>;
  readonly ensureIdentity: (
    options?: EnsureRepositoryIdentityOptions,
  ) => Effect.Effect<RepositoryIdentityInfo, GitStoreError>;
  readonly get: (
    path: string,
    options?: ReadOptions,
  ) => Effect.Effect<Document | null, GitStoreError>;
  readonly history: (
    from?: string,
    options?: HistoryOptions,
  ) => Effect.Effect<ReadonlyArray<Snapshot>, GitStoreError>;
  readonly introduced: (
    snapshot: Snapshot,
  ) => Effect.Effect<ReadonlyArray<EventChange>, GitStoreError>;
  readonly list: (
    path?: string,
    options?: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError>;
  readonly parseEventPath: (path: string) => ParsedEventPath | null;
  readonly pointerRef: (pointer: string) => Effect.Effect<string, GitStoreError>;
  readonly resolveIdentity: () => Effect.Effect<RepositoryIdentityInfo | null, GitStoreError>;
  readonly resolveSnapshotId: (from?: string) => Effect.Effect<string | null, GitStoreError>;
  readonly snapshot: (id: string) => Effect.Effect<Snapshot, GitStoreError>;
  readonly sync: (options?: GitSyncOptions) => Effect.Effect<GitSyncResult, GitStoreError>;
  readonly transaction: <A, E, R>(
    options: TransactionOptions,
    use: (tx: RepositoryTransaction) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<TransactionResult<A>, GitStoreError | E, R>;
};

export const makeGitRepositoryStore = (
  stores: GitStoresShape,
  options: GitStoreOpenOptions,
): RepositoryStoreShape => {
  const withStore = <A, E, R>(
    use: (store: GitStoreShape) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, GitStoreError | E> =>
    stores.withStore(options, use) as Effect.Effect<A, GitStoreError | E>;

  return {
    aggregatePath: aggregateEventPath,
    appendEvent: (tx, input) =>
      withStore(() => EventStore.use((events) => events.append(tx, input))),
    currentSnapshotForPointer: (pointer) =>
      withStore((store) =>
        store
          .resolveSnapshotId(pointer)
          .pipe(Effect.flatMap((id) => (id === null ? Effect.succeed(null) : store.snapshot(id)))),
      ),
    diff: (a, b) => withStore((store) => store.diff(a, b)),
    ensureIdentity: (identityOptions) =>
      withStore(() =>
        RepositoryIdentity.use((identity) => identity.ensureIdentity(identityOptions)),
      ),
    get: (path, readOptions) => withStore((store) => store.get(path, readOptions)),
    history: (from, historyOptions) => withStore((store) => store.history(from, historyOptions)),
    introduced: (snapshot) =>
      withStore(() => EventStore.use((events) => events.introduced(snapshot))),
    list: (path, readOptions) => withStore((store) => store.list(path, readOptions)),
    parseEventPath: parseEventMetadataPath,
    pointerRef: (pointer) => withStore((store) => store.pointerRef(pointer)),
    resolveIdentity: () =>
      withStore(() => RepositoryIdentity.use((identity) => identity.resolveIdentity())),
    resolveSnapshotId: (from) => withStore((store) => store.resolveSnapshotId(from)),
    snapshot: (id) => withStore((store) => store.snapshot(id)),
    sync: (syncOptions) => withStore(() => GitStoreSync.use((sync) => sync.sync(syncOptions))),
    transaction: (transactionOptions, use) =>
      stores.withStore(options, (store) => store.transaction(transactionOptions, use)),
  };
};

export const makeGitRepositoryStoreEffect = (
  options: GitStoreOpenOptions,
): Effect.Effect<RepositoryStoreShape, never, GitStores> =>
  GitStores.use((stores) => Effect.succeed(makeGitRepositoryStore(stores, options)));
