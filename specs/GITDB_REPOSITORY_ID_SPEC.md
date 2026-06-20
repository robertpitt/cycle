# GitDB Root Repository ID Specification

Status: Draft

Version: 1

## 1. Purpose

This specification defines how Cycle derives a deterministic repository ID from the first commit in
the repository's Cycle GitDB history. The ID MUST be stable across machines that open the same
`refs/gitdb/cycle/main` history, without writing repository-owned metadata files, reserved
directories, JSON manifests, or working-tree conventions.

The primary product problem is preserving repository references inside synced issues. If User 1
creates an issue that references another repository, User 2 MUST resolve that reference after
syncing the same GitDB history, even when their local checkout path differs.

## 2. Normative Language

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as
described in RFC 2119.

Implementation-defined means the implementation may choose the exact mechanism, provided the
externally observable behavior satisfies this specification.

## 3. Problem Statement

Cycle currently derives repository IDs from local filesystem paths. Path-derived IDs are stable on
one machine but unstable across machines, clones, users, and workspace layouts. Cross-repository
issue links therefore cannot safely store those IDs as durable references.

Cycle already stores durable issue state in GitDB at `refs/gitdb/cycle/main`. That ref is the
portable storage identity shared by producers and consumers of the Cycle GitDB application. The root
commit of that ref is a better identity anchor than the working-tree path because it is copied with
the GitDB history itself.

## 4. Goals

1. Derive the user-visible repository ID from the root commit reachable from
   `refs/gitdb/cycle/main`.
2. Use the exact ID format `repo_<root-commit-prefix>`, where `<root-commit-prefix>` is the first
   five lowercase hexadecimal characters of the root commit object ID.
3. Ensure opening a repository initializes `refs/gitdb/cycle/main` immediately when it is absent.
4. Ensure first-time GitDB initialization creates a unique root commit by adding randomness to the
   root commit message.
5. Preserve the same repository ID across machines that share the same GitDB root commit.
6. Avoid repository-owned metadata files, special directories, JSON identity files, or working-tree
   naming conventions.
7. Handle first-open remote races deterministically by fetching before creating and adopting the
   remote root if a concurrent push wins.

## 5. Non-Goals

1. This specification does not define a globally collision-free repository ID. The required ID uses
   only five hex characters by design.
2. This specification does not preserve repository identity across root-history rewrites. If the
   root commit reachable from `refs/gitdb/cycle/main` changes, the repository ID changes.
3. This specification does not identify the user's normal Git branch, `main`, `master`, or working
   tree history.
4. This specification does not introduce `.cycle`, repository JSON files, Git notes, tags, branch
   naming conventions, or committed identity documents.
5. This specification does not automatically merge two independently initialized Cycle GitDB roots
   into one identity.

## 6. System Overview

The repository ID becomes a GitDB-derived ID rather than a local workspace-derived ID.

Main components:

- GitDB identity resolver: reads, creates, and validates the identity root for
  `refs/gitdb/cycle/main`.
- Local workspace registry: persists configured repositories using the resolved GitDB-derived ID.
- Desktop bootstrap: opens repositories, performs remote-aware identity resolution, and registers
  the database projection under the resolved ID.
- Database projection: treats the supplied repository ID as the durable repository key for tickets,
  records, history, inbox items, and repository status.
- Issue/reference model: stores repository references using the derived repository ID so synced
  references resolve on other machines with the same GitDB root.

External dependencies:

- Git object database for commit, tree, and ref operations.
- GitDB store configured with namespace `refs/gitdb`, database `cycle`, and default pointer `main`.
- Optional default Git remote for fetch/push during first-open identity resolution.

## 7. Core Domain Model

### 7.1 Cycle GitDB Ref

The Cycle GitDB ref is:

```text
refs/gitdb/cycle/main
```

The implementation MUST derive repository identity from this ref only. It MUST NOT inspect
`main`, `master`, `HEAD`, tags, remotes other than the selected GitDB remote ref, or working-tree
files to derive the repository ID.

### 7.2 GitDB Root Commit

The GitDB root commit is the single parentless commit reachable from `refs/gitdb/cycle/main`.

The implementation MUST resolve it using commit graph ancestry, equivalent to:

```bash
git rev-list --max-parents=0 refs/gitdb/cycle/main
```

If exactly one parentless commit is reachable, that commit is the GitDB root commit.

If no parentless commit is reachable because the ref is missing, the repository is uninitialized and
MUST enter the initialization workflow described in section 9.

If more than one parentless commit is reachable, the implementation MUST treat the repository
identity as ambiguous and fail repository open with an operator-visible identity conflict. It MUST
NOT choose a root by lexical order, timestamp, branch order, or traversal order.

### 7.3 Repository ID

The repository ID is:

```text
repo_<first five lowercase hex characters of GitDB root commit object ID>
```

For example:

```text
root commit: 91c28f90109950f5e17798e2f5a52a14ef6f01ac
repository ID: repo_91c28
```

The repository ID MUST match:

```text
^repo_[0-9a-f]{5}$
```

The implementation MUST normalize the root commit object ID to lowercase before slicing the first
five characters.

### 7.4 Bootstrap Root Commit

When Cycle creates `refs/gitdb/cycle/main` for the first time, it MUST create a root commit with:

- no parents;
- an empty tree;
- no GitDB event files;
- no working-tree file changes;
- no repository-owned metadata files;
- a commit message containing a random seed.

The commit message MUST use this format:

```text
Initialize Cycle GitDB

Seed: <seed>
```

`<seed>` MUST contain at least 128 bits of cryptographically secure randomness encoded as lowercase
hexadecimal. A 32-character lowercase hex string is the minimum acceptable seed representation.

The author and committer identity are implementation-defined. The commit object ID may also include
normal Git timestamp and identity data, but the random seed is the REQUIRED uniqueness source.

### 7.5 Collision Metadata

Because the repository ID intentionally uses only five hex characters, the implementation MUST be
able to detect local collisions between different full root commit IDs that produce the same
repository ID.

The implementation MAY store the full GitDB root commit ID in local app configuration, SQLite
projection metadata, or process memory for collision detection. Such metadata MUST NOT be written
to the repository working tree or GitDB as a committed identity file.

## 8. Repository Contract

### 8.1 Store Identity

The standard GitDB store identity remains:

```text
namespace: refs/gitdb
database: cycle
defaultPointer: main
watched ref: refs/gitdb/cycle/main
```

The previous behavior, where a missing `refs/gitdb/cycle/main` could remain an open `empty`
repository until the first domain write, is replaced. Opening a repository MUST attempt to ensure
the GitDB root exists before registering the repository as open.

### 8.2 No Repository-Owned Identity Files

The implementation MUST NOT create, read, or require any of the following for repository identity:

- `.cycle` directories;
- JSON identity files;
- generated files in the working tree;
- Git notes;
- Git tags;
- normal branches such as `main` or `master`;
- branch naming conventions outside `refs/gitdb/cycle/main`.

The only durable identity source is the Git commit graph reachable from `refs/gitdb/cycle/main`.

### 8.3 Local Registry

The local workspace registry MUST store the resolved `repo_<root5>` ID as the repository record ID.

When an existing path-hash repository record is reopened, the implementation MUST:

1. preserve the existing display name, preferences, added timestamp, and last-opened metadata where
   possible;
2. resolve or create the GitDB root;
3. replace the old local ID with the GitDB-derived ID;
4. update dependent local caches or route state so future operations use the new ID.

If two configured repository records resolve to the same repository ID and the same full root commit,
the implementation SHOULD collapse them into one local repository record. If they resolve to the
same repository ID but different full root commits, the implementation MUST fail with a repository ID
collision.

## 9. Runtime Workflows

### 9.1 Open Repository

Opening a repository MUST follow this order:

1. Normalize and validate the repository path.
2. Ensure the path is a Git repository, or initialize Git when the user explicitly requested
   repository creation.
3. Inspect Git metadata, including Git directory and default remote if available.
4. Create a GitDB store for namespace `refs/gitdb`, database `cycle`, default pointer `main`.
5. Resolve or initialize the GitDB root according to sections 9.2 through 9.5.
6. Derive `repositoryId = repo_<root5>`.
7. Detect local ID collisions.
8. Persist or update the local repository registry using the derived ID.
9. Register the database projection using the derived ID.
10. Materialize `refs/gitdb/cycle/main`.

The database projection MUST NOT be registered under a path-derived ID.

### 9.2 Open With Existing Local GitDB Ref

If local `refs/gitdb/cycle/main` exists, the implementation MUST resolve the GitDB root commit from
that ref and derive the repository ID from the root.

If a default remote is configured, the implementation SHOULD fetch the remote GitDB ref before final
registration so a missing or stale local ref can be reconciled with the remote before the ID is
persisted for this open.

If both local and remote refs exist and have the same root commit, normal GitDB synchronization MAY
continue using existing fetch, rebase, merge, or push policy.

If both local and remote refs exist and have different root commits, the implementation MUST treat
this as an identity conflict unless the local ref is known to be an unpublished bootstrap-only root
created during the current open attempt. In that current-open bootstrap race case, section 9.4
applies.

### 9.3 Open Without Local Ref And Without Remote Ref

If local `refs/gitdb/cycle/main` is missing and no configured remote GitDB ref is available, the
implementation MUST create the bootstrap root commit immediately.

After creation, the implementation MUST update local `refs/gitdb/cycle/main` to the new root commit
using an expected previous value of null.

### 9.4 Open Without Local Ref And With Remote

If local `refs/gitdb/cycle/main` is missing and a default remote is available, the implementation
MUST use this fetch-before-create workflow:

1. Fetch the remote GitDB ref for `refs/gitdb/cycle/main`.
2. If the remote ref exists, create or fast-forward the local ref to the remote ref, then derive the
   repository ID from the remote root.
3. If the remote ref does not exist, create a local bootstrap root commit.
4. Push the new local GitDB ref to the remote using lease semantics that require the remote ref to
   still be absent.
5. If the push succeeds, derive the repository ID from the local root.
6. If the push loses a race because another writer created the remote ref, fetch the remote ref,
   replace the current-open unpublished bootstrap-only local ref with the remote ref, and derive the
   repository ID from the remote root.

The implementation MUST NOT allow domain writes to proceed between creating the local bootstrap root
and completing the initial remote publish/adoption attempt when a default remote is available.

### 9.5 Open Existing Git Repository With Missing Cycle GitDB

Opening an existing user Git repository that has no Cycle GitDB ref MUST still initialize the Cycle
GitDB root immediately. This initialization MUST NOT stage, modify, or commit working-tree files.

This means a newly imported Git repository receives a Cycle repository ID before the first Cycle
issue, comment, label, template, saved view, or other domain object is created.

### 9.6 Reopen After Root Rewrite

If `refs/gitdb/cycle/main` is rewritten so that its reachable root commit changes, the repository ID
MUST change on the next identity resolution. This edge case is accepted behavior.

The implementation SHOULD log the old and new full root commit IDs when it detects a configured path
whose derived repository ID changed.

### 9.7 Missing Ref After Previous Initialization

If a previously initialized repository is later opened and `refs/gitdb/cycle/main` is missing, the
implementation MAY create a new bootstrap root according to this specification. That creates a new
repository ID. The implementation SHOULD log this as a root replacement event rather than treating it
as a normal first import.

## 10. Integration Contracts

### 10.1 Identity Resolver

The implementation MUST provide an identity resolver equivalent to:

```ts
type GitDbRepositoryIdentity = {
  readonly repositoryId: string; // repo_<root5>
  readonly rootCommitId: string; // full Git object ID
  readonly source: "local" | "remote" | "created" | "adopted-remote";
  readonly ref: "refs/gitdb/cycle/main";
};
```

The exact module and function names are implementation-defined.

The resolver MUST:

- create no working-tree files;
- return the same `repositoryId` for the same full `rootCommitId`;
- return the same `rootCommitId` on every machine that has the same GitDB root;
- fail on multiple reachable roots;
- fail on local five-character prefix collisions with different full roots;
- expose enough context for logging and user-facing error messages.

### 10.2 GitDB Store

The GitDB store SHOULD expose or support operations for:

- reading the current pointer commit;
- resolving all parentless commits reachable from a pointer;
- creating an empty-tree root commit with a supplied message;
- moving a pointer with an expected previous value;
- fetching and pushing the GitDB pointer with lease semantics.

If these operations are implemented outside `@cycle/git-db`, the implementation MUST keep their
behavior consistent with GitDB's existing pointer conflict, fetch, and push error model.

### 10.3 Desktop Local Workspace

Desktop local workspace registration MUST derive the repository record ID from the identity resolver.

The path-hash ID generation logic MUST be removed from the repository registration path or retained
only as a non-persisted temporary implementation detail before identity resolution completes.

### 10.4 Database Service

`RepositoryInput.repositoryId` remains the repository key accepted by the database service.
Callers MUST pass the GitDB-derived ID. The database service MUST NOT derive repository IDs from
paths.

SQLite projection tables MAY continue to use `repository_id` as their key column. Values in that
column MUST be GitDB-derived IDs after migration.

### 10.5 Issue And Repository References

Any durable issue field, record, comment, relation, markdown tag, autocomplete mention, or structured
reference that stores a repository reference MUST store the GitDB-derived repository ID.

When such content syncs to another machine that has opened the same GitDB root, the reference MUST
resolve to that machine's repository record without path mapping.

If the referenced repository is not configured locally, the reference MUST remain intact and
unresolved. The implementation SHOULD render a stable unresolved label using the stored repository
ID.

## 11. Failure Model And Recovery

### 11.1 Identity Conflict

Identity conflict occurs when:

- more than one parentless commit is reachable from `refs/gitdb/cycle/main`;
- local and remote GitDB refs have different roots outside the current-open bootstrap race case;
- a local `repo_<root5>` collision exists between different full root commit IDs.

Identity conflicts MUST be operator-visible and MUST prevent repository open under the ambiguous ID.

### 11.2 Remote Fetch Failure

If remote fetch fails before a missing local ref is initialized, the implementation MAY continue as
offline initialization only if the failure is clearly a connectivity or authentication failure and
the user has not required remote synchronization.

If offline initialization proceeds, the resulting root is unique to the local GitDB until it is
successfully pushed. If a different remote root later exists, the implementation MUST report an
identity conflict rather than silently merging identities.

### 11.3 Remote Push Race

If the initial push of a newly created bootstrap root is rejected because the remote ref was created
concurrently, the implementation MUST fetch and adopt the remote root when the local ref is still the
unpublished bootstrap-only root created during the current open attempt.

If local domain commits were created after the local bootstrap root before the push rejection, the
implementation MUST fail with an identity conflict. This should be impossible if section 9.4 is
implemented correctly.

### 11.4 Bootstrap Commit Failure

If the bootstrap commit cannot be created or the local ref cannot be moved with expected null, the
repository open MUST fail. The implementation MUST NOT fall back to a path-derived repository ID.

### 11.5 ID Collision

If two different full root commit IDs share the same five-character repository ID on one machine,
the implementation MUST fail opening the second repository and surface:

- the colliding repository ID;
- both full root commit IDs when available;
- both local paths when available.

The implementation MUST NOT silently rename either repository ID, append suffixes, or use more than
five characters for one side of the collision.

## 12. Observability

The implementation MUST emit structured logs for:

- identity resolution started;
- local GitDB ref found or missing;
- remote GitDB ref found, missing, fetched, or fetch failed;
- bootstrap root commit created, with full root commit ID but without logging secrets;
- initial remote push attempted, succeeded, rejected, or failed;
- remote root adopted after push race;
- repository ID derived;
- repository ID collision;
- identity conflict;
- migration from path-derived ID to GitDB-derived ID.

Every identity log event SHOULD include:

- repository path when safe to log;
- Git directory when safe to log;
- remote name when used;
- full root commit ID when known;
- derived repository ID when known;
- source: `local`, `remote`, `created`, or `adopted-remote`.

The random seed MAY appear in Git commit history by design, but logs SHOULD NOT emit the seed
separately.

## 13. Security And Safety

The random seed MUST come from a cryptographically secure random source.

The implementation MUST NOT store secrets in the bootstrap commit message. The seed is not a secret;
it is public uniqueness material.

The bootstrap workflow MUST NOT stage, alter, delete, or commit working-tree files.

Remote URLs, credentials, and tokens MUST follow existing redaction rules in logs and errors.

The implementation MUST use expected-ref or lease semantics when creating or adopting the identity
ref to avoid overwriting another writer's root.

## 14. Reference Algorithms

### 14.1 Derive Repository ID

```ts
function deriveRepositoryId(rootCommitId: string): string {
  const normalized = rootCommitId.toLowerCase();
  return `repo_${normalized.slice(0, 5)}`;
}
```

### 14.2 Resolve Root Commit

```ts
function resolveRootCommit(ref: string): RootResult {
  const current = readRef(ref);
  if (current === null) return { status: "missing" };

  const roots = reachableCommits(current).filter((commit) => commit.parents.length === 0);
  if (roots.length === 1) return { status: "ok", rootCommitId: roots[0].id };
  if (roots.length === 0) return { status: "invalid", reason: "no-root" };
  return { status: "conflict", reason: "multiple-roots", roots: roots.map((root) => root.id) };
}
```

### 14.3 Create Bootstrap Root

```ts
function createBootstrapRoot(pointer: "main"): Snapshot {
  const seed = secureRandomHex(16); // 16 bytes = 128 bits
  const message = `Initialize Cycle GitDB\n\nSeed: ${seed}`;
  const tx = gitdb.pointer(pointer).begin(); // base must be null
  return tx.commit({
    expectedSnapshot: null,
    message,
  });
}
```

The transaction MUST produce a commit even though there are no document mutations when the base is
null.

### 14.4 Remote-Aware First Open

```ts
function ensureIdentity(repository, remote) {
  const local = resolveRootCommit("refs/gitdb/cycle/main");
  if (local.status === "ok" && remote === undefined) return identity(local.rootCommitId, "local");

  if (remote !== undefined) {
    const fetched = fetchRemoteGitDbRef(remote, "refs/gitdb/cycle/main");
    if (fetched.status === "found" && local.status === "missing") {
      setLocalRef("refs/gitdb/cycle/main", fetched.snapshotId, null);
      return identity(resolveRootCommit("refs/gitdb/cycle/main").rootCommitId, "remote");
    }

    if (fetched.status === "found" && local.status === "ok") {
      const remoteRoot = resolveRemoteRoot(fetched.snapshotId);
      if (remoteRoot === local.rootCommitId) return identity(local.rootCommitId, "local");
      throw identityConflict(local.rootCommitId, remoteRoot);
    }
  }

  if (local.status === "ok") return identity(local.rootCommitId, "local");

  const created = createBootstrapRoot("main");

  if (remote === undefined) return identity(created.id, "created");

  const pushed = pushWithLease(remote, "refs/gitdb/cycle/main", created.id, null);
  if (pushed) return identity(created.id, "created");

  const remoteSnapshot = fetchRequiredRemoteGitDbRef(remote, "refs/gitdb/cycle/main");
  replaceCurrentOpenBootstrapRefWithRemote(remoteSnapshot);
  const adoptedRoot = resolveRootCommit("refs/gitdb/cycle/main").rootCommitId;
  return identity(adoptedRoot, "adopted-remote");
}
```

## 15. Migration Requirements

Existing installations may have path-derived repository IDs in local app configuration and SQLite.

On first open after this change, the implementation MUST:

1. resolve the GitDB-derived repository ID;
2. update local app config to use the new ID;
3. register the database projection with the new ID;
4. avoid writing compatibility metadata into the repository;
5. invalidate renderer query caches that include the old ID;
6. tolerate stale stored UI routes by redirecting to the corresponding repository path when
   possible, or to the normal invalid-route fallback otherwise.

SQLite projection data is rebuildable from GitDB. The implementation MAY clear and rebuild affected
projection rows instead of migrating every row from the old ID to the new ID.

External API clients MUST use the new GitDB-derived IDs after migration. Backward compatibility for
old path-derived IDs is not required unless a separate compatibility layer is specified.

## 16. Test And Validation Matrix

Core tests:

1. Opening a Git repository with no `refs/gitdb/cycle/main` creates an empty-tree root commit
   immediately.
2. The bootstrap root commit has no parents and no GitDB event files.
3. The bootstrap root commit message matches:
   `Initialize Cycle GitDB\n\nSeed: <32+ lowercase hex chars>`.
4. The derived repository ID is `repo_` plus the first five lowercase hex characters of the root
   commit ID.
5. Reopening the same repository derives the same repository ID.
6. Cloning or opening another checkout with the same GitDB root derives the same repository ID.
7. Different freshly initialized repositories produce different root commits because their seeds
   differ.
8. Opening a repository with a remote GitDB ref fetches and adopts the remote root before creating a
   local root.
9. Concurrent first open against the same remote produces one remote root; the loser fetches and
   adopts the winner's root.
10. Local and remote refs with different non-bootstrap roots fail with identity conflict.
11. A reachable GitDB history with multiple parentless roots fails with identity conflict.
12. A forced test collision where two different full roots share the same first five hex characters
    fails with repository ID collision.
13. Existing path-derived app config records are rewritten to GitDB-derived IDs while preserving
    preferences and display names.
14. Database projection rows are registered under the GitDB-derived ID.
15. Durable cross-repository references stored with `repo_<root5>` resolve on another machine with
    the same GitDB root.
16. No `.cycle` directory, JSON identity file, Git note, tag, or working-tree file is created.

Recommended integration tests:

1. Desktop add-repository flow creates the GitDB root before app config is refreshed.
2. Desktop initialize-repository flow runs `git init`, creates the GitDB root, and returns the
   GitDB-derived repository ID.
3. Remote push uses lease semantics and does not overwrite an existing remote GitDB root.
4. Renderer routes and query caches recover after old IDs are replaced.
5. CLI/API repository list returns only GitDB-derived IDs after migration.

## 17. Implementation Checklist

1. Add or expose GitDB root resolution for `refs/gitdb/cycle/main`.
2. Add bootstrap root commit creation with an empty tree and random seed message.
3. Add remote-aware fetch-before-create identity resolution.
4. Add push-with-lease handling and remote adoption on first-open race loss.
5. Replace path-hash repository ID generation in desktop local workspace registration.
6. Persist GitDB-derived IDs in app config.
7. Add local collision detection for five-character root prefixes.
8. Update database/open repository plumbing to require caller-supplied GitDB-derived IDs.
9. Update repository status semantics so missing GitDB refs are initialized on open rather than
   remaining normal `empty` repositories.
10. Update issue/reference storage and rendering paths to rely on the GitDB-derived repository ID.
11. Update architecture docs and existing specs that describe path-derived IDs or persistent empty
    GitDB refs.
12. Add the tests listed in section 16.

## 18. Open Questions

None. The short five-character ID and root-rewrite behavior are intentional constraints of this
specification.
