import type { Actor, LinkedRecord } from "@cycle/contracts/schemas";

export type MaterializedIssueComment = {
  readonly archived: boolean;
  readonly body: string;
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly id: string;
  readonly parentCommentId?: string;
  readonly reactions: readonly {
    readonly active: boolean;
    readonly count: number;
    readonly emoji: string;
  }[];
};

type MutableIssueComment = {
  archived: boolean;
  body: string;
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly id: string;
  readonly parentCommentId?: string;
  readonly reactionActors: Map<string, Set<string>>;
};

const payloadRecord = (record: LinkedRecord): Readonly<Record<string, unknown>> | undefined =>
  record.payload !== null && typeof record.payload === "object"
    ? (record.payload as Readonly<Record<string, unknown>>)
    : undefined;

const payloadString = (record: LinkedRecord, key: string): string | undefined => {
  const value = payloadRecord(record)?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

export const actorKey = (actor: Actor): string =>
  `${actor.email ?? ""}:${actor.provider ?? ""}:${actor.type}:${actor.name}`;

export const materializeIssueCommentRecords = (
  records: readonly LinkedRecord[],
  viewer: Actor,
): readonly MaterializedIssueComment[] => {
  const comments = new Map<string, MutableIssueComment>();
  const orderedRecords = [...records].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );

  for (const record of orderedRecords) {
    if (record.recordType === "comment") {
      const body = payloadString(record, "body");
      if (body === undefined) continue;
      comments.set(record.id, {
        archived: false,
        body,
        createdAt: record.createdAt,
        createdBy: record.createdBy,
        id: record.id,
        ...(payloadString(record, "parentCommentId") === undefined
          ? {}
          : { parentCommentId: payloadString(record, "parentCommentId") }),
        reactionActors: new Map(),
      });
      continue;
    }

    const commentId = payloadString(record, "commentId");
    if (commentId === undefined) continue;
    const comment = comments.get(commentId);
    if (comment === undefined) continue;

    if (record.recordType === "comment.edit") {
      const body = payloadString(record, "body");
      if (body !== undefined) comment.body = body;
      continue;
    }

    if (record.recordType === "comment.archive") {
      comment.archived = true;
      continue;
    }

    if (record.recordType === "comment.reaction") {
      const emoji = payloadString(record, "emoji");
      if (emoji === undefined) continue;
      const actors = comment.reactionActors.get(emoji) ?? new Set<string>();
      const reactingActor = actorKey(record.createdBy);
      if (payloadString(record, "operation") === "remove") actors.delete(reactingActor);
      else actors.add(reactingActor);
      comment.reactionActors.set(emoji, actors);
    }
  }

  const viewerKey = actorKey(viewer);
  return [...comments.values()].map(({ reactionActors, ...comment }) => ({
    ...comment,
    reactions: [...reactionActors.entries()]
      .filter(([, actors]) => actors.size > 0)
      .map(([emoji, actors]) => ({
        active: actors.has(viewerKey),
        count: actors.size,
        emoji,
      })),
  }));
};

const readableRecordType = (recordType: string): string => recordType.replace(/[._-]+/gu, " ");

export const issueRecordActivityBody = (record: LinkedRecord): string | undefined => {
  const commentId = payloadString(record, "commentId");
  switch (record.recordType) {
    case "comment":
      return undefined;
    case "comment.edit":
      return `edited comment ${commentId ?? ""}`.trim();
    case "comment.archive":
      return `archived comment ${commentId ?? ""}`.trim();
    case "comment.reaction":
      return `reacted ${payloadString(record, "emoji") ?? ""} to comment ${commentId ?? ""}`.replace(
        /\s+/gu,
        " ",
      );
    case "archive":
      return "archived the issue";
    case "delete":
      return "deleted the issue";
    case "restore":
      return "restored the issue";
    case "relation-change":
      return "changed issue relationships";
    case "status-change":
      return "changed the issue status";
    case "initiative-update":
      return "updated initiative progress";
    case "provenance":
      return "recorded issue provenance";
    default:
      return `recorded ${readableRecordType(record.recordType)}`;
  }
};
