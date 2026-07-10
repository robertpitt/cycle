import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { BranchCollisionError, WorktreeLeaseConflictError, WorktreeStore } from "../src/index.ts";
import type {
  JobId,
  RepositoryId,
  WorktreeId,
  WorktreeLeaseId,
  WorktreeRecord,
} from "../src/index.ts";
import { makeWorktreeStoreSqliteTestLayer } from "../src/testing/index.ts";
import { implementationBranchName, resolveBranchCollision } from "../src/internal/branch.ts";
import { validateManagedPath } from "../src/internal/path-policy.ts";
import { omitUndefinedProperties } from "../src/internal/record.ts";
import { canTransition } from "../src/internal/state-machine.ts";
import { assert, describe, it } from "./effect-vitest.ts";

const withTempDir = <A, E, R>(f: (dir: string) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "cycle-git-worktrees-"))),
    f,
    (dir) => Effect.sync(() => rmSync(dir, { force: true, recursive: true })),
  );

const makeRecord = (path: string): WorktreeRecord => ({
  baseRef: "HEAD",
  baseSha: "1234567890abcdef1234567890abcdef12345678" as never,
  cleanupPolicy: "delete_after_handover",
  commonGitDir: join(path, ".git"),
  createdAt: "2026-01-01T00:00:00.000Z",
  gitDir: join(path, ".git"),
  jobId: "job_1" as JobId,
  mode: "implementation",
  path: join(path, "worktree"),
  repositoryId: "repo_1" as RepositoryId,
  repositoryPath: path,
  setupDirtyPolicy: "require_clean",
  status: "creating",
  storageRoot: path,
  updatedAt: "2026-01-01T00:00:00.000Z",
  worktreeId: "worktree_test_1" as WorktreeId,
});

describe("@cycle/git-worktrees primitives", () => {
  it("derives implementation branch names", () => {
    assert.strictEqual(
      implementationBranchName({
        ticketId: "cyc-123",
        ticketSlugSource: "Add billing: webhooks!",
        ticketType: "feature",
      }),
      "cycle/feature/CYC-123-add-billing-webhooks",
    );
  });

  it.effect("resolves branch collisions", () =>
    Effect.gen(function* () {
      const renamed = yield* resolveBranchCollision({
        desiredBranchName: "cycle/task/CYC-1-work",
        existingBranches: ["cycle/task/CYC-1-work", "cycle/task/CYC-1-work-2"],
        ticketId: "CYC-2",
      });
      assert.strictEqual(renamed.type, "renamed");
      assert.strictEqual(renamed.branchName, "cycle/task/CYC-1-work-3");

      const failed = yield* Effect.flip(
        resolveBranchCollision({
          desiredBranchName: "cycle/task/CYC-1-work",
          existingBranches: ["cycle/task/CYC-1-work"],
          maxAttempts: 1,
          ticketId: "CYC-2",
        }),
      );
      assert.ok(failed instanceof BranchCollisionError);
    }),
  );

  it("validates state machine transitions", () => {
    assert.strictEqual(canTransition("creating", "initialising"), true);
    assert.strictEqual(canTransition("ready", "removed"), false);
    assert.strictEqual(canTransition("removed", "ready"), false);
  });

  it.effect("rejects managed paths outside storage root", () =>
    withTempDir((dir) =>
      Effect.gen(function* () {
        const failed = yield* Effect.flip(
          validateManagedPath(join(tmpdir(), "escape"), {
            gitDir: join(dir, ".git"),
            primaryPath: join(dir, "repo"),
            storageRoot: join(dir, "storage"),
          }),
        );
        assert.strictEqual(failed._tag, "WorktreePathPolicyError");
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect("enforces lease fencing for status transitions", () =>
    withTempDir((dir) =>
      Effect.gen(function* () {
        const store = yield* WorktreeStore;
        const record = yield* store.createWorktreeRecord(makeRecord(dir));
        const lease = yield* store.acquireLease({
          actor: "test",
          heartbeatDeadline: "2026-01-01T00:05:00.000Z",
          ownerId: "owner",
          purpose: "create",
          worktreeId: record.worktreeId,
        });
        const stale = yield* Effect.flip(
          store.transitionWithEvent({
            actor: "test",
            eventType: "test",
            expectedStatus: "creating",
            fencingToken: lease.fencingToken + 1,
            nextStatus: "initialising",
            worktreeId: record.worktreeId,
          }),
        );
        assert.ok(stale instanceof WorktreeLeaseConflictError);

        const updated = yield* store.transitionWithEvent({
          actor: "test",
          eventType: "test",
          expectedStatus: "creating",
          fencingToken: lease.fencingToken,
          nextStatus: "initialising",
          worktreeId: record.worktreeId,
        });
        assert.strictEqual(updated.status, "initialising");

        yield* store.releaseLease(lease.leaseId as WorktreeLeaseId, lease.fencingToken);
      }).pipe(Effect.provide(makeWorktreeStoreSqliteTestLayer())),
    ),
  );

  it("omits undefined optional worktree fields at the store boundary", () => {
    const record = omitUndefinedProperties({
      ...makeRecord("/tmp/cycle-worktree-record"),
      remoteName: undefined,
      setupProfileId: undefined,
    });

    assert.strictEqual("remoteName" in record, false);
    assert.strictEqual("setupProfileId" in record, false);
  });
});
