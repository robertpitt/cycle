# @cycle/git-store

[![Event Sourcing — Martin Fowler, YOW! 2016](https://i.ytimg.com/vi/ck7t592bvBg/hqdefault.jpg)](https://www.youtube.com/watch?v=ck7t592bvBg)

> [Event Sourcing — Martin Fowler, YOW! 2016](https://www.youtube.com/watch?v=ck7t592bvBg)

`@cycle/git-store` is an Effect-native store for Cycle documents and append-only event files backed
directly by a Git object database.

The package writes standard Git blobs, trees, commits, and refs without touching the normal
worktree, Git index, `HEAD`, user branches, tags, or notes. Cycle data lives under GitDB-style refs:

```text
refs/gitdb/<database>/<pointer>
```

The default database is `cycle`, and the default pointer is `main`, so the default document snapshot
ref is:

```text
refs/gitdb/cycle/main
```

This package is the direct-filesystem, Effect v4 GitDB storage implementation. It keeps the storage
format compatible with existing GitDB data, while exposing a smaller service-oriented API.

## Responsibilities

`@cycle/git-store` provides:

- Git repository discovery for normal repositories, worktrees, and common Git directories.
- Canonical Git object hashing, encoding, decoding, and loose object writes.
- Loose and packed object reads, including repositories packed by normal Git tooling.
- Loose and packed ref reads.
- Git-compatible lockfile ref transactions with optimistic expected-value checks.
- Document transactions that write objects before moving refs.
- Snapshot reads, tree listing, history traversal, and snapshot diffs.
- Append-only event storage under GitDB-compatible event paths.
- Repository identity resolution and explicit bootstrap.
- Local ref-change notifications for active store instances.
- Remote `fetch`, `pull`, `push`, and `sync` orchestration through a small transport boundary.

It does not provide:

- Source-control branch, tag, worktree, or index workflows.
- Merge UI, rebase UI, credential prompting, or provider-specific remote policy.
- Packfile writing or garbage collection.
- SHA-256 object-format repository support.

See [SPEC.md](./SPEC.md) for the full implementation specification and invariants.

## Storage Model

Documents are stored as files in the root tree of commits reachable from a GitDB pointer ref. A
transaction stages document mutations, writes the resulting blobs and trees into `.git/objects`, then
updates the pointer ref.

For example, putting `tickets/TCK-1.json` on the default store writes a normal Git blob and a commit
reachable from:

```text
refs/gitdb/cycle/main
```

Events are regular documents under:

```text
collections/events/<aggregate-type>/<aggregate-id>/<event-id>.json
```

The event helper preserves the current GitDB ticket sharding convention through the internal event
path builder, so callers should construct event paths through `EventStore.path`,
`EventStore.append`, or `aggregateEventPath` instead of hardcoding path layouts.

## Public Entry Points

The root package exports the primary services and schemas:

```ts
import {
  Document,
  EventStore,
  GitStoreSync,
  GitStores,
  GitStoresLive,
  RepositoryIdentity,
  RepositoryPathsLive,
} from "@cycle/git-store";
```

Subpath exports are available for direct ownership imports:

```ts
import { Document } from "@cycle/git-store/document";
import { GitStoreSync } from "@cycle/git-store/sync";
import { GitStoreError } from "@cycle/git-store/errors";
import { ObjectId, Snapshot } from "@cycle/git-store/schemas";
import { GitStoresTestLive, withTestIdentity } from "@cycle/git-store/testing";
```

Use the root export when consuming the package as an application service. Use subpaths when a module
needs a specific owner, such as schemas, errors, or testing support.

## Runtime Layer

`GitStoresLive` is the main application layer. It opens and caches scoped store instances by
repository, namespace, and database. Node applications should provide Effect platform services and
`RepositoryPathsLive` at the edge:

```ts
import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { GitStoresLive, RepositoryPathsLive } from "@cycle/git-store";

export const GitStoresNodeLive = GitStoresLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      NodeServices.layer,
      RepositoryPathsLive.pipe(Layer.provide(NodeServices.layer)),
    ),
  ),
);
```

Most callers should use `GitStores.withStore`. It resolves the repository, opens the correct scoped
instance, provides the instance context to the callback, and closes the scope when the callback
finishes.

## Quick Start

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import {
  Document,
  GitStores,
  GitStoresLive,
  RepositoryPathsLive,
} from "@cycle/git-store";

const GitStoresNodeLive = GitStoresLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      NodeServices.layer,
      RepositoryPathsLive.pipe(Layer.provide(NodeServices.layer)),
    ),
  ),
);

const program = Effect.gen(function* () {
  const stores = yield* GitStores;

  return yield* stores.withStore(
    {
      cwd: "/path/to/repo",
      database: "cycle",
      identity: {
        email: "cycle@example.invalid",
        name: "Cycle",
      },
    },
    (store) =>
      store.transaction({ message: "Create ticket" }, (tx) =>
        Effect.gen(function* () {
          yield* tx.put(
            "tickets/TCK-1.json",
            Document.json({
              status: "open",
              title: "First ticket",
            }),
          );

          return yield* tx.list("tickets");
        }),
      ),
  );
});

const result = await Effect.runPromise(program.pipe(Effect.provide(GitStoresNodeLive)));

console.log(result.snapshot.id);
console.log(result.value.map((entry) => entry.path));
```

## Opening A Store

`GitStores.withStore(options, use)` accepts `GitStoreOpenOptions`.

| Option | Default | Description |
| --- | --- | --- |
| `cwd` | `"."` | Repository working directory. |
| `gitDir` | `".git"` under `cwd` | Git directory or `.git` file to resolve. |
| `commonGitDir` | Resolved from `commondir` or `gitDir` | Object and refs directory for worktree-aware repositories. |
| `database` | `"cycle"` | Safe GitDB database segment used in `refs/gitdb/<database>/<pointer>`. |
| `defaultPointer` | `"main"` | Pointer used when operations do not name a pointer. |
| `namespace` | `"refs/gitdb"` | Ref namespace. |
| `identity` | none | Default commit author and committer for transactions. |
| `verifyGitDir` | `true` | Fails if the Git directory cannot be found. |

Repository discovery only supports SHA-1 object-format repositories. Repositories configured with a
different object format fail with `UnsupportedObjectFormatError`.

## Store API

`GitStore` is available inside `GitStores.withStore`.

```ts
type GitStoreShape = {
  readonly config: GitStoreConfig;
  readonly key: GitStoreKey;
  readonly get: (path: string, options?: ReadOptions) => Effect.Effect<Document | null, GitStoreError>;
  readonly list: (path?: string, options?: ReadOptions) => Effect.Effect<ReadonlyArray<TreeEntry>, GitStoreError>;
  readonly transaction: <A, E, R>(
    options: TransactionOptions,
    use: (tx: GitStoreTransaction) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<TransactionResult<A>, GitStoreError | E, R>;
  readonly history: (from?: string, options?: HistoryOptions) => Effect.Effect<ReadonlyArray<Snapshot>, GitStoreError>;
  readonly diff: (a: string, b: string) => Effect.Effect<ChangeSet, GitStoreError>;
  readonly snapshot: (id: string) => Effect.Effect<Snapshot, GitStoreError>;
  readonly resolveSnapshotId: (from?: string) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly pointerRef: (pointer: string) => Effect.Effect<RefName, GitStoreError>;
};
```

`from` can be a snapshot object id or a pointer name. Pointer names are resolved under the store's
configured namespace and database.

## Transactions

Transactions are the only high-level write API for documents.

```ts
const written = yield* store.transaction(
  {
    expectedSnapshot: null,
    message: "Initialize store",
    pointer: "main",
  },
  (tx) =>
    Effect.gen(function* () {
      yield* tx.put("tickets/TCK-1.json", Document.json({ title: "One" }));
      yield* tx.put("notes/TCK-1.txt", Document.text("created\n"));

      const staged = yield* tx.get("tickets/TCK-1.json");
      const entries = yield* tx.list("tickets");

      return { entries, staged };
    }),
);
```

Important transaction behavior:

- `tx.put(path, input)` writes or replaces a document.
- `tx.delete(path)` deletes a document path or subtree.
- `tx.get(path)` and `tx.list(path)` read the staged virtual tree, including pending mutations.
- `expectedSnapshot` controls optimistic concurrency. When omitted, the transaction expects the ref
  to still equal the snapshot read at transaction start.
- An empty transaction can return the base snapshot, but it cannot create an initial snapshot from an
  empty repository.
- A transaction object becomes inactive after the transaction callback finishes, succeeds, or fails.
- Path conflicts fail with `PathConflictError`; for example, a document path cannot also have
  descendants.

Objects are written before the pointer ref is moved. Ref updates use Git-compatible lockfiles and an
expected-value check, so concurrent writers fail with `RefExpectedValueConflictError` rather than
silently overwriting each other.

## Documents

`Document` wraps stored blob bytes and exposes helpers for common encodings:

```ts
yield* tx.put("raw.bin", Document.bytes(bytes));
yield* tx.put("readme.txt", Document.text("hello\n"));
yield* tx.put("ticket.json", Document.json({ status: "open" }));
```

Reading returns a `Document`:

```ts
const document = yield* store.get("ticket.json");

if (document !== null) {
  const text = document.text();
  const json = document.json<{ readonly status: string }>();
  const size = document.size;
  const objectId = document.objectId;
}
```

JSON document writes are canonicalized with stable key ordering and a trailing newline. When a schema
is supplied, the value is encoded through the schema before canonical JSON bytes are written:

```ts
import { Schema } from "effect";
import { Document } from "@cycle/git-store";

const Ticket = Schema.Struct({
  status: Schema.Literals(["open", "closed"]),
  title: Schema.String,
});

yield* tx.put(
  "tickets/TCK-1.json",
  Document.json(
    {
      status: "open",
      title: "Validated ticket",
    },
    Ticket,
  ),
);
```

Use `decodeJson(document, schema)` when reads need schema validation.

## Events

`EventStore` is available in the store instance context. Append events inside a document transaction:

```ts
import { Effect } from "effect";
import { EventStore } from "@cycle/git-store";

const result = yield* store.transaction({ message: "Append ticket event" }, (tx) =>
  Effect.gen(function* () {
    const events = yield* EventStore;

    return yield* events.append(tx, {
      aggregateId: "TCK-1",
      aggregateType: "ticket",
      eventId: "evt_0001",
      payload: {
        op: "ticket.create",
        title: "First ticket",
      },
    });
  }),
);
```

Event capabilities:

- `events.path(input)` validates identifiers and returns the event document path.
- `events.append(tx, input)` fails with `EventAppendConflictError` if the event file already exists.
- `events.list(options)` returns event documents and decoded payloads, sorted by path.
- `events.introduced(snapshot)` returns event changes introduced by a snapshot.
- `aggregateEventPath(input)` returns an aggregate root path for listing.
- `parseEventMetadataPath(path)` extracts event metadata from a stored event path.

Event payload JSON is canonicalized. Event identity is carried by the path, so payloads should not
duplicate aggregate id, aggregate type, or event id unless the domain event explicitly needs those
fields.

## History And Diffs

```ts
const current = yield* store.resolveSnapshotId();
const history = yield* store.history("main", { max: 10 });

if (history.length >= 2) {
  const diff = yield* store.diff(history[1]!.id, history[0]!.id);

  console.log(diff.added.map((change) => change.path));
  console.log(diff.modified.map((change) => change.path));
  console.log(diff.deleted.map((change) => change.path));
}
```

`history` traverses commit parents from the requested snapshot or pointer. `diff` compares flattened
document trees between two snapshots and reports added, modified, and deleted document paths.

## Repository Identity

Repository identity is derived from the root commit reachable from:

```text
refs/gitdb/cycle/main
```

Use `RepositoryIdentity.ensureIdentity` when a repository needs a Cycle identity. If a remote is
provided, the service first tries to adopt the remote identity:

```ts
import { RepositoryIdentity } from "@cycle/git-store";

const identity = yield* RepositoryIdentity;
const info = yield* identity.ensureIdentity({ remote: "origin" });

console.log(info.repositoryId);
console.log(info.rootCommitId);
```

`resolveIdentity()` returns `null` when the identity ref does not exist. Conflicting roots fail with
`RepositoryIdentityConflictError`.

## Sync

`GitStoreSync` coordinates the current store pointer with a remote Git ref through
`GitRemoteTransport`.

```ts
import { GitStoreSync } from "@cycle/git-store";

const sync = yield* GitStoreSync;

yield* sync.fetch({ remote: "origin" });
yield* sync.pull({ pointer: "main", remote: "origin" });
yield* sync.push({ pointer: "main", remote: "origin" });

const result = yield* sync.sync({
  mode: "full",
  onDiverged: "rebase",
  pointer: "main",
  remote: "origin",
});
```

Available modes:

| Method | Behavior |
| --- | --- |
| `fetch` | Updates the remote-tracking ref only. |
| `pull` | Fetches and fast-forwards the local pointer when possible. |
| `push` | Pushes the local pointer with a remote lease. |
| `sync` | Runs the selected mode, defaulting to full pull/push reconciliation. |

Pointer result statuses include:

- `up-to-date`
- `missing-remote-gitdb-ref`
- `fast-forwarded`
- `pushed`
- `rebased`
- `rejected`
- `remote-deleted`

By default, divergent local and remote histories fail with `GitSyncConflictError`. Passing
`onDiverged: "rebase"` allows `sync({ mode: "full" })` or `push` to replay non-conflicting local
commits on top of the remote commit and push the rebased pointer.

Remote transport is intentionally narrow. The live transport shells out to `git` only for explicit
remote operations: `ls-remote`, `fetch`, and `push`. Local object and ref storage does not shell out
to Git.

## Ref Changes

`GitStoreChanges` publishes local ref movement for active store instances. `GitStore` transactions
and sync operations poll the relevant ref after changes, and callers can subscribe to the stream:

```ts
import { Stream } from "effect";
import { GitStoreChanges } from "@cycle/git-store";

const changes = yield* GitStoreChanges;
const ref = yield* store.pointerRef("main");

yield* changes.poll({ ref });

const firstTwo = yield* changes.changes.pipe(Stream.take(2), Stream.runCollect);
```

The change stream reports:

- `ref`
- `before`
- `after`
- `source`, such as `local`, `external`, `fetch`, `pull`, `push`, or `sync`

The stream is intentionally ref-level. It does not eagerly compute tree diffs or scan the whole
repository.

## Errors

Recoverable failures are modeled as `Schema.TaggedErrorClass` values and exported from
`@cycle/git-store/errors`.

```ts
import { Effect } from "effect";
import { Document, GitStores } from "@cycle/git-store";

const program = Effect.gen(function* () {
  const stores = yield* GitStores;

  return yield* stores.withStore({ cwd: "/path/to/repo" }, (store) =>
    store.transaction({ message: "Write" }, (tx) =>
      tx.put("tickets/TCK-1.json", Document.json({ status: "open" })),
    ),
  );
}).pipe(
  Effect.catchTag("RefExpectedValueConflictError", (error) =>
    Effect.succeed({
      conflict: true,
      ref: error.ref,
    }),
  ),
);
```

Common error tags:

- `RepositoryNotFoundError`
- `UnsupportedObjectFormatError`
- `InvalidPathError`
- `InvalidPointerNameError`
- `InvalidRefNameError`
- `InvalidObjectIdError`
- `ObjectNotFoundError`
- `ObjectTypeMismatchError`
- `ObjectDecodeError`
- `RefExpectedValueConflictError`
- `RefLockUnavailableError`
- `SnapshotNotFoundError`
- `PathConflictError`
- `EmptyTransactionError`
- `TransactionInactiveError`
- `InvalidJsonDocumentError`
- `EventAppendConflictError`
- `MissingCommitIdentityError`
- `RepositoryIdentityConflictError`
- `GitRemoteError`
- `GitSyncConflictError`
- `FilesystemProtocolError`

## Low-Level Services

The package exposes lower-level services for code that needs Git storage primitives directly:

- `ObjectCodec` hashes and encodes canonical Git object bytes.
- `LooseObjectStore` writes loose objects and reads loose object bodies.
- `PackIndexStore` and `PackObjectStore` read packed objects.
- `ObjectStore` unifies loose and packed object reads and writes blobs, trees, and commits.
- `LooseRefStore` reads loose refs.
- `PackedRefsStore` reads `packed-refs`.
- `RefReader` reads refs from loose and packed stores.
- `RefTransaction` updates refs through lockfiles and atomic renames.
- `RefStore` combines reads and transactions.
- `ReflogStore` writes reflog entries where needed.
- `CommitWriter` builds commit objects and commits them to refs.
- `GitRemoteTransport` isolates remote Git command execution.

Most application code should use `GitStores`, `GitStore`, `EventStore`, `RepositoryIdentity`, and
`GitStoreSync` instead of these lower-level services.

## Testing

Testing helpers live under `@cycle/git-store/testing`.

```ts
import { Effect } from "effect";
import {
  Document,
  GitStores,
} from "@cycle/git-store";
import {
  GitStoresTestLive,
  withTestIdentity,
} from "@cycle/git-store/testing";

const program = Effect.gen(function* () {
  const stores = yield* GitStores;

  return yield* stores.withStore(
    withTestIdentity({
      cwd: "/path/to/temp/repo",
      database: "cycle",
    }),
    (store) =>
      store.transaction({ message: "Test write" }, (tx) =>
        tx.put("tickets/TCK-1.json", Document.json({ status: "open" })),
      ),
  );
});

await Effect.runPromise(program.pipe(Effect.provide(GitStoresTestLive)));
```

`GitStoresTestLive` provides the Node platform services and repository path layer expected by the
live store. Tests are still expected to create an actual temporary Git repository when using this
layer.

## Package Layout

```text
src/
  GitStores.ts             store registry facade
  GitStore.ts              document store and transactions
  EventStore.ts            append-only event helper
  RepositoryIdentity.ts    Cycle repository identity
  GitStoreSync.ts          fetch, pull, push, and sync orchestration
  GitRemoteTransport.ts    remote transport boundary
  *Store.ts                object and ref storage services
  GitStoreSchemas.ts       schema-first public contracts
  GitStoreErrors.ts        typed error classes
  internal/                package-private helpers
  testing/                 test-only layers and helpers
```

Keep new public services as focused root-level files in `src/`. Keep implementation details under
`src/internal/`, and keep test-only support under `src/testing/`.

## Scripts

From the repository root:

```sh
pnpm --filter @cycle/git-store typecheck
pnpm --filter @cycle/git-store test
```

The current tests cover:

- Canonical Git object hashing.
- Ref-name and store-path validation.
- Packed ref and packed object reads.
- Store instance reuse and invalidation.
- Scoped document transactions, reads, history, and diffs.
- Ref-change notifications.
- Remote push, pull, full sync, conflict handling, and rebase mode.
- Repository identity bootstrap and remote adoption.
- Event append, listing, introduced-event discovery, and legacy path parsing.

## Operational Notes

- The package reads and writes `.git` data directly for local storage. Use it only against Git
  repositories that Cycle is allowed to manage.
- Local writes do not mutate checked-out files, the index, `HEAD`, branches, tags, or notes.
- Ref updates are per-ref atomic, not multi-ref atomic.
- The store writes loose objects. Normal Git maintenance may later pack them, and the store can read
  packed objects.
- Remote operations require a working `git` executable in `PATH`.
- Store instances are cached by `LayerMap` and have a five-minute idle TTL. Use `GitStores.invalidate`
  when a caller needs to force a fresh instance for the same repository key.
