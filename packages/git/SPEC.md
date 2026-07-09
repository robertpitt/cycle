# Git Package CLI Operations Specification

Status: Draft implementation specification

Version: 0.1.0

Package: `@cycle/git`

Location: `packages/git`

## 1. Purpose

`@cycle/git` is the canonical Effect-first Git access package for Cycle. This specification extends
the package with a typed, service-backed API for Git operations that require the Git CLI, including
repository inspection, revision resolution, worktree management, status inspection, branch and ref
commands, commit/index commands, revision listing, and remote transport commands.

Higher-level packages MUST use this package for Git CLI actions instead of importing
`ChildProcessSpawner`, `node:child_process`, or raw `gitRaw` helpers directly. `@cycle/git-store`
MUST continue to use direct filesystem access for local Git object and ref storage, but any explicit
CLI command in `@cycle/git-store` MUST delegate to `@cycle/git`. `@cycle/git-worktrees` MUST
delegate all Git command execution to `@cycle/git`.

## 2. Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` in this document
are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all
capitals.

`Implementation-defined` means an implementation may choose the mechanism, but it MUST document the
choice when callers, tests, or operators need to reason about behavior.

## 3. Problem Statement

Cycle currently has two overlapping Git access patterns:

1. `@cycle/git` owns reusable Git schemas, errors, repository checks, object/ref services, and the
   low-level `GitCommand` runner.
2. `@cycle/git-store` and `@cycle/git-worktrees` still contain direct Git CLI call sites for remote
   sync, worktree creation/removal, status inspection, branch publication, finalization, and push.

Those direct call sites duplicate stdout parsing, exit-code handling, command annotations, retry
placement, and error mapping. They also force higher packages to know which `git` spellings are
canonical. Cycle needs one package-owned CLI command/action service so callers can compose effects,
map typed errors into domain errors, and test command behavior without shelling out everywhere.

## 4. Goals

`@cycle/git` MUST:

1. Provide a typed Effect service for Git CLI actions required by `@cycle/git-store` and
   `@cycle/git-worktrees`.
2. Keep command execution array-based and shell-free.
3. Preserve the existing low-level command runner behavior: scoped child process lifetime, collected
   stdout/stderr bytes, exit status, structured logs, spans, and stderr sanitization.
4. Expose high-level methods for the Git commands currently duplicated by higher packages:
   `rev-parse`, `status`, `branch`, `for-each-ref`, `check-ref-format`, `update-ref`,
   `rev-list`, `merge-base --is-ancestor`, `add`, `commit`, `worktree add/remove`,
   `ls-remote`, `fetch`, and `push`.
5. Provide Effect-first signatures with typed error channels. Methods MUST NOT fail with `unknown`,
   raw process errors, or package-specific higher-layer domain errors.
6. Treat command exit codes intentionally: expected non-zero statuses MUST be converted into typed
   results, and unexpected statuses MUST be typed failures.
7. Allow higher packages to map `@cycle/git` errors into their own domain errors at package
   boundaries.
8. Provide deterministic test layers or fakes for command operations that higher packages can use
   without executing a real Git binary.
9. Avoid moving hashing, direct object codec, direct loose/packed object storage, GitDB document
   transactions, worktree lifecycle state, or branch association persistence into the CLI service.

## 5. Non-Goals

This specification MUST NOT:

1. Replace `GitFilesystem` as the direct filesystem object/ref backend.
2. Move `@cycle/git-store` document, pointer, transaction, event, identity, or sync policy into
   `@cycle/git`.
3. Move `@cycle/git-worktrees` durable records, leases, setup profiles, handover orchestration,
   cleanup policy, or reconciliation state into `@cycle/git`.
4. Require direct filesystem object reads in `@cycle/git-store` to use the Git CLI.
5. Require `@cycle/git` to implement Git object hashing, pack parsing, or loose object writes
   through the new CLI action service.
6. Provide a general-purpose shell runner. The service executes only `git` with structured
   arguments.
7. Own retry policy for higher-level workflows. Callers MAY retry typed failures, but retries MUST
   stay explicit at the workflow layer unless a method documents a bounded internal retry.

## 6. System Overview

### 6.1 Components

`@cycle/git` SHOULD contain these public components:

| Component | Responsibility |
| --- | --- |
| `GitCommand` | Low-level `git` process runner. Owns process spawning, stdout/stderr collection, status handling, spans, logs, and stderr sanitization. |
| `GitCommands` | High-level CLI action service. Owns canonical command spellings and parsing for repository, revision, status, branch, ref, index, commit, worktree, and remote operations. |
| `GitRepository` | Repository lifecycle service. MAY delegate repository CLI inspection to `GitCommands` or `GitCommand`. |
| `Git` | Existing object/ref service for blobs, trees, commits, refs, ancestry, fetch, and push. It MAY continue to have CLI, filesystem, and in-memory backends, but it is not the only API for working-tree CLI actions. |
| `GitSchemas` | Shared schemas and branded types for object IDs, refs, command DTOs, status DTOs, branch DTOs, worktree DTOs, and remote DTOs. |
| `GitErrors` | Tagged errors for command, repository, revision, ref, branch, status, index, commit, worktree, and remote failures. |

`GitCommands` is the canonical high-level Git CLI action boundary. Higher packages SHOULD prefer it
over calling `GitCommand` directly. `GitCommand` remains available for low-level commands that do
not yet have a high-level method, but new package code SHOULD add a typed method to `GitCommands`
instead of spreading new raw command call sites.

### 6.2 Package Exports

The package SHOULD add an export for the high-level service:

```json
{
  "exports": {
    "./commands/GitCommands": "./src/GitCommands.ts"
  }
}
```

The existing `./command/GitCommand`, `./repository/GitRepository`, `./schemas`, and `./errors`
exports MUST remain valid unless a separate migration spec supersedes them.

### 6.3 Dependency Direction

`@cycle/git` MUST NOT import any other `@cycle/*` package.

`@cycle/git-store` and `@cycle/git-worktrees` MAY import `@cycle/git` services and schemas. They
MUST NOT re-export `@cycle/git` symbols as convenience facades.

## 7. Domain Model

### 7.1 Repository Command Context

Every CLI operation MUST execute with an explicit repository context:

```ts
type GitCommandCwd = {
  readonly cwd: string;
};

type GitCommandRepository = {
  readonly cwd: string;
  readonly gitDir?: string;
};
```

Methods that operate on a worktree SHOULD use `cwd` only, because Git resolves the worktree-specific
`.git` file and common directory itself. Methods that intentionally operate against an explicit Git
directory MAY accept `gitDir` and run through `git --git-dir <gitDir>`.

### 7.2 Result DTOs

The package SHOULD define schema-backed DTOs for command results that cross package boundaries:

- `GitStatusPorcelain`: `{ cwd, porcelain, format, isDirty }`
- `GitHead`: `{ cwd, sha }`
- `GitCurrentBranch`: `{ cwd, branchName: string | null }`
- `GitResolvedRepository`: `{ cwd, primaryPath, gitDir, commonGitDir }`
- `GitBranchRef`: `{ branchName, ref }`
- `GitRemoteRef`: `{ remote, ref, target: ObjectId | null }`
- `GitWorktreeAddResult`: `{ repositoryPath, worktreePath, baseSha, headSha }`
- `GitCommitResult`: `{ cwd, sha, message }`
- `GitPushResult`: `{ remote, refspecs, status: "pushed" }`

DTOs returned by public services MUST avoid raw `unknown`. Object IDs MUST use the package
`ObjectId` schema where the value is required to be a full Git object ID.

### 7.3 Invariants

The implementation MUST enforce these invariants:

1. Command arguments MUST be passed as arrays; no method may build a shell command string.
2. Commands MUST run with an explicit `cwd`.
3. Object IDs returned from `rev-parse`, `rev-list`, `ls-remote`, and commit methods MUST be
   validated before being returned as `ObjectId`.
4. Ref names passed to `update-ref`, `deleteRef`, and branch publication helpers MUST be validated
   with the canonical ref schema or by `git check-ref-format` where Git's own branch syntax is
   required.
5. `currentBranch` MUST return `null` for detached HEAD, not an empty string.
6. `isAncestor` MUST return `false` for Git exit status `1` and fail only for unexpected statuses
   or process errors.
7. `statusPorcelain` MUST preserve machine-readable output exactly except for explicit trimming only
   when the method documents it. `-z` output MUST NOT be normalized with control-character removal.
8. Remote methods MUST redact credentials from logged URLs and stderr.

## 8. Public Service Contract

### 8.1 `GitCommand`

`GitCommand.ts` SHOULD continue to export low-level helpers and SHOULD also expose a service shape:

```ts
type GitCommandShape = {
  readonly runRaw: (
    input: GitRawCommandInput,
  ) => Effect.Effect<GitRunResult, GitCommandError>;
  readonly run: (
    input: GitRepositoryCommandInput,
  ) => Effect.Effect<GitRunResult, GitCommandError>;
  readonly output: (
    input: GitRawCommandInput | GitRepositoryCommandInput,
  ) => Effect.Effect<string, GitCommandError>;
};
```

`runRaw` MUST execute `git <args...>` in `cwd`. `run` MUST execute
`git --git-dir <gitDir> <args...>` when `gitDir` is supplied. `output` MUST decode stdout as UTF-8
and trim only trailing line endings unless a method requests raw output.

`GitCommand` MUST support these options:

- `allowFailure?: boolean`
- `quietAllowedFailure?: boolean`
- `env?: Record<string, string | undefined>`
- `input?: Uint8Array | string`

The command runner MAY support a timeout option, but if it does, timeout failure MUST be typed and
MUST interrupt the child process through scoped process lifetime.

### 8.2 `GitCommands`

`GitCommands` MUST expose high-level methods for these operations:

```ts
type GitCommandsShape = {
  readonly showTopLevel: (cwd: string) => Effect.Effect<string, GitRepositoryError>;
  readonly commonGitDir: (cwd: string) => Effect.Effect<string, GitRepositoryError>;
  readonly absoluteGitDir: (cwd: string) => Effect.Effect<string, GitRepositoryError>;
  readonly resolveCommit: (
    cwd: string,
    ref: string,
  ) => Effect.Effect<ObjectId, GitRevisionError>;
  readonly head: (cwd: string) => Effect.Effect<ObjectId, GitRevisionError>;
  readonly currentBranch: (cwd: string) => Effect.Effect<string | null, GitBranchError>;
  readonly statusPorcelain: (
    cwd: string,
    options?: GitStatusOptions,
  ) => Effect.Effect<string, GitStatusError>;
  readonly revList: (
    cwd: string,
    input: GitRevListInput,
  ) => Effect.Effect<ReadonlyArray<ObjectId>, GitRevisionError>;
  readonly isAncestor: (
    cwd: string,
    ancestor: ObjectId,
    descendant: ObjectId,
  ) => Effect.Effect<boolean, GitRevisionError>;
  readonly listLocalBranches: (cwd: string) => Effect.Effect<ReadonlyArray<string>, GitBranchError>;
  readonly checkBranchName: (
    cwd: string,
    branchName: string,
  ) => Effect.Effect<string, GitBranchNameError>;
  readonly branchRef: (branchName: string) => string;
  readonly updateRef: (
    cwd: string,
    input: GitUpdateRefCommandInput,
  ) => Effect.Effect<void, GitRefError>;
  readonly deleteRef: (
    cwd: string,
    input: GitDeleteRefCommandInput,
  ) => Effect.Effect<void, GitRefError>;
  readonly addAll: (cwd: string) => Effect.Effect<void, GitIndexError>;
  readonly commit: (
    cwd: string,
    input: GitCommitCommandInput,
  ) => Effect.Effect<GitCommitResult, GitCommitError>;
  readonly worktreeAddDetached: (
    repositoryPath: string,
    input: GitWorktreeAddDetachedInput,
  ) => Effect.Effect<GitWorktreeAddResult, GitWorktreeError>;
  readonly worktreeRemove: (
    repositoryPath: string,
    input: GitWorktreeRemoveInput,
  ) => Effect.Effect<void, GitWorktreeError>;
  readonly lsRemoteRef: (
    cwd: string,
    input: GitLsRemoteRefInput,
  ) => Effect.Effect<ObjectId | null, GitRemoteLookupError>;
  readonly fetchRef: (
    cwd: string,
    input: GitFetchRefInput,
  ) => Effect.Effect<void, RemoteFetchError>;
  readonly push: (
    cwd: string,
    input: GitPushCommandInput,
  ) => Effect.Effect<void, RemotePushError>;
};
```

The concrete implementation MAY split this shape into smaller package-owned services if a single
file becomes too broad, but the public API MUST still provide one canonical import path for each
operation. Implementers MUST NOT create convenience re-export packages that obscure symbol
ownership.

### 8.3 Command Spellings

The high-level service MUST use these canonical command spellings:

| Method | Git command |
| --- | --- |
| `showTopLevel` | `git rev-parse --show-toplevel` |
| `commonGitDir` | `git rev-parse --git-common-dir` |
| `absoluteGitDir` | `git rev-parse --absolute-git-dir` |
| `resolveCommit(cwd, ref)` | `git rev-parse <ref>^{commit}` |
| `head` | `git rev-parse HEAD` |
| `currentBranch` | `git branch --show-current` |
| `statusPorcelain` | `git status --porcelain=v1` plus `-z` when requested |
| `revList` range | `git rev-list <fromExclusive>..<toInclusive>` |
| `revList` roots | `git rev-list --max-parents=0 <start>` |
| `isAncestor` | `git merge-base --is-ancestor <ancestor> <descendant>` |
| `listLocalBranches` | `git for-each-ref --format=%(refname:short) refs/heads/` |
| `checkBranchName` | `git check-ref-format --branch <branchName>` |
| `updateRef` | `git update-ref <ref> <target> [<expected>]` |
| `deleteRef` | `git update-ref -d <ref> [<expected>]` |
| `addAll` | `git add -A` |
| `commit` | `git commit [--allow-empty] -m <message>` plus explicit config/env when supplied |
| `worktreeAddDetached` | `git worktree add --detach <worktreePath> <baseSha>` |
| `worktreeRemove` | `git worktree remove --force <worktreePath>` when `force` is true |
| `lsRemoteRef` | `git ls-remote <remote> <ref>` |
| `fetchRef` | `git fetch --no-tags <remote> +<ref>:<trackingRef>` |
| `push` | `git push [--force-with-lease=<ref>:<expected>] <remote> <refspec...>` |

Additional methods MAY be added for `ls-tree`, object-oriented `cat-file`, `hash-object`, `mktree`,
and `commit-tree` only where they support the existing `Git` object-store backend. They MUST NOT
replace the direct filesystem storage path in `@cycle/git-store`.

## 9. Error Model

### 9.1 Error Classes

`@cycle/git/errors` MUST define or retain tagged errors for:

- `GitCommandError`: process spawn, interruption, timeout, stdout/stderr collection, or unexpected
  non-zero exit.
- `GitRepositoryError`: repository discovery and repository metadata failures.
- `GitRevisionError`: revision parsing, invalid object ID output, missing commit, `rev-list`, and
  ancestry failures.
- `GitStatusError`: `git status` failures.
- `GitBranchError`: current branch and branch listing failures.
- `GitBranchNameError`: invalid branch names reported by `git check-ref-format`.
- `GitRefError`: `update-ref` and delete-ref failures.
- `GitIndexError`: index mutation failures such as `git add -A`.
- `GitCommitError`: worktree commit failures.
- `GitWorktreeError`: worktree add/remove failures.
- `GitRemoteLookupError`: `ls-remote` failures.
- `RemoteFetchError`: fetch failures.
- `RemotePushError`: push failures.

Each error MUST include, when available:

- `operation`
- `cwd`
- `gitDir`
- `args`
- `status`
- sanitized `stderr`
- bounded `stdout` when useful for debugging
- `cause`

Domain packages MUST map these errors into domain errors at their service boundaries. For example,
`@cycle/git-worktrees` may map `GitWorktreeError` into `WorktreeCreateError`, and
`@cycle/git-store` may map `RemotePushError` into `GitRemoteError` only if it preserves the original
cause.

### 9.2 Exit Code Handling

Methods MUST document expected non-zero exit codes:

- `isAncestor`: status `0` means `true`, status `1` means `false`, other statuses fail.
- `currentBranch`: empty stdout means detached HEAD and returns `null`; non-zero status fails.
- `lsRemoteRef`: empty stdout with status `0` returns `null`; non-zero status fails.
- `checkBranchName`: non-zero status fails with `GitBranchNameError`.
- `statusPorcelain`: non-zero status fails with `GitStatusError`.
- `push`, `fetchRef`, `worktreeAddDetached`, `worktreeRemove`, `addAll`, `commit`, and `updateRef`
  fail on any non-zero status unless the method explicitly returns a richer result type.

The low-level command runner MAY expose `allowFailure`, but high-level methods MUST convert allowed
failures into typed domain results or typed errors before returning.

## 10. Integration Requirements

### 10.1 `@cycle/git-store`

`@cycle/git-store` MUST use `@cycle/git` only for places that explicitly execute Git CLI commands.
It MUST NOT move local object storage, ref storage, commit creation, tree mutation, document
transactions, or GitDB sync policy to the CLI path.

Required migration points:

| Current module | Current CLI behavior | Required `@cycle/git` delegation |
| --- | --- | --- |
| `GitRemoteTransport.ts` | `git ls-remote <remote> <ref>` through `node:child_process.execFile` | `GitCommands.lsRemoteRef` |
| `GitRemoteTransport.ts` | `git fetch --no-tags <remote> +<ref>:<trackingRef>` | `GitCommands.fetchRef` |
| `GitRemoteTransport.ts` | `git push --force-with-lease=<ref>:<expected> <remote> <target>:<ref>` | `GitCommands.push` |

`GitRemoteTransport` MAY remain the `@cycle/git-store` domain service that translates remote
results into GitDB sync behavior. It MUST NOT own process spawning or raw Git command spellings.

The helper `remoteTrackingRef(remote, ref)` MAY be hoisted into `@cycle/git` if it is useful to
`GitCommands.fetchRef`; if so, `@cycle/git-store` MUST import it from the owning `@cycle/git`
module and MUST NOT re-export it.

### 10.2 `@cycle/git-worktrees`

`@cycle/git-worktrees` MUST replace all direct imports of `@cycle/git/command/GitCommand` and all
direct `gitRaw` usage with `@cycle/git` services.

Required migration points:

| Current module | Current CLI behavior | Required `@cycle/git` delegation |
| --- | --- | --- |
| `WorktreePaths.ts` | `rev-parse --show-toplevel` | `GitCommands.showTopLevel` |
| `WorktreePaths.ts` | `rev-parse --git-common-dir` | `GitCommands.commonGitDir` |
| `WorktreePaths.ts` | `rev-parse <baseRef>^{commit}` | `GitCommands.resolveCommit` |
| `WorktreeLifecycle.ts` | `worktree add --detach <path> <baseSha>` | `GitCommands.worktreeAddDetached` |
| `WorktreeLifecycle.ts` | `rev-parse HEAD` | `GitCommands.head` |
| `WorktreeLifecycle.ts` | `worktree remove --force <path>` | `GitCommands.worktreeRemove` |
| `WorktreeSetup.ts` | `status --porcelain=v1` | `GitCommands.statusPorcelain` |
| `WorktreeSetup.ts` | `rev-parse HEAD` | `GitCommands.head` |
| `WorktreeFinalizer.ts` | `merge-base --is-ancestor` | `GitCommands.isAncestor` |
| `WorktreeFinalizer.ts` | `rev-parse HEAD` | `GitCommands.head` |
| `WorktreeFinalizer.ts` | `status --porcelain=v1` and `status --porcelain=v1 -z` | `GitCommands.statusPorcelain` |
| `WorktreeFinalizer.ts` | `branch --show-current` | `GitCommands.currentBranch` |
| `WorktreeFinalizer.ts` | `rev-list <baseSha>..HEAD` | `GitCommands.revList` |
| `WorktreeFinalizer.ts` | `add -A` | `GitCommands.addAll` |
| `WorktreeFinalizer.ts` | `commit [-m] [--allow-empty]` | `GitCommands.commit` |
| `WorktreeFinalizer.ts` | `update-ref refs/heads/<backup> <headSha>` | `GitCommands.updateRef` |
| `WorktreeBranchPublisher.ts` | `for-each-ref --format=%(refname:short) refs/heads/` | `GitCommands.listLocalBranches` |
| `WorktreeBranchPublisher.ts` | `check-ref-format --branch <branch>` | `GitCommands.checkBranchName` |
| `WorktreeBranchPublisher.ts` | `update-ref refs/heads/<branch> <targetSha>` | `GitCommands.updateRef` |
| `WorktreeRemotePublisher.ts` | `push <remote> <branchRef>:<remoteRef>` | `GitCommands.push` |

`@cycle/git-worktrees` MUST keep path policy, lease handling, setup command execution, branch
association persistence, handover sequencing, backup policy, and worktree lifecycle state in
`@cycle/git-worktrees`.

`WorktreeSetup` setup profile commands are not Git commands by definition and MUST NOT be routed
through `GitCommands`. They SHOULD remain behind a worktree setup runner owned by
`@cycle/git-worktrees`.

## 11. Runtime Behavior

### 11.1 Effect Service Style

Every new service MUST use `Context.Service` class syntax and return live implementations with
`ServiceName.of(...)`.

Multi-step methods MUST use `Effect.gen`. Service methods returning effects SHOULD be defined with
`Effect.fn("ServiceName.method")`. Early failure paths inside `Effect.gen` MUST use
`return yield* new SomeError(...)`.

The implementation MUST use `Effect.try`, `Effect.tryPromise`, or Effect platform services only at
actual side-effect boundaries. Command process execution SHOULD remain in `GitCommand`.

### 11.2 Resource Lifetime

Child process execution MUST be scoped. If the caller fiber is interrupted, the child process MUST
be interrupted or cleaned up by the command runner. No method may leave a detached Git process
running after the owning scope exits.

### 11.3 Logging and Spans

Every command execution MUST annotate logs and spans with:

- service: `@cycle/git`
- operation
- cwd
- gitDir when provided
- command category
- ref when inferable
- remote when inferable
- status
- sanitized stderr length and bounded sanitized stderr

Methods MUST NOT log stdin payloads, commit messages beyond bounded sanitized summaries, full
environment maps, credentials, or remote URLs with embedded credentials.

## 12. Security and Safety

1. Commands MUST be executed without a shell.
2. User-provided refs and branch names MUST be validated before mutation commands.
3. Remote names and refspecs MUST be logged as data, not interpolated into shell strings.
4. Stderr sanitization MUST redact URL credentials and `token=`, `password=`, `secret=`, and
   `credential=` values.
5. `GitCommands.commit` MUST not add authors, co-authors, or trailers on its own. Callers own commit
   message policy.
6. `GitCommands.worktreeRemove` MUST not remove directories directly. It only invokes
   `git worktree remove`; higher packages own filesystem cleanup and backup policy.
7. `GitCommands.addAll` and `GitCommands.commit` MUST operate only on the explicit `cwd` supplied by
   the caller.

## 13. Reference Algorithms

### 13.1 `statusPorcelain`

```text
run git status --porcelain=v1 plus -z if requested
if status != 0:
  fail GitStatusError
if z == true:
  return stdout decoded without trimming or control-character normalization
else:
  return stdout decoded and trim only trailing newline
```

### 13.2 `isAncestor`

```text
run git merge-base --is-ancestor ancestor descendant with allowFailure
if status == 0:
  return true
if status == 1:
  return false
fail GitRevisionError with status and sanitized stderr
```

### 13.3 `lsRemoteRef`

```text
run git ls-remote remote ref
if status != 0:
  fail GitRemoteLookupError
let line = first non-empty stdout line
if line does not exist:
  return null
parse first whitespace-delimited token as object id
validate object id
return object id
```

### 13.4 `worktreeAddDetached`

```text
validate or accept already-validated base object id
run git worktree add --detach worktreePath baseSha in repositoryPath
if command fails:
  fail GitWorktreeError
headSha = head(worktreePath)
if headSha != baseSha:
  fail GitWorktreeError reason "head_mismatch"
return repositoryPath, worktreePath, baseSha, headSha
```

## 14. Test and Validation Matrix

`@cycle/git` MUST include deterministic tests for:

1. `GitCommand` returns stdout, stderr, and status for successful commands.
2. `GitCommand` fails with `GitCommandError` for spawn or unexpected non-zero status.
3. `showTopLevel`, `commonGitDir`, and `absoluteGitDir` work in primary and linked worktrees.
4. `resolveCommit` rejects non-commit refs and invalid object output.
5. `head` returns the current commit object ID.
6. `currentBranch` returns branch name on a branch and `null` in detached HEAD.
7. `statusPorcelain` returns clean, dirty, and `-z` output without corrupting NUL separators.
8. `revList` returns ordered object IDs for `base..HEAD` ranges.
9. `isAncestor` maps exit statuses `0` and `1` to booleans and fails on unexpected statuses.
10. `listLocalBranches` returns short local branch names.
11. `checkBranchName` accepts valid branch names and fails invalid names with `GitBranchNameError`.
12. `updateRef` creates and updates refs with expected values where supplied.
13. `deleteRef` deletes refs with expected values where supplied.
14. `addAll` and `commit` create commits from worktree changes and support explicit
    `--allow-empty`.
15. `worktreeAddDetached` creates a detached worktree at the requested base SHA.
16. `worktreeRemove` removes a managed worktree through Git.
17. `lsRemoteRef`, `fetchRef`, and `push` can be smoke-tested against a local bare remote.
18. stderr sanitization redacts credentials in remote URLs and secret-like key-value pairs.
19. A fake or in-memory command layer can drive higher-package tests without invoking the real Git
    binary.

`@cycle/git-store` migration tests MUST verify:

1. `GitRemoteTransport` no longer imports `node:child_process`.
2. `GitRemoteTransport` delegates `ls-remote`, `fetch`, and `push` behavior to `@cycle/git`.
3. Local object, tree, commit, and ref storage tests still run without requiring CLI delegation.

`@cycle/git-worktrees` migration tests MUST verify:

1. No source file imports `@cycle/git/command/GitCommand` directly.
2. Worktree creation, setup inspection, finalization, branch publication, remote push, and cleanup
   delegate Git commands through `@cycle/git`.
3. Domain errors still include worktree IDs, repository IDs, paths, and lifecycle context after
   mapping from `@cycle/git` errors.

## 15. Implementation Checklist

An implementation is complete when:

1. `packages/git/src/GitCommands.ts` or equivalent package-owned modules define the high-level
   command service.
2. `packages/git/src/GitCommand.ts` exposes a service or remains wrapped by a service without
   requiring higher packages to access `ChildProcessSpawner`.
3. `packages/git/src/GitErrors.ts` contains the required typed error classes.
4. `packages/git/src/GitSchemas.ts` contains required command DTO schemas and object/ref validators.
5. `packages/git/package.json` exports the canonical command service path.
6. `@cycle/git-store` has no explicit Git CLI execution except through `@cycle/git`.
7. `@cycle/git-worktrees` has no explicit Git CLI execution except through `@cycle/git`.
8. Typechecks pass for `@cycle/git`, `@cycle/git-store`, and `@cycle/git-worktrees`.
9. Tests pass for `@cycle/git`, `@cycle/git-store`, and `@cycle/git-worktrees`.
10. The README for `@cycle/git` documents when to use `Git`, `GitCommand`, `GitCommands`,
    `GitRepository`, `GitFilesystem`, and `GitCli`.

## 16. Draft Assumptions

1. The user request listed `stats`; this specification treats that as `status` because existing
   call sites use `git status --porcelain=v1`.
2. The exact service name MAY be adjusted during implementation if `GitCommands` conflicts with
   local naming conventions, but the canonical API requirement remains.
