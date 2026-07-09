# @cycle/git-worktrees

`@cycle/git-worktrees` is the Effect-native worktree lifecycle package for Cycle agent work.

It owns disposable and implementation worktrees from allocation through setup, agent handoff,
finalization, branch publication, optional remote push, product handover, reconciliation, and
cleanup. Low-level Git access remains delegated to `@cycle/git`; this package owns the lifecycle
state machine and the durable records around those Git operations.

## Responsibilities

This package provides:

- Safe managed worktree path allocation and validation.
- Durable SQLite records for worktrees, setup runs, leases, branch associations, handovers, and
  lifecycle events.
- Fenced leases for creation, agent use, handover, cleanup, and reconciliation operations.
- Repository-specific setup profiles that run after `git worktree add` and before agent use.
- Finalization of implementation work into commits.
- Local branch publication with deterministic Cycle branch names and collision handling.
- Optional remote push with `disabled`, `best_effort`, and `required` policies.
- Handover orchestration through package-defined ports for comments, ticket status, branch
  attachment, and pull request creation.
- Backup branch creation before risky cleanup paths.
- Reconciliation for missing, removing, and orphaned managed worktrees.

This package does not provide:

- Agent turn execution, prompt handling, streaming, or provider sessions.
- Agent Work queue scheduling or ticket assignment policy.
- Direct imports from API, desktop, renderer, usecase, or product database packages.
- Pull request provider implementation in the default layer.
- General-purpose Git object storage or repository discovery beyond lifecycle needs.

## Package Boundaries

`@cycle/git-worktrees` depends on:

- `effect`
- `@effect/platform-node`
- `@effect/sql-sqlite-node`
- `@cycle/sqlite`
- `@cycle/git`

Runtime code should call Git through `@cycle/git` command/repository boundaries. Product side
effects such as ticket comments or pull request creation must go through `WorktreeHandoverTarget`
instead of importing higher-level packages.

## Lifecycle Model

Managed worktrees use this status model:

```txt
creating -> initialising -> ready -> removing -> removed
                         -> retained
                         -> failed
```

Important lifecycle points:

- `creating`: durable record exists and `git worktree add --detach` is in progress.
- `initialising`: the Git worktree exists and setup is running.
- `ready`: setup succeeded and the worktree can be handed to an agent.
- `removing`: cleanup has started.
- `removed`: the managed worktree path has been removed.
- `retained`: the worktree is intentionally kept for operator/debug policy.
- `failed`: lifecycle operation failed and needs operator or reconciliation handling.

Transitions are validated in `internal/state-machine.ts`; callers should not mutate records
directly.

## Public Services

### `Worktrees`

`Worktrees` is the repository-instance facade. It uses `LayerMap.Service` internally so callers can
address worktrees by repository descriptor without manually composing the lower-level layer graph.

Use this when application code wants the high-level API:

- `create(descriptor, input)`
- `acquireForAgentRun(descriptor, input)`
- `handover(descriptor, input)`
- `reconcileRepository(descriptor, repositoryId)`

The default repository instance uses the no-op handover target. Product integrations that need real
comments, ticket transitions, or pull requests should compose `WorktreeHandoverLive` directly with a
custom `WorktreeHandoverTarget`.

```ts
import { Effect } from "effect";
import {
  Worktrees,
  WorktreesLive,
  type AgentRunId,
  type JobId,
  type RepositoryId,
  type TicketId,
} from "@cycle/git-worktrees";

const repositoryId = "repo_cycle" as RepositoryId;
const jobId = "job_123" as JobId;
const ticketId = "CYC-123" as TicketId;

const descriptor = {
  repositoryId,
  repositoryPath: "/Users/me/Projects/cycle",
};

const program = Effect.gen(function* () {
  const worktrees = yield* Worktrees;

  const record = yield* worktrees.create(descriptor, {
    jobId,
    mode: "implementation",
    repositoryId,
    repositoryPath: descriptor.repositoryPath,
    ticketId,
    ticketSlugSource: "Add worktree lifecycle",
    ticketType: "feature",
  });

  return yield* worktrees.acquireForAgentRun(descriptor, {
    actor: "agent-work",
    agentRunId: "agent_run_123" as AgentRunId,
    ownerId: "agent-work:job_123",
    worktreeId: record.worktreeId,
  });
});

Effect.runPromise(program.pipe(Effect.provide(WorktreesLive)));
```

### `WorktreeLifecycle`

`WorktreeLifecycle` owns create, acquire, cleanup, and retain operations for a single repository
runtime.

Capabilities:

- `create(input)` resolves the repository, records durable state, creates a detached Git worktree,
  runs setup, and transitions the record to `ready`.
- `acquireForAgentRun(input)` verifies the record is `ready`, acquires an `agent` lease, and returns
  an `AgentWorktreeContext`.
- `cleanup(input)` transitions to `removing`, removes the Git worktree, removes the directory, and
  records `removed`.
- `retain(input)` records an explicit retained state.

Worktrees are detached by default. Implementation work is published later through branch
publication, not by checking out a branch in the managed worktree.

### `WorktreeSetup`

`WorktreeSetup` runs repository-specific setup commands after the worktree is created.

A setup profile contains:

- `profileId`
- `commands`
- `dirtyPolicy`
- optional environment values
- optional redaction keys
- optional artifact paths
- optional timeout overrides

Each command can specify:

- `command`
- optional `args`
- optional `cwd`, resolved inside the worktree
- optional `env`
- optional `timeoutMs`

Command working directories must stay inside the managed worktree. Environment values are merged
with process environment at spawn time. Redacted environment output is stored in the setup run
record.

`dirtyPolicy` controls post-setup Git status:

- `require_clean`: fail setup if tracked or untracked changes remain.
- `record_generated_changes`: allow generated changes and store a bounded summary.

```ts
const setupProfile = {
  commands: [
    {
      command: "pnpm",
      args: ["install", "--frozen-lockfile"],
    },
    {
      command: "pnpm",
      args: ["typecheck"],
    },
  ],
  dirtyPolicy: "require_clean" as const,
  profileId: "pnpm-default",
  redactedEnvironmentKeys: ["NPM_TOKEN"],
  timeoutMs: 10 * 60_000,
};
```

### `WorktreeFinalizer`

`WorktreeFinalizer` inspects and finalizes worktree contents.

Capabilities:

- `inspect(record)` returns HEAD, branch name, porcelain status, dirtiness, and commits since the
  recorded base SHA.
- `finalize(input)` validates ancestry, commits dirty work when needed, rejects empty work unless
  `allowEmpty` is set, and returns finalized commit information.
- `createBackupBranch(input)` creates a backup branch for dirty or unpublished work before cleanup
  paths that could otherwise lose work.

Backup creation blocks secret-like paths such as `.env`, credentials, private keys, and token files.
This is intentionally conservative.

### `WorktreeBranchPublisher`

`WorktreeBranchPublisher` publishes finalized implementation work to a local branch.

Branch names are derived from ticket information:

```txt
cycle/<type>/<TICKET-ID>-<slug>
```

Examples:

- `cycle/feature/CYC-123-add-worktree-lifecycle`
- `cycle/bug/CYC-456-fix-setup-cleanliness`

Collision behavior:

- If no branch exists, the desired branch is used.
- If the branch exists and the durable association belongs to the same ticket, the branch can be
  reused.
- Otherwise, a suffix such as `-2`, `-3`, and so on is selected.

Publication updates Git refs with `git update-ref` and persists a `BranchAssociation`.

### `WorktreeRemotePublisher`

`WorktreeRemotePublisher` pushes a published branch to a remote.

Push policies:

- `disabled`: do not push.
- `best_effort`: try to push; return a structured failure result without failing the handover.
- `required`: push failures fail the operation.

Failures are categorized as authentication, authorization, remote-not-found, branch conflict,
rejected push, network failure, or unknown failure where possible.

### `WorktreeHandover`

`WorktreeHandover` orchestrates implementation delivery:

1. Acquire a handover lease.
2. Create or reuse the durable handover record.
3. Finalize worktree changes.
4. Publish a local implementation branch when the worktree mode is `implementation`.
5. Push the branch according to policy.
6. Deliver handover through `WorktreeHandoverTarget`.
7. Cleanup the worktree.
8. Mark handover completed or persist failure details.

The target port is:

- `attachBranch(input)`
- `publishComment(input)`
- `transitionTicket(input)`
- `createPullRequest(input)`

`WorktreeHandoverTargetNoopLive` is provided for tests and local flows that only need durable
records and branch publication.

### `WorktreeReconciler`

`WorktreeReconciler` repairs known managed worktrees after crashes or interrupted workflows.

Current reconciliation behavior:

- Missing `removing` paths are marked `removed`.
- Missing non-terminal paths are marked `failed`.
- `removing` records are cleaned up.
- `ready` records with `delete_after_handover` are backed up when dirty or unpublished, then
  cleaned up.
- Other records are retained.

Reconciliation logs per-record failures and returns aggregate counts.

### `WorktreePaths`

`WorktreePaths` owns safe path behavior:

- storage root creation
- repository resolution
- base SHA resolution
- managed path allocation
- path validation

Managed paths must stay inside `storageRoot` and must not overlap:

- the primary worktree
- the Git directory
- optional GitDB storage
- caller-supplied forbidden paths

### `WorktreeStore`

`WorktreeStore` is the durable state boundary. The live implementation uses SQLite through
Effect SQL.

Stored entities:

- `worktree_records`
- `worktree_leases`
- `worktree_setup_runs`
- `branch_associations`
- `worktree_handovers`
- `worktree_lifecycle_events`

Most callers should prefer lifecycle/handover services over direct store access. Store operations
are useful for tests, reconciliation, and targeted package internals.

## Configuration

Configuration is read through Effect `Config` under the `git_worktrees` namespace when using
`WorktreeConfigLive`.

| Key                                   | Default                               | Purpose                                  |
| ------------------------------------- | ------------------------------------- | ---------------------------------------- |
| `storage_root`                        | `~/.cycle/worktrees`                  | Parent directory for managed worktrees.  |
| `database_path`                       | `~/.cycle/worktrees/worktrees.sqlite` | SQLite database path.                    |
| `cleanup_policy`                      | `delete_after_handover`               | Default retention/cleanup policy.        |
| `default_push_policy`                 | `required`                            | Default remote push behavior.            |
| `lease_duration_ms`                   | `300000`                              | Lease heartbeat deadline window.         |
| `setup_timeout_ms`                    | `600000`                              | Default setup command timeout.           |
| `push_timeout_ms`                     | `60000`                               | Remote push timeout.                     |
| `max_active_worktrees_per_repository` | `64`                                  | Intended active worktree cap.            |
| `max_setup_concurrency`               | `4`                                   | Intended setup concurrency cap.          |
| `max_reconciliation_concurrency`      | `4`                                   | Intended reconciliation concurrency cap. |
| `backup_file_bytes`                   | `20971520`                            | Intended single-file backup size guard.  |
| `backup_aggregate_bytes`              | `104857600`                           | Intended aggregate backup size guard.    |

Tests and repository-specific instances can provide explicit config:

```ts
import { makeWorktreeConfigLayer } from "@cycle/git-worktrees/config";

const WorktreeConfigTest = makeWorktreeConfigLayer({
  backupAggregateBytes: 100 * 1024 * 1024,
  backupFileBytes: 20 * 1024 * 1024,
  cleanupPolicy: "delete_after_handover",
  databasePath: "/tmp/cycle-worktrees.sqlite",
  defaultPushPolicy: "disabled",
  leaseDurationMs: 60_000,
  maxActiveWorktreesPerRepository: 16,
  maxReconciliationConcurrency: 2,
  maxSetupConcurrency: 2,
  pushTimeoutMs: 10_000,
  setupTimeoutMs: 30_000,
  storageRoot: "/tmp/cycle-worktrees",
});
```

## Durable Leases

Operations that mutate lifecycle state use leases and fencing tokens. A worktree can have only one
active lease at a time. Mutating store operations that accept a fencing token verify that the token
still belongs to an active lease before applying the update.

Lease purposes:

- `create`
- `agent`
- `handover`
- `cleanup`
- `reconcile`

Agent orchestration should keep the returned lease from `acquireForAgentRun` and release or
heartbeat it through the store when the broader Agent Work runtime adds that supervision.

## Branch And Backup Naming

Implementation branches:

```txt
cycle/<branch-type>/<TICKET-ID>-<slug>
```

Backup branches:

```txt
cycle/backup/worktrees/<worktree-id>-<timestamp>
```

Commit messages are sanitized to remove `Co-authored-by:` trailers and to provide a fallback when
the supplied message is empty.

## Testing Utilities

Testing helpers are exported from `@cycle/git-worktrees/testing`.

Available helpers:

- `makeTestWorktreeConfig(overrides)`
- `makeWorktreeStoreSqliteTestLayer()`
- `makeWorktreesTestLayer(config)`

Example:

```ts
import { Effect } from "effect";
import { WorktreeStore } from "@cycle/git-worktrees";
import { makeWorktreeStoreSqliteTestLayer } from "@cycle/git-worktrees/testing";

const testProgram = Effect.gen(function* () {
  const store = yield* WorktreeStore;
  // Exercise store operations here.
});

Effect.runPromise(testProgram.pipe(Effect.provide(makeWorktreeStoreSqliteTestLayer())));
```

The current primitive tests cover:

- implementation branch name derivation
- branch collision resolution
- state transition validation
- managed path rejection outside the storage root
- lease fencing on status transitions

## Package Exports

```json
{
  ".": "./src/index.ts",
  "./paths": "./src/WorktreePaths.ts",
  "./store": "./src/WorktreeStore.ts",
  "./lifecycle": "./src/WorktreeLifecycle.ts",
  "./setup": "./src/WorktreeSetup.ts",
  "./finalizer": "./src/WorktreeFinalizer.ts",
  "./branch-publisher": "./src/WorktreeBranchPublisher.ts",
  "./remote-publisher": "./src/WorktreeRemotePublisher.ts",
  "./handover": "./src/WorktreeHandover.ts",
  "./reconciler": "./src/WorktreeReconciler.ts",
  "./instances": "./src/WorktreeInstances.ts",
  "./worktrees": "./src/Worktrees.ts",
  "./config": "./src/WorktreeConfig.ts",
  "./schemas": "./src/WorktreeSchemas.ts",
  "./errors": "./src/WorktreeErrors.ts",
  "./testing": "./src/testing/index.ts"
}
```

The root export only re-exports package-owned modules.

## Verification

From the repository root:

```sh
pnpm --filter @cycle/git-worktrees typecheck
pnpm --filter @cycle/git-worktrees test
pnpm lint
pnpm format:check
```

Focused checks for this package:

```sh
tsc -p packages/git-worktrees/tsconfig.json
oxlint --deny-warnings packages/git-worktrees
oxfmt --check packages/git-worktrees
```
