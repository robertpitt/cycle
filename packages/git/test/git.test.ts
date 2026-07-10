import { NodeServices } from "@effect/platform-node";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { promisify } from "node:util";
import { Data, Effect, Layer, Result } from "effect";
import { Git, GitLive, GitRepository, GitRepositoryLive } from "../src/index.ts";
import { sanitizeStderr } from "../src/GitCommand.ts";
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

const git = (cwd: string, args: ReadonlyArray<string>): Effect.Effect<string, TestFailure> =>
  attemptPromise(async () => {
    const { stdout } = await execFileAsync("git", [...args], { cwd });
    return stdout.trim();
  });

const cleanupDir = (dir: string): Effect.Effect<void, never> =>
  attemptPromise(() => rm(dir, { force: true, recursive: true })).pipe(Effect.orDie);

const withTempDir = <A, E, R>(
  prefix: string,
  f: (dir: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | TestFailure, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        attemptPromise(() => mkdtemp(path.join(os.tmpdir(), prefix))),
        cleanupDir,
      );

      return yield* f(dir);
    }),
  );

const createRepo = (root: string): Effect.Effect<string, TestFailure> =>
  Effect.gen(function* () {
    const repo = path.join(root, "source");

    yield* attemptPromise(() => rm(repo, { force: true, recursive: true }));
    yield* attemptPromise(() => mkdir(repo));
    yield* git(repo, ["init", "--initial-branch=main"]);
    yield* git(repo, ["config", "user.name", "Test User"]);
    yield* git(repo, ["config", "user.email", "test@example.com"]);
    yield* attemptPromise(() => writeFile(path.join(repo, "source.txt"), "source\n"));
    yield* git(repo, ["add", "source.txt"]);
    yield* git(repo, ["commit", "-m", "Initial source commit"]);

    return repo;
  });

const withRepo = <A, E, R>(
  f: (input: { readonly repo: string; readonly root: string }) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | TestFailure, R> =>
  withTempDir("cycle-git-", (root) =>
    Effect.gen(function* () {
      const repo = yield* createRepo(root);
      return yield* f({ repo, root });
    }),
  );

const gitLayer = GitLive.pipe(Layer.provide(NodeServices.layer));
const repositoryLayer = GitRepositoryLive.pipe(Layer.provide(NodeServices.layer));

describe("@cycle/git", () => {
  it("sanitizes stderr metadata before logging or attaching it to command errors", () => {
    assert.strictEqual(
      sanitizeStderr(
        "fatal: unable to access https://user:password@example.invalid/repo.git token=abc123",
      ),
      "fatal: unable to access https://<redacted>@example.invalid/repo.git token=<redacted>",
    );
  });

  it.effect("inspects and initializes repositories through the repository service", () =>
    withTempDir("cycle-git-empty-", (dir) =>
      Effect.gen(function* () {
        const repositories = yield* GitRepository;
        const before = yield* repositories.inspect(dir);
        const initialized = yield* repositories.init(dir);
        const after = yield* repositories.inspect(dir);
        const ensured = yield* repositories.ensure(dir);

        assert.strictEqual(before.status, "not-git");
        assert.strictEqual(initialized.cwd, dir);
        assert.ok(initialized.gitDir.endsWith(`${path.sep}.git`));
        assert.deepStrictEqual(after, {
          gitDir: initialized.gitDir,
          path: dir,
          status: "git",
        });
        assert.deepStrictEqual(ensured, initialized);
      }).pipe(Effect.provide(repositoryLayer)),
    ),
  );

  it.effect("runs repository, revision, ref, index, commit, and worktree commands", () =>
    withRepo(({ repo, root }) =>
      Effect.gen(function* () {
        const service = yield* Git;
        const firstHead = yield* service.head(repo);
        const repoRealPath = yield* attemptPromise(() => realpath(repo));
        const gitDirRealPath = yield* attemptPromise(() => realpath(path.join(repo, ".git")));

        assert.strictEqual(yield* service.showTopLevel(repo), repoRealPath);
        assert.ok((yield* service.commonGitDir(repo)).endsWith(".git"));
        assert.strictEqual(yield* service.absoluteGitDir(repo), gitDirRealPath);
        assert.strictEqual(yield* service.resolveCommit(repo, "HEAD"), firstHead);
        assert.strictEqual(yield* service.currentBranch(repo), "main");
        assert.strictEqual(yield* service.statusPorcelain(repo), "");
        assert.deepStrictEqual(yield* service.listLocalBranches(repo), ["main"]);
        assert.strictEqual(
          yield* service.checkBranchName(repo, "cycle/test-branch"),
          "cycle/test-branch",
        );

        yield* attemptPromise(() => writeFile(path.join(repo, "source.txt"), "changed\n"));
        assert.match(yield* service.statusPorcelain(repo), /source\.txt/u);
        assert.ok(
          (yield* service.statusPorcelain(repo, { z: true })).includes(String.fromCharCode(0)),
        );

        yield* service.addAll(repo);
        const commit = yield* service.commit(repo, {
          message: "Command service update",
        });
        assert.strictEqual(commit.sha, yield* service.head(repo));
        assert.deepStrictEqual(
          yield* service.revList(repo, {
            range: {
              fromExclusive: firstHead,
              toInclusive: commit.sha,
            },
          }),
          [commit.sha],
        );
        assert.deepStrictEqual(
          yield* service.changedFiles(repo, {
            fromExclusive: firstHead,
            toInclusive: commit.sha,
          }),
          [{ path: "source.txt", status: "M" }],
        );
        assert.strictEqual(yield* service.isAncestor(repo, firstHead, commit.sha), true);
        assert.strictEqual(yield* service.isAncestor(repo, commit.sha, firstHead), false);

        const ref = "refs/heads/cycle-command-test";
        yield* service.updateRef(repo, { ref, target: commit.sha });
        assert.strictEqual(yield* service.resolveCommit(repo, ref), commit.sha);
        yield* service.deleteRef(repo, { ref });
        assert.ok(Result.isFailure(yield* Effect.result(service.resolveCommit(repo, ref))));

        assert.ok(
          Result.isFailure(yield* Effect.result(service.checkBranchName(repo, "bad branch name"))),
        );

        const worktreePath = path.join(root, "linked-worktree");
        assert.deepStrictEqual(
          yield* service.worktreeAddDetached(repo, {
            baseSha: commit.sha,
            worktreePath,
          }),
          {
            baseSha: commit.sha,
            headSha: commit.sha,
            repositoryPath: repo,
            worktreePath,
          },
        );
        assert.strictEqual(yield* service.currentBranch(worktreePath), null);
        yield* service.worktreeRemove(repo, { force: true, worktreePath });
      }).pipe(Effect.provide(gitLayer)),
    ),
  );

  it.effect("runs remote lookup, fetch, and push commands against a local bare remote", () =>
    withRepo(({ repo, root }) =>
      Effect.gen(function* () {
        const service = yield* Git;
        const remote = path.join(root, "origin.git");
        const head = yield* service.head(repo);

        yield* git(repo, ["clone", "--bare", repo, remote]);
        assert.strictEqual(
          yield* service.lsRemoteRef(repo, {
            ref: "refs/heads/main",
            remote,
          }),
          head,
        );

        yield* service.fetchRef(repo, {
          ref: "refs/heads/main",
          remote,
          trackingRef: "refs/remotes/origin/main",
        });
        assert.strictEqual(yield* service.resolveCommit(repo, "refs/remotes/origin/main"), head);

        yield* service.updateRef(repo, {
          ref: "refs/heads/cycle-push-test",
          target: head,
        });
        yield* service.push(repo, {
          refspecs: ["refs/heads/cycle-push-test:refs/heads/cycle-push-test"],
          remote,
        });
        assert.strictEqual(
          yield* service.lsRemoteRef(repo, {
            ref: "refs/heads/cycle-push-test",
            remote,
          }),
          head,
        );
      }).pipe(Effect.provide(gitLayer)),
    ),
  );
});
