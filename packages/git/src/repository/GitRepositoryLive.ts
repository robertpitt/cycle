import { NodeServices } from "@effect/platform-node";
import { ChildProcessSpawner } from "effect/unstable/process";
import { Effect, FileSystem, Layer, Path, Result } from "effect";
import { gitRaw } from "../command/GitCommand.ts";
import { bytesToString } from "../internals/bytes.ts";
import { GitRepositoryError } from "../errors/index.ts";
import type { GitRepositoryRemote } from "../schemas/index.ts";
import { GitRepository } from "./GitRepository.ts";

export const layer = Layer.effect(
  GitRepository,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const normalize = (repositoryPath: string): string => path.resolve(repositoryPath);

    const gitOutput = (
      cwd: string,
      args: ReadonlyArray<string>,
      options: {
        readonly quietAllowedFailure?: boolean;
      } = {},
    ) =>
      gitRaw(spawner, cwd, [...args], {
        allowFailure: true,
        quietAllowedFailure: options.quietAllowedFailure,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new GitRepositoryError({
              operation: args.join(" "),
              path: cwd,
              message: "Unable to inspect Git repository.",
              cause,
            }),
        ),
      );

    const remoteList = (cwd: string) =>
      gitOutput(cwd, ["config", "--get-regexp", "^remote\\..*\\.url$"], {
        quietAllowedFailure: true,
      }).pipe(
        Effect.map((result): ReadonlyArray<GitRepositoryRemote> => {
          if (result.status !== 0) return [];

          return bytesToString(result.stdout)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .flatMap((line) => {
              const separator = line.search(/\s/u);
              if (separator === -1) return [];

              const key = line.slice(0, separator);
              const url = line.slice(separator).trim();
              const match = /^remote\.(.+)\.url$/u.exec(key);
              if (!match?.[1]) return [];

              return [
                {
                  name: match[1],
                  ...(url.length === 0 ? {} : { url }),
                },
              ];
            });
        }),
      );

    const resolveGitDir = (repositoryPath: string) =>
      Effect.gen(function* () {
        const cwd = normalize(repositoryPath);
        const result = yield* gitRaw(spawner, cwd, ["rev-parse", "--absolute-git-dir"], {
          allowFailure: true,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new GitRepositoryError({
                operation: "git rev-parse",
                path: cwd,
                message: "Unable to inspect Git repository.",
                cause,
              }),
          ),
        );

        if (result.status !== 0) {
          return yield* new GitRepositoryError({
            operation: "git rev-parse",
            path: cwd,
            message: "Path is not a Git repository.",
            cause: bytesToString(result.stderr).trim(),
          });
        }

        return bytesToString(result.stdout).trim();
      });

    const ensure = (repositoryPath: string) =>
      Effect.gen(function* () {
        const cwd = normalize(repositoryPath);
        const gitDir = yield* resolveGitDir(cwd);

        return { cwd, gitDir };
      });

    return GitRepository.of({
      ensure,
      init: (repositoryPath) =>
        Effect.gen(function* () {
          const cwd = normalize(repositoryPath);
          const exists = yield* fs.exists(cwd).pipe(Effect.catch(() => Effect.succeed(false)));

          if (!exists) {
            return yield* new GitRepositoryError({
              operation: "git init",
              path: cwd,
              message: "Selected path does not exist.",
            });
          }

          yield* gitRaw(spawner, cwd, ["init"]).pipe(
            Effect.mapError(
              (cause) =>
                new GitRepositoryError({
                  operation: "git init",
                  path: cwd,
                  message: "Unable to initialise Git repository.",
                  cause,
                }),
            ),
          );

          return yield* ensure(cwd);
        }),
      metadata: (repositoryPath) =>
        Effect.gen(function* () {
          const cwd = normalize(repositoryPath);
          const gitDir = yield* resolveGitDir(cwd);
          const remotes = yield* remoteList(cwd);
          const defaultRemote = remotes.some((remote) => remote.name === "origin")
            ? "origin"
            : remotes[0]?.name;
          const defaultRemoteUrl = remotes.find((remote) => remote.name === defaultRemote)?.url;

          return {
            ...(defaultRemote === undefined ? {} : { defaultRemote }),
            ...(defaultRemoteUrl === undefined ? {} : { defaultRemoteUrl }),
            gitDir,
            inspectedAt: new Date().toISOString(),
            path: cwd,
            remotes,
          };
        }),
      inspect: (repositoryPath) =>
        Effect.gen(function* () {
          const cwd = normalize(repositoryPath);
          const gitDir = yield* resolveGitDir(cwd).pipe(Effect.result);

          return Result.isSuccess(gitDir)
            ? {
                gitDir: gitDir.success,
                path: cwd,
                status: "git" as const,
              }
            : {
                message: gitDir.failure.message,
                path: cwd,
                status: "not-git" as const,
              };
        }),
      resolveGitDir,
    });
  }),
);

export const Live = layer;
export const NodeLive = layer.pipe(Layer.provide(NodeServices.layer));
