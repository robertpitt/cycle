# @cycle/git-db

GitDB is a small Effect service for storing append-only application event files in Git objects
without touching the normal source-control workflow. It provides raw tree/blob transactions,
snapshots, pointers, history, diff, sync, and an event helper API used by `@cycle/database`.

## Current Storage Model

The durable Cycle data model is event sourced:

```text
collections/events/<aggregate-type>/<aggregate-id>/<event-id>.json
collections/events/ticket/<ticket-shard>/<ticket-id>/<event-id>.json
```

Ticket events are sharded by the ticket ID segment so the `ticket` aggregate tree does not grow into
one directory with every ticket in the repository. Event identity and aggregate targeting live in the
path. Event file contents are canonical JSON payloads and intentionally omit generated timestamp,
actor, aggregate ID, and event ID fields unless the domain payload needs them. This lets Git
deduplicate common operations that have identical content.

The old collection/document convenience API has been removed. Callers should use:

- `Event.append` for append-only event writes.
- `Event.list` and `Event.introduced` for event reads.
- `Store.begin`, the returned transaction methods, `Store.get`, and `Store.list` for raw low-level
  GitDB paths.
- `Store.pointer`, `Store.history`, `Store.diff`, and `Store.sync` for refs, history, diffs, fetch,
  pull, and push.

## Example

```ts
import { Effect } from "effect";
import { Event as GitDbEvent, GitDbFilesystem, Store as GitDbStore } from "@cycle/git-db";

const program = Effect.gen(function* () {
  const store = yield* GitDbStore.StoreService;
  const tx = yield* store.begin();

  yield* GitDbEvent.append(tx, {
    aggregateId: "UKN-00001",
    aggregateType: "ticket",
    eventId: "evt_00001",
    payload: {
      field: "status",
      op: "ticket.update",
      value: "in-progress",
    },
  });

  const snapshot = yield* tx.commit({
    message: "Update ticket status",
  });

  return yield* GitDbEvent.list(store, { from: snapshot.id });
});

await Effect.runPromise(
  program.pipe(
    Effect.provide(
      GitDbFilesystem({
        cwd: "/path/to/repo",
        database: "cycle",
      }),
    ),
  ),
);
```

## Public Modules

Root imports expose the real package entrypoints:

- `Store`: service construction, raw transactions, raw tree/blob reads, history, diff, identity,
  pointer state, and sync.
- `Event`: event path construction, canonical JSON encoding, append, list, and introduced-event
  discovery.
- `Document`: raw blob wrapper returned by `Store.get` and event reads.
- `Schemas`: schema-first contracts for GitDB options, snapshots, changes, entries, paths, and sync
  results.

GitDB does not export pass-through wrapper modules for transaction, pointer, snapshot, or sync
operations. Callers should use `StoreService`, `StorePointer`, and transaction methods directly.

Specific public modules are also available through package subpaths:

```ts
import { InvalidPathError } from "@cycle/git-db/errors";
import { GitDbInMemory } from "@cycle/git-db/live";
import { StoreService } from "@cycle/git-db/store";
import { SyncResult } from "@cycle/git-db/schemas";
```

Internal helpers live under `src/internals` and are not package exports.

## Invariants

- Existing event files are immutable.
- Every domain mutation appends a new uniquely named event file.
- Event payload JSON is canonicalized with stable key ordering.
- Event paths are explicit source truth; generated projections are not committed by GitDB.
- Ordering is computed from Git history and lexical event paths, not a shared index file.

## Scalability

See [SCALABILITY_EXPERIMENT.md](./SCALABILITY_EXPERIMENT.md) for the current tree-width model,
breakpoints, and benchmark matrix for millions of tickets.

## Scripts

```bash
pnpm --filter @cycle/git-db typecheck
pnpm --filter @cycle/git-db test
pnpm --filter @cycle/git-db test:merge-scenarios
pnpm --filter @cycle/git-db bench:local -- --count 5000
```
