import { strict as assert } from "node:assert";
import type { WorktreeHandoverRecord } from "@cycle/git-worktrees";
import { describe, it } from "vitest";
import {
  branchUrlFromRemote,
  mergeHandoffProjection,
} from "../src/http/handlers/v1/mergeHandoff.ts";

const record = (overrides: Partial<WorktreeHandoverRecord> = {}): WorktreeHandoverRecord => ({
  artifacts: [],
  baseRef: "main",
  branchName: "cycle/task/CYC-1-work",
  changedFiles: [{ path: "src/index.ts", status: "M" }],
  commits: ["abcdefabcdefabcdefabcdefabcdefabcdefabcd" as never],
  completedSteps: ["prepare_output", "publish_branch", "push_branch"],
  createdAt: "2026-01-01T00:00:00.000Z",
  handoverId: "worktree_handover_task_1" as never,
  jobId: "job_1" as never,
  knownLimitations: [],
  pushStatus: "pushed",
  remoteName: "origin",
  remoteRef: "refs/heads/cycle/task/CYC-1-work",
  remoteUrl: "git@github.com:cycle/repository.git",
  repositoryId: "repo_1" as never,
  reviewState: "merge_ready",
  status: "completed",
  tests: [{ command: "pnpm test", result: "passed", status: "passed" }],
  updatedAt: "2026-01-01T00:01:00.000Z",
  worktreeId: "worktree_test_1" as never,
  ...overrides,
});

describe("merge handoff projection", () => {
  it("renders a pushed handoff with exact merge commands and host branch URL", () => {
    const handoff = mergeHandoffProjection(record());

    assert.strictEqual(handoff.state, "merge_ready");
    assert.strictEqual(
      handoff.branchUrl,
      "https://github.com/cycle/repository/tree/cycle/task/CYC-1-work",
    );
    assert.deepEqual(handoff.mergeCommands, [
      "git fetch 'origin'",
      "git switch 'main'",
      "git merge --ff-only 'origin/cycle/task/CYC-1-work'",
    ]);
  });

  it("keeps branch and evidence visible for a failed push", () => {
    const handoff = mergeHandoffProjection(
      record({
        lastError: { message: "Authentication failed", tag: "RemotePushError" },
        pushError: "Authentication failed",
        pushStatus: "failed",
        reviewState: "failed",
        status: "failed",
      }),
    );

    assert.strictEqual(handoff.state, "failed");
    assert.strictEqual(handoff.pushStatus, "failed");
    assert.strictEqual(handoff.failure?.code, "RemotePushError");
    assert.deepEqual(handoff.changedFiles, [{ path: "src/index.ts", status: "M" }]);
    assert.deepEqual(handoff.mergeCommands, [
      "git switch 'main'",
      "git merge --ff-only 'cycle/task/CYC-1-work'",
    ]);
  });

  it("supports common configured Git host URLs", () => {
    assert.strictEqual(
      branchUrlFromRemote("https://gitlab.com/cycle/repository.git", "feature/test"),
      "https://gitlab.com/cycle/repository/-/tree/feature/test",
    );
  });
});
