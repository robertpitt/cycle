import type { MaterializationWarning } from "../../domain/index.ts";
export const warning = (
  repositoryId: string,
  snapshotId: string,
  path: string,
  objectType: string,
  objectId: string | undefined,
  cause: unknown,
  createdAt: string,
  reason = "invalid-source-object",
): MaterializationWarning => ({
  createdAt,
  message: cause instanceof Error ? cause.message : String(cause),
  objectId,
  objectType,
  path,
  reason,
  repositoryId,
  snapshotId,
});
