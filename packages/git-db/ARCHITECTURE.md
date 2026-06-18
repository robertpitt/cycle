# @cycle/git-db Architecture

`@cycle/git-db` owns the Git-backed storage primitives used by Cycle's Level 0 data layer. It does
not understand tickets, labels, users, or SQLite projections. Those belong to `@cycle/database`.

## Responsibilities

- Build and validate GitDB store configuration.
- Write blobs, trees, commits, and refs through `@cycle/git`.
- Expose optimistic raw-path transactions.
- Read raw blobs and tree entries from a pointer or snapshot.
- Resolve snapshots, history, diffs, and pointer state.
- Fetch, pull, push, and merge GitDB refs.
- Provide append-only event helpers over raw transactions.

## Source Layout

```text
src/
  domain/      Public schemas and DTOs for changes, snapshots, sync, and options.
  errors/      Typed GitDB errors.
  schemas/     Runtime validation schemas.
  store/       Store service, transaction, pointer, snapshot, sync, event, tree, and document APIs.
  internals/   Small byte/hash helpers.
```

## Event Store

The event helper writes canonical JSON files at:

```text
collections/events/<aggregate-type>/<aggregate-id>/<event-id>.json
collections/events/ticket/<ticket-shard>/<ticket-id>/<event-id>.json
```

Ticket events use a shard level under `collections/events/ticket` to avoid one very wide tree of
ticket IDs. `Event.append` validates the path, checks that the event path does not already exist in
the transaction base, canonicalizes the payload, and stages a raw `put`.

`Event.list` walks the event root, reads matching blobs, parses the aggregate metadata from paths,
and returns events sorted by lexical path.

`Event.introduced` uses snapshot diff data to identify event paths added, modified, or deleted by a
snapshot. Higher layers use this to project new events and detect append-only violations.

See [SCALABILITY_EXPERIMENT.md](./SCALABILITY_EXPERIMENT.md) for the tree-width cost model and
benchmark scenarios for high-volume ticket stores.

## Raw Store

The raw store API remains intentionally small:

- `Store.begin(pointer?)`
- `Store.get(path, options?)`
- `Store.list(path?, options?)`
- `Store.history(from?, options?)`
- `Store.diff(a, b)`
- `Store.pointer(name)`
- `Store.sync(options?)`

Transactions expose:

- `put(path, value)`
- `delete(path)`
- `get(path)`
- `list(path?)`
- `commit(options?)`
- `abort()`

Values passed to `put` are encoded through the shared JSON/bytes encoder. Event writes should use
`Event.append` so canonical event JSON and duplicate-path checks are applied consistently.

## Removed Collection Layer

The previous sharded collection/document convenience API has been removed. GitDB no longer exports
collection handles, collection metadata helpers, document ID validation, document path derivation,
or collection pagination. Cycle's durable source truth is event files; current-state documents and
SQL rows are projections owned by higher layers.
