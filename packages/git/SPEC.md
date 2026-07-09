# Git Package Specification

Package: `@cycle/git`

## Purpose

`@cycle/git` is the canonical low-level Git command package for Cycle. It exposes one primary
Effect service, `Git`, whose methods correspond to Git commands that higher-level packages need.

Callers must use this service instead of spawning `git` directly.

## Public Surface

The package owns:

- `Git`: command-facing service.
- `GitLive`: Node-backed live layer for `Git`.
- `GitRepository`: compatibility service for repository inspection and initialization.
- `GitRepositoryLive`: Node-backed live layer for `GitRepository`.
- Git schemas and tagged errors.

`@cycle/git/commands/GitCommands` is a compatibility import path. It provides the same `Git` service
key and should not be used by new code.

## `Git` Service

`Git` methods are intentionally close to Git command names and output:

- `showTopLevel(cwd)`
- `commonGitDir(cwd)`
- `absoluteGitDir(cwd)`
- `resolveCommit(cwd, ref)`
- `head(cwd)`
- `currentBranch(cwd)`
- `statusPorcelain(cwd, options?)`
- `revList(cwd, input)`
- `isAncestor(cwd, ancestor, descendant)`
- `listLocalBranches(cwd)`
- `checkBranchName(cwd, branchName)`
- `branchRef(branchName)`
- `updateRef(cwd, input)`
- `deleteRef(cwd, input)`
- `addAll(cwd)`
- `commit(cwd, input)`
- `worktreeAddDetached(repositoryPath, input)`
- `worktreeRemove(repositoryPath, input)`
- `lsRemoteRef(cwd, input)`
- `fetchRef(cwd, input)`
- `push(cwd, input)`

Expected non-zero statuses are converted into typed results where useful. Unexpected failures are
mapped into package-owned tagged errors.

## Boundaries

`@cycle/git` must not import other `@cycle/*` packages.

`@cycle/git-store` owns Git object/ref storage, GitDB documents, snapshots, transactions, and sync
policy.

`@cycle/git-worktrees` owns durable worktree records, leases, setup profiles, handover,
reconciliation, and lifecycle policy.

## Verification

```sh
pnpm --filter @cycle/git typecheck
pnpm --filter @cycle/git test
pnpm --filter @cycle/git-store typecheck
pnpm --filter @cycle/git-worktrees typecheck
```
