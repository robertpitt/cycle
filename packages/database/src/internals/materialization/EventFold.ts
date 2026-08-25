import type { CommentDocument } from "@cycle/contracts/schemas";
import { Clock, Effect } from "effect";
import { DatabaseEventFoldError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  CURRENT_SCHEMA_VERSION,
  makeIssueFrontmatter,
  makeTicketDocument,
  normalizeKey,
  updateTicketDocument,
  type IssueFrontmatter,
  type LinkedRecord,
  type MaterializationWarning,
  type TicketDocument,
  type TicketDraftDocument,
} from "../../domain/index.ts";
import { commentPayloadBody, validateTicketSync } from "../commands/TicketCommandRules.ts";
import { elapsedMs, nowIso, storage } from "../DatabaseBoundary.ts";
import {
  parseCycleRepositoryMetadata,
  parseIssueTemplate,
  parseLabelDefinition,
  parseSavedView,
  parseUserProfile,
} from "../commands/CatalogDocuments.ts";
import { parseRecord } from "../commands/RecordDocuments.ts";
import { warning } from "./MaterializationWarning.ts";
import type {
  DatabaseEventPayload,
  EventContext,
  FoldedEvents,
  InboxSourceEvent,
  InboxSourceEventInput,
  MaterializationTrace,
  RepositoryRuntime,
} from "../DatabaseRuntime.ts";
import { applyCommentEvent, applyPageEvent } from "../../PageEvent.ts";
import type { RepositorySnapshot } from "../../RepositoryStore.ts";
import type { MaterializationProjectionReader } from "./MaterializationTypes.ts";
import {
  actorFromSnapshot,
  associateCommentCommitChange,
  changeTypeFromDiff,
  eventPathChange,
} from "./CommitProjection.ts";
export const emptyFoldedEvents = (): FoldedEvents => ({
  changedComments: new Set(),
  changedLabels: new Set(),
  changedPages: new Set(),
  changedRecords: new Set(),
  changedTemplates: new Set(),
  changedTickets: new Set(),
  changedUsers: new Set(),
  changedViews: new Set(),
  commitChanges: [],
  comments: new Map(),
  deletedLabels: new Set(),
  deletedRecords: new Set(),
  deletedTemplates: new Set(),
  deletedTickets: new Set(),
  deletedUsers: new Set(),
  deletedViews: new Set(),
  drafts: new Map(),
  inboxSources: [],
  invalidPages: new Set(),
  labels: new Map(),
  nonAdditiveEvents: [],
  pageHistory: [],
  pages: new Map(),
  records: new Map(),
  templates: new Map(),
  tickets: new Map(),
  users: new Map(),
  views: new Map(),
  warnings: [],
});

export const eventAggregatePath = (
  repository: RepositoryRuntime,
  aggregateType: string,
  aggregateId: string,
): string => repository.store.aggregatePath({ aggregateId, aggregateType });

export const foldRepositoryEvents = (
  repository: RepositoryRuntime,
  snapshotId?: string,
  trace?: MaterializationTrace,
  options: {
    readonly history?: ReadonlyArray<RepositorySnapshot>;
    readonly seed?: FoldedEvents;
    readonly seedFromProjection?: {
      readonly projection: MaterializationProjectionReader;
      readonly repositoryId: string;
    };
  } = {},
): Effect.Effect<FoldedEvents, DatabaseFailure> =>
  Effect.gen(function* () {
    const currentSnapshotId =
      snapshotId ??
      (yield* storage("resolve current snapshot", repository.store.resolveSnapshotId()));

    if (currentSnapshotId === null) return emptyFoldedEvents();

    const historyStartedAt = yield* Clock.currentTimeMillis;
    const history =
      options.history ??
      (yield* storage("read event history", repository.store.history(currentSnapshotId)));
    if (trace !== undefined)
      yield* trace("sync event history read", {
        commits: history.length,
        historyMs: elapsedMs(historyStartedAt, yield* Clock.currentTimeMillis),
        snapshotId: currentSnapshotId,
      });
    const folded = options.seed ?? emptyFoldedEvents();
    const warnings: Array<MaterializationWarning> = [...folded.warnings];
    let documentsRead = 0;
    let introducedEvents = 0;
    let processedCommits = 0;
    const foldStartedAt = yield* Clock.currentTimeMillis;

    for (const snapshot of history.slice().reverse()) {
      const introduced = yield* storage(
        "read introduced events",
        repository.store.introduced(snapshot),
      );
      introducedEvents += introduced.length;
      folded.commitChanges.push({
        changes: introduced.map((event) =>
          eventPathChange(repository, changeTypeFromDiff(event.change), event.path),
        ),
        repositoryId: repository.repositoryId,
        snapshotId: snapshot.id,
      });
      const timestamp = snapshot.createdAt ?? (yield* nowIso());
      const actor = actorFromSnapshot(snapshot);

      for (const event of introduced) {
        if (event.change.newObjectId === undefined) {
          if (event.aggregateType === "page") folded.invalidPages.add(event.aggregateId);
          folded.nonAdditiveEvents.push({
            path: event.path,
            reason: "event-deleted",
            snapshotId: snapshot.id,
          });
          warnings.push(
            warning(
              repository.repositoryId,
              snapshot.id,
              event.path,
              event.aggregateType,
              event.aggregateId,
              new Error("event file was deleted"),
              yield* nowIso(),
              "event-deleted",
            ),
          );
          continue;
        }

        if (event.change.oldObjectId !== undefined) {
          if (event.aggregateType === "page") folded.invalidPages.add(event.aggregateId);
          folded.nonAdditiveEvents.push({
            path: event.path,
            reason: "event-modified",
            snapshotId: snapshot.id,
          });
          warnings.push(
            warning(
              repository.repositoryId,
              snapshot.id,
              event.path,
              event.aggregateType,
              event.aggregateId,
              new Error("event file was modified"),
              yield* nowIso(),
              "event-modified",
            ),
          );
          continue;
        }

        const document = yield* storage(
          "read event document",
          repository.store.get(event.path, { from: snapshot.id }),
        );

        if (document === null) continue;
        documentsRead += 1;

        yield* Effect.gen(function* () {
          const payload = yield* Effect.try({
            try: () => document.json(),
            catch: (cause) => new DatabaseEventFoldError({ cause }),
          });

          associateCommentCommitChange(folded, event.path, payload);

          if (options.seedFromProjection !== undefined) {
            yield* seedFoldedEventFromProjection(
              folded,
              options.seedFromProjection.projection,
              options.seedFromProjection.repositoryId,
              event.aggregateType,
              event.aggregateId,
              payload,
            );
          }

          yield* applyDatabaseEvent(folded, event.aggregateType, event.aggregateId, payload, {
            actor,
            message: snapshot.message,
            parentIds: snapshot.parents,
            path: event.path,
            repositoryId: repository.repositoryId,
            snapshotId: snapshot.id,
            timestamp,
          }).pipe(Effect.mapError((cause) => new DatabaseEventFoldError({ cause })));
        }).pipe(
          Effect.catch((error) =>
            Effect.gen(function* () {
              if (event.aggregateType === "page") folded.invalidPages.add(event.aggregateId);
              warnings.push(
                warning(
                  repository.repositoryId,
                  snapshot.id,
                  event.path,
                  event.aggregateType,
                  event.aggregateId,
                  error.cause,
                  yield* nowIso(),
                ),
              );
            }),
          ),
        );
      }
      processedCommits += 1;
      if (processedCommits % 10 === 0 || processedCommits === history.length) {
        if (trace !== undefined)
          yield* trace("sync event fold progress", {
            commitsProcessed: processedCommits,
            commitsTotal: history.length,
            documentsRead,
            foldMs: elapsedMs(foldStartedAt, yield* Clock.currentTimeMillis),
            introducedEvents,
            labels: folded.labels.size,
            records: folded.records.size,
            tickets: folded.tickets.size,
            warnings: warnings.length,
          });
      }
    }

    return {
      ...folded,
      warnings,
    };
  });

export const seedFoldedEventFromProjection = (
  folded: FoldedEvents,
  projection: MaterializationProjectionReader,
  repositoryId: string,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
): Effect.Effect<void, DatabaseFailure> =>
  Effect.gen(function* () {
    if (payload === null || typeof payload !== "object") return;

    const event = payload as Partial<DatabaseEventPayload>;
    const seedTicket = Effect.fn("DatabaseMaterialization.seedTicket")(function* (
      ticketId: string,
    ) {
      if (folded.tickets.has(ticketId)) return;

      const ticket = yield* projection.tickets.getTicket(repositoryId, ticketId);
      if (ticket !== null) {
        folded.tickets.set(ticketId, ticket);
      }
    });
    const seedPage = Effect.fn("DatabaseMaterialization.seedPage")(function* (pageId: string) {
      if (folded.pages.has(pageId)) return;

      const page = yield* projection.pages.getPage(repositoryId, pageId);
      if (page !== null) folded.pages.set(pageId, page);
    });

    if (
      aggregateType === "page" &&
      (event.op === "page.replace" || event.op === "page.archive" || event.op === "page.restore")
    ) {
      yield* seedPage(aggregateId);
      return;
    }

    if (event.op === "comment.add") {
      const comment = event.value as
        | { readonly target?: { readonly resourceId?: unknown; readonly resourceKind?: unknown } }
        | undefined;
      const target = comment?.target;

      if (target?.resourceKind === "page" && typeof target.resourceId === "string") {
        yield* seedPage(target.resourceId);
      } else if (target?.resourceKind === "ticket" && typeof target.resourceId === "string") {
        yield* seedTicket(target.resourceId);
      }
      return;
    }

    if (
      aggregateType === "ticket" &&
      (event.op === "ticket.replace" ||
        event.op === "ticket.update" ||
        event.op === "ticket.archive" ||
        event.op === "ticket.delete" ||
        event.op === "ticket.restore")
    ) {
      yield* seedTicket(aggregateId);
      return;
    }

    if (event.op === "record.add") {
      const record = event.value as Partial<LinkedRecord> | undefined;

      if (record !== undefined && typeof record.issueId === "string") {
        yield* seedTicket(record.issueId);
      }
    }
  });

const applyDomainEvent = (
  folded: FoldedEvents,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
  context: EventContext,
): void => {
  if (payload === null || typeof payload !== "object") {
    throw new Error("event payload must be an object");
  }

  const event = payload as DatabaseEventPayload;

  switch (event.op) {
    case "repository.metadata.set": {
      folded.cycleMetadata = parseCycleRepositoryMetadata(event.value, context.timestamp);
      return;
    }
    case "ticket.create":
    case "ticket.replace": {
      const before = folded.tickets.get(aggregateId) ?? null;
      const ticket = parseTicketValue(event.value);

      folded.tickets.set(aggregateId, ticket);
      folded.deletedTickets.delete(aggregateId);
      folded.changedTickets.add(aggregateId);
      pushInboxSource(folded, {
        actor: context.actor,
        after: ticket,
        before,
        eventPath: context.path,
        op: event.op,
        snapshotId: context.snapshotId,
        timestamp: context.timestamp,
        ticketId: aggregateId,
      });
      return;
    }
    case "ticket.update": {
      const ticket = folded.tickets.get(aggregateId);

      if (ticket === undefined) throw new Error(`ticket does not exist: ${aggregateId}`);

      const next = applyTicketFieldUpdate(ticket, event.field, event.value);
      folded.tickets.set(aggregateId, next);
      folded.changedTickets.add(aggregateId);
      pushInboxSource(folded, {
        actor: context.actor,
        after: next,
        before: ticket,
        eventPath: context.path,
        field: event.field,
        op: "ticket.update",
        snapshotId: context.snapshotId,
        timestamp: context.timestamp,
        ticketId: aggregateId,
      });
      return;
    }
    case "ticket.archive": {
      const ticket = requireTicket(folded, aggregateId);
      const actor = context.actor ?? ticket.frontmatter.createdBy;

      folded.tickets.set(
        aggregateId,
        updateTicketDocument(ticket, {
          ...ticket.frontmatter,
          archivedAt: context.timestamp,
          archivedBy: actor,
          updatedAt: context.timestamp,
        }),
      );
      folded.changedTickets.add(aggregateId);
      return;
    }
    case "ticket.delete": {
      const ticket = requireTicket(folded, aggregateId);
      const actor = context.actor ?? ticket.frontmatter.createdBy;

      folded.tickets.set(
        aggregateId,
        updateTicketDocument(ticket, {
          ...ticket.frontmatter,
          deletedAt: context.timestamp,
          deletedBy: actor,
          updatedAt: context.timestamp,
        }),
      );
      folded.changedTickets.add(aggregateId);
      return;
    }
    case "ticket.restore": {
      const ticket = requireTicket(folded, aggregateId);

      folded.tickets.set(
        aggregateId,
        updateTicketDocument(ticket, {
          ...ticket.frontmatter,
          archivedAt: undefined,
          archivedBy: undefined,
          deletedAt: undefined,
          deletedBy: undefined,
          updatedAt: context.timestamp,
        }),
      );
      folded.changedTickets.add(aggregateId);
      return;
    }
    case "record.add": {
      const record = parseRecord(event.value);

      folded.records.set(record.id, record);
      folded.deletedRecords.delete(record.id);
      folded.changedRecords.add(record.id);
      if (normalizeKey(record.recordType) === "comment") {
        const comment: CommentDocument = {
          body: commentPayloadBody(record.payload),
          bodyFormat: "markdown",
          createdAt: record.createdAt,
          createdBy: record.createdBy,
          id: record.id,
          repositoryId: context.repositoryId,
          schemaVersion: 1,
          target: {
            repositoryId: context.repositoryId,
            resourceId: record.issueId,
            resourceKind: "ticket",
          },
        };
        folded.comments.set(comment.id, comment);
        folded.changedComments.add(comment.id);
      }
      pushInboxSource(folded, {
        actor: context.actor,
        eventPath: context.path,
        op: "record.add",
        record,
        snapshotId: context.snapshotId,
        timestamp: context.timestamp,
        ticket: folded.tickets.get(record.issueId) ?? null,
      });
      return;
    }
    case "draft.create":
    case "draft.update":
    case "draft.commit": {
      const draft = parseDraft(event.value);

      folded.drafts.set(draft.id, draft);
      return;
    }
    case "user.upsert": {
      const user = parseUserProfile(event.value);

      folded.users.set(user.id, user);
      folded.deletedUsers.delete(user.id);
      folded.changedUsers.add(user.id);
      return;
    }
    case "label.upsert": {
      const label = parseLabelDefinition(event.value);

      folded.labels.set(label.id, label);
      folded.deletedLabels.delete(label.id);
      folded.changedLabels.add(label.id);
      return;
    }
    case "view.upsert": {
      const view = parseSavedView(event.value);

      folded.views.set(view.id, view);
      folded.deletedViews.delete(view.id);
      folded.changedViews.add(view.id);
      return;
    }
    case "view.delete": {
      folded.views.delete(aggregateId);
      folded.changedViews.delete(aggregateId);
      folded.deletedViews.add(aggregateId);
      return;
    }
    case "template.upsert": {
      const template = parseIssueTemplate(event.value);

      folded.templates.set(template.id, template);
      folded.deletedTemplates.delete(template.id);
      folded.changedTemplates.add(template.id);
      return;
    }
  }

  throw new Error(
    `unsupported event operation: ${String((payload as { readonly op?: unknown }).op)}`,
  );
};

export const applyDatabaseEvent = Effect.fn("DatabaseMaterialization.applyDatabaseEvent")(
  function* (
    folded: FoldedEvents,
    aggregateType: string,
    aggregateId: string,
    payload: unknown,
    context: EventContext,
  ) {
    if (yield* applyPageEvent(folded, aggregateType, aggregateId, payload, context)) return;
    if (yield* applyCommentEvent(folded, aggregateType, aggregateId, payload, context)) return;
    yield* Effect.try({
      try: () => applyDomainEvent(folded, aggregateType, aggregateId, payload, context),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
  },
);

export const pushInboxSource = (folded: FoldedEvents, source: InboxSourceEventInput): void => {
  folded.inboxSources.push({
    ...source,
    sequence: folded.inboxSources.length + 1,
  } as InboxSourceEvent);
};

export const parseTicketValue = (input: unknown): TicketDocument => {
  if (input === null || typeof input !== "object") throw new Error("ticket must be an object");

  const value = input as Partial<TicketDocument>;

  if (value.frontmatter === undefined || typeof value.body !== "string") {
    throw new Error("ticket is missing required fields");
  }

  const ticket = makeTicketDocument(makeIssueFrontmatter(value.frontmatter), value.body);

  validateTicketSync(ticket);

  return ticket;
};

export const requireTicket = (folded: FoldedEvents, ticketId: string): TicketDocument => {
  const ticket = folded.tickets.get(ticketId);

  if (ticket === undefined) throw new Error(`ticket does not exist: ${ticketId}`);

  return ticket;
};

export const applyTicketFieldUpdate = (
  ticket: TicketDocument,
  field: keyof IssueFrontmatter | "body",
  value: unknown,
): TicketDocument => {
  if (field === "body")
    return updateTicketDocument(ticket, ticket.frontmatter, String(value ?? ""));

  const frontmatter = {
    ...ticket.frontmatter,
    [field]: value === null ? undefined : value,
  } as IssueFrontmatter;

  return updateTicketDocument(ticket, frontmatter);
};

export const parseDraft = (input: unknown): TicketDraftDocument => {
  if (input === null || typeof input !== "object") throw new Error("draft must be an object");

  const value = input as Partial<TicketDraftDocument>;

  if (
    typeof value.id !== "string" ||
    value.input === undefined ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    value.createdBy === undefined ||
    (value.status !== "open" && value.status !== "committed")
  ) {
    throw new Error("draft is missing required fields");
  }

  return {
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    id: value.id,
    input: value.input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    status: value.status,
    updatedAt: value.updatedAt,
  };
};
