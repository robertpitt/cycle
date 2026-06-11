# GitDB Snapshot Store Specification

Status: Draft

Version: 0.2

Audience: implementers of Git-backed local-first stores, developer tools, agents, workflow engines,
project metadata systems, and conformance test suites.

## 1. Purpose

GitDB defines a small database abstraction backed by an existing Git object database. It stores
application documents as Git blobs, groups them through Git trees, represents committed database
states as Git commits, and moves named database pointers through custom Git refs under
`refs/gitdb`.

GitDB is not a Git porcelain API. It uses Git as a storage engine while keeping application state
separate from normal source-code branches, the working tree, `HEAD`, and the repository index.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the behavior, but it MUST document that
choice and expose enough information for callers and conformance tests to reason about it.

## 3. Problem Statement

Applications often need durable, local, syncable project state without introducing a separate
database service. Git already provides content-addressed objects, immutable trees, commits, refs,
transport, history, and integrity checks. Directly exposing Git, however, leaks source-control
concepts such as checkout, staging, branches, and `HEAD` into application data models.

GitDB standardizes the minimal storage and synchronization contract needed to use Git as a database
engine while avoiding interference with normal developer Git workflows.

## 4. Goals

A conforming GitDB implementation MUST support:

1. Opening an existing Git repository object database.
2. Writing documents as Git blobs.
3. Building collection state as Git trees without using the repository index.
4. Creating immutable snapshots as Git commits.
5. Storing mutable database pointers under `refs/gitdb/{database}/{pointer}`.
6. Reading documents from a pointer or historical snapshot.
7. Listing collections by inspecting the snapshot tree.
8. Committing transactions with optimistic pointer updates.
9. Walking snapshot history through commit parents.
10. Computing path-level diffs between snapshots.
11. Fetching and pushing GitDB refs explicitly.
12. Reporting sync divergence without performing automatic merges.

## 5. Non-Goals

GitDB v0.2 does not define:

1. SQL, query planning, joins, or arbitrary predicates.
2. Full-text search.
3. Automatic merge, CRDT behavior, or conflict-free multi-writer coordination.
4. Schema enforcement.
5. Encryption, access control, or secret management.
6. A lock service for concurrent distributed writers.
7. Use of `refs/heads/*` for database pointers.
8. Mutating the Git working tree, `HEAD`, or repository index.
9. A required global manifest file.
10. A language-specific public API.

Optional extensions MAY define these features if they do not violate the core safety and storage
requirements in this specification.

## 6. System Overview

### 6.1 Concept Mapping

| GitDB Concept | Git Primitive                                     |
| ------------- | ------------------------------------------------- |
| Store         | Git object database plus GitDB ref namespace      |
| Collection    | Tree path under `collections/`                    |
| Document      | Blob                                              |
| Snapshot      | Commit                                            |
| Pointer       | Ref under `refs/gitdb/{database}/`                |
| Transaction   | In-memory or implementation-private tree mutation |
| Sync          | Explicit fetch and push of GitDB refs             |

### 6.2 Components

A conforming implementation has these responsibility boundaries:

- Store: owns database configuration, ref namespace construction, collection discovery, snapshot
  resolution, history, diff, and sync orchestration.
- Collection: maps safe document IDs to deterministic document paths and handles collection-level
  reads and writes.
- Transaction: stages document mutations against one base snapshot and commits them atomically by
  creating a new snapshot and moving one pointer.
- Pointer: resolves, moves, forks, and deletes named snapshot refs.
- Git adapter: performs Git object, commit, ref, ancestry, fetch, and push operations.

The Git adapter MAY be implemented using the Git CLI, libgit2, JGit, isomorphic-git, a custom object
writer, or another compatible backend.

## 7. Repository Contract

### 7.1 Store Identity

A Store is identified by:

- `gitDir`: path to an existing Git directory.
- `namespace`: Git ref namespace. The default and standard namespace is `refs/gitdb`.
- `database`: safe database name. The default database name is `default`.
- `defaultPointer`: safe pointer name. The default pointer is `main`.

The canonical local pointer ref is:

```text
refs/gitdb/{database}/{pointer}
```

The canonical remote-tracking pointer ref is:

```text
refs/gitdb/{database}/remotes/{remote}/{pointer}
```

### 7.2 Normal Git Workflow Isolation

GitDB implementations MUST NOT require or perform any of the following for normal database reads or
writes:

- `git add`
- `git commit`
- checkout
- branch switching
- mutation of `.git/index`
- mutation of the working tree
- mutation of `HEAD`
- creation of refs under `refs/heads/*`

Implementations MAY expose diagnostics or maintenance tools that inspect normal Git state, but core
database behavior MUST remain independent of it.

### 7.3 Ref Namespace Validation

Implementations MUST reject application pointer namespaces under `refs/heads/*` unless a caller uses
an explicit low-level escape hatch outside the GitDB conformance profile.

Pointer names MUST be relative names, not full ref paths. They MUST NOT:

- be empty
- start or end with `/`
- contain `//`
- contain path traversal segments
- contain `@{`
- contain Git ref metacharacters
- start with `refs/`
- start with `remotes/`
- start with `transactions/`
- end with `.lock`

Valid examples:

```text
main
workspaces/robert
experiments/provider-routing
releases/v1
```

Invalid examples:

```text
refs/heads/main
../main
main.lock
remotes/origin/main
feature@{1}
```

## 8. Path and Identifier Rules

### 8.1 Safe Segments

The v0.2 core profile uses safe path segments instead of arbitrary string encoding.

Database names, collection names, document IDs, index names, index keys, remote names, and pointer
path segments MUST use safe segments.

A safe segment:

- MUST match `[A-Za-z0-9][A-Za-z0-9._-]*`.
- MUST NOT equal `.` or `..`.
- MUST NOT contain `/`, `\`, or NUL.
- MUST NOT end with `.lock`.

Collection names MUST NOT start with `.`.

### 8.2 Store Paths

Store paths are slash-separated safe segments relative to a snapshot root tree. Store paths MUST NOT
be absolute paths and MUST NOT contain traversal segments.

The empty path refers to the snapshot root tree. Implementations MUST reject attempts to write a
document at the empty path.

## 9. Snapshot Tree Layout

### 9.1 Core Layout

Each snapshot root tree represents a complete database state.

The core v0.2 tree layout is:

```text
/
  collections/
    {collection}/
      .meta.json
      {shard}/
        {documentId}.json
```

`collections/` MAY be absent in an empty snapshot. A collection exists when
`collections/{collection}/` exists as a tree.

### 9.2 No Global Manifest

GitDB v0.2 does not require a global manifest.

Implementations MUST be able to discover collections by listing the `collections/` tree in the
target snapshot. Implementations MUST NOT require `.store/manifest.json` or any other global
manifest file to read collections, documents, history, diffs, or pointers.

Implementations MAY preserve or ignore non-core metadata paths. Unknown files under the snapshot
root MUST NOT prevent a conforming reader from reading core collections unless they conflict with
required core paths.

### 9.3 Collection Metadata

Collection metadata is optional. If present, collection metadata SHOULD be stored as canonical JSON
at:

```text
collections/{collection}/.meta.json
```

Collection metadata MUST NOT be required for collection discovery. Readers that do not understand
the metadata schema MUST still be able to list and read documents in the collection.

### 9.4 Document Placement

The standard v0.2 document path is:

```text
collections/{collection}/{shard}/{documentId}.json
```

`shard` MUST be the first two lowercase hexadecimal characters of the SHA-1 digest of the UTF-8
document ID. SHA-1 is used only as a deterministic placement hash and MUST NOT be treated as a
security property.

Example:

```text
collections/tickets/a3/ticket-123.json
```

Implementations MAY support additional layout profiles, but the layout in this section is REQUIRED
for v0.2 core interoperability.

## 10. Documents

A document is a Git blob addressed by a collection name and document ID.

For JSON documents, writers SHOULD use deterministic JSON encoding:

- UTF-8.
- Stable object key ordering.
- No insignificant whitespace except an optional trailing newline.
- Dates encoded as strings.
- No representation of `undefined`.

Readers MUST treat document bytes as the source of truth. JSON parsing is a higher-level
interpretation, not a GitDB storage requirement.

Binary, text, compressed, or custom encoded documents MAY be stored as blobs if the application can
derive the same document path and interpret the bytes.

## 11. Collections

Collections are logical groups of documents represented by trees under `collections/`.

A conforming implementation MUST support:

- listing collection names from `collections/*`
- reading collection metadata when present
- reading a document by ID
- writing a document by ID inside a transaction
- deleting a document by ID inside a transaction
- listing documents by walking the collection tree and ignoring `.meta.json`

Document listing order SHOULD be deterministic. Lexicographic path order is RECOMMENDED.

## 12. Snapshots

A snapshot is a Git commit whose tree is a GitDB root tree.

A snapshot MUST expose:

- `id`: commit object ID
- `root`: root tree object ID
- `parents`: parent snapshot IDs
- `message`: commit message, if present
- `author`: author identity, if present
- `committer`: committer identity, if present
- `createdAt`: timestamp derived from committer or author metadata, if present

Snapshot IDs are Git commit IDs. Implementations MAY wrap IDs in language-specific types, but they
MUST preserve the underlying Git object identity for adapter, diff, sync, and history operations.

## 13. Pointers

A pointer is a mutable name that resolves to a snapshot commit.

Pointer refs MUST be stored under:

```text
refs/gitdb/{database}/{pointer}
```

Pointers MUST NOT be stored under `refs/heads/*`.

A conforming implementation MUST support:

- reading the current snapshot for a pointer
- moving a pointer to a target snapshot with expected-current semantics
- creating a new pointer from an existing pointer or snapshot
- deleting a pointer with optional expected-current semantics
- walking history from a pointer

Deleting a pointer MAY make snapshots unreachable except through another ref, tag, reflog, or
retention mechanism. Implementations SHOULD document this garbage collection risk.

## 14. Transactions

A transaction is a set of staged document mutations against one base snapshot and one target
pointer.

A transaction MUST:

- read from its base snapshot plus its own staged writes
- keep writes private until commit
- create a new root tree without using `.git/index`
- create a commit whose parent is the base snapshot when a base exists
- update the target pointer only after the commit object exists
- use optimistic pointer concurrency when moving the pointer

If the target pointer no longer equals the expected base snapshot at commit time, the commit MUST
fail with a pointer conflict and MUST NOT move the pointer.

An implementation MAY still have written unreachable blobs, trees, or commits before detecting a
pointer conflict. Such objects MUST NOT be considered committed database state unless reachable from
a GitDB pointer or another retention ref.

### 14.1 Empty Initial Transaction

If a target pointer does not exist, the first successful transaction MAY create a snapshot with no
parents. GitDB v0.2 does not require an initialization manifest or bootstrap document.

## 15. Read Model

### 15.1 Read Source Resolution

Read operations MAY specify `from`.

If `from` is omitted, readers MUST resolve the default pointer.

If `from` is a valid pointer name and that pointer exists, readers MUST read from the pointer's
current snapshot.

If `from` is a commit ID, readers MUST read from that snapshot.

If neither resolution succeeds, reads SHOULD return null or an explicit not-found error according
to the language binding.

### 15.2 Read by Path

A conforming implementation MUST support reading a blob by store path from a pointer or snapshot.

Resolution order:

```text
source -> snapshot commit -> root tree -> path entry -> blob bytes
```

If the path is missing or resolves to a tree, the operation MUST NOT return document bytes.

### 15.3 List by Prefix

A conforming implementation MUST support listing direct entries under a tree path from a pointer or
snapshot.

If the path is missing or resolves to a blob, the operation SHOULD return an empty list or an
explicit not-found/type error according to the language binding.

## 16. History and Edits

GitDB v0.2 models edits through snapshot history. Each committed transaction creates a new snapshot
commit. The commit graph is the authoritative edit history.

Applications that need domain-specific audit trails MAY maintain separate event collections, but
GitDB core conformance MUST NOT require event collections to understand document history.

A conforming implementation MUST support walking commit parents from a pointer or snapshot.

History traversal SHOULD support:

- maximum result count
- timestamp bounds
- path filtering

Path filtering MAY be implemented by comparing tree entries across adjacent snapshots.

## 17. Diff

A conforming implementation MUST support path-level diffs between two snapshots.

A diff result MUST classify changed blob paths as:

- `added`
- `modified`
- `deleted`

Each change SHOULD include:

- `path`
- `oldObjectId`, when present
- `newObjectId`, when present

GitDB v0.2 does not require semantic JSON diffs.

## 18. Sync

### 18.1 Explicit Sync Only

GitDB refs MUST be synchronized explicitly. Implementations MUST NOT assume normal `git pull` or
`git push` includes GitDB refs.

### 18.2 Fetch

Fetch SHOULD retrieve remote GitDB refs into remote-tracking refs:

```text
refs/gitdb/{database}/{pointer}
  -> refs/gitdb/{database}/remotes/{remote}/{pointer}
```

The recommended fetch refspec is:

```text
+refs/gitdb/{database}/*:refs/gitdb/{database}/remotes/{remote}/*
```

Implementations MUST NOT fetch remote GitDB refs into `refs/heads/*`.

### 18.3 Push

Push SHOULD publish selected local pointers to matching remote GitDB refs.

The recommended push refspec for one pointer is:

```text
refs/gitdb/{database}/{pointer}:refs/gitdb/{database}/{pointer}
```

### 18.4 Sync State Comparison

After fetch, implementations MUST be able to compare local and remote-tracking pointer state:

```text
local:  refs/gitdb/{database}/{pointer}
remote: refs/gitdb/{database}/remotes/{remote}/{pointer}
```

The comparison states are:

| State        | Condition                          | Core Behavior                |
| ------------ | ---------------------------------- | ---------------------------- |
| equal        | local equals remote                | no-op                        |
| local-only   | local exists and remote is missing | push MAY create remote       |
| remote-only  | remote exists and local is missing | pull MAY create local        |
| local-ahead  | local descends from remote         | push MAY fast-forward remote |
| remote-ahead | remote descends from local         | pull MAY fast-forward local  |
| diverged     | neither descends from the other    | report conflict              |

### 18.5 Merge Excluded From Core

GitDB v0.2 does not define automatic merge behavior.

If local and remote pointers have diverged, a conforming implementation MUST NOT silently overwrite
either side. It MUST report a sync conflict that includes:

- pointer name
- local snapshot ID
- remote snapshot ID
- merge base snapshot ID, when known

Implementations MAY expose explicit non-core policies such as `keep-local` or `keep-remote`, but
such policies MUST be opt-in and MUST be documented as destructive or conflict-resolving behavior.

## 19. Git Adapter Contract

A conforming implementation MUST provide or depend on a Git adapter capable of:

- writing blobs
- reading blobs
- writing trees from explicit entries
- reading tree entries
- writing commits from tree, parent, message, and identity input
- reading commit objects
- reading refs
- atomically updating refs with expected-current semantics
- deleting refs with expected-current semantics
- listing refs under a prefix
- fetching explicit refspecs
- pushing explicit refspecs
- checking whether an object ID resolves to a commit
- checking commit ancestry
- computing a merge base, when available

Adapter errors MUST be mapped into implementation-visible error categories. Raw backend errors MAY
be attached as causes for diagnostics.

## 21. Failure Model

### 21.1 Required Error Categories

A conforming implementation MUST be able to represent these failure classes:

- store not found
- invalid path or identifier
- invalid pointer name
- pointer not found
- snapshot not found
- document not found
- pointer conflict
- sync conflict
- Git adapter failure
- remote fetch failure
- remote push failure

Language bindings MAY expose these as exceptions, tagged results, error codes, or another idiomatic
error mechanism.

### 21.2 Pointer Conflict

A pointer conflict occurs when an implementation attempts to move a pointer from `expected` to
`target`, but the pointer currently resolves to a different snapshot.

Pointer conflict reports MUST include:

- pointer name
- expected snapshot ID or null
- actual snapshot ID or null

### 21.3 Partial Writes

Git object writes may occur before a transaction fails. Implementations MUST treat a transaction as
committed only after the target GitDB pointer successfully resolves to the new snapshot.

Unreachable objects created by failed transactions are subject to normal Git garbage collection.

## 22. Security and Operational Safety

GitDB data stored in Git objects is not secret. If GitDB refs or objects are pushed to a remote,
users with repository access may be able to fetch and inspect them.

Implementations MUST NOT log secrets by default. Applications storing sensitive data MUST encrypt
or redact it before handing it to GitDB.

Implementations MUST validate untrusted names before constructing store paths or refs.

Implementations that invoke Git commands MUST avoid shell interpolation for untrusted values.

Implementations SHOULD document garbage collection behavior and the risk of deleting the last ref
that reaches a snapshot.

## 23. Observability

Implementations SHOULD expose enough diagnostic information to debug storage and sync behavior
without inspecting Git internals manually.

Recommended structured fields:

- database
- namespace
- pointer
- ref
- snapshot ID
- parent snapshot IDs
- root tree ID
- collection
- document ID
- store path
- remote
- sync mode
- sync status
- error category

Implementations SHOULD make pointer conflicts and sync conflicts visible without requiring debug
logging.

## 24. Access Pattern Workflows

This section defines the expected operation workflows for common GitDB access patterns. The
workflows describe required ordering and visibility boundaries, not a required internal API.
Implementations MAY optimize the internal algorithms as long as the externally observable behavior
matches these workflows.

### 24.1 Open Store Workflow

Opening a store MUST follow this workflow:

1. Resolve `cwd` and `gitDir` according to the implementation's configuration rules.
2. Validate the GitDB namespace, database name, and default pointer name.
3. Verify the Git directory exists unless the implementation explicitly supports deferred or
   in-memory stores.
4. Construct the canonical local ref prefix:

   ```text
   refs/gitdb/{database}
   ```

5. Expose the store as an unresolved dependency or explicit store value according to the language
   binding.

Opening a store MUST NOT create a database snapshot, initialize a manifest, move a pointer, mutate
the working tree, or mutate `.git/index`.

### 24.2 Current Pointer Read Workflow

Reading the current state of a pointer MUST follow this workflow:

1. Validate the pointer name.
2. Construct `refs/gitdb/{database}/{pointer}`.
3. Read the ref through the Git adapter.
4. If the ref is missing, return an absent pointer result.
5. If the ref exists, verify or read the target commit as a snapshot.
6. Return the snapshot metadata and root tree ID.

Implementations SHOULD distinguish a missing pointer from a pointer that targets a missing or
invalid commit.

### 24.3 Historical Document Read Workflow

Reading a document from a pointer or historical snapshot MUST follow this workflow:

1. Validate the collection name and document ID, or validate the explicit store path.
2. Resolve the read source:
   - omitted source resolves the default pointer
   - pointer source resolves the pointer's current snapshot
   - commit ID source resolves that snapshot
3. If the source is absent, return an absent document result or an explicit not-found error
   according to the language binding.
4. Traverse the snapshot root tree to the document path.
5. If the path is missing or resolves to a tree, return an absent document result.
6. Read the blob bytes.
7. Return bytes and document metadata. JSON decoding, if requested, happens after the storage read.

Historical reads MUST NOT consult the current pointer after the source snapshot has been resolved.

### 24.4 Collection List Workflow

Listing documents in a collection MUST follow this workflow:

1. Resolve the read source as described in Section 24.3.
2. Traverse to `collections/{collection}`.
3. Walk document shard trees under the collection root.
4. Ignore `.meta.json` and non-document entries that do not match the implementation's document
   path profile.
5. Return entries in deterministic order.

Collection discovery MUST list direct tree entries under `collections/` and MUST NOT require a
global manifest.

### 24.5 Transaction Begin Workflow

Beginning a transaction MUST follow this workflow:

1. Validate the target pointer name.
2. Read the target pointer.
3. If the pointer exists, read the target snapshot and record it as the base snapshot.
4. If the pointer is missing, record a null base snapshot.
5. Record the transaction's expected pointer value:
   - base snapshot ID when the base exists
   - null when the pointer is missing
6. Create an implementation-private mutation set.

The mutation set MUST remain private until commit. Reads through the transaction MUST observe the
base snapshot plus staged mutations.

### 24.6 Stage Document Put Workflow

Staging a document put inside a transaction MUST follow this workflow:

1. Verify the transaction is active.
2. Validate the collection name and document ID, or validate the explicit store path.
3. Derive the document path.
4. Encode the document bytes.
5. Stage a `put` mutation for the path.

Staging a put MUST NOT move a pointer. Implementations MAY write Git blobs eagerly, but those blobs
MUST NOT be considered committed database state until the target pointer is moved successfully.

### 24.7 Stage Document Delete Workflow

Staging a document delete inside a transaction MUST follow this workflow:

1. Verify the transaction is active.
2. Validate the collection name and document ID, or validate the explicit store path.
3. Derive the document path.
4. Stage a delete mutation for the document path.

Deleting a missing document MAY be treated as a no-op.

### 24.8 Commit Transaction Workflow

Committing a transaction MUST follow this workflow:

1. Verify the transaction is active.
2. Determine the target pointer. If not explicitly overridden, use the pointer recorded when the
   transaction began.
3. Determine the expected pointer value. If the caller supplies an explicit expected snapshot, use
   it. Otherwise use the transaction's recorded base snapshot ID or null.
4. Materialize the next root tree from the base snapshot plus staged mutations. Implementations MAY
   use recursive tree materialization, path-level copy-on-write tree updates, or another equivalent
   algorithm.
5. Write all new or changed blobs.
6. Write all new or changed trees without using the repository index.
7. Write a commit whose tree is the new root tree and whose parents are:
   - empty when the base snapshot is null
   - the base snapshot ID when the base exists
8. Atomically update the target pointer ref from `expected` to the new commit ID.
9. Mark the transaction inactive.
10. Return the new snapshot only after the pointer update succeeds and the pointer resolves to the
    new snapshot.

The pointer update in step 8 is the commit point. If the pointer update fails because the actual
pointer value differs from `expected`, the implementation MUST report a pointer conflict and MUST
NOT report the transaction as committed.

If a transaction contains no staged mutations and the base snapshot is not null, the implementation
MAY skip writing a new commit. It MUST still verify that the pointer equals the expected value
before returning the base snapshot as the result.

### 24.9 Raw Path Mutation Workflow

Implementations MAY expose raw path mutation APIs in addition to collection APIs. Raw path mutation
MUST follow the same transaction rules as collection mutation:

1. Validate the store path.
2. Reject mutation of the root path.
3. Stage put or delete mutations privately.
4. Commit through the transaction workflow in Section 24.8.

Raw path APIs MUST NOT bypass pointer concurrency, tree construction, or GitDB namespace rules.

### 24.10 Pointer Move, Fork, and Delete Workflow

Moving a pointer MUST validate the pointer name, verify the target snapshot exists, and atomically
update the pointer ref with expected-current semantics.

Forking a pointer MUST resolve the source pointer or snapshot, then create the target pointer with
expected null unless the language binding exposes another explicit expectation.

Deleting a pointer MUST atomically delete the pointer ref with expected-current semantics when an
expectation is supplied. If no expectation is supplied, the implementation MAY delete the ref
unconditionally, but it MUST document the lost-update risk.

Pointer operations MUST NOT mutate snapshots or tree objects.

### 24.11 History Workflow

Walking history MUST follow this workflow:

1. Resolve the start pointer or snapshot.
2. Read the start commit.
3. Walk parent commits until the traversal limit is reached or no parents remain.
4. Apply timestamp and path filters when supplied.
5. Return snapshots in deterministic traversal order.

For linear histories, newest-to-oldest parent traversal is RECOMMENDED.

### 24.12 Diff Workflow

Computing a diff MUST follow this workflow:

1. Resolve both input pointers or snapshots.
2. Flatten each snapshot tree to path-to-object-ID entries, or compare trees recursively.
3. Classify paths missing on the left as `added`.
4. Classify paths missing on the right as `deleted`.
5. Classify paths present on both sides with different object IDs as `modified`.

Diff MUST operate on snapshot content, not on working tree files.

### 24.13 Sync Workflow

Syncing a pointer with a remote MUST follow this workflow:

1. Validate remote and pointer names.
2. For fetch, pull, or full sync modes, fetch remote GitDB refs into remote-tracking GitDB refs.
3. Read local and remote-tracking pointer refs.
4. Compare pointer state using equality and commit ancestry.
5. Fast-forward the side selected by the sync mode when one side descends from the other.
6. Report a sync conflict when neither side descends from the other, unless an explicit
   conflict-resolution policy is selected.
7. Return per-pointer sync status.

Sync MUST NOT rely on normal branch checkout state. Conflict-resolution policies such as
`keep-local` or `keep-remote` MUST be explicit because they overwrite one side's pointer state.

## 25. Reference Algorithms

### 25.1 Document Path

```text
function documentPath(collection, id):
  validateSafeSegment(collection)
  validateSafeSegment(id)
  shard = sha1Hex(utf8(id))[0:2]
  return "collections/" + collection + "/" + shard + "/" + id + ".json"
```

### 25.2 Commit Transaction

```text
function commitTransaction(pointer, baseSnapshot, mutations, message):
  expected = baseSnapshot ? baseSnapshot.id : null
  rootTree = baseSnapshot ? readTreeRecursive(baseSnapshot.root) : emptyTree()

  for mutation in mutations:
    applyMutation(rootTree, mutation)

  newRoot = writeTreeRecursive(rootTree)
  parents = baseSnapshot ? [baseSnapshot.id] : []
  snapshot = writeCommit(tree = newRoot, parents = parents, message = message)

  updateRef(
    ref = "refs/gitdb/{database}/" + pointer,
    target = snapshot,
    expected = expected
  )

  return snapshot
```

### 25.3 Full Sync Without Merge

```text
function syncPointer(remote, pointer):
  fetch(remote, "+refs/gitdb/{database}/*:refs/gitdb/{database}/remotes/{remote}/*")

  local = readRef("refs/gitdb/{database}/" + pointer)
  incoming = readRef("refs/gitdb/{database}/remotes/" + remote + "/" + pointer)

  if local == incoming:
    return "up-to-date"

  if local == null and incoming != null:
    updateRef(localRef(pointer), incoming, expected = null)
    return "fast-forwarded"

  if local != null and incoming == null:
    push(remote, localRef(pointer) + ":" + localRef(pointer))
    return "pushed"

  if isAncestor(local, incoming):
    updateRef(localRef(pointer), incoming, expected = local)
    return "fast-forwarded"

  if isAncestor(incoming, local):
    push(remote, localRef(pointer) + ":" + localRef(pointer))
    return "pushed"

  raise SyncConflict(pointer, local, incoming, mergeBase(local, incoming))
```

## 26. Conformance Matrix

A GitDB v0.2 core implementation is conforming if it passes tests for:

| Area            | Required Validation                                                                  |
| --------------- | ------------------------------------------------------------------------------------ |
| Repository open | Opens an existing Git directory and rejects a missing one                            |
| Namespace       | Uses `refs/gitdb/{database}/{pointer}` for database pointers                         |
| Safety          | Does not mutate working tree, `HEAD`, normal branches, or `.git/index` during writes |
| Identifiers     | Rejects unsafe database, collection, document, index, remote, and pointer names      |
| Document path   | Maps IDs to `collections/{collection}/{sha1-prefix}/{id}.json`                       |
| Writes          | Writes documents as blobs and creates trees directly                                 |
| Snapshots       | Creates commits whose trees contain the complete database state                      |
| Initial commit  | Can create a first snapshot for a missing pointer without a manifest                 |
| Reads           | Reads by path and by collection ID from pointer and historical snapshot              |
| Collections     | Lists collections from the `collections/` tree without a global manifest             |
| Transactions    | Keeps writes private until commit                                                    |
| Concurrency     | Fails commit when expected pointer no longer matches actual pointer                  |
| Workflows       | Read, mutation, commit, pointer, history, diff, and sync workflows match Section 24  |
| History         | Walks snapshots through commit parents                                               |
| Diff            | Reports added, modified, and deleted blob paths between snapshots                    |
| Fetch           | Fetches GitDB refs into remote-tracking GitDB refs                                   |
| Push            | Pushes selected GitDB refs explicitly                                                |
| Divergence      | Reports sync conflict and does not auto-merge                                        |

## 27. Definition of Done

An implementation of this specification is done when:

1. Core conformance tests in Section 26 pass against a real Git repository.
2. A transaction can create, update, read, list, diff, and walk history for documents without a
   manifest.
3. Application pointers are stored only under `refs/gitdb` by default.
4. Optimistic pointer conflicts are observable and testable.
5. Explicit fetch and push operate on GitDB refs and do not require normal branch synchronization.
6. Diverged sync state is reported rather than merged.
7. Safety tests show no mutation of working tree files, `HEAD`, normal branches, or `.git/index`.

## 28. Optional Extensions

Future or non-core specifications MAY define:

- schema documents
- merge strategies
- retention refs
- transaction anchoring refs
- encryption envelopes
- binary document content types
- path codecs for arbitrary IDs
- snapshot metadata documents
- remote provider compatibility profiles

Optional extensions MUST preserve v0.2 core read compatibility for `collections/` documents and
`refs/gitdb` pointers unless they explicitly declare a different compatibility profile.
