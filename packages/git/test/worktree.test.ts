import { NodeServices } from "@effect/platform-node";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { promisify } from "node:util";
import { Data, Effect, Layer, Result } from "effect";
import {
  implementationBranchName,
  resolveBranchCollision,
  WorktreeService,
} from "../src/worktree/index.ts";
import * as WorktreeServiceLive from "../src/worktree/WorktreeServiceLive.ts";
import { describe, it } from "./effect-vitest.ts";

const execFileAsync = promisify(execFile);

class TestFailure extends Data.TaggedError("TestFailure")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const attemptPromise = <A>(try_: () => Promise<A>): Effect.Effect<A, TestFailure> =>
  Effect.tryPromise({
    catch: (cause) => new TestFailure({ cause, message: "test promise failed" }),
    try: try_,
  });

const git = (cwd: string, args: readonly string[]): Effect.Effect<string, TestFailure> =>
  attemptPromise(async () => {
    const { stdout } = await execFileAsync("git", [...args], { cwd });
    return stdout.trim();
  });

const cleanupDir = (dir: string): Effect.Effect<void, never> =>
  attemptPromise(() => rm(dir, { force: true, recursive: true })).pipe(Effect.orDie);

const createRepo = (root: string): Effect.Effect<string, TestFailure> =>
  Effect.gen(function* () {
    const repo = path.join(root, "source");
    yield* attemptPromise(() => mkdir(repo, { recursive: true }));
    yield* git(repo, ["init", "--initial-branch=main"]);
    yield* git(repo, ["config", "user.name", "Local User"]);
    yield* git(repo, ["config", "user.email", "local@example.com"]);
    yield* attemptPromise(() => writeFile(path.join(repo, "source.txt"), "source\n"));
    yield* git(repo, ["add", "source.txt"]);
    yield* git(repo, ["commit", "-m", "Initial source commit"]);
    return repo;
  });

const withRepoRoot = <A, E, R>(
  f: (input: {
    readonly repo: string;
    readonly root: string;
    readonly storage: string;
  }) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | TestFailure, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        attemptPromise(() => mkdtemp(path.join(os.tmpdir(), "cycle-worktree-"))),
        cleanupDir,
      );
      const repo = yield* createRepo(root);
      const storage = path.join(root, "worktrees");
      return yield* f({ repo, root, storage });
    }),
  );

const layer = WorktreeServiceLive.layer.pipe(Layer.provide(NodeServices.layer));

describe("@cycle/git WorktreeService", () => {
  it("builds implementation branch names from canonical and legacy ticket types", () => {
    assert.equal(
      implementationBranchName({
        ticketId: "CYC-123",
        ticketSlugSource: "Agent Activity Panel",
        ticketType: "feature",
      }),
      "cycle/feature/CYC-123-agent-activity-panel",
    );
    assert.equal(
      implementationBranchName({
        ticketId: "cyc-456",
        ticketSlugSource: "Fix mention trigger",
        ticketType: "issue",
      }),
      "cycle/task/CYC-456-fix-mention-trigger",
    );
    assert.equal(
      implementationBranchName({
        ticketId: "CYC-789",
        ticketSlugSource: "Plan rollout",
        ticketType: "initiative",
      }),
      "cycle/epic/CYC-789-plan-rollout",
    );
  });

  it("resolves branch collisions for same-ticket updates or renamed branches", () => {
    assert.deepEqual(
      resolveBranchCollision({
        desiredBranchName: "cycle/task/CYC-1-work",
        existingAssociations: [{ branchName: "cycle/task/CYC-1-work", ticketId: "CYC-1" }],
        existingBranches: ["cycle/task/CYC-1-work"],
        ticketId: "CYC-1",
      }),
      {
        branchName: "cycle/task/CYC-1-work",
        branchRef: "refs/heads/cycle/task/CYC-1-work",
        type: "same-ticket",
      },
    );
    assert.deepEqual(
      resolveBranchCollision({
        desiredBranchName: "cycle/task/CYC-1-work",
        existingAssociations: [{ branchName: "cycle/task/CYC-1-work", ticketId: "OTHER-1" }],
        existingBranches: ["cycle/task/CYC-1-work", "cycle/task/CYC-1-work-2"],
        ticketId: "CYC-1",
      }),
      {
        branchName: "cycle/task/CYC-1-work-3",
        branchRef: "refs/heads/cycle/task/CYC-1-work-3",
        desiredBranchName: "cycle/task/CYC-1-work",
        type: "renamed",
      },
    );
  });

  it.effect(
    "creates implementation worktrees outside the primary worktree and cleans them up",
    () =>
      withRepoRoot(({ repo, storage }) =>
        Effect.gen(function* () {
          const service = yield* WorktreeService;
          const worktree = yield* service.createImplementationWorktree({
            jobId: "job_1",
            repositoryId: "repo_1",
            repositoryPath: repo,
            ticketId: "CYC-123",
            ticketSlugSource: "Agent Activity Panel",
            ticketType: "feature",
            worktreeStoragePath: storage,
          });

          assert.equal(worktree.mode, "implementation");
          assert.equal(worktree.branchName, "cycle/feature/CYC-123-agent-activity-panel");
          assert.notEqual(worktree.path, repo);
          assert.ok(worktree.path.startsWith(storage));

          const cleaned = yield* service.cleanupWorktree({
            repositoryPath: repo,
            worktree,
            pathPolicy: { worktreeStoragePath: storage },
          });
          assert.equal(cleaned.status, "cleaned");

          const inspection = yield* Effect.result(service.inspectWorktree({ path: worktree.path }));
          assert.ok(Result.isFailure(inspection));
        }).pipe(Effect.provide(layer)),
      ),
  );

  it.effect("refuses to create worktrees inside the primary worktree", () =>
    withRepoRoot(({ repo }) =>
      Effect.gen(function* () {
        const service = yield* WorktreeService;
        const result = yield* Effect.result(
          service.createDisposableWorktree({
            jobId: "job_unsafe",
            repositoryId: "repo_1",
            repositoryPath: repo,
            worktreeStoragePath: repo,
          }),
        );

        assert.ok(Result.isFailure(result));
      }).pipe(Effect.provide(layer)),
    ),
  );

  it.effect(
    "commits with local Git identity, strips co-author trailers, and publishes a branch",
    () =>
      withRepoRoot(({ repo, storage }) =>
        Effect.gen(function* () {
          const service = yield* WorktreeService;
          const worktree = yield* service.createImplementationWorktree({
            jobId: "job_commit",
            repositoryId: "repo_1",
            repositoryPath: repo,
            ticketId: "CYC-500",
            ticketSlugSource: "Final Commit",
            ticketType: "task",
            worktreeStoragePath: storage,
          });
          yield* attemptPromise(() =>
            writeFile(path.join(worktree.path, "source.txt"), "changed\n"),
          );

          const commit = yield* service.commitWorktree({
            message: "Implement ticket\n\nCo-Authored-By: Agent <agent@example.com>",
            repositoryPath: repo,
            worktree,
          });
          assert.equal(commit.authorName, "Local User");
          assert.equal(commit.authorEmail, "local@example.com");
          assert.equal(commit.message.includes("Co-Authored-By"), false);

          const publication = yield* service.createOrUpdateBranch({
            baseSha: worktree.baseSha,
            desiredBranchName: worktree.branchName ?? "cycle/task/CYC-500-final-commit",
            jobId: "job_commit",
            repositoryId: "repo_1",
            repositoryPath: repo,
            targetSha: commit.sha,
            ticketId: "CYC-500",
          });
          assert.equal(publication.association.branchName, "cycle/task/CYC-500-final-commit");
          assert.equal(
            yield* git(repo, ["rev-parse", publication.association.branchRef]),
            commit.sha,
          );

          const body = yield* git(repo, ["log", "-1", "--format=%B", commit.sha]);
          const author = yield* git(repo, ["log", "-1", "--format=%an <%ae>", commit.sha]);
          assert.equal(author, "Local User <local@example.com>");
          assert.equal(body.includes("Co-Authored-By"), false);
        }).pipe(Effect.provide(layer)),
      ),
  );
});
