import { Git } from "@cycle/git";
import { Context, Effect, Layer } from "effect";
import {
  NoWorktreeChangesError,
  WorktreeBackupError,
  WorktreeFinalizeError,
} from "./WorktreeErrors.ts";
import type {
  ObjectId,
  WorktreeFinalization,
  WorktreeInspection,
  WorktreeRecord,
} from "./WorktreeSchemas.ts";
import { backupBranchName, refForBranch, sanitizeCommitMessage } from "./internal/branch.ts";

export type WorktreeBackupResult = {
  readonly backupBranchName: string;
  readonly headSha: string;
};

export type WorktreeFinalizerShape = {
  readonly createBackupBranch: (input: {
    readonly reason: string;
    readonly record: WorktreeRecord;
  }) => Effect.Effect<WorktreeBackupResult, WorktreeBackupError | WorktreeFinalizeError>;
  readonly finalize: (input: {
    readonly allowEmpty?: boolean | undefined;
    readonly message: string;
    readonly record: WorktreeRecord;
  }) => Effect.Effect<
    WorktreeFinalization,
    WorktreeFinalizeError | NoWorktreeChangesError | WorktreeBackupError
  >;
  readonly inspect: (
    record: WorktreeRecord,
  ) => Effect.Effect<WorktreeInspection, WorktreeFinalizeError>;
};

export class WorktreeFinalizer extends Context.Service<WorktreeFinalizer, WorktreeFinalizerShape>()(
  "@cycle/git-worktrees/WorktreeFinalizer",
) {}

const secretLikePath = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    lower === ".env" ||
    lower.startsWith(".env.") ||
    lower.includes("/.env") ||
    lower.includes("credential") ||
    lower.includes("secret") ||
    lower.includes("private_key") ||
    lower.includes("id_rsa") ||
    lower.includes("token")
  );
};

const parsePorcelainZPaths = (output: string): ReadonlyArray<string> => {
  const entries = output.split("\0").filter(Boolean);
  const paths: string[] = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.length >= 4 && entry[2] === " ") {
      const status = entry.slice(0, 2);
      paths.push(entry.slice(3));
      if (status.includes("R") || status.includes("C")) {
        const copiedOrRenamedFrom = entries[index + 1];
        if (copiedOrRenamedFrom !== undefined) {
          paths.push(copiedOrRenamedFrom);
          index++;
        }
      }
    } else {
      paths.push(entry);
    }
  }

  return paths;
};

export const WorktreeFinalizerLive = Layer.effect(
  WorktreeFinalizer,
  Effect.gen(function* () {
    const git = yield* Git;

    const mapFinalizeError = (operation: string, path: string, cause: unknown) =>
      new WorktreeFinalizeError({
        cause,
        message: `Git finalization command failed: ${operation}`,
        operation,
        path,
      });

    const inspect = Effect.fn("WorktreeFinalizer.inspect")(function* (record: WorktreeRecord) {
      const headSha = yield* git
        .head(record.path)
        .pipe(
          Effect.mapError((cause) =>
            mapFinalizeError("git rev-parse HEAD", record.path, cause),
          ),
        );
      const statusPorcelain = yield* git
        .statusPorcelain(record.path)
        .pipe(
          Effect.mapError((cause) =>
            mapFinalizeError("git status --porcelain=v1", record.path, cause),
          ),
        );
      const branch = yield* git
        .currentBranch(record.path)
        .pipe(
          Effect.mapError((cause) =>
            mapFinalizeError("git branch --show-current", record.path, cause),
          ),
        );
      const descended = yield* git
        .isAncestor(record.path, record.baseSha, headSha)
        .pipe(
          Effect.mapError((cause) =>
            mapFinalizeError("git merge-base --is-ancestor", record.path, cause),
          ),
        );
      const unpublishedCommits: ReadonlyArray<ObjectId> = descended
        ? ((yield* git
            .revList(record.path, {
              range: {
                fromExclusive: record.baseSha,
                toInclusive: headSha,
              },
            })
            .pipe(
              Effect.mapError((cause) =>
                mapFinalizeError("git rev-list", record.path, cause),
              ),
            )) as unknown as ReadonlyArray<ObjectId>)
        : [];

      return {
        ...(branch === null ? {} : { branchName: branch }),
        dirty: statusPorcelain.length > 0,
        headSha: headSha as ObjectId,
        path: record.path,
        statusPorcelain,
        unpublishedCommits,
      };
    });

    const createBackupBranchRaw = Effect.fn("WorktreeFinalizer.createBackupBranch")(
      function* (input: { readonly reason: string; readonly record: WorktreeRecord }) {
        const status = yield* git
          .statusPorcelain(input.record.path, { z: true })
          .pipe(
            Effect.mapError((cause) =>
              mapFinalizeError("git status --porcelain=v1 -z", input.record.path, cause),
            ),
          );
        const paths = parsePorcelainZPaths(status);
        const blocked = paths.find(secretLikePath);
        if (blocked !== undefined) {
          return yield* new WorktreeBackupError({
            message: `Backup blocked by secret-like path: ${blocked}`,
            path: input.record.path,
            reason: "secret_like_path",
            repositoryId: input.record.repositoryId,
            worktreeId: input.record.worktreeId,
          });
        }

        if (status.length > 0) {
          yield* git
            .addAll(input.record.path)
            .pipe(
              Effect.mapError((cause) => mapFinalizeError("git add -A", input.record.path, cause)),
            );
          yield* git
            .commit(input.record.path, {
              message: sanitizeCommitMessage(
                `Backup managed worktree\n\nWorktree: ${input.record.worktreeId}\nRepository: ${input.record.repositoryId}\nJob: ${input.record.jobId}\nReason: ${input.reason}`,
              ),
            })
            .pipe(
              Effect.mapError((cause) => mapFinalizeError("git commit", input.record.path, cause)),
            );
        }

        const headSha = yield* git
          .head(input.record.path)
          .pipe(
            Effect.mapError((cause) =>
              mapFinalizeError("git rev-parse HEAD", input.record.path, cause),
            ),
          );
        const branchName = backupBranchName({
          timestamp: new Date().toISOString(),
          worktreeId: input.record.worktreeId,
        });
        yield* git
          .updateRef(input.record.path, {
            ref: refForBranch(branchName),
            target: headSha,
          })
          .pipe(
            Effect.mapError((cause) =>
              mapFinalizeError("git update-ref", input.record.path, cause),
            ),
          );
        return {
          backupBranchName: branchName,
          headSha,
        };
      },
    );

    const createBackupBranch: WorktreeFinalizerShape["createBackupBranch"] = (input) =>
      createBackupBranchRaw(input).pipe(
        Effect.mapError((cause) =>
          cause instanceof WorktreeBackupError
            ? cause
            : new WorktreeBackupError({
                cause,
                message: "Unable to create backup branch.",
                path: input.record.path,
                reason: "git_backup_failed",
              }),
        ),
      );

    const finalize = Effect.fn("WorktreeFinalizer.finalize")(function* (input: {
      readonly allowEmpty?: boolean | undefined;
      readonly message: string;
      readonly record: WorktreeRecord;
    }) {
      const before = yield* inspect(input.record);
      const descended = yield* git
        .isAncestor(input.record.path, input.record.baseSha, before.headSha)
        .pipe(
          Effect.mapError((cause) =>
            mapFinalizeError("git merge-base --is-ancestor", input.record.path, cause),
          ),
        );
      if (!descended) {
        const backup = yield* createBackupBranch({
          reason: "head_not_descended_from_base",
          record: input.record,
        });
        return yield* new WorktreeFinalizeError({
          message: `Worktree HEAD is not descended from recorded base SHA. Backup branch: ${backup.backupBranchName}`,
          operation: "finalize",
          path: input.record.path,
          repositoryId: input.record.repositoryId,
          worktreeId: input.record.worktreeId,
        });
      }

      const hasExistingCommits = before.unpublishedCommits.length > 0;
      if (!before.dirty && !hasExistingCommits && input.allowEmpty !== true) {
        return yield* new NoWorktreeChangesError({
          message: "Worktree has no changes to finalize.",
          path: input.record.path,
          repositoryId: input.record.repositoryId,
          worktreeId: input.record.worktreeId,
        });
      }

      let managedCommitSha: string | undefined;
      if (before.dirty || (!hasExistingCommits && input.allowEmpty === true)) {
        yield* git
          .addAll(input.record.path)
          .pipe(
            Effect.mapError((cause) => mapFinalizeError("git add -A", input.record.path, cause)),
          );
        const commit = yield* git
          .commit(input.record.path, {
            allowEmpty: !before.dirty,
            message: sanitizeCommitMessage(input.message),
          })
          .pipe(
            Effect.mapError((cause) => mapFinalizeError("git commit", input.record.path, cause)),
          );
        managedCommitSha = commit.sha;
      }

      const after = yield* inspect(input.record);
      return {
        commits: after.unpublishedCommits,
        headSha: after.headSha,
        message: sanitizeCommitMessage(input.message),
        noChanges: after.unpublishedCommits.length === 0,
        worktreeId: input.record.worktreeId,
        ...(managedCommitSha === undefined
          ? {}
          : { managedCommitSha: managedCommitSha as ObjectId }),
      };
    });

    return WorktreeFinalizer.of({
      createBackupBranch,
      finalize,
      inspect,
    });
  }),
);
