# @cycle/git-db

GitDB is a small Effect service for storing application documents in Git objects without touching
the normal source-control workflow. It writes JSON documents as blobs, groups them in Git trees,
commits complete database snapshots, and moves named pointers under `refs/gitdb`.

This package is source-first inside the Cycle monorepo and is intended for application data that
benefits from Git's immutable object model, local-first history, and explicit synchronization.

This README is organized by use case. The first sections explain how the package fits together; the
API reference sections show the call shape and the kind of result you should expect when reading or
writing realistic project data.

Object IDs in examples are representative 40-character Git SHA-1 values. They will change when
commit metadata, document bytes, parent snapshots, or the backend changes.

## Contents

- [Package Role](#package-role)
- [Run And Test](#run-and-test)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Mental model](#mental-model)
- [Local benchmark script](#local-benchmark-script)
- [Minimal Effect program](#minimal-effect-program)
- [Collections](#collections)
- [Store reads](#store-reads)
- [Transactions](#transactions)
- [Pointers](#pointers)
- [Snapshots, history, and diff](#snapshots-history-and-diff)
- [Sync](#sync)
- [Module-first helper APIs](#module-first-helper-apis)
- [Validation and expected failures](#validation-and-expected-failures)
- [Real Git safety properties](#real-git-safety-properties)
- [Development Notes](#development-notes)

## Package Role

Use `@cycle/git-db` when the application needs a JSON document store with:

- immutable snapshots represented as Git commits
- named mutable pointers represented as refs under a dedicated namespace
- collection-level reads and writes
- explicit indexes for common lookup paths
- optimistic transactions
- history and diff over database snapshots
- fetch/push/full sync of GitDB refs without touching normal Git branches

This package does not implement a general relational database, query planner, CRDT, merge engine, or
worktree checkout flow. It stores JSON documents and derives trees, commits, refs, indexes, history,
and sync behavior from Git primitives.

## Run And Test

From the repository root:

```sh
pnpm install
pnpm --filter @cycle/git-db test
pnpm --filter @cycle/git-db typecheck
```

Run the local benchmark:

```sh
pnpm --filter @cycle/git-db bench:local -- --count 5000 --page-size 100
```

The benchmark writes Git objects and refs under `refs/gitdb`; it does not touch the worktree, Git
index, `HEAD`, or normal branches.

## Quick Start

Use the in-memory layer for tests and examples:

```ts
import { Effect } from "effect";
import { GitDbInMemory, Store } from "@cycle/git-db";

const program = Effect.gen(function* () {
  const store = yield* Store.StoreService;
  const issues = yield* store.collection<{ readonly title: string }>("issues");

  yield* issues.put("CYC-1", { title: "Document GitDB" }, { message: "Create issue" });

  return yield* issues.get("CYC-1");
}).pipe(Effect.provide(GitDbInMemory()));
```

Use a real repository through the Git CLI:

```ts
const layer = GitDbLive({
  cwd: "/repo/worktree",
  gitDir: "/repo/worktree/.git",
  database: "default",
  defaultPointer: "main",
});
```

Use the direct filesystem object backend when you want to avoid invoking the Git CLI for local object
reads and writes:

```ts
const layer = GitDbFilesystem({
  cwd: "/repo/worktree",
  gitDir: "/repo/worktree/.git",
});
```

## Architecture

```txt
Application Effect program
  -> Store.StoreService
      -> collections, transactions, pointers, history, diff, sync
  -> Git adapter
      -> GitDbLive: Git CLI backend
      -> GitDbFilesystem: direct .git object/ref backend
      -> GitDbInMemory: deterministic test backend
  -> Git object database
      -> blobs for JSON documents
      -> trees for collections and indexes
      -> commits for snapshots
      -> refs for pointers
```

Source layout:

```txt
src/
  domain/      Public TypeScript domain types.
  errors/      Typed error constructors and error classes.
  git/         Replaceable Git adapter interfaces and implementations.
  internals/   Hashing, byte, and identity helpers.
  schemas/     Effect Schema decoders for identifiers, refs, commits, and options.
  store/       Store service, collection/pointer/snapshot/sync helpers, and layers.
  index.ts     Public package exports.
test/          Vitest coverage using Effect helpers and temporary repositories.
scripts/       Local benchmark script.
```

Public package exports include:

- live layers: `GitDbLive`, `GitDbFilesystem`, `GitDbInMemory`
- service namespace: `Store`
- helper namespaces: `Collection`, `Document`, `Pointer`, `Snapshot`, `Sync`, `Transaction`, `Tree`
- lower-level Git APIs under `git/`
- schemas as `Schemas`
- typed errors from `errors/`

## Mental model

| GitDB concept | Git storage |
| --- | --- |
| Store | Existing Git object database plus a GitDB ref namespace |
| Collection | Tree under `collections/<collection>` |
| Document | JSON blob under a sharded collection path |
| Snapshot | Git commit whose tree is the complete database state |
| Pointer | Ref such as `refs/gitdb/default/main` |
| Transaction | In-memory staged mutations committed atomically |
| Index | Tree-backed lookup under `indexes/<collection>/<index>/<key>` |
| Sync | Explicit fetch/push of GitDB refs |

Default store identity:

```txt
namespace: refs/gitdb
database: default
default pointer: main
local pointer ref: refs/gitdb/default/main
remote pointer ref: refs/gitdb/default/remotes/origin/main
```

The package exposes Effect layers:

```ts
import { GitDbFilesystem, GitDbInMemory, GitDbLive } from "@cycle/git-db";
```

| Layer | Use case |
| --- | --- |
| `GitDbLive(options)` | Production/default backend using the Git CLI |
| `GitDbFilesystem(options)` | Direct filesystem object backend |
| `GitDbInMemory(options)` | Deterministic tests and examples, no real `.git` directory required |

Common options:

```ts
{
  cwd: "/repo/worktree",
  gitDir: "/repo/worktree/.git",
  namespace: "refs/gitdb",
  database: "default",
  defaultPointer: "main",
  shardLength: 2,
  verifyGitDir: true
}
```

## Local benchmark script

Run a local benchmark against the current repository's Git database:

```sh
pnpm --dir packages/git-db bench:local -- --count 5000 --page-size 100
```

The script imports the local GitDB module, loads `GitDbFilesystem` by default, seeds realistic issue
documents into `refs/gitdb/benchmark/main`, then times cold and warm page reads, cached cursor
navigation, index navigation, sample point reads, and a full list read. It writes Git objects and
GitDB refs only; it does not touch the worktree, `HEAD`, the Git index, or normal branches.

Useful flags:

```sh
pnpm --dir packages/git-db bench:local -- --count 10000 --page-size 250
pnpm --dir packages/git-db bench:local -- --backend cli --database benchmark-cli
pnpm --dir packages/git-db bench:local -- --backend filesystem --database benchmark-fs
pnpm --dir packages/git-db bench:local -- --append
```

## Minimal Effect program

```ts
import { Effect } from "effect";
import { GitDbInMemory, Store } from "@cycle/git-db";

const program = Effect.gen(function* () {
  const store = yield* Store.StoreService;
  const tickets = yield* store.collection<{
    readonly status: "open" | "closed";
    readonly title: string;
  }>("tickets");

  const snapshot = yield* tickets.put(
    "ticket-1",
    {
      status: "open",
      title: "Safety test",
    },
    {
      message: "Create ticket",
    },
  );

  const value = yield* tickets.get("ticket-1");

  return { snapshot, value };
}).pipe(Effect.provide(GitDbInMemory()));
```

Example result:

```ts
{
  snapshot: {
    id: "8dd3f6dc9b3a5f0b5e1e0de5c634d0ac2e05c03a",
    root: "d08f8f48b2f6c0ac59f747dba11a7c8e892ac6e1",
    parents: [],
    message: "Create ticket",
    createdAt: "2026-06-08T21:42:11.000Z",
    author: {
      name: "GitDB",
      email: "git-db@example.invalid",
      date: "2026-06-08T21:42:11.000Z",
      timestamp: 1780954931,
      timezone: "+0000"
    },
    committer: {
      name: "GitDB",
      email: "git-db@example.invalid",
      date: "2026-06-08T21:42:11.000Z",
      timestamp: 1780954931,
      timezone: "+0000"
    }
  },
  value: {
    status: "open",
    title: "Safety test"
  }
}
```

## Collections

### Get a collection handle

```ts
const providers = yield* store.collection<{
  readonly enabled: boolean;
  readonly name: string;
  readonly tags?: ReadonlyArray<string>;
  readonly type: string;
}>("providers", {
  indexes: ["type", "tags"],
});
```

Result:

```ts
{
  name: "providers",
  path: "collections/providers",
  get: Function,
  put: Function,
  delete: Function,
  list: Function,
  document: Function,
  index: Function,
  meta: Function,
  setMeta: Function
}
```

Collection names must be safe path segments like `providers`, `tickets`, or `workspace_settings`.

### Put one document

```ts
const snapshot = yield* providers.put(
  "stripe",
  {
    enabled: true,
    name: "Stripe",
    tags: ["payment", "card", "live"],
    type: "payment",
  },
  {
    message: "Add Stripe provider",
  },
);
```

Example result:

```ts
{
  id: "94be553c8f5a3658cb1d94b7430b7a0d2c4a9e74",
  root: "4637f9608c52b2de3f329c7e7f9cd853e81b6d6e",
  parents: [],
  message: "Add Stripe provider",
  createdAt: "2026-06-08T21:45:10.000Z"
}
```

With the default `shardLength: 2`, document ID `stripe` is stored at:

```txt
collections/providers/2f/stripe.json
```

The index entry is stored at:

```txt
indexes/providers/type/payment/stripe
```

### Get one document value

```ts
const stripe = yield* providers.get("stripe");
```

Result:

```ts
{
  enabled: true,
  name: "Stripe",
  type: "payment"
}
```

Missing documents return `null`:

```ts
const missing = yield* providers.get("paypal");
// null
```

### Get the raw document

```ts
const document = yield* providers.document("stripe");
```

Example result:

```ts
{
  objectId: "7c4b57e8694c1f6c3f853a1a0c739da40a8d1f17",
  path: "collections/providers/2f/stripe.json",
  size: 58,
  text: () => "{\"enabled\":true,\"name\":\"Stripe\",\"type\":\"payment\"}",
  json: () => ({ enabled: true, name: "Stripe", type: "payment" })
}
```

The actual `Document` instance contains `bytes`, `objectId`, `path`, plus `size`, `text()`, and
`json<T>()`.

### List collection entries

```ts
yield* providers.put("adyen", {
  enabled: false,
  name: "Adyen",
  type: "payment",
});

const entries = yield* providers.list();
```

Example result:

```ts
[
  {
    id: "stripe",
    path: "collections/providers/2f/stripe.json",
    value: {
      enabled: true,
      name: "Stripe",
      type: "payment"
    },
    document: Document
  },
  {
    id: "adyen",
    path: "collections/providers/85/adyen.json",
    value: {
      enabled: false,
      name: "Adyen",
      type: "payment"
    },
    document: Document
  }
]
```

### Page collection entries

Use `page` when a collection may contain many documents. GitDB walks the tree entries to find the
next document paths, then reads and parses only the blobs in the returned page.

```ts
const firstPage = yield* providers.page({ limit: 2 });
const secondPage = yield* providers.page({
  cursor: firstPage.nextCursor,
  limit: 2,
});
```

Example first page:

```ts
{
  entries: [
    {
      id: "stripe",
      path: "collections/providers/2f/stripe.json",
      value: {
        enabled: true,
        name: "Stripe",
        type: "payment"
      },
      document: Document
    },
    {
      id: "adyen",
      path: "collections/providers/85/adyen.json",
      value: {
        enabled: false,
        name: "Adyen",
        type: "payment"
      },
      document: Document
    }
  ],
  nextCursor: "collections/providers/85/adyen.json"
}
```

The cursor is exclusive. To page a stable historical view, keep passing the same `from` value:

```ts
const page = yield* providers.page({
  from: snapshot.id,
  cursor: previous.nextCursor,
  limit: 100,
});
```

### Collection metadata

```ts
const snapshot = yield* providers.setMeta(
  {
    label: "Payment providers",
    owner: "platform",
  },
  {
    message: "Label provider collection",
  },
);

const meta = yield* providers.meta<{
  readonly label: string;
  readonly owner: string;
}>();
```

Result:

```ts
{
  label: "Payment providers",
  owner: "platform"
}
```

Metadata is stored at:

```txt
collections/providers/.meta.json
```

### List collections

```ts
const collections = yield* store.collections<{
  readonly label: string;
  readonly owner: string;
}>();
```

Result:

```ts
[
  {
    name: "providers",
    path: "collections/providers",
    meta: {
      label: "Payment providers",
      owner: "platform"
    }
  }
]
```

GitDB v0.2 does not require a global manifest. A missing `.store/manifest.json` is normal:

```ts
const manifest = yield* store.get(".store/manifest.json");
// null
```

### Query an index

Indexes are explicit. Index fields are declared on the collection handle and automatically updated
when documents are written or deleted. The definitions are code-level collection options, not
persisted collection manifests.

```ts
const providers = yield* store.collection<{
  readonly enabled: boolean;
  readonly name: string;
  readonly tags?: ReadonlyArray<string>;
  readonly type: string;
}>("providers", {
  indexes: ["type", "tags"],
});

yield* providers.put(
  "stripe",
  { enabled: true, name: "Stripe", tags: ["payment", "card", "live"], type: "payment" },
);

yield* providers.put(
  "adyen",
  { enabled: false, name: "Adyen", type: "payment" },
);

const byType = yield* providers.index("type");
const paymentProviders = yield* byType.get("payment");
```

Result:

```ts
[
  {
    id: "adyen",
    path: "collections/providers/85/adyen.json",
    value: {
      enabled: false,
      name: "Adyen",
      type: "payment"
    },
    document: Document
  },
  {
    id: "stripe",
    path: "collections/providers/2f/stripe.json",
    value: {
      enabled: true,
      name: "Stripe",
      type: "payment"
    },
    document: Document
  }
]
```

Index results can also be paged. The index page cursor is the index entry path, so it may differ
from the returned document paths.

```ts
const firstOpenPage = yield* byType.page("payment", { limit: 1 });
const nextOpenPage = yield* byType.page("payment", {
  cursor: firstOpenPage.nextCursor,
  limit: 1,
});
```

Example:

```ts
{
  entries: [
    {
      id: "adyen",
      path: "collections/providers/85/adyen.json",
      value: {
        enabled: false,
        name: "Adyen",
        type: "payment"
      },
      document: Document
    }
  ],
  nextCursor: "indexes/providers/type/payment/adyen"
}
```

Multi-value indexes are supported:

```ts
yield* providers.put(
  "stripe",
  { enabled: true, name: "Stripe", tags: ["payment", "card", "live"], type: "payment" },
);

const taggedForCards = yield* (yield* providers.index("tags")).get("card");
```

To remove index entries when deleting a document:

```ts
yield* providers.delete("stripe", {
  message: "Remove Stripe provider",
});
```

GitDB derives old index values from the previous document before updating or deleting it, so callers
do not need to pass previous index values.

## Store reads

### Read a raw path

```ts
const document = yield* store.get("collections/providers/2f/stripe.json");
```

Result:

```ts
Document {
  objectId: "7c4b57e8694c1f6c3f853a1a0c739da40a8d1f17",
  path: "collections/providers/2f/stripe.json",
  bytes: Uint8Array([...])
}
```

### List a raw tree path

```ts
const entries = yield* store.list("collections/providers");
```

Example result:

```ts
[
  {
    name: ".meta.json",
    path: "collections/providers/.meta.json",
    type: "blob",
    mode: "100644",
    objectId: "5b10c7d4b4c9f0db24b75dd5c2d625ff2707a8a7"
  },
  {
    name: "2f",
    path: "collections/providers/2f",
    type: "tree",
    mode: "040000",
    objectId: "9a68e15e7aa31d3ff028f6ebf4a2d9edfe410f16"
  },
  {
    name: "85",
    path: "collections/providers/85",
    type: "tree",
    mode: "040000",
    objectId: "29f4d37f2bff64fdbb6c547f5d31eba8795e0123"
  }
]
```

Missing paths return an empty array from `list` and `null` from `get`.

### Read from a historical snapshot or pointer

Every read accepts `{ from }`. The value can be a pointer name or a snapshot id.

```ts
const openSnapshot = yield* tickets.put(
  "ticket-1",
  {
    status: "open",
    title: "Safety test",
  },
  {
    message: "Create ticket",
  },
);

const closedSnapshot = yield* tickets.put(
  "ticket-1",
  {
    status: "closed",
    title: "Safety test",
  },
  {
    message: "Close ticket",
  },
);

const before = yield* tickets.get("ticket-1", { from: openSnapshot.id });
const after = yield* tickets.get("ticket-1", { from: closedSnapshot.id });
```

Result:

```ts
{
  before: {
    status: "open",
    title: "Safety test"
  },
  after: {
    status: "closed",
    title: "Safety test"
  }
}
```

## Transactions

Use transactions when multiple writes should become one snapshot.

```ts
const tx = yield* store.begin();
const providers = yield* tx.collection<{
  readonly enabled: boolean;
  readonly name: string;
  readonly type: string;
}>("providers", {
  indexes: ["type"],
});

yield* providers.setMeta({
  label: "Payment providers",
});

yield* providers.put(
  "stripe",
  {
    enabled: true,
    name: "Stripe",
    type: "payment",
  },
);

yield* providers.put(
  "adyen",
  {
    enabled: false,
    name: "Adyen",
    type: "payment",
  },
);

const snapshot = yield* tx.commit({
  message: "Add payment provider configuration",
});
```

Example result:

```ts
{
  id: "9aa17f743827462619bf802d73fc52d535f3f8f0",
  root: "d2e556b7d95030f9fef1cf5f3b05028c57024ef7",
  parents: [],
  message: "Add payment provider configuration"
}
```

After commit:

```ts
const committedProviders = yield* store.collection<{
  readonly enabled: boolean;
  readonly name: string;
  readonly type: string;
}>("providers");

yield* committedProviders.get("stripe");
// { enabled: true, name: "Stripe", type: "payment" }

yield* committedProviders.meta();
// { label: "Payment providers" }
```

### Roll back staged mutations

Transactions participate in Effect transactions through `TxRef`. If an `Effect.tx` block fails,
staged mutations are rolled back.

```ts
const tx = yield* store.begin();
const providers = yield* tx.collection<{ readonly enabled: boolean }>("providers");

const failure = yield* Effect.tx(
  Effect.gen(function* () {
    yield* providers.put("stripe", { enabled: true });
    return yield* Effect.fail("rollback");
  }),
).pipe(Effect.flip);

const stagedValue = yield* providers.get("stripe");
```

Result:

```ts
{
  failure: "rollback",
  stagedValue: null
}
```

### Abort a transaction

```ts
const tx = yield* store.begin();
yield* tx.put("scratch/provider.json", { enabled: true });
yield* tx.abort();

const result = yield* Effect.flip(tx.commit({ message: "Will not commit" }));
```

Result:

```ts
TransactionInactiveError {
  _tag: "TransactionInactiveError",
  message: "Transaction is no longer active"
}
```

### Optimistic pointer conflict

Each transaction records the pointer snapshot it started from. Commit fails if another writer moved
the same pointer first.

```ts
const first = yield* store.begin();
const second = yield* store.begin();

yield* (yield* first.collection("providers")).put("stripe", { enabled: true });
yield* (yield* second.collection("providers")).put("adyen", { enabled: true });

yield* first.commit({ message: "Add Stripe" });

const conflict = yield* Effect.flip(second.commit({ message: "Add Adyen" }));
```

Example result:

```ts
PointerConflictError {
  _tag: "PointerConflictError",
  pointer: "main",
  expected: null,
  actual: "f6a865e0b1c94a847ba6450c58f542d0cdb6a56d",
  message: "Pointer conflict for main: expected <missing>, actual f6a865e0b1c94a847ba6450c58f542d0cdb6a56d"
}
```

## Pointers

Pointers are named mutable refs to immutable snapshots.

### Get the current snapshot

```ts
const main = yield* store.pointer("main");
const current = yield* main.current();
```

Example result:

```ts
{
  id: "9aa17f743827462619bf802d73fc52d535f3f8f0",
  root: "d2e556b7d95030f9fef1cf5f3b05028c57024ef7",
  parents: [],
  message: "Add payment provider configuration"
}
```

If the pointer has never been written, `current()` returns `null`.

### Begin from a specific pointer

```ts
const draft = yield* store.pointer("draft");
const tx = yield* draft.begin();
```

Same as:

```ts
const tx = yield* store.begin("draft");
```

### Fork a pointer

```ts
const main = yield* store.pointer("main");
const review = yield* main.fork("review/provider-rollout");
```

Result:

```ts
{
  name: "review/provider-rollout",
  current: Function,
  begin: Function,
  move: Function,
  fork: Function,
  forkFrom: Function,
  delete: Function,
  history: Function
}
```

The new pointer now resolves to the same snapshot as `main`.

### Create a pointer from a source

```ts
const release = yield* store.pointer("release/v1");
yield* release.forkFrom("main");
```

`forkFrom` accepts a pointer name or a snapshot id. It fails with `PointerNotFoundError` if the
source cannot be resolved, and with `PointerConflictError` if the target pointer already exists.

### Move a pointer

```ts
const main = yield* store.pointer("main");

yield* main.move("9aa17f743827462619bf802d73fc52d535f3f8f0", {
  expectedSnapshot: "f6a865e0b1c94a847ba6450c58f542d0cdb6a56d",
});
```

Result:

```ts
undefined
```

If `expectedSnapshot` does not match the current pointer target, the result fails with
`PointerConflictError`.

### Delete a pointer

```ts
const draft = yield* store.pointer("draft");

yield* draft.delete({
  expectedSnapshot: "6d9bbd3632dfdb9dcbe790177989ac63f6d7c9f9",
});
```

Result:

```ts
undefined
```

### List local pointer names

```ts
const pointers = yield* store.localPointers();
```

Result:

```ts
["main", "release/v1", "review/provider-rollout"]
```

### Build ref names

```ts
const localRef = yield* store.pointerRef("main");
const remotePrefix = yield* store.remoteRefPrefix("origin");
const remoteRef = yield* store.remotePointerRef("origin", "main");
```

Result:

```ts
{
  localRef: "refs/gitdb/default/main",
  remotePrefix: "refs/gitdb/default/remotes/origin",
  remoteRef: "refs/gitdb/default/remotes/origin/main"
}
```

## Snapshots, history, and diff

### Resolve a pointer or snapshot id

```ts
const id = yield* store.resolveSnapshotId("main");
```

Example result:

```ts
"9aa17f743827462619bf802d73fc52d535f3f8f0"
```

Unknown pointers or invalid ids resolve to `null`:

```ts
yield* store.resolveSnapshotId("missing");
// null
```

### Get a snapshot

```ts
const snapshot = yield* store.snapshot("9aa17f743827462619bf802d73fc52d535f3f8f0");
```

Example result:

```ts
{
  id: "9aa17f743827462619bf802d73fc52d535f3f8f0",
  root: "d2e556b7d95030f9fef1cf5f3b05028c57024ef7",
  parents: ["f6a865e0b1c94a847ba6450c58f542d0cdb6a56d"],
  message: "Close ticket",
  createdAt: "2026-06-08T22:05:24.000Z"
}
```

If the id is not a Git commit, the call fails with `SnapshotNotFoundError`.

### History

```ts
const history = yield* store.history("main", {
  max: 2,
});
```

Result:

```ts
[
  {
    id: "9aa17f743827462619bf802d73fc52d535f3f8f0",
    message: "Close ticket",
    parents: ["f6a865e0b1c94a847ba6450c58f542d0cdb6a56d"]
  },
  {
    id: "f6a865e0b1c94a847ba6450c58f542d0cdb6a56d",
    message: "Create ticket",
    parents: []
  }
]
```

History options:

```ts
{
  max: 10,
  path: "collections/tickets",
  since: "2026-06-01T00:00:00.000Z",
  until: "2026-06-30T23:59:59.999Z"
}
```

`pointer.history(options)` is the pointer-scoped equivalent:

```ts
const main = yield* store.pointer("main");
const history = yield* main.history({ max: 5 });
```

### Diff two snapshots or pointers

```ts
const diff = yield* store.diff(openSnapshot.id, closedSnapshot.id);
```

Example result:

```ts
{
  added: [],
  modified: [
    {
      path: "collections/tickets/83/ticket-1.json",
      oldObjectId: "4b736f7ba9355dfc0372615c98e92f8c5fb7713f",
      newObjectId: "b9aa956d38d4b3c26b261d604e5f8d30299a2f49"
    }
  ],
  deleted: []
}
```

You can also compare pointers:

```ts
const diff = yield* store.diff("main", "release/v1");
```

## Sync

Sync only moves GitDB refs. It does not merge JSON, checkout files, update `HEAD`, or touch the
working tree.

### Push local pointers

```ts
const result = yield* store.sync({
  mode: "push",
  remote: "origin",
  pointers: ["main"],
});
```

Example result:

```ts
{
  remote: "origin",
  pointers: [
    {
      pointer: "main",
      localBefore: "9aa17f743827462619bf802d73fc52d535f3f8f0",
      remoteBefore: undefined,
      localAfter: "9aa17f743827462619bf802d73fc52d535f3f8f0",
      remoteAfter: "9aa17f743827462619bf802d73fc52d535f3f8f0",
      status: "pushed"
    }
  ]
}
```

### Fetch remote pointers

```ts
const result = yield* store.sync({
  mode: "fetch",
  remote: "origin",
});
```

Example result:

```ts
{
  remote: "origin",
  pointers: [
    {
      pointer: "main",
      localBefore: "9aa17f743827462619bf802d73fc52d535f3f8f0",
      remoteBefore: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      localAfter: "9aa17f743827462619bf802d73fc52d535f3f8f0",
      remoteAfter: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      status: "up-to-date"
    }
  ]
}
```

Fetch updates remote-tracking refs such as:

```txt
refs/gitdb/default/remotes/origin/main
```

It does not move the local pointer.

### Pull or full sync

```ts
const result = yield* store.sync({
  mode: "full",
  remote: "origin",
  pointers: ["main"],
});
```

If the remote is ahead and the local pointer can fast-forward:

```ts
{
  remote: "origin",
  pointers: [
    {
      pointer: "main",
      localBefore: "9aa17f743827462619bf802d73fc52d535f3f8f0",
      remoteBefore: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      localAfter: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      remoteAfter: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      status: "fast-forwarded"
    }
  ]
}
```

If the local pointer is ahead and the remote can fast-forward:

```ts
{
  remote: "origin",
  pointers: [
    {
      pointer: "main",
      localBefore: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      remoteBefore: "9aa17f743827462619bf802d73fc52d535f3f8f0",
      localAfter: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      remoteAfter: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
      status: "pushed"
    }
  ]
}
```

### Sync conflicts

By default, diverged pointers fail with `SyncConflictError`.

```ts
const conflict = yield* Effect.flip(
  store.sync({
    mode: "full",
    remote: "origin",
    pointers: ["main"],
  }),
);
```

Example result:

```ts
SyncConflictError {
  _tag: "SyncConflictError",
  pointer: "main",
  localSnapshot: "8f968c98f5c10f6df265fa41a1f86fe6c3e89f07",
  remoteSnapshot: "18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1",
  mergeBase: "9aa17f743827462619bf802d73fc52d535f3f8f0",
  message: "Sync conflict for main: local 8f968c98f5c10f6df265fa41a1f86fe6c3e89f07, remote 18af5e2e6f0d77cf7fc4d5dd273ecf0fd27c83c1"
}
```

You can choose a side explicitly:

```ts
yield* store.sync({
  mode: "full",
  remote: "origin",
  pointers: ["main"],
  onDiverged: "keep-local",
});

yield* store.sync({
  mode: "full",
  remote: "origin",
  pointers: ["main"],
  onDiverged: "keep-remote",
});
```

## Module-first helper APIs

The package also exports small helper modules that delegate to the store objects.

```ts
import {
  Collection,
  Pointer,
  Snapshot,
  Store,
  Sync,
  Transaction,
} from "@cycle/git-db";
```

Example:

```ts
const store = yield* Store.StoreService;
const providers = yield* Collection.get<{ readonly enabled: boolean }>(store, "providers");

const snapshot = yield* Collection.put(
  providers,
  "stripe",
  {
    enabled: true,
  },
  {
    message: "Add provider through module API",
  },
);

const pointer = yield* Pointer.get(store, "main");
const current = yield* Pointer.current(pointer);
const fetched = yield* Snapshot.get(store, snapshot.id);
```

Result:

```ts
{
  snapshotId: "48cddc6062a8be160f0f52dcd4decb917f2a08d0",
  currentId: "48cddc6062a8be160f0f52dcd4decb917f2a08d0",
  fetchedId: "48cddc6062a8be160f0f52dcd4decb917f2a08d0"
}
```

Helper mapping:

| Helper | Equivalent |
| --- | --- |
| `Collection.get(store, name, options)` | `store.collection(name, options)` |
| `Collection.list(store, options)` | `store.collections(options)` |
| `Collection.entries(collection, options)` | `collection.list(options)` |
| `Collection.page(collection, options)` | `collection.page(options)` |
| `Collection.put(collection, id, value, options)` | `collection.put(id, value, options)` |
| `Pointer.get(store, name)` | `store.pointer(name)` |
| `Pointer.localNames(store)` | `store.localPointers()` |
| `Pointer.current(pointer)` | `pointer.current()` |
| `Pointer.begin(pointer)` | `pointer.begin()` |
| `Pointer.move(pointer, target, options)` | `pointer.move(target, options)` |
| `Snapshot.get(store, id)` | `store.snapshot(id)` |
| `Snapshot.history(store, from, options)` | `store.history(from, options)` |
| `Snapshot.diff(store, a, b)` | `store.diff(a, b)` |
| `Snapshot.resolveId(store, from)` | `store.resolveSnapshotId(from)` |
| `Transaction.begin(store, pointer)` | `store.begin(pointer)` |
| `Transaction.commit(tx, options)` | `tx.commit(options)` |
| `Transaction.abort(tx)` | `tx.abort()` |
| `Sync.run(store, options)` | `store.sync(options)` |

## Validation and expected failures

Identifiers are intentionally restricted so GitDB paths are predictable and safe.

Valid examples:

```txt
database: default
collection: providers
document id: stripe
index: type
index key: payment
pointer: review/provider-rollout
remote: origin
```

Invalid examples:

```txt
collection: .internal
document id: ../stripe
index key: payment/card
pointer: refs/heads/main
pointer: main.lock
remote: ../origin
```

Common typed failures:

| Error | When it happens |
| --- | --- |
| `StoreNotFoundError` | `verifyGitDir` is true and the Git directory does not exist |
| `InvalidNamespaceError` | namespace is not a valid ref namespace, or uses `refs/heads` without the escape hatch |
| `InvalidIdentifierError` | database, collection, document, index, key, or remote name is invalid |
| `InvalidPathError` | raw store path is absolute, empty for mutation, or contains traversal |
| `InvalidPointerNameError` | pointer name is not a valid relative ref name |
| `PointerNotFoundError` | fork source pointer or snapshot cannot be resolved |
| `SnapshotNotFoundError` | requested snapshot id is not a Git commit |
| `PointerConflictError` | optimistic pointer update expected one snapshot but found another |
| `SyncConflictError` | local and remote pointers diverged and `onDiverged` is `error` |
| `InvalidJsonDocumentError` | a stored blob cannot be parsed as JSON |
| `TransactionInactiveError` | a transaction was committed or aborted and then used again |
| `GitAdapterError` | local Git object/ref command failed |
| `RemoteFetchError` | `git fetch` failed |
| `RemotePushError` | `git push` failed |

## Real Git safety properties

When using `GitDbLive({ gitDir })` or `GitDbFilesystem({ gitDir })`, writes create Git objects and
move refs under `refs/gitdb`. They do not:

- write the worktree
- stage files
- mutate `.git/index`
- move `HEAD`
- move branches under `refs/heads`

For example, after writing a ticket:

```ts
const appRef = "refs/gitdb/default/main";
const normalBranch = "refs/heads/main";
```

The GitDB ref points at the database snapshot:

```txt
refs/gitdb/default/main -> 8dd3f6dc9b3a5f0b5e1e0de5c634d0ac2e05c03a
```

The normal branch and worktree state remain whatever they were before the GitDB write.

## Development Notes

Keep changes aligned with the package boundaries:

- put public domain shapes in `src/domain`
- put validation schemas in `src/schemas`
- put user-facing typed failures in `src/errors`
- keep backend-specific Git behavior behind the adapter interface in `src/git`
- keep store orchestration in `src/store`
- add tests for behavior that affects object layout, ref movement, transaction semantics, sync
  results, validation, or typed errors

Useful checks:

```sh
pnpm --filter @cycle/git-db test
pnpm --filter @cycle/git-db typecheck
pnpm lint
pnpm format:check
```

When adding a public API, update:

1. the relevant source module
2. `src/index.ts`
3. the matching helper namespace if one exists
4. tests that cover the public behavior
5. this README if the usage model changes

Prefer `GitDbInMemory()` for fast deterministic tests. Use temporary real repositories when behavior
depends on Git object/ref compatibility, filesystem persistence, or remote sync.
