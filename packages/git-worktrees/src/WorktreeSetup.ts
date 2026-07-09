import { GitCommands } from "@cycle/git/commands/GitCommands";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Context, Effect, FileSystem, Layer, Path, Stream } from "effect";
import { WorktreePathPolicyError, WorktreeSetupError } from "./WorktreeErrors.ts";
import type {
  ObjectId,
  WorktreeRecord,
  WorktreeSetupProfile,
  WorktreeSetupRun,
} from "./WorktreeSchemas.ts";
import { WorktreeConfig } from "./WorktreeConfig.ts";
import { newWorktreeSetupRunId } from "./internal/ids.ts";
import { pathInside } from "./internal/path-policy.ts";
import { boundedOutput, bytesToString, redactEnvironment } from "./internal/process-output.ts";

export type WorktreeSetupShape = {
  readonly run: (input: {
    readonly profile?: WorktreeSetupProfile | undefined;
    readonly record: WorktreeRecord;
  }) => Effect.Effect<WorktreeSetupRun, WorktreeSetupError | WorktreePathPolicyError>;
};

export class WorktreeSetup extends Context.Service<WorktreeSetup, WorktreeSetupShape>()(
  "@cycle/git-worktrees/WorktreeSetup",
) {}

const collectBytes = (
  stream: Stream.Stream<Uint8Array, unknown>,
): Effect.Effect<Uint8Array, unknown> =>
  Stream.runCollect(stream).pipe(
    Effect.map((chunks) => {
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const output = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return output;
    }),
  );

const defaultProfile = (timeoutMs: number): WorktreeSetupProfile => ({
  commands: [],
  dirtyPolicy: "require_clean",
  profileId: "default",
  timeoutMs,
});

export const WorktreeSetupLive = Layer.effect(
  WorktreeSetup,
  Effect.gen(function* () {
    const config = yield* WorktreeConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const git = yield* GitCommands;

    const runCommand = Effect.fn("WorktreeSetup.runCommand")(function* (
      record: WorktreeRecord,
      profile: WorktreeSetupProfile,
      command: WorktreeSetupProfile["commands"][number],
    ) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const cwd = path.resolve(record.path, command.cwd ?? ".");
          if (!pathInside(path, record.path, cwd)) {
            return yield* new WorktreePathPolicyError({
              message: "Setup command cwd must stay inside the managed worktree.",
              path: cwd,
              reason: "setup_cwd_escape",
              worktreeId: record.worktreeId,
            });
          }

          const exists = yield* fs.exists(cwd).pipe(Effect.catch(() => Effect.succeed(false)));
          if (!exists) {
            return yield* new WorktreeSetupError({
              message: "Setup command working directory does not exist.",
              operation: command.command,
              path: cwd,
              worktreeId: record.worktreeId,
            });
          }

          const environment = {
            ...profile.environment,
            ...command.env,
          };
          const child = ChildProcess.make(command.command, command.args ?? [], {
            cwd,
            env: environment,
            extendEnv: true,
          });
          const handle = yield* spawner.spawn(child).pipe(
            Effect.mapError(
              (cause) =>
                new WorktreeSetupError({
                  cause,
                  message: `Unable to start setup command: ${command.command}`,
                  operation: command.command,
                  path: cwd,
                  worktreeId: record.worktreeId,
                }),
            ),
          );
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [collectBytes(handle.stdout), collectBytes(handle.stderr), handle.exitCode],
            { concurrency: "unbounded" },
          ).pipe(
            Effect.timeout(command.timeoutMs ?? profile.timeoutMs ?? config.config.setupTimeoutMs),
            Effect.mapError(
              (cause) =>
                new WorktreeSetupError({
                  cause,
                  message: `Setup command failed: ${command.command}`,
                  operation: command.command,
                  path: cwd,
                  worktreeId: record.worktreeId,
                }),
            ),
          );

          if (Number(exitCode) !== 0) {
            return yield* new WorktreeSetupError({
              message:
                boundedOutput(bytesToString(stderr)) || `Setup command exited with ${exitCode}.`,
              operation: command.command,
              path: cwd,
              worktreeId: record.worktreeId,
            });
          }

          return boundedOutput(`${bytesToString(stdout)}\n${bytesToString(stderr)}`);
        }),
      );
    });

    const mapGitSetupError = (operation: string, cwd: string, cause: unknown) =>
      new WorktreeSetupError({
        cause,
        message: `Unable to inspect setup baseline with ${operation}.`,
        operation,
        path: cwd,
      });

    const run = Effect.fn("WorktreeSetup.run")(function* (input: {
      readonly profile?: WorktreeSetupProfile | undefined;
      readonly record: WorktreeRecord;
    }) {
      const profile = input.profile ?? defaultProfile(config.config.setupTimeoutMs);
      const startedAt = new Date().toISOString();
      const setupRunId = newWorktreeSetupRunId();
      const outputParts = yield* Effect.forEach(profile.commands, (command) =>
        runCommand(input.record, profile, command),
      );

      const statusPorcelain = yield* git
        .statusPorcelain(input.record.path)
        .pipe(
          Effect.mapError((cause) =>
            mapGitSetupError("git status --porcelain=v1", input.record.path, cause),
          ),
        );
      const readySha = yield* git
        .head(input.record.path)
        .pipe(
          Effect.mapError((cause) =>
            mapGitSetupError("git rev-parse HEAD", input.record.path, cause),
          ),
        );
      if (statusPorcelain.length > 0 && profile.dirtyPolicy === "require_clean") {
        return yield* new WorktreeSetupError({
          message:
            "Setup profile left tracked or untracked changes outside the clean baseline policy.",
          operation: "setup baseline",
          path: input.record.path,
          worktreeId: input.record.worktreeId,
        });
      }

      return {
        artifactPaths: profile.artifactPaths ?? [],
        commands: profile.commands,
        completedAt: new Date().toISOString(),
        dirtyPolicy: profile.dirtyPolicy,
        generatedChangesSummary:
          statusPorcelain.length === 0 ? undefined : boundedOutput(statusPorcelain),
        outputSummary: boundedOutput(outputParts.filter(Boolean).join("\n")),
        profileId: profile.profileId,
        readySha: readySha as ObjectId,
        redactedEnvironment: redactEnvironment(
          profile.environment ?? {},
          profile.redactedEnvironmentKeys ?? [],
        ),
        setupRunId,
        startedAt,
        status: "succeeded" as const,
        worktreeId: input.record.worktreeId,
      };
    });

    return WorktreeSetup.of({
      run,
    });
  }),
);
