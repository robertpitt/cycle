import { ChildProcessSpawner } from "effect/unstable/process";
import { Context, Effect, Layer } from "effect";
import { realpathSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { gitRaw } from "./GitCommand.ts";
import { GitAdapterError } from "./GitErrors.ts";
import { GitRepository, GitRepositoryLive } from "./GitRepository.ts";
import { bytesToString } from "./internals/bytes.ts";

export type WorktreeMode = "disposable" | "implementation";
export type WorktreeStatus = "active" | "cleaned" | "retained" | "failed";
export type BranchAssociationStatus = "active" | "superseded" | "failed" | "abandoned";

export type WorktreeRecord = {
  readonly worktreeId: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly mode: WorktreeMode;
  readonly path: string;
  readonly baseRef: string;
  readonly baseSha: string;
  readonly branchName?: string;
  readonly branchRef?: string;
  readonly status: WorktreeStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cleanedAt?: string;
  readonly retentionReason?: string;
  readonly lastError?: string;
};

export type BranchAssociation = {
  readonly branchAssociationId: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly jobId: string;
  readonly branchName: string;
  readonly branchRef: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: BranchAssociationStatus;
  readonly handoverCommentId?: string;
};

export type WorktreePathPolicy = {
  readonly worktreeStoragePath: string;
  readonly gitDbStoragePath?: string;
  readonly forbiddenPaths?: readonly string[];
};

export type CreateDisposableWorktreeInput = WorktreePathPolicy & {
  readonly repositoryPath: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly baseRef?: string;
};

export type CreateImplementationWorktreeInput = WorktreePathPolicy & {
  readonly repositoryPath: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly ticketId: string;
  readonly ticketSlugSource?: string;
  readonly ticketType?: string | null;
  readonly baseRef?: string;
};

export type InspectWorktreeInput = {
  readonly path: string;
};

export type WorktreeInspection = {
  readonly path: string;
  readonly headSha: string;
  readonly branchName?: string;
  readonly dirty: boolean;
  readonly statusPorcelain: string;
};

export type WorktreeDiff = {
  readonly path: string;
  readonly dirty: boolean;
  readonly statusPorcelain: string;
  readonly patch: string;
};

export type CommitWorktreeInput = {
  readonly repositoryPath: string;
  readonly worktree: WorktreeRecord;
  readonly message: string;
  readonly allowEmpty?: boolean;
};

export type WorktreeCommit = {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly message: string;
};

export type BranchCollisionAssociation = Pick<BranchAssociation, "branchName" | "ticketId">;

export type CreateOrUpdateBranchInput = {
  readonly repositoryPath: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly ticketId: string;
  readonly desiredBranchName: string;
  readonly targetSha: string;
  readonly baseSha: string;
  readonly existingAssociations?: readonly BranchCollisionAssociation[];
};

export type BranchPublication = {
  readonly association: BranchAssociation;
  readonly collision: BranchCollisionResolution;
};

export type CleanupWorktreeInput = {
  readonly repositoryPath: string;
  readonly worktree: WorktreeRecord;
  readonly pathPolicy?: WorktreePathPolicy;
};

export type RetainWorktreeInput = {
  readonly worktree: WorktreeRecord;
  readonly reason: string;
};

export type BranchCollisionResolution =
  | {
      readonly type: "none";
      readonly branchName: string;
      readonly branchRef: string;
    }
  | {
      readonly type: "same-ticket";
      readonly branchName: string;
      readonly branchRef: string;
    }
  | {
      readonly type: "renamed";
      readonly desiredBranchName: string;
      readonly branchName: string;
      readonly branchRef: string;
    };

export type ResolveBranchCollisionInput = {
  readonly desiredBranchName: string;
  readonly ticketId: string;
  readonly existingBranches: readonly string[];
  readonly existingAssociations?: readonly BranchCollisionAssociation[];
  readonly maxAttempts?: number;
};

export type WorktreeServiceShape = {
  readonly createDisposableWorktree: (
    input: CreateDisposableWorktreeInput,
  ) => Effect.Effect<WorktreeRecord, GitAdapterError>;
  readonly createImplementationWorktree: (
    input: CreateImplementationWorktreeInput,
  ) => Effect.Effect<WorktreeRecord, GitAdapterError>;
  readonly inspectWorktree: (
    input: InspectWorktreeInput,
  ) => Effect.Effect<WorktreeInspection, GitAdapterError>;
  readonly diffWorktree: (
    input: InspectWorktreeInput,
  ) => Effect.Effect<WorktreeDiff, GitAdapterError>;
  readonly commitWorktree: (
    input: CommitWorktreeInput,
  ) => Effect.Effect<WorktreeCommit, GitAdapterError>;
  readonly createOrUpdateBranch: (
    input: CreateOrUpdateBranchInput,
  ) => Effect.Effect<BranchPublication, GitAdapterError>;
  readonly cleanupWorktree: (
    input: CleanupWorktreeInput,
  ) => Effect.Effect<WorktreeRecord, GitAdapterError>;
  readonly retainWorktree: (input: RetainWorktreeInput) => Effect.Effect<WorktreeRecord, never>;
};

export class WorktreeService extends Context.Service<WorktreeService, WorktreeServiceShape>()(
  "@cycle/git/WorktreeService",
) {}

const defaultBaseRef = "HEAD";

const nowIso = (): string => new Date().toISOString();

const newLocalId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const normalizePath = (value: string): string => path.resolve(value);

const normalizeExistingPath = (value: string): string => {
  try {
    return realpathSync.native(value);
  } catch {
    return normalizePath(value);
  }
};

const pathInside = (parent: string, child: string): boolean => {
  const relative = path.relative(normalizePath(parent), normalizePath(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const refForBranch = (branchName: string): string => `refs/heads/${branchName}`;

const operationError = (
  operation: string,
  message: string,
  options: { readonly cause?: unknown; readonly status?: number; readonly stderr?: string } = {},
): GitAdapterError => new GitAdapterError({ operation: operation, message: message, ...options });

const sanitizeSegment = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");

  return normalized.length === 0 ? fallback : normalized;
};

export const branchTypeSegment = (ticketType: string | null | undefined): string => {
  switch (ticketType?.trim().toLowerCase()) {
    case "epic":
      return "epic";
    case "feature":
      return "feature";
    case "story":
      return "story";
    case "bug":
      return "bug";
    case "specification":
      return "specification";
    case "task":
    case "issue":
    case undefined:
    case "":
      return "task";
    case "initiative":
      return "epic";
    default:
      return "task";
  }
};

export const implementationBranchName = (input: {
  readonly ticketId: string;
  readonly ticketSlugSource?: string;
  readonly ticketType?: string | null;
}): string => {
  const ticketId = sanitizeSegment(input.ticketId, "ticket").toUpperCase();
  const slug = sanitizeSegment(input.ticketSlugSource ?? "", "work");
  return `cycle/${branchTypeSegment(input.ticketType)}/${ticketId}-${slug}`;
};

export const resolveBranchCollision = (
  input: ResolveBranchCollisionInput,
): BranchCollisionResolution => {
  const branches = new Set(input.existingBranches);
  const association = input.existingAssociations?.find(
    (candidate) => candidate.branchName === input.desiredBranchName,
  );

  if (!branches.has(input.desiredBranchName)) {
    return {
      branchName: input.desiredBranchName,
      branchRef: refForBranch(input.desiredBranchName),
      type: "none",
    };
  }

  if (association?.ticketId === input.ticketId) {
    return {
      branchName: input.desiredBranchName,
      branchRef: refForBranch(input.desiredBranchName),
      type: "same-ticket",
    };
  }

  const maxAttempts = input.maxAttempts ?? 100;
  for (let suffix = 2; suffix <= maxAttempts; suffix++) {
    const branchName = `${input.desiredBranchName}-${suffix}`;
    if (!branches.has(branchName)) {
      return {
        branchName,
        branchRef: refForBranch(branchName),
        desiredBranchName: input.desiredBranchName,
        type: "renamed",
      };
    }
  }

  throw operationError(
    "resolve branch collision",
    `Unable to find a non-conflicting branch name for ${input.desiredBranchName}.`,
  );
};

const sanitizeCommitMessage = (message: string): string => {
  const lines = message.replace(/\r\n?/gu, "\n").split("\n");
  const withoutCoAuthors = lines.filter((line) => !/^Co-authored-by:/iu.test(line.trim()));
  const normalized = withoutCoAuthors.join("\n").trim();
  return normalized.length === 0 ? "Agent implementation update" : normalized;
};

const WorktreeServiceLayer = Layer.effect(
  WorktreeService,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const repositories = yield* GitRepository;

    const git = (
      cwd: string,
      args: readonly string[],
      options: { readonly allowFailure?: boolean; readonly input?: string } = {},
    ) =>
      gitRaw(spawner, cwd, args, {
        allowFailure: options.allowFailure,
        input: options.input,
      });

    const gitString = (cwd: string, args: readonly string[]) =>
      git(cwd, args).pipe(Effect.map((result) => bytesToString(result.stdout).trim()));

    const ensureRepository = (repositoryPath: string) =>
      Effect.gen(function* () {
        const repository = yield* repositories.ensure(repositoryPath).pipe(
          Effect.mapError((cause) =>
            operationError(cause.operation, cause.message, {
              cause,
            }),
          ),
        );
        const topLevel = yield* gitString(repository.cwd, ["rev-parse", "--show-toplevel"]);

        return {
          gitDir: normalizeExistingPath(repository.gitDir),
          primaryPath: normalizeExistingPath(topLevel),
        };
      });

    const validatePathPolicy = (
      operation: string,
      candidatePath: string,
      repository: { readonly gitDir: string; readonly primaryPath: string },
      policy: WorktreePathPolicy,
    ): Effect.Effect<string, GitAdapterError> =>
      Effect.try({
        catch: (cause) =>
          cause instanceof Error && "_tag" in cause
            ? (cause as GitAdapterError)
            : operationError(operation, "Invalid worktree path policy.", { cause }),
        try: () => {
          const rawStoragePath = normalizePath(policy.worktreeStoragePath);
          const storagePath = normalizeExistingPath(rawStoragePath);
          const rawWorktreePath = normalizePath(candidatePath);
          const rawRelative = path.relative(rawStoragePath, rawWorktreePath);
          const worktreePath =
            rawRelative === "" || (!rawRelative.startsWith("..") && !path.isAbsolute(rawRelative))
              ? path.join(storagePath, rawRelative)
              : rawWorktreePath;
          const forbiddenPaths = [
            repository.primaryPath,
            repository.gitDir,
            ...(policy.gitDbStoragePath === undefined ? [] : [policy.gitDbStoragePath]),
            ...(policy.forbiddenPaths ?? []),
          ].map(normalizeExistingPath);

          if (!pathInside(storagePath, worktreePath)) {
            throw operationError(
              operation,
              "Worktree path must be inside the configured worktree storage path.",
            );
          }
          for (const forbiddenPath of forbiddenPaths) {
            if (
              pathInside(forbiddenPath, worktreePath) ||
              pathInside(worktreePath, forbiddenPath)
            ) {
              throw operationError(
                operation,
                "Worktree path must not be the primary worktree, Git directory, GitDB storage, or a forbidden path.",
              );
            }
          }

          return worktreePath;
        },
      });

    const createWorktree = (input: {
      readonly baseRef?: string;
      readonly branchName?: string;
      readonly jobId: string;
      readonly mode: "disposable" | "implementation";
      readonly repositoryId: string;
      readonly repositoryPath: string;
      readonly pathPolicy: WorktreePathPolicy;
    }) =>
      Effect.gen(function* () {
        const repository = yield* ensureRepository(input.repositoryPath);
        const baseRef = input.baseRef ?? defaultBaseRef;
        const baseSha = yield* gitString(repository.primaryPath, ["rev-parse", baseRef]);
        const worktreeId = newLocalId("worktree");
        const worktreePath = yield* validatePathPolicy(
          "git worktree add",
          path.join(input.pathPolicy.worktreeStoragePath, worktreeId),
          repository,
          input.pathPolicy,
        );

        yield* Effect.tryPromise({
          catch: (cause) =>
            operationError("mkdir", "Unable to create worktree storage directory.", { cause }),
          try: () => mkdir(path.dirname(worktreePath), { recursive: true }),
        });
        yield* git(repository.primaryPath, ["worktree", "add", "--detach", worktreePath, baseRef]);

        const timestamp = nowIso();
        return {
          baseRef,
          baseSha,
          ...(input.branchName === undefined ? {} : { branchName: input.branchName }),
          ...(input.branchName === undefined ? {} : { branchRef: refForBranch(input.branchName) }),
          createdAt: timestamp,
          jobId: input.jobId,
          mode: input.mode,
          path: worktreePath,
          repositoryId: input.repositoryId,
          status: "active" as const,
          updatedAt: timestamp,
          worktreeId,
        };
      });

    const inspectWorktree = (
      input: InspectWorktreeInput,
    ): Effect.Effect<WorktreeInspection, GitAdapterError> =>
      Effect.gen(function* () {
        const worktreePath = normalizePath(input.path);
        const headSha = yield* gitString(worktreePath, ["rev-parse", "HEAD"]);
        const branchNameResult = yield* git(worktreePath, ["branch", "--show-current"], {
          allowFailure: true,
        });
        const statusPorcelain = yield* gitString(worktreePath, ["status", "--porcelain=v1"]);
        const branchName = bytesToString(branchNameResult.stdout).trim();

        return {
          ...(branchName.length === 0 ? {} : { branchName }),
          dirty: statusPorcelain.length > 0,
          headSha,
          path: worktreePath,
          statusPorcelain,
        };
      });

    const diffWorktree = (
      input: InspectWorktreeInput,
    ): Effect.Effect<WorktreeDiff, GitAdapterError> =>
      Effect.gen(function* () {
        const worktreePath = normalizePath(input.path);
        const statusPorcelain = yield* gitString(worktreePath, ["status", "--porcelain=v1"]);
        const patch = yield* gitString(worktreePath, ["diff", "--binary", "HEAD"]);

        return {
          dirty: statusPorcelain.length > 0,
          patch,
          path: worktreePath,
          statusPorcelain,
        };
      });

    const commitWorktree = (
      input: CommitWorktreeInput,
    ): Effect.Effect<WorktreeCommit, GitAdapterError> =>
      Effect.gen(function* () {
        const repository = yield* ensureRepository(input.repositoryPath);
        const worktreePath = normalizePath(input.worktree.path);
        if (worktreePath === repository.primaryPath) {
          return yield* operationError(
            "git commit",
            "Refusing to commit the primary worktree for agent work.",
          );
        }

        const headSha = yield* gitString(worktreePath, ["rev-parse", "HEAD"]);
        if (headSha !== input.worktree.baseSha) {
          return yield* operationError(
            "git commit",
            "Refusing to finalize a worktree whose HEAD moved from the recorded base SHA.",
          );
        }

        const diff = yield* diffWorktree({ path: worktreePath });
        if (!diff.dirty && input.allowEmpty !== true) {
          return yield* operationError("git commit", "Worktree has no changes to commit.");
        }

        const authorName = yield* gitString(worktreePath, ["config", "--get", "user.name"]);
        const authorEmail = yield* gitString(worktreePath, ["config", "--get", "user.email"]);
        const message = sanitizeCommitMessage(input.message);
        yield* git(worktreePath, ["add", "-A"]);
        yield* git(worktreePath, [
          "-c",
          `user.name=${authorName}`,
          "-c",
          `user.email=${authorEmail}`,
          "commit",
          "-m",
          message,
        ]);
        const sha = yield* gitString(worktreePath, ["rev-parse", "HEAD"]);

        return {
          authorEmail,
          authorName,
          message,
          sha,
        };
      });

    const listBranches = (repositoryPath: string) =>
      gitString(repositoryPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"]).pipe(
        Effect.map((stdout) =>
          stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        ),
      );

    const checkBranchName = (repositoryPath: string, branchName: string) =>
      git(repositoryPath, ["check-ref-format", "--branch", branchName]).pipe(
        Effect.as(branchName),
        Effect.mapError((cause) =>
          operationError("git check-ref-format", `Invalid branch name: ${branchName}`, { cause }),
        ),
      );

    const createOrUpdateBranch = (
      input: CreateOrUpdateBranchInput,
    ): Effect.Effect<BranchPublication, GitAdapterError> =>
      Effect.gen(function* () {
        const repository = yield* ensureRepository(input.repositoryPath);
        yield* checkBranchName(repository.primaryPath, input.desiredBranchName);
        const existingBranches = yield* listBranches(repository.primaryPath);
        const collision = resolveBranchCollision({
          desiredBranchName: input.desiredBranchName,
          existingAssociations: input.existingAssociations,
          existingBranches,
          ticketId: input.ticketId,
        });
        if (collision.type === "renamed") {
          yield* checkBranchName(repository.primaryPath, collision.branchName);
        }

        yield* git(repository.primaryPath, [
          "update-ref",
          refForBranch(collision.branchName),
          input.targetSha,
        ]);

        const timestamp = nowIso();
        const association: BranchAssociation = {
          baseSha: input.baseSha,
          branchAssociationId: newLocalId("branch_assoc"),
          branchName: collision.branchName,
          branchRef: refForBranch(collision.branchName),
          createdAt: timestamp,
          headSha: input.targetSha,
          jobId: input.jobId,
          repositoryId: input.repositoryId,
          status: "active",
          ticketId: input.ticketId,
          updatedAt: timestamp,
        };

        return {
          association,
          collision,
        };
      });

    const cleanupWorktree = (
      input: CleanupWorktreeInput,
    ): Effect.Effect<WorktreeRecord, GitAdapterError> =>
      Effect.gen(function* () {
        const repository = yield* ensureRepository(input.repositoryPath);
        const policy =
          input.pathPolicy ??
          ({
            worktreeStoragePath: path.dirname(input.worktree.path),
          } satisfies WorktreePathPolicy);
        const worktreePath = yield* validatePathPolicy(
          "git worktree remove",
          input.worktree.path,
          repository,
          policy,
        );

        yield* git(repository.primaryPath, ["worktree", "remove", "--force", worktreePath], {
          allowFailure: true,
        });
        yield* Effect.tryPromise({
          catch: (cause) =>
            operationError("rm worktree", "Unable to remove worktree directory.", { cause }),
          try: () => rm(worktreePath, { force: true, recursive: true }),
        });

        const timestamp = nowIso();
        return {
          ...input.worktree,
          cleanedAt: timestamp,
          status: "cleaned",
          updatedAt: timestamp,
        };
      });

    return WorktreeService.of({
      cleanupWorktree,
      commitWorktree,
      createDisposableWorktree: (input: CreateDisposableWorktreeInput) =>
        createWorktree({
          baseRef: input.baseRef,
          jobId: input.jobId,
          mode: "disposable",
          pathPolicy: input,
          repositoryId: input.repositoryId,
          repositoryPath: input.repositoryPath,
        }),
      createImplementationWorktree: (input: CreateImplementationWorktreeInput) =>
        createWorktree({
          baseRef: input.baseRef,
          branchName: implementationBranchName(input),
          jobId: input.jobId,
          mode: "implementation",
          pathPolicy: input,
          repositoryId: input.repositoryId,
          repositoryPath: input.repositoryPath,
        }),
      createOrUpdateBranch,
      diffWorktree,
      inspectWorktree,
      retainWorktree: (input: RetainWorktreeInput) =>
        Effect.succeed({
          ...input.worktree,
          retentionReason: input.reason,
          status: "retained",
          updatedAt: nowIso(),
        }),
    });
  }),
);

export const WorktreeServiceLive = WorktreeServiceLayer.pipe(Layer.provide(GitRepositoryLive));
