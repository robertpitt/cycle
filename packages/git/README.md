# @cycle/git

`@cycle/git` is Cycle's Effect-first wrapper around Git command execution. It exposes one primary
service, `Git`, with methods that map to the Git commands used by higher-level packages.

Higher-level packages should depend on `Git` instead of spawning `git` directly.

## Responsibilities

This package provides:

- A typed `Git` service for repository, revision, status, branch, ref, index, commit, worktree, and
  remote commands.
- Repository compatibility helpers for inspection, initialization, and Git directory resolution.
- Shared Git schemas and tagged errors.

This package does not provide:

- GitDB collections, documents, snapshots, pointers, transactions, or sync policy.
- Worktree lifecycle persistence, setup profiles, handover orchestration, or cleanup policy.
- Direct object database storage backends.
- Ticket, issue, workflow, draft, or execution-record domain logic.

## `Git`

Use `Git` for command-level Git operations:

```ts
import { Git, GitLive } from "@cycle/git";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";

const program = Effect.gen(function* () {
  const git = yield* Git;
  const head = yield* git.head("/path/to/repo");
  const status = yield* git.statusPorcelain("/path/to/repo");

  return { head, status };
});

Effect.runPromise(program.pipe(Effect.provide(GitLive.pipe(Layer.provide(NodeServices.layer)))));
```

The service includes methods for:

- `showTopLevel`, `commonGitDir`, `absoluteGitDir`
- `resolveCommit`, `head`, `revList`, `isAncestor`
- `currentBranch`, `listLocalBranches`, `checkBranchName`
- `statusPorcelain`
- `updateRef`, `deleteRef`
- `addAll`, `commit`
- `worktreeAddDetached`, `worktreeRemove`
- `lsRemoteRef`, `fetchRef`, `push`

`@cycle/git/commands/GitCommands` remains as a compatibility import path, but it provides the same
`Git` service key. New code should import `Git` and `GitLive` from `@cycle/git`.

## Repository Compatibility

`GitRepository` remains available for code that needs repository lifecycle operations:

- `inspect(path)`
- `ensure(path)`
- `init(path)`
- `metadata(path)`
- `resolveGitDir(path)`

```ts
import { GitRepository, GitRepositoryLive } from "@cycle/git";
```

## Schemas

Schemas live under `@cycle/git/schemas` and are also exported from the root package.

Common schemas:

- `ObjectId`
- `Ref`
- `RefName`
- `PointerName`
- `GitRepositoryRef`
- `GitRepositoryInspection`

## Errors

Errors live under `@cycle/git/errors` and are also exported from the root package.

Common errors:

- `GitCommandError`
- `GitRepositoryError`
- `GitRevisionError`
- `GitStatusError`
- `GitBranchError`
- `GitBranchNameError`
- `GitRefError`
- `GitIndexError`
- `GitCommitError`
- `GitWorktreeError`
- `GitRemoteLookupError`
- `RemoteFetchError`
- `RemotePushError`

## Verification

From the repository root:

```sh
pnpm --filter @cycle/git typecheck
pnpm --filter @cycle/git test
```
