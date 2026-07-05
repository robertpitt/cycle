# @cycle/git

`@cycle/git` owns Cycle's reusable Git capabilities. It provides Effect services and schemas for
Git command execution, object/ref storage, repository lifecycle checks, and Git transport errors.

Use this package when code needs Git behavior directly. Higher-level packages such as
`@cycle/git-db` should build on these services instead of shelling out or reading `.git` directly.

## Responsibilities

This package provides:

- Git command execution through a typed Effect wrapper.
- Git object database primitives for blobs, trees, commits, refs, ancestry, fetch, and push.
- Replaceable object-store backends for CLI, direct filesystem access, and deterministic tests.
- Repository lifecycle helpers for inspection, initialization, and Git directory resolution.
- Shared Git schemas for object IDs, refs, identities, commits, tree entries, transport inputs, and
  repository inspection results.
- Shared Git errors for adapter failures, transport failures, and repository lifecycle failures.

This package does not provide:

- GitDB collections, documents, snapshots, pointers, transactions, or sync policy.
- Ticket, issue, workflow, draft, or execution-record domain logic.
- Desktop repository preference persistence.
- User-facing Git history UI.

## Public Services

### `Git`

`Git` is the low-level object/ref service. It is intentionally narrow and works against an explicit
repository reference:

```ts
type GitStore = {
  readonly cwd: string;
  readonly gitDir: string;
};
```

Capabilities:

- `readBlob` / `writeBlob`
- `readTree` / `writeTree`
- `readCommit` / `writeCommit`
- `readRef` / `updateRef` / `deleteRef` / `listRefs`
- `isCommit`
- `isAncestor`
- `mergeBase`
- `fetch`
- `push`

Import the service contract from:

```ts
import { Git } from "@cycle/git/object-store/Git";
```

Or through the root package:

```ts
import { GitService } from "@cycle/git";
```

### `GitRepository`

`GitRepository` handles repository lifecycle operations that are not Git object-store reads/writes.

Capabilities:

- `inspect(path)` returns whether a path is a Git repository.
- `ensure(path)` returns `{ cwd, gitDir }` or fails if the path is not a repository.
- `init(path)` runs `git init` and returns `{ cwd, gitDir }`.
- `resolveGitDir(path)` returns Git's absolute `.git` directory path.

Import the service from:

```ts
import { GitRepository } from "@cycle/git";
```

Use `GitRepositoryLive` when composing the Node implementation into an application layer.

## Backends

### `GitCli`

`GitCli.layer` shells out to the local `git` binary through Effect's `ChildProcessSpawner`.

Use it when compatibility with Git's own behavior is more important than direct filesystem speed.
It supports object/ref operations and transport operations such as `fetch` and `push`.

```ts
import * as GitCli from "@cycle/git/object-store/GitCli";
```

### `GitFilesystem`

`GitFilesystem.layer` reads and writes Git objects and refs directly under `.git`.

It supports loose and packed object reads, including packed objects after `git gc`. Transport
operations intentionally fail with typed transport errors because direct Git protocol transport is
not implemented here.

```ts
import * as GitFilesystem from "@cycle/git/object-store/GitFilesystem";
```

### `GitInMemory`

`GitInMemory.layer` is a deterministic object/ref backend for tests. It does not require a real
`.git` directory and treats transport as a no-op.

```ts
import * as GitInMemory from "@cycle/git/object-store/GitInMemory";
```

## Schemas

Schemas live under `@cycle/git/schemas`.

Important schemas:

- `ObjectId`
- `PotentialObjectId`
- `Ref`
- `RefName`
- `PointerName`
- `Identity`
- `IdentityInput`
- `CommitObject`
- `WriteCommitInput`
- `TreeEntry`
- `UpdateRefInput`
- `DeleteRefInput`
- `FetchInput`
- `PushInput`
- `GitRepositoryRef`
- `GitRepositoryInspection`

Example:

```ts
import { ObjectId, Ref, WriteCommitInput } from "@cycle/git/schemas";
```

## Errors

Errors live under `@cycle/git/errors`.

Error types:

- `GitAdapterError`: object/ref backend failure.
- `RemoteFetchError`: `git fetch` failure.
- `RemotePushError`: `git push` failure.
- `GitRepositoryError`: repository lifecycle failure.

Helper union types:

- `GitError`
- `GitTransportError`

Example:

```ts
import type { GitAdapterError, GitTransportError } from "@cycle/git/errors";
```

## Command Runner

`GitCommand` wraps local Git command execution and collects stdout, stderr, and exit status.

Capabilities:

- `git(spawner, gitDir, cwd, args, options)` runs `git --git-dir <gitDir> ...`.
- `gitRaw(spawner, cwd, args, options)` runs plain `git ...`.
- `formatOperation(args)` formats operations for errors.
- `formatGitFailure(args, result, cause)` creates readable failure text.

Most callers should prefer `Git`, `GitRepository`, or a backend layer instead of calling
`GitCommand` directly.

## Package Boundaries

The intended dependency direction is:

```txt
@cycle/git
  -> @cycle/git-db
    -> @cycle/database
      -> @cycle/usecases
        -> @cycle/api
        -> @cycle/desktop
```

`@cycle/git-db` imports Git schemas, errors, and services from this package. It should not duplicate
Git object codecs, command runners, ref validation, or repository lifecycle checks.

## Verification

From the repository root:

```sh
pnpm --filter @cycle/git typecheck
pnpm --filter @cycle/git test
```

The e2e tests cover:

- Repository inspection and initialization.
- CLI and filesystem backend interoperability.
- Blob, tree, commit, and ref round trips.
- Ancestry and merge-base checks.
- Filesystem reads of packed objects after `git gc`.
