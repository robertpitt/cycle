# @cycle/git-db

GitDB is a small Effect service for storing append-only application event files in Git objects
without touching the normal source-control workflow. It provides raw tree/blob transactions,
snapshots, pointers, history, diff, sync, and an event helper API used by `@cycle/database`.

## Current Storage Model

The durable Cycle data model is event sourced:

```text
collections/events/<aggregate-type>/<aggregate-id>/<event-id>.json
```

Event identity and aggregate targeting live in the path. Event file contents are canonical JSON
payloads and intentionally omit generated timestamp, actor, aggregate ID, and event ID fields unless
the domain payload needs them. This lets Git deduplicate common operations that have identical
content.

The old collection/document convenience API has been removed. Callers should use:

- `Event.append` for append-only event writes.
- `Event.list` and `Event.introduced` for event reads.
- `Store.begin`, `Transaction.put`, `Transaction.delete`, `Store.get`, and `Store.list` for raw
  low-level GitDB paths.
- `Pointer`, `Snapshot`, and `Sync` helpers for refs, history, diffs, fetch, pull, and push.

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

- `Store`: service construction, raw transactions, raw tree/blob reads, history, diff, and sync.
- `Transaction`: module-first wrappers around transaction begin/commit/abort.
- `Event`: event path construction, canonical JSON encoding, append, list, and introduced-event
  discovery.
- `Pointer`: pointer lookup, current snapshot, begin, and move helpers.
- `Snapshot`: snapshot read, history, diff, and ID resolution helpers.
- `Sync`: pointer sync helper.
- `Document`: raw blob wrapper returned by `Store.get` and event reads.

## Invariants

- Existing event files are immutable.
- Every domain mutation appends a new uniquely named event file.
- Event payload JSON is canonicalized with stable key ordering.
- Event paths are explicit source truth; generated projections are not committed by GitDB.
- Ordering is computed from Git history and lexical event paths, not a shared index file.

## Scripts

```bash
npm run typecheck --workspace @cycle/git-db
npm test --workspace @cycle/git-db
npm run test:merge-scenarios --workspace @cycle/git-db
npm run bench:local --workspace @cycle/git-db -- --count 5000
```
