# GitDB Performance Plan

Status: proposal

Audience: implementers working on `packages/git-db/src/git/*` and the higher-level store modules
that depend on the `Git` service.

## Purpose

This plan applies the Git storage feedback to the current `@cycle/git-db` package. The goal is to
move the direct filesystem backend closer to the performance profile of real Git without widening
the public GitDB API prematurely.

The current package already has the right public boundary:

- `Git.ts` defines a narrow `GitService`.
- `GitCli.ts` delegates to real Git and remains the compatibility baseline.
- `GitFilesystem.ts` reads and writes loose objects, refs, and snapshots directly.
- `GitPack.ts` can locate objects through pack `.idx` files and resolve basic packed deltas.
- `benchmark-local.ts` gives us a repeatable CLI-vs-filesystem performance harness.

The primary issue is that the filesystem backend is still shaped as a set of independent methods.
Methods such as `readCommit`, `readTree`, `isAncestor`, `mergeBase`, `listRefs`, and packed-object
reads rediscover storage state and reparse data repeatedly. Real Git avoids this with shared object
indexes, ref snapshots, commit summaries, graph metadata, and targeted caches.

## Performance Target

The near-term target is not full native Git compatibility. The target is:

1. Keep `GitCli.layer` as the transport and compatibility fallback.
2. Make `GitFilesystem.layer` fast for local GitDB reads, writes, tree navigation, ref reads, and
   ancestry checks in normal repositories.
3. Avoid shelling out for hot local operations.
4. Defer native fetch/push protocol work until local object, ref, pack, and graph performance are
   well factored.

## Compatibility Scope

Implement support in this order:

| Scope | Decision |
| --- | --- |
| Loose objects | Required; already mostly implemented. |
| Canonical Git object hashing | Required; already implemented for SHA-1 envelopes. |
| Loose refs and `packed-refs` | Required; already partially implemented. |
| Lockfile ref updates | Required; implemented, but durability and cleanup need tightening. |
| Pack `.idx` lookup | Required for normal cloned repos; implemented but reparsed per lookup. |
| Packed whole objects and deltas | Required; implemented but currently reads whole packs and lacks shared caches. |
| Commit summaries | Required for performance; not yet separated from full commit parsing. |
| Commit-graph files | Optional acceleration after summary cache and walker refactor. |
| Multi-pack-index | Optional acceleration after stable pack index registry. |
| Reachability bitmaps | Defer; useful for fetch/push and rev-list-style operations, not needed first. |
| Native fetch/push protocol | Defer; keep using `GitCli` for transport. |
| SHA-256 repositories | Model explicitly later; do not spread new SHA-1 assumptions. |

## Internal Architecture

Do not change `GitService` first. Instead, refactor `GitFilesystem.layer` to build one internal
runtime per layer instance:

```ts
type GitRuntime = {
  readonly refs: RefStore;
  readonly objects: ObjectDatabase;
  readonly commits: CommitReader;
  readonly trees: TreeReader;
  readonly traversal: RevisionWalker;
  readonly cache: GitCache;
};
```

The public methods should become thin delegation:

```ts
readCommit(store, id) -> runtime.forStore(store).commits.readCommit(id)
readTree(store, id) -> runtime.forStore(store).trees.readTree(id)
isAncestor(store, a, b) -> runtime.forStore(store).traversal.isAncestor(a, b)
mergeBase(store, a, b) -> runtime.forStore(store).traversal.mergeBase(a, b)
readRef(store, name) -> runtime.forStore(store).refs.readRef(name)
```

The implementation can still live under `src/git/` and remain private. The important change is
that object location, pack indexes, parsed commit summaries, trees, and refs are shared across
operations instead of rebuilt inside every method.

## Proposed Module Layout

Add modules incrementally rather than moving everything at once:

```txt
src/git/
  Git.ts
  GitCli.ts
  GitFilesystem.ts
  GitCommand.ts
  GitObjectCodec.ts
  GitPack.ts

  GitRuntime.ts
  GitCache.ts

  object/
    ObjectDatabase.ts
    LooseObjectStore.ts
    PackIndex.ts
    PackStore.ts
    DeltaResolver.ts

  ref/
    RefStore.ts
    PackedRefs.ts
    RefLock.ts

  commit/
    CommitReader.ts
    CommitSummary.ts
    RevisionWalker.ts

  tree/
    TreeReader.ts
```

Keep exports stable. These modules are implementation details unless we decide to expose a lower
level Git API later.

## Runtime Services

### ObjectDatabase

Own raw object lookup and writes:

```ts
type ObjectDatabase = {
  readonly hasObject: (id: ObjectId) => Effect.Effect<boolean, GitAdapterError>;
  readonly readObject: (
    id: ObjectId,
  ) => Effect.Effect<{ readonly id: ObjectId; readonly type: GitObjectType; readonly payload: Uint8Array }, GitAdapterError>;
  readonly writeObject: (
    type: GitObjectType,
    payload: Uint8Array,
  ) => Effect.Effect<ObjectId, GitAdapterError>;
};
```

Lookup order:

1. Object location cache.
2. Raw object cache for small objects.
3. Loose object path.
4. Pack index registry.
5. Future multi-pack-index.

Near-term improvements:

- Stop reading and parsing every `.idx` file on every packed-object lookup.
- Cache pack index fanout tables, object-name tables, and offset tables by pack mtime/size.
- Cache object location results.
- Cache resolved packed delta bases.
- Avoid caching large blobs by default.
- Add `readObjectHeader` later for `isCommit` so we do not inflate full blobs just to check type.

### RefStore

Own ref reading, listing, compare-and-swap updates, and deletion:

```ts
type RefStore = {
  readonly readRef: (name: string) => Effect.Effect<ObjectId | null, GitAdapterError>;
  readonly readSymbolicRef: (name: string) => Effect.Effect<string | null, GitAdapterError>;
  readonly listRefs: (prefix: string) => Effect.Effect<ReadonlyArray<GitRef>, GitAdapterError>;
  readonly updateRef: (input: UpdateRefInput) => Effect.Effect<void, GitAdapterError>;
  readonly deleteRef: (input: DeleteRefInput) => Effect.Effect<void, GitAdapterError>;
};
```

Near-term improvements:

- Keep loose refs overriding `packed-refs`, matching current behavior.
- Cache a ref snapshot keyed by `packed-refs` mtime and loose ref directory metadata.
- Invalidate the cache on `updateRef` and `deleteRef`.
- Support symbolic `HEAD` as an internal ref capability, but keep GitDB pointers under
  `refs/gitdb/*`.
- Tighten lockfile behavior: compare expected value after lock acquisition, write, fsync where the
  platform service supports it, and atomic rename.

### CommitReader

Separate full commit reads from lightweight traversal data:

```ts
type CommitSummary = {
  readonly id: ObjectId;
  readonly tree: ObjectId;
  readonly parents: ReadonlyArray<ObjectId>;
  readonly authorTime?: number;
  readonly committerTime?: number;
  readonly generation?: number;
  readonly correctedCommitDate?: number;
};

type CommitReader = {
  readonly readCommit: (id: ObjectId) => Effect.Effect<CommitObject, GitAdapterError>;
  readonly readCommitSummary: (id: ObjectId) => Effect.Effect<CommitSummary, GitAdapterError>;
};
```

Near-term improvements:

- Cache parsed commit summaries separately from full commit objects.
- Make `isAncestor`, `mergeBase`, history, and sync divergence use summaries.
- Add optional commit-graph support only after callers consume summaries.
- Keep full `readCommit` available for public API behavior and snapshot metadata.

### TreeReader

Separate complete tree parsing from path navigation:

```ts
type TreeReader = {
  readonly readTree: (id: ObjectId) => Effect.Effect<ReadonlyArray<TreeEntry>, GitAdapterError>;
  readonly findEntryByPath: (
    rootTree: ObjectId,
    path: string,
  ) => Effect.Effect<TreeEntry | null, GitAdapterError>;
};
```

Near-term improvements:

- Cache parsed trees by object id.
- Use one-level-at-a-time lookup for point reads instead of materialising unrelated subtrees.
- Keep full `readTree` for public API and listing operations.

### RevisionWalker

Own graph algorithms:

```ts
type RevisionWalker = {
  readonly isAncestor: (
    ancestor: ObjectId,
    descendant: ObjectId,
  ) => Effect.Effect<boolean, GitAdapterError>;
  readonly mergeBase: (
    a: ObjectId,
    b: ObjectId,
  ) => Effect.Effect<ObjectId | null, GitAdapterError>;
};
```

Near-term improvements:

- Replace repeated full commit parsing with `CommitSummary`.
- Use per-query visited sets and a priority queue ordered by generation when available, then commit
  time as a non-correctness heuristic.
- Add generation pruning when commit-graph data is present:
  `generation(current) < generation(target)` means the current branch cannot reach the target.
- Replace `mergeBase`'s current full ancestor materialisation with a bidirectional walk once the
  summary reader is stable.

## Caching Strategy

Use several bounded caches instead of one broad cache. Prefer Effect's cache primitives over a
home-grown LRU wherever the lookup shape fits.

| Cache | Key | Value | Default policy |
| --- | --- | --- | --- |
| Object location | object id | loose path or pack offset | `Cache.Cache` |
| Raw object | object id | type + payload | `Cache.Cache`, skip large blobs |
| Commit summary | object id | parents/tree/time/generation | `Cache.Cache` |
| Parsed tree | object id | `TreeEntry[]` | `Cache.Cache` |
| Pack index | index path + mtime/size | parsed fanout/name/offset tables | `Cache.Cache` or `ScopedCache` if it owns handles |
| Delta base | pack path + offset | resolved base object | `Cache.Cache` |
| Ref snapshot | git dir + metadata | merged ref map | `Ref`/`SynchronizedRef` with metadata validation |

Initial cache sizes should be conservative and configurable through internal constants. Avoid
public configuration until the defaults have benchmark evidence.

## Effect Primitives To Reuse

The local Effect v4 source under `vendor/effect-v4/packages/effect/src` has several public modules
that should shape the implementation. These are exported from `effect`, so we should prefer them
over copying internal code or writing broad equivalents.

| Need in GitDB | Effect primitive | Recommendation |
| --- | --- | --- |
| Bounded lookup cache with concurrent miss sharing | `Cache` | Use for object locations, raw small objects, commit summaries, parsed trees, delta bases, and store-level list/walk caches. |
| Cache entries that own scoped resources | `ScopedCache` | Use only if pack indexes or pack readers later hold open file handles or mapped resources. Otherwise plain `Cache` is simpler. |
| Keyed runtime/resource families | `RcMap` or `LayerMap` | Consider for `runtime.forStore(store)` if we support many git dirs per process and want idle eviction. A single configured `StoreService` does not need it. |
| Mutable shared metadata | `Ref` | Use for simple ref snapshot state and counters where updates are pure and cheap. |
| Serialized effectful metadata updates | `SynchronizedRef` | Use for ref snapshot refresh and pack registry refresh so concurrent readers do not duplicate filesystem scans. |
| In-memory mutable indexes | `MutableHashMap` | Use inside private hot caches or registries when direct mutation is acceptable. Prefer `Cache` when miss loading, TTL, capacity, or concurrent sharing matters. |
| Immutable transaction state | `HashMap` / `HashSet` | Keep using these for staged transaction mutations and persistent data structures. |
| Concurrency limits | `Semaphore` | Use for bounding expensive pack inflates or concurrent filesystem scans if benchmarks show contention. |
| Priority queue for graph traversal | custom binary heap | Do not use `TxPriorityQueue` for hot ancestry walks; it is transactional and backed by sorted chunks, not a low-overhead heap. |
| Data models and tagged errors | `Data` / `Schema` | Keep schema-backed public/domain validation; use `Data` for small internal tagged unions if schemas are unnecessary. |
| Platform hashing/filesystem/path | `Crypto`, `FileSystem`, `Path`, `Clock` | Continue using platform services instead of Node globals where the package already has Effect dependencies. |
| Observability | `Effect.fn`, `Effect.withSpan`, logs | Wrap high-level operations and cache misses so benchmark traces can show object, pack, ref, and traversal costs. |

Concrete changes to the earlier architecture:

- Replace the planned `cache/LruCache.ts` with `Cache.Cache` instances in `GitCache`.
- Replace ad hoc store runtime `Map` caches in `Store.ts` with bounded `Cache.Cache` instances where
  the current unbounded maps cache commits, trees, list entries, and flattened entries.
- Use `SynchronizedRef` around the pack registry and ref snapshot when refresh requires filesystem
  effects.
- Keep a small custom binary heap for `RevisionWalker`; Effect's transactional priority queue is
  not the right data structure for synchronous graph-local scheduling.
- Do not import from `effect/internal/*`; the public modules above are sufficient.

## Implementation Phases

### Phase 0: Baseline and conformance

Deliverables:

- Run the existing benchmark with both backends for a small, medium, and large repository state.
- Add benchmark notes to track cold read, warm read, page navigation, index navigation, random point
  reads, full list, and memory.
- Make sure `GitCli.layer`, `GitFilesystem.layer`, and `GitInMemory` continue to pass the same
  conformance tests.

Acceptance criteria:

- We have repeatable numbers before refactoring.
- No public API changes.

### Phase 1: Extract codecs and object database

Deliverables:

- Move loose object read/write out of `GitFilesystem.ts` into `object/LooseObjectStore.ts`.
- Move raw object envelope parsing/formatting into `GitObjectCodec.ts`.
- Add private `ObjectDatabase` that composes loose reads and existing pack reads.
- Introduce `GitCache` using `Cache.Cache` rather than a custom LRU abstraction.
- Preserve current SHA-1 behavior, but introduce a private `HashAlgorithm = "sha1"` model so future
  SHA-256 support has one place to grow.

Acceptance criteria:

- Existing tests pass.
- Object hashing remains byte-for-byte compatible with Git CLI `hash-object`.
- `GitFilesystem.ts` delegates object work instead of owning it.

### Phase 2: Pack index registry and packed-object cache

Deliverables:

- Parse `.idx` files once per pack metadata version instead of once per lookup.
- Keep a pack registry for `.git/objects/pack`, guarded by `SynchronizedRef` when refresh is
  effectful.
- Read pack objects through cached index locations.
- Add resolved delta base caching.
- Avoid reading unrelated packfiles during a lookup.

Acceptance criteria:

- Packed-object reads work on a normal cloned repository after `git gc`.
- Repeated `readCommit` and `readTree` of packed objects avoid repeated `.idx` parsing.
- Benchmarks show warm packed reads improving without substantial memory growth.

### Phase 3: Ref store extraction and snapshot cache

Deliverables:

- Move loose refs, symbolic refs, `packed-refs`, list, update, and delete logic into `ref/RefStore`.
- Add ref snapshot caching with `Ref` or `SynchronizedRef` and explicit invalidation after writes.
- Keep `packed-refs` read-only for now.
- Tighten compare-and-swap semantics under lock.

Acceptance criteria:

- `listRefs(prefix)` no longer rereads all ref files and `packed-refs` for repeated calls in the
  same metadata version.
- Pointer update conflict behavior remains compatible with current tests.
- GitDB pointer operations stay isolated to `refs/gitdb/*`.

### Phase 4: Commit summary and tree caches

Deliverables:

- Add `CommitReader.readCommitSummary`.
- Cache commit summaries separately from full commits.
- Cache parsed tree entries.
- Add `TreeReader.findEntryByPath` and migrate point-read-heavy store paths where practical.
- Replace store-level unbounded `Map` caches with bounded `Cache.Cache` instances.

Acceptance criteria:

- `isAncestor`, `mergeBase`, history, and sync divergence do not parse full commit messages unless
  full metadata is required.
- Repeated document reads avoid reparsing the same parent trees.
- Benchmarks show better warm random reads and page navigation.

### Phase 5: Revision walker rewrite

Deliverables:

- Replace `isAncestor` queue traversal with a summary-based walker.
- Replace `mergeBase` ancestor-set materialisation with a bidirectional summary-based walk.
- Add priority queue ordering by generation if available, then commit time.

Acceptance criteria:

- Results match `git merge-base --is-ancestor` and `git merge-base` across linear history, branches,
  criss-cross merges, unrelated histories, and missing commits.
- Traversal does less raw object reading than the current implementation on long histories.

### Phase 6: Optional commit-graph acceleration

Deliverables:

- Read `.git/objects/info/commit-graph`.
- Later support split commit graphs under `.git/objects/info/commit-graphs`.
- Use commit-graph entries only for summaries: parents, tree, commit time, generation, corrected
  commit date.
- Fall back to raw commit parsing when data is missing or unsupported.

Acceptance criteria:

- Repositories without commit-graph files behave exactly as before.
- Repositories with commit-graph files accelerate ancestry and merge-base queries.
- Unsupported commit-graph features fail closed to fallback parsing, not user-visible failure.

### Phase 7: Optional multi-pack-index

Deliverables:

- Read `.git/objects/pack/multi-pack-index`.
- Use it to locate object id -> pack + offset before scanning individual pack indexes.
- Fall back to individual `.idx` files.

Acceptance criteria:

- Repositories with many packs no longer perform per-pack lookup for common reads.
- Repositories without MIDX keep the Phase 2 behavior.

### Phase 8: Deferred native transport and bitmaps

Do not implement native fetch/push yet. Keep `GitCli.layer` for transport because Git protocol
support involves capability negotiation, pack negotiation, thin packs, authentication, sideband
streams, shallow clones, partial clones, and push status handling.

Only revisit reachability bitmaps when we decide to implement native fetch/push or rev-list-style
object enumeration.

## Test Plan

Add targeted tests as each phase lands:

- Loose object envelope compatibility with `git hash-object`.
- Loose object write idempotency and concurrent same-object write behavior.
- `.idx` lookup for small and large offsets.
- Packed whole object, `ofs-delta`, and `ref-delta` reads after `git gc`.
- Ref overlay behavior: loose refs override `packed-refs`.
- Symbolic ref cycle protection.
- Lockfile conflict handling for `updateRef` and `deleteRef`.
- Commit summary parsing for single-parent, multi-parent, root, signed, and encoded commits.
- `isAncestor` parity with Git CLI.
- `mergeBase` parity with Git CLI.
- Benchmark regression guard for warm point reads and ancestry queries.

## Measurement Plan

Use `scripts/benchmark-local.ts` as the first harness:

```sh
pnpm --dir packages/git-db bench:local -- --backend cli --database benchmark-cli --count 5000
pnpm --dir packages/git-db bench:local -- --backend filesystem --database benchmark-fs --count 5000
pnpm --dir packages/git-db bench:local -- --backend filesystem --database benchmark-fs --count 5000 --append
```

Add focused microbenchmarks for:

- `readCommit` cold and warm.
- `readTree` cold and warm.
- packed-object lookup by object id.
- repeated `listRefs`.
- `isAncestor` over long linear history.
- `mergeBase` over branching history.

For every performance PR, record:

- repository state: loose-only, packed, many packs, commit-graph present or absent.
- operation count and data size.
- cold time, warm time, and memory.
- comparison to `GitCli.layer` and previous `GitFilesystem.layer`.

## Risks

- Pack parsing and delta resolution are easy to make correct for common repos and still miss edge
  cases. Keep `GitCli.layer` available and add fixtures created by real Git.
- Cache invalidation can return stale refs. Ref caches need metadata validation and explicit
  invalidation on writes.
- Large blob caching can harm memory more than it helps. Cache small blobs only, or skip blob
  payload caching until benchmarks justify it.
- Commit-graph and MIDX formats add complexity. Treat both as optional accelerators with fallback.
- A native transport implementation would compete with Git itself. Defer it until local storage
  performance stops being the bottleneck.

## Immediate Next Steps

1. Capture baseline benchmark numbers for `GitCli` and `GitFilesystem`.
2. Extract `ObjectDatabase` and `LooseObjectStore` without behavior changes.
3. Add a pack index registry so repeated packed reads do not reparse `.idx` files.
4. Add `CommitSummary` and migrate `isAncestor`/`mergeBase` to summary reads.
5. Re-run benchmarks and decide whether tree path lookup or commit-graph support is the next
   highest-impact change.
