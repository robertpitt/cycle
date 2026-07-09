import { Context, Effect, FileSystem, Path } from "effect";
import { WorktreePathPolicyError } from "../WorktreeErrors.ts";

export type RepositoryPathPolicyInput = {
  readonly forbiddenPaths?: readonly string[] | undefined;
  readonly gitDbStoragePath?: string | undefined;
  readonly gitDir: string;
  readonly primaryPath: string;
  readonly storageRoot: string;
};

export const pathInside = (
  path: ContextPath,
  parent: string,
  child: string,
  includeEqual = true,
): boolean => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative === "") return includeEqual;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

type ContextPath = Context.Service.Shape<typeof Path.Path>;

const normalizeExisting = (
  fs: ContextFs,
  path: ContextPath,
  value: string,
): Effect.Effect<string> =>
  fs.realPath(value).pipe(Effect.catch(() => Effect.succeed(path.resolve(value))));

type ContextFs = Context.Service.Shape<typeof FileSystem.FileSystem>;

export const validateManagedPath = Effect.fn("validateManagedPath")(function* (
  candidatePath: string,
  policy: RepositoryPathPolicyInput,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const storageRoot = yield* normalizeExisting(fs, path, policy.storageRoot);
  const rawCandidate = path.resolve(candidatePath);
  const rawRelative = path.relative(path.resolve(policy.storageRoot), rawCandidate);
  const candidate =
    rawRelative === "" || (!rawRelative.startsWith("..") && !path.isAbsolute(rawRelative))
      ? path.join(storageRoot, rawRelative)
      : rawCandidate;
  const normalizedCandidate = yield* normalizeExisting(fs, path, candidate);

  if (!pathInside(path, storageRoot, normalizedCandidate)) {
    return yield* new WorktreePathPolicyError({
      message: "Worktree path must be inside the configured worktree storage root.",
      path: normalizedCandidate,
      reason: "outside_storage_root",
    });
  }

  const forbiddenPaths = [
    policy.primaryPath,
    policy.gitDir,
    ...(policy.gitDbStoragePath === undefined ? [] : [policy.gitDbStoragePath]),
    ...(policy.forbiddenPaths ?? []),
  ];

  for (const forbidden of forbiddenPaths) {
    const normalizedForbidden = yield* normalizeExisting(fs, path, forbidden);
    if (
      pathInside(path, normalizedForbidden, normalizedCandidate) ||
      pathInside(path, normalizedCandidate, normalizedForbidden)
    ) {
      return yield* new WorktreePathPolicyError({
        message:
          "Worktree path must not overlap the primary worktree, Git directory, GitDB storage, or a forbidden path.",
        path: normalizedCandidate,
        reason: "forbidden_overlap",
      });
    }
  }

  return normalizedCandidate;
});
