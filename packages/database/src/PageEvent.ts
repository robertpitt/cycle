import {
  Actor,
  CommentDocument,
  IsoDateTimeString,
  PageDocument,
  PageState,
  type PageHistoryEntry,
} from "@cycle/contracts/schemas";
import { Schema } from "effect";
import type { EventContext, FoldedEvents, PageHistoryProjection } from "./internals/DatabaseRuntime.ts";

const PageEventBase = {
  actor: Actor,
  humanApproved: Schema.optional(Schema.Boolean),
  timestamp: IsoDateTimeString,
} as const;

export const PageEventPayload = Schema.Union([
  Schema.Struct({
    ...PageEventBase,
    op: Schema.Literal("page.create"),
    value: PageState,
  }),
  Schema.Struct({
    ...PageEventBase,
    op: Schema.Literal("page.replace"),
    value: PageState,
  }),
  Schema.Struct({
    ...PageEventBase,
    op: Schema.Literal("page.archive"),
    reason: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...PageEventBase,
    op: Schema.Literal("page.restore"),
    reason: Schema.optional(Schema.String),
  }),
]);

export type PageEventPayload = typeof PageEventPayload.Type;

export const CommentEventPayload = Schema.Struct({
  humanApproved: Schema.optional(Schema.Boolean),
  op: Schema.Literal("comment.add"),
  value: CommentDocument,
});

export type CommentEventPayload = typeof CommentEventPayload.Type;

const sameActor = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const pagePathOwner = (
  pages: ReadonlyMap<string, typeof PageDocument.Type>,
  path: string,
  exceptPageId?: string,
): string | undefined => {
  for (const page of pages.values()) {
    if (page.id !== exceptPageId && page.path === path) return page.id;
  }

  return undefined;
};

const assertEventState = (
  event: Extract<PageEventPayload, { readonly value: unknown }>,
  aggregateId: string,
  repositoryId: string,
): typeof PageDocument.Type => {
  if (event.value.id !== aggregateId || event.value.frontmatter.id !== aggregateId) {
    throw new Error("Page event aggregate id does not match Page state");
  }
  if (event.value.repositoryId !== repositoryId) {
    throw new Error("Page event repository does not match materialized repository");
  }
  if (
    event.value.frontmatter.updatedAt !== event.timestamp ||
    !sameActor(event.value.frontmatter.updatedBy, event.actor)
  ) {
    throw new Error("Page event actor or timestamp does not match Page state");
  }

  return Schema.decodeUnknownSync(PageDocument)({
    ...event.value,
    revisionId: "0000000000000000000000000000000000000000",
  });
};

const historyRecord = (
  event: PageEventPayload,
  page: typeof PageDocument.Type,
  context: EventContext,
): PageHistoryProjection => ({
  actor: event.actor,
  committedAt: event.timestamp,
  message: context.message,
  operation: event.op,
  pageId: page.id,
  parentIds: context.parentIds,
  path: page.path,
  repositoryId: context.repositoryId,
  snapshotId: context.snapshotId,
});

export const applyPageEvent = (
  folded: FoldedEvents,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
  context: EventContext,
): boolean => {
  if (aggregateType !== "page") return false;
  if (folded.invalidPages.has(aggregateId)) return true;

  const event = Schema.decodeUnknownSync(PageEventPayload)(payload);
  const current = folded.pages.get(aggregateId);

  switch (event.op) {
    case "page.create": {
      if (current !== undefined) throw new Error(`Page already exists: ${aggregateId}`);

      const decoded = assertEventState(event, aggregateId, context.repositoryId);
      if (decoded.frontmatter.archivedAt !== undefined || decoded.frontmatter.archivedBy !== undefined) {
        throw new Error("A created Page must be active");
      }

      const owner = pagePathOwner(folded.pages, decoded.path);
      if (owner !== undefined) throw new Error(`Page path is already reserved by ${owner}`);

      const page = { ...decoded, revisionId: context.snapshotId };
      folded.pages.set(aggregateId, page);
      folded.changedPages.add(aggregateId);
      folded.pageHistory.push(historyRecord(event, page, context));
      return true;
    }
    case "page.replace": {
      if (current === undefined) throw new Error(`Page does not exist: ${aggregateId}`);
      if (current.frontmatter.archivedAt !== undefined) throw new Error("Archived Page cannot be replaced");

      const decoded = assertEventState(event, aggregateId, context.repositoryId);
      if (
        decoded.frontmatter.createdAt !== current.frontmatter.createdAt ||
        !sameActor(decoded.frontmatter.createdBy, current.frontmatter.createdBy)
      ) {
        throw new Error("Page replacement changed immutable creation metadata");
      }
      if (decoded.frontmatter.archivedAt !== undefined || decoded.frontmatter.archivedBy !== undefined) {
        throw new Error("Page replacement cannot change archive state");
      }

      const owner = pagePathOwner(folded.pages, decoded.path, aggregateId);
      if (owner !== undefined) throw new Error(`Page path is already reserved by ${owner}`);

      const page = { ...decoded, revisionId: context.snapshotId };
      folded.pages.set(aggregateId, page);
      folded.changedPages.add(aggregateId);
      folded.pageHistory.push(historyRecord(event, page, context));
      return true;
    }
    case "page.archive": {
      if (current === undefined) throw new Error(`Page does not exist: ${aggregateId}`);
      if (current.frontmatter.archivedAt !== undefined) throw new Error("Page is already archived");

      const page = Schema.decodeUnknownSync(PageDocument)({
        ...current,
        frontmatter: {
          ...current.frontmatter,
          archivedAt: event.timestamp,
          archivedBy: event.actor,
          updatedAt: event.timestamp,
          updatedBy: event.actor,
        },
        revisionId: context.snapshotId,
      });
      folded.pages.set(aggregateId, page);
      folded.changedPages.add(aggregateId);
      folded.pageHistory.push(historyRecord(event, page, context));
      return true;
    }
    case "page.restore": {
      if (current === undefined) throw new Error(`Page does not exist: ${aggregateId}`);
      if (current.frontmatter.archivedAt === undefined) throw new Error("Page is already active");

      const { archivedAt: _archivedAt, archivedBy: _archivedBy, ...active } = current.frontmatter;
      const page = Schema.decodeUnknownSync(PageDocument)({
        ...current,
        frontmatter: {
          ...active,
          updatedAt: event.timestamp,
          updatedBy: event.actor,
        },
        revisionId: context.snapshotId,
      });
      folded.pages.set(aggregateId, page);
      folded.changedPages.add(aggregateId);
      folded.pageHistory.push(historyRecord(event, page, context));
      return true;
    }
  }
};

export const applyCommentEvent = (
  folded: FoldedEvents,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
  context: EventContext,
): boolean => {
  if (aggregateType !== "comment") return false;

  const event = Schema.decodeUnknownSync(CommentEventPayload)(payload);
  const comment = event.value;

  if (comment.id !== aggregateId) throw new Error("Comment aggregate id does not match document");
  if (
    comment.repositoryId !== context.repositoryId ||
    comment.target.repositoryId !== context.repositoryId
  ) {
    throw new Error("Comment target repository does not match materialized repository");
  }
  if (comment.target.resourceKind === "page") {
    if (!folded.pages.has(comment.target.resourceId)) throw new Error("Comment Page target is missing");
  } else if (comment.target.resourceKind === "ticket") {
    if (!folded.tickets.has(comment.target.resourceId)) {
      throw new Error("Comment ticket target is missing");
    }
  } else {
    throw new Error("Comment target kind is unsupported");
  }

  folded.comments.set(comment.id, comment);
  folded.changedComments.add(comment.id);
  return true;
};

export const pageHistoryOperation = (
  value: string,
): value is PageHistoryEntry["operation"] =>
  value === "page.create" ||
  value === "page.replace" ||
  value === "page.archive" ||
  value === "page.restore";
