import type { Actor } from "../../domain/index.ts";
import { ticketIdFromRecordId } from "../commands/RecordDocuments.ts";
import type { CommitChange, FoldedEvents, RepositoryRuntime } from "../DatabaseRuntime.ts";
import type { RepositorySnapshot } from "../../RepositoryStore.ts";
export const actorFromSnapshot = (snapshot: {
  readonly author?: { readonly email?: string; readonly name?: string };
  readonly committer?: { readonly email?: string; readonly name?: string };
}): Actor | undefined => {
  const identity = snapshot.author ?? snapshot.committer;

  if (identity?.name === undefined) return undefined;

  return {
    email: identity.email,
    name: identity.name,
    type: identity.email === undefined ? "agent" : "human",
  };
};

export const buildCommitRows = (
  repository: RepositoryRuntime,
  history: ReadonlyArray<RepositorySnapshot>,
  sequenceStart: number,
) =>
  history
    .slice()
    .reverse()
    .map((snapshot, index) => ({
      authorEmail: snapshot.author?.email,
      authorName: snapshot.author?.name,
      committedAt: snapshot.createdAt,
      committerEmail: snapshot.committer?.email,
      committerName: snapshot.committer?.name,
      message: snapshot.message,
      parentIds: snapshot.parents,
      repositoryId: repository.repositoryId,
      rootTreeId: snapshot.root,
      sequence: sequenceStart + index + 1,
      snapshotId: snapshot.id,
    }));

export const changeTypeFromDiff = (change: {
  readonly newObjectId?: string;
  readonly oldObjectId?: string;
}): "added" | "deleted" | "modified" =>
  change.newObjectId === undefined
    ? "deleted"
    : change.oldObjectId === undefined
      ? "added"
      : "modified";

export const eventPathChange = (
  repository: RepositoryRuntime,
  changeType: "added" | "deleted" | "modified",
  path: string,
): CommitChange => {
  const event = repository.store.parseEventPath(path);

  return {
    changeType,
    objectId: event?.aggregateId,
    objectType: event?.aggregateType ?? "unknown",
    path,
    ticketId:
      event?.aggregateType === "ticket"
        ? event.aggregateId
        : event?.aggregateType === "record"
          ? ticketIdFromRecordId(event.aggregateId)
          : undefined,
  };
};

export const associateCommentCommitChange = (
  folded: FoldedEvents,
  eventPath: string,
  payload: unknown,
): void => {
  if (payload === null || typeof payload !== "object") return;

  const event = payload as {
    readonly op?: unknown;
    readonly value?: {
      readonly target?: { readonly resourceId?: unknown; readonly resourceKind?: unknown };
    };
  };
  if (
    event.op !== "comment.add" ||
    event.value?.target?.resourceKind !== "ticket" ||
    typeof event.value.target.resourceId !== "string"
  ) {
    return;
  }

  const index = folded.commitChanges.length - 1;
  const commit = folded.commitChanges[index];
  if (commit === undefined) return;

  folded.commitChanges[index] = {
    ...commit,
    changes: commit.changes.map((change) =>
      change.path === eventPath
        ? { ...change, ticketId: event.value?.target?.resourceId as string }
        : change,
    ),
  };
};
