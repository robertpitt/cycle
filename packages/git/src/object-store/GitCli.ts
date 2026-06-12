import { ChildProcessSpawner } from "effect/unstable/process";
import { Effect, Layer } from "effect";
import type { Ref as GitRef } from "../schemas/index.ts";
import { gitAdapterError, remoteFetchError, remotePushError } from "../errors/index.ts";
import { bytesToString } from "../internals/bytes.ts";
import { git, formatGitFailure, formatOperation, sanitizeStderr } from "../command/GitCommand.ts";
import { Git, type GitService } from "./Git.ts";
import { commitEnv, parseCommit, parseTree } from "./GitObjectCodec.ts";
import { compareTreeEntries } from "./GitTreeOrder.ts";

export const layer = Layer.effect(
  Git,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const service: GitService = {
      deleteRef: (store, input) => {
        const args = ["update-ref", "-d", input.ref];

        if ("expected" in input) {
          args.push(input.expected ?? "");
        }

        return git(spawner, store.gitDir, store.cwd, args).pipe(Effect.asVoid);
      },
      fetch: (store, input) =>
        git(
          spawner,
          store.gitDir,
          store.cwd,
          [
            "fetch",
            ...(input.prune === true ? ["--prune"] : []),
            input.remote,
            ...input.refspecs,
          ],
          {},
          (args, result, cause) =>
            remoteFetchError(
              input.remote,
              formatOperation(args),
              formatGitFailure(args, result, cause),
              {
                cause,
                status: result?.status,
                stderr:
                  result === undefined ? undefined : sanitizeStderr(bytesToString(result.stderr)),
              },
            ),
        ).pipe(Effect.asVoid),
      isAncestor: (store, ancestor, descendant) =>
        git(
          spawner,
          store.gitDir,
          store.cwd,
          ["merge-base", "--is-ancestor", ancestor, descendant],
          {
            allowFailure: true,
          },
        ).pipe(
          Effect.flatMap((result) => {
            if (result.status === 0) return Effect.succeed(true);
            if (result.status === 1) return Effect.succeed(false);

            const stderr = sanitizeStderr(bytesToString(result.stderr));

            return Effect.fail(
              gitAdapterError("git merge-base --is-ancestor", stderr || "git merge-base failed", {
                status: result.status,
                stderr,
              }),
            );
          }),
        ),
      isCommit: (store, id) =>
        git(spawner, store.gitDir, store.cwd, ["cat-file", "-e", `${id}^{commit}`], {
          allowFailure: true,
        }).pipe(Effect.map((result) => result.status === 0)),
      listRefs: (store, prefix) =>
        git(
          spawner,
          store.gitDir,
          store.cwd,
          ["for-each-ref", "--format=%(refname)%00%(objectname)", prefix],
          {
            allowFailure: true,
          },
        ).pipe(
          Effect.map((result): ReadonlyArray<GitRef> => {
            if (result.status !== 0 || result.stdout.byteLength === 0) return [];

            return bytesToString(result.stdout)
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const [name, target] = line.split("\0");
                return { name, target };
              });
          }),
        ),
      mergeBase: (store, a, b) =>
        git(spawner, store.gitDir, store.cwd, ["merge-base", a, b], {
          allowFailure: true,
        }).pipe(
          Effect.map((result) =>
            result.status === 0 ? bytesToString(result.stdout).trim() || null : null,
          ),
        ),
      push: (store, input) =>
        git(
          spawner,
          store.gitDir,
          store.cwd,
          ["push", input.remote, ...input.refspecs],
          {},
          (args, result, cause) =>
            remotePushError(
              input.remote,
              formatOperation(args),
              formatGitFailure(args, result, cause),
              {
                cause,
                status: result?.status,
                stderr:
                  result === undefined ? undefined : sanitizeStderr(bytesToString(result.stderr)),
              },
            ),
        ).pipe(Effect.asVoid),
      readBlob: (store, id) =>
        git(spawner, store.gitDir, store.cwd, ["cat-file", "-p", id]).pipe(
          Effect.map((result): Uint8Array => result.stdout),
        ),
      readCommit: (store, id) =>
        git(spawner, store.gitDir, store.cwd, ["cat-file", "-p", id]).pipe(
          Effect.flatMap((result) => parseCommit(id, bytesToString(result.stdout))),
        ),
      readRef: (store, name) =>
        git(spawner, store.gitDir, store.cwd, ["show-ref", "--verify", "--hash", name], {
          allowFailure: true,
        }).pipe(
          Effect.map((result) =>
            result.status === 0 ? bytesToString(result.stdout).trim() || null : null,
          ),
        ),
      readTree: (store, id) =>
        git(spawner, store.gitDir, store.cwd, ["ls-tree", "-z", id]).pipe(
          Effect.flatMap((result) => parseTree(bytesToString(result.stdout))),
        ),
      updateRef: (store, input) => {
        const args = ["update-ref", input.ref, input.target];

        if ("expected" in input) {
          args.push(input.expected ?? "");
        }

        return git(spawner, store.gitDir, store.cwd, args).pipe(Effect.asVoid);
      },
      writeBlob: (store, bytes) =>
        git(spawner, store.gitDir, store.cwd, ["hash-object", "-w", "--stdin"], {
          input: bytes,
        }).pipe(Effect.map((result) => bytesToString(result.stdout).trim())),
      writeCommit: (store, input) =>
        Effect.gen(function* () {
          const args = ["commit-tree", input.tree];

          for (const parent of input.parents ?? []) {
            args.push("-p", parent);
          }

          const env = yield* commitEnv(input);
          const result = yield* git(spawner, store.gitDir, store.cwd, args, {
            env,
            input: `${input.message ?? "Update GitDB snapshot"}\n`,
          });

          return bytesToString(result.stdout).trim();
        }),
      writeTree: (store, entries) => {
        const input = [...entries]
          .sort(compareTreeEntries)
          .map((entry) => `${entry.mode} ${entry.type} ${entry.objectId}\t${entry.name}\0`)
          .join("");

        return git(spawner, store.gitDir, store.cwd, ["mktree", "-z"], { input }).pipe(
          Effect.map((result) => bytesToString(result.stdout).trim()),
        );
      },
    };

    return service;
  }),
);

export const Live = layer;
