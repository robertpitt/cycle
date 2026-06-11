import { NodeServices } from "@effect/platform-node";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strict as assert } from "node:assert";
import { promisify } from "node:util";
import { Effect, Layer } from "effect";
import { bytesToString } from "../src/internals/bytes.ts";
import { Git, type GitService } from "../src/object-store/Git.ts";
import * as GitCli from "../src/object-store/GitCli.ts";
import * as GitFilesystem from "../src/object-store/GitFilesystem.ts";
import { GitRepository } from "../src/repository/GitRepository.ts";
import * as GitRepositoryLive from "../src/repository/GitRepositoryLive.ts";
import { describe, it } from "./effect-vitest.ts";

const execFileAsync = promisify(execFile);
const encoder = new TextEncoder();

const attemptPromise = <A>(try_: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({
    catch: (cause) => cause,
    try: try_,
  });

const git = (cwd: string, args: ReadonlyArray<string>): Effect.Effect<string, unknown> =>
  attemptPromise(async () => {
    const { stdout } = await execFileAsync("git", [...args], { cwd });
    return stdout;
  });

const cleanupDir = (dir: string): Effect.Effect<void, never> =>
  attemptPromise(() => rm(dir, { force: true, recursive: true })).pipe(Effect.orDie);

const withTempDir = <A, E, R>(
  prefix: string,
  f: (dir: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | unknown, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        attemptPromise(() => mkdtemp(path.join(os.tmpdir(), prefix))),
        cleanupDir,
      );

      return yield* f(dir);
    }),
  );

const createRepo = (): Effect.Effect<string, unknown> =>
  Effect.gen(function* () {
    const repo = yield* attemptPromise(() => mkdtemp(path.join(os.tmpdir(), "cycle-git-")));

    yield* git(repo, ["init", "--initial-branch=main"]);
    yield* attemptPromise(() => writeFile(path.join(repo, "source.txt"), "source\n"));
    yield* git(repo, ["add", "source.txt"]);
    yield* git(repo, [
      "-c",
      "user.name=Test User",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "Initial source commit",
    ]);

    return repo;
  });

const withRepo = <A, E, R>(
  f: (repo: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | unknown, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const repo = yield* Effect.acquireRelease(createRepo(), cleanupDir);

      return yield* f(repo);
    }),
  );

const cliLayer = GitCli.layer.pipe(Layer.provide(NodeServices.layer));
const filesystemLayer = GitFilesystem.layer.pipe(Layer.provide(NodeServices.layer));
const repositoryLayer = GitRepositoryLive.layer.pipe(Layer.provide(NodeServices.layer));

const writeSnapshot = (service: GitService, repo: string, message: string, parent?: string) =>
  Effect.gen(function* () {
    const store = { cwd: repo, gitDir: path.join(repo, ".git") };
    const blob = yield* service.writeBlob(store, encoder.encode(`${message}\n`));
    const tree = yield* service.writeTree(store, [
      {
        mode: "100644",
        name: "ticket.txt",
        objectId: blob,
        type: "blob",
      },
    ]);
    const commit = yield* service.writeCommit(store, {
      author: {
        email: "cycle@example.com",
        name: "Cycle",
      },
      message,
      parents: parent === undefined ? [] : [parent],
      tree,
    });

    return { blob, commit, store, tree };
  });

describe("@cycle/git", () => {
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

  it.effect("shares objects, refs, commits, and ancestry across CLI and filesystem backends", () =>
    withRepo((repo) =>
      Effect.gen(function* () {
        const cli = yield* Effect.provide(Git, cliLayer);
        const filesystem = yield* Effect.provide(Git, filesystemLayer);
        const first = yield* writeSnapshot(cli, repo, "Create ticket");

        yield* cli.updateRef(first.store, {
          expected: null,
          ref: "refs/cycle-test/main",
          target: first.commit,
        });

        const firstRef = yield* filesystem.readRef(first.store, "refs/cycle-test/main");
        const firstBlob = yield* filesystem.readBlob(first.store, first.blob);
        const firstTree = yield* filesystem.readTree(first.store, first.tree);
        const second = yield* writeSnapshot(filesystem, repo, "Update ticket", first.commit);

        yield* filesystem.updateRef(first.store, {
          expected: first.commit,
          ref: "refs/cycle-test/main",
          target: second.commit,
        });

        const secondRef = yield* cli.readRef(first.store, "refs/cycle-test/main");
        const secondCommit = yield* cli.readCommit(first.store, second.commit);
        const secondBlob = yield* cli.readBlob(first.store, second.blob);
        const isCommit = yield* cli.isCommit(first.store, second.commit);
        const isAncestor = yield* cli.isAncestor(first.store, first.commit, second.commit);
        const mergeBase = yield* cli.mergeBase(first.store, first.commit, second.commit);

        assert.strictEqual(firstRef, first.commit);
        assert.strictEqual(bytesToString(firstBlob), "Create ticket\n");
        assert.deepStrictEqual(firstTree, [
          {
            mode: "100644",
            name: "ticket.txt",
            objectId: first.blob,
            type: "blob",
          },
        ]);
        assert.strictEqual(secondRef, second.commit);
        assert.strictEqual(secondCommit.message, "Update ticket\n");
        assert.deepStrictEqual(secondCommit.parents, [first.commit]);
        assert.strictEqual(bytesToString(secondBlob), "Update ticket\n");
        assert.strictEqual(isCommit, true);
        assert.strictEqual(isAncestor, true);
        assert.strictEqual(mergeBase, first.commit);

        yield* git(repo, ["gc"]);
        const packedBlob = yield* filesystem.readBlob(first.store, first.blob);
        assert.strictEqual(bytesToString(packedBlob), "Create ticket\n");
      }),
    ),
  );
});
