import { Effect } from "effect";
import {
  CURRENT_SCHEMA_VERSION,
  deriveInboxItemId,
  extractMentionTags,
  makeIssueFrontmatter,
  makeTicketDocument,
  normalizeKey,
  stripUndefined,
  updateTicketDocument,
  type Actor,
  type InboxItem,
  type InboxReason,
  type IssueFrontmatter,
  type LinkedRecord,
  type MaterializationWarning,
  type TicketDocument,
  type TicketDraftDocument,
  type UserProfileDocument,
} from "./domain/index.ts";
import { DatabaseEventFoldError, type DatabaseFailure } from "./DatabaseErrors.ts";
import {
  commentPayloadBody,
  elapsedMs,
  nowIso,
  parseCycleRepositoryMetadata,
  parseIssueTemplate,
  parseLabelDefinition,
  parseRecord,
  parseSavedView,
  parseUserProfile,
  storage,
  ticketIdFromRecordId,
  validateTicketSync,
  warning,
} from "./internals/DatabaseHelpers.ts";
import type {
  CommitChange,
  DatabaseEventPayload,
  EventContext,
  FoldedEvents,
  InboxSourceEvent,
  InboxSourceEventInput,
  MaterializationTrace,
  RepositoryRuntime,
} from "./internals/DatabaseRuntime.ts";
import { Projection } from "./Projection.ts";
import type { RepositorySnapshot } from "./RepositoryStore.ts";

export const buildMaterialization = (
  projection: Projection,
  repository: RepositoryRuntime,
  previousSnapshotId: string | null,
  currentSnapshotId: string,
  trace?: MaterializationTrace,
) =>
  Effect.gen(function* () {
    let history = yield* readMaterializationHistory(
      projection,
      repository,
      previousSnapshotId,
      currentSnapshotId,
      trace,
    );
    const foldStartedAt = performance.now();
    let folded = yield* foldRepositoryEvents(repository, currentSnapshotId, trace, {
      history: history.snapshots,
      seed: history.fullRebuild
        ? emptyFoldedEvents()
        : seedIncrementalFoldedEvents(projection, repository.repositoryId),
      seedFromProjection: history.fullRebuild
        ? undefined
        : {
            projection,
            repositoryId: repository.repositoryId,
          },
    });

    if (!history.fullRebuild && folded.nonAdditiveEvents.length > 0) {
      if (trace !== undefined)
        yield* trace("sync materialization falling back to full rebuild", {
          nonAdditiveEvents: folded.nonAdditiveEvents.length,
          previousSnapshotId,
          snapshotId: currentSnapshotId,
        });
      history = {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: yield* storage(
          "read full event history",
          repository.store.history(currentSnapshotId),
        ),
      };
      folded = yield* foldRepositoryEvents(repository, currentSnapshotId, trace, {
        history: history.snapshots,
        seed: emptyFoldedEvents(),
      });
    }

    if (trace !== undefined)
      yield* trace("sync materialization fold completed", {
        foldMs: elapsedMs(foldStartedAt),
        fullRebuild: history.fullRebuild,
        labels: folded.labels.size,
        replayedCommits: history.snapshots.length,
        records: folded.records.size,
        templates: folded.templates.size,
        tickets: folded.tickets.size,
        users: folded.users.size,
        views: folded.views.size,
        warnings: folded.warnings.length,
      });

    const assembleStartedAt = performance.now();
    const ticketValues = history.fullRebuild
      ? [...folded.tickets.values()]
      : valuesForIds(folded.tickets, folded.changedTickets);
    const recordValues = history.fullRebuild
      ? [...folded.records.values()]
      : valuesForIds(folded.records, folded.changedRecords);
    const userValues = history.fullRebuild
      ? [...folded.users.values()]
      : valuesForIds(folded.users, folded.changedUsers);
    const labelValues = history.fullRebuild
      ? [...folded.labels.values()]
      : valuesForIds(folded.labels, folded.changedLabels);
    const viewValues = history.fullRebuild
      ? [...folded.views.values()]
      : valuesForIds(folded.views, folded.changedViews);
    const templateValues = history.fullRebuild
      ? [...folded.templates.values()]
      : valuesForIds(folded.templates, folded.changedTemplates);
    const tickets = ticketValues.map((ticket) => ({
      path: eventAggregatePath(repository, "ticket", ticket.id),
      value: ticket,
    }));
    const records = recordValues.map((record) => ({
      path: eventAggregatePath(repository, "record", record.id),
      value: record,
    }));
    const users = userValues.map((user) => ({
      path: eventAggregatePath(repository, "user", user.id),
      value: user,
    }));
    const labels = labelValues.map((label) => ({
      path: eventAggregatePath(repository, "label", label.id),
      value: label,
    }));
    const views = viewValues.map((view) => ({
      path: eventAggregatePath(repository, "view", view.id),
      value: view,
    }));
    const templates = templateValues.map((template) => ({
      path: eventAggregatePath(repository, "template", template.id),
      value: template,
    }));
    const warnings = [...folded.warnings];
    const now = nowIso();

    const ticketIds = new Set(folded.tickets.keys());
    for (const ticket of folded.tickets.values()) {
      for (const childId of ticket.frontmatter.children ?? []) {
        if (ticketIds.has(childId)) continue;

        warnings.push(
          warning(
            repository.repositoryId,
            currentSnapshotId,
            eventAggregatePath(repository, "ticket", ticket.id),
            "ticket",
            ticket.id,
            new Error(`unknown child issue id: ${childId}`),
            now,
            "unknown-child-issue",
          ),
        );
      }
    }
    if (trace !== undefined)
      yield* trace("sync materialization documents assembled", {
        assembleMs: elapsedMs(assembleStartedAt),
        labels: labels.length,
        records: records.length,
        templates: templates.length,
        tickets: tickets.length,
        users: users.length,
        views: views.length,
        warnings: warnings.length,
      });

    const commitsStartedAt = performance.now();
    const commits = buildCommitRows(repository, history.snapshots, history.sequenceStart);
    if (trace !== undefined)
      yield* trace("sync materialization commits built", {
        commits: commits.length,
        commitsMs: elapsedMs(commitsStartedAt),
      });

    const commitChangesStartedAt = performance.now();
    const commitChanges = folded.commitChanges;
    if (trace !== undefined)
      yield* trace("sync materialization commit changes built", {
        commitChanges: commitChanges.length,
        commitChangesMs: elapsedMs(commitChangesStartedAt),
      });

    const inboxStartedAt = performance.now();
    const inboxUsers = history.fullRebuild
      ? [...folded.users.values()]
      : mergeUsers(
          userValues,
          projection.usersByRecipientLookupKeys(
            repository.repositoryId,
            inboxRecipientLookupKeys(folded),
          ),
        );
    const inboxItems = deriveInboxItems(repository.repositoryId, folded, inboxUsers);
    if (trace !== undefined)
      yield* trace("sync materialization inbox derived", {
        inboxItems: inboxItems.length,
        inboxMs: elapsedMs(inboxStartedAt),
        users: inboxUsers.length,
      });

    return {
      commitChanges,
      commits,
      cycleMetadata: folded.cycleMetadata,
      deletedRecords: history.fullRebuild ? [] : [...folded.deletedRecords],
      deletedTickets: history.fullRebuild ? [] : [...folded.deletedTickets],
      deletedLabels: history.fullRebuild ? [] : [...folded.deletedLabels],
      deletedTemplates: history.fullRebuild ? [] : [...folded.deletedTemplates],
      deletedUsers: history.fullRebuild ? [] : [...folded.deletedUsers],
      deletedViews: history.fullRebuild ? [] : [...folded.deletedViews],
      fullRebuild: history.fullRebuild,
      inboxItems,
      labels,
      records,
      templates,
      tickets,
      users,
      views,
      warnings,
    };
  });

export const readMaterializationHistory = (
  projection: Projection,
  repository: RepositoryRuntime,
  previousSnapshotId: string | null,
  currentSnapshotId: string,
  trace?: MaterializationTrace,
): Effect.Effect<
  {
    readonly fullRebuild: boolean;
    readonly sequenceStart: number;
    readonly snapshots: ReadonlyArray<RepositorySnapshot>;
  },
  DatabaseFailure
> =>
  Effect.gen(function* () {
    if (previousSnapshotId === null) {
      const history = yield* storage(
        "read full event history",
        repository.store.history(currentSnapshotId),
      );
      if (trace !== undefined)
        yield* trace("sync materialization selected full rebuild", {
          commits: history.length,
          reason: "no-previous-snapshot",
          snapshotId: currentSnapshotId,
        });

      return {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: history,
      };
    }

    const incremental = yield* readHistorySince(repository, currentSnapshotId, previousSnapshotId);

    if (!incremental.reachedPrevious) {
      if (trace !== undefined)
        yield* trace("sync materialization selected full rebuild", {
          commits: incremental.snapshots.length,
          previousSnapshotId,
          reason: "previous-snapshot-not-in-history",
          snapshotId: currentSnapshotId,
        });

      return {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: incremental.snapshots,
      };
    }

    const sequenceStart = projection.maxCommitSequence(repository.repositoryId);
    if (trace !== undefined)
      yield* trace("sync materialization selected incremental replay", {
        commits: incremental.snapshots.length,
        previousSequence: sequenceStart,
        previousSnapshotId,
        snapshotId: currentSnapshotId,
      });

    return {
      fullRebuild: false,
      sequenceStart,
      snapshots: incremental.snapshots,
    };
  });

export const readHistorySince = (
  repository: RepositoryRuntime,
  currentSnapshotId: string,
  previousSnapshotId: string,
): Effect.Effect<
  {
    readonly reachedPrevious: boolean;
    readonly snapshots: ReadonlyArray<RepositorySnapshot>;
  },
  DatabaseFailure
> =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    const stack = [currentSnapshotId];
    const snapshots: Array<RepositorySnapshot> = [];
    let reachedPrevious = false;

    while (stack.length > 0) {
      const id = stack.shift();

      if (id === undefined) continue;
      if (id === previousSnapshotId) {
        reachedPrevious = true;
        continue;
      }
      if (seen.has(id)) continue;

      seen.add(id);

      const snapshot = yield* storage("read repository snapshot", repository.store.snapshot(id));
      snapshots.push(snapshot);

      for (const parent of snapshot.parents) {
        if (parent === previousSnapshotId) {
          reachedPrevious = true;
          continue;
        }
        if (!seen.has(parent)) {
          stack.push(parent);
        }
      }
    }

    return {
      reachedPrevious,
      snapshots,
    };
  });

export const seedIncrementalFoldedEvents = (
  projection: Projection,
  repositoryId: string,
): FoldedEvents => {
  const folded = emptyFoldedEvents();
  const status = projection.repositoryStatus(repositoryId);

  folded.cycleMetadata = status.cycleMetadata;

  return folded;
};

export const valuesForIds = <A>(
  values: ReadonlyMap<string, A>,
  ids: ReadonlySet<string>,
): ReadonlyArray<A> =>
  [...ids].flatMap((id) => {
    const value = values.get(id);

    return value === undefined ? [] : [value];
  });

export const emptyFoldedEvents = (): FoldedEvents => ({
  changedLabels: new Set(),
  changedRecords: new Set(),
  changedTemplates: new Set(),
  changedTickets: new Set(),
  changedUsers: new Set(),
  changedViews: new Set(),
  commitChanges: [],
  deletedLabels: new Set(),
  deletedRecords: new Set(),
  deletedTemplates: new Set(),
  deletedTickets: new Set(),
  deletedUsers: new Set(),
  deletedViews: new Set(),
  drafts: new Map(),
  inboxSources: [],
  labels: new Map(),
  nonAdditiveEvents: [],
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
      readonly projection: Projection;
      readonly repositoryId: string;
    };
  } = {},
): Effect.Effect<FoldedEvents, DatabaseFailure> =>
  Effect.gen(function* () {
    const currentSnapshotId =
      snapshotId ??
      (yield* storage("resolve current snapshot", repository.store.resolveSnapshotId()));

    if (currentSnapshotId === null) return emptyFoldedEvents();

    const historyStartedAt = performance.now();
    const history =
      options.history ??
      (yield* storage("read event history", repository.store.history(currentSnapshotId)));
    if (trace !== undefined)
      yield* trace("sync event history read", {
        commits: history.length,
        historyMs: elapsedMs(historyStartedAt),
        snapshotId: currentSnapshotId,
      });
    const folded = options.seed ?? emptyFoldedEvents();
    const warnings: Array<MaterializationWarning> = [...folded.warnings];
    let documentsRead = 0;
    let introducedEvents = 0;
    let processedCommits = 0;
    const foldStartedAt = performance.now();

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
      const timestamp = snapshot.createdAt ?? nowIso();
      const actor = actorFromSnapshot(snapshot);

      for (const event of introduced) {
        if (event.change.newObjectId === undefined) {
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
              nowIso(),
              "event-deleted",
            ),
          );
          continue;
        }

        if (event.change.oldObjectId !== undefined) {
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
              nowIso(),
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

        yield* Effect.try({
          try: () => {
            const payload = document.json();

            if (options.seedFromProjection !== undefined) {
              seedFoldedEventFromProjection(
                folded,
                options.seedFromProjection.projection,
                options.seedFromProjection.repositoryId,
                event.aggregateType,
                event.aggregateId,
                payload,
              );
            }

            applyDatabaseEvent(folded, event.aggregateType, event.aggregateId, payload, {
              actor,
              path: event.path,
              snapshotId: snapshot.id,
              timestamp,
            });
          },
          catch: (cause) => new DatabaseEventFoldError({ cause }),
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              warnings.push(
                warning(
                  repository.repositoryId,
                  snapshot.id,
                  event.path,
                  event.aggregateType,
                  event.aggregateId,
                  error.cause,
                  nowIso(),
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
            foldMs: elapsedMs(foldStartedAt),
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
  projection: Projection,
  repositoryId: string,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
): void => {
  if (payload === null || typeof payload !== "object") return;

  const event = payload as Partial<DatabaseEventPayload>;
  const seedTicket = (ticketId: string): void => {
    if (folded.tickets.has(ticketId)) return;

    const ticket = projection.getTicket(repositoryId, ticketId);
    if (ticket !== null) {
      folded.tickets.set(ticketId, ticket);
    }
  };

  if (
    aggregateType === "ticket" &&
    (event.op === "ticket.replace" ||
      event.op === "ticket.update" ||
      event.op === "ticket.archive" ||
      event.op === "ticket.delete" ||
      event.op === "ticket.restore")
  ) {
    seedTicket(aggregateId);
    return;
  }

  if (event.op === "record.add") {
    const record = event.value as Partial<LinkedRecord> | undefined;

    if (record !== undefined && typeof record.issueId === "string") {
      seedTicket(record.issueId);
    }
  }
};

export const applyDatabaseEvent = (
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

export const pushInboxSource = (folded: FoldedEvents, source: InboxSourceEventInput): void => {
  folded.inboxSources.push({
    ...source,
    sequence: folded.inboxSources.length + 1,
  } as InboxSourceEvent);
};

export type InboxRecipient = {
  readonly user: UserProfileDocument;
  readonly userId: string;
};

export const mergeUsers = (
  ...groups: ReadonlyArray<ReadonlyArray<UserProfileDocument>>
): ReadonlyArray<UserProfileDocument> => {
  const users = new Map<string, UserProfileDocument>();

  for (const group of groups) {
    for (const user of group) {
      users.set(user.id, user);
    }
  }

  return [...users.values()];
};

export const inboxRecipientLookupKeys = (folded: FoldedEvents): ReadonlyArray<string> => {
  const keys = new Set<string>();
  const add = (value: string | undefined): void => {
    if (value === undefined) return;
    for (const key of recipientLookupKeys(value)) {
      keys.add(key);
    }
  };
  const addActor = (actor: Actor | undefined): void => {
    add(actor?.email);
    add(actor?.name);
  };

  for (const source of folded.inboxSources) {
    if (
      source.op === "ticket.create" ||
      source.op === "ticket.update" ||
      source.op === "ticket.replace"
    ) {
      for (const mention of extractMentionTags(ticketMentionText(source.after))) {
        add(mention.normalized);
      }
      add(inboxAssigneeValue(source.after));
      continue;
    }

    if (source.op === "record.add" && normalizeKey(source.record.recordType) === "comment") {
      const ticket = source.ticket ?? folded.tickets.get(source.record.issueId);
      const body = commentPayloadBody(source.record.payload);

      for (const mention of extractMentionTags(body)) {
        add(mention.normalized);
      }
      if (ticket !== undefined && ticket !== null) {
        add(inboxAssigneeValue(ticket));
        addActor(ticket.frontmatter.createdBy);
      }
    }
  }

  return [...keys];
};

export const deriveInboxItems = (
  repositoryId: string,
  folded: FoldedEvents,
  users: ReadonlyArray<UserProfileDocument>,
): ReadonlyArray<InboxItem> => {
  const resolver = makeInboxRecipientResolver(users);
  const items = new Map<string, InboxItem>();

  const addItem = (
    source: InboxSourceEvent,
    recipient: InboxRecipient,
    reason: InboxReason,
    ticket: TicketDocument,
    options: {
      readonly bodyExcerpt?: string;
      readonly mention?: string;
      readonly recordId?: string;
    } = {},
  ): void => {
    if (!ticketActive(ticket)) return;
    if (sourceAuthoredByRecipient(source, recipient.userId)) return;

    const itemId = deriveInboxItemId({
      eventPath: source.eventPath,
      reason,
      recordId: options.recordId,
      repositoryId,
      ticketId: ticket.id,
      userId: recipient.userId,
    });
    const metadata = stripUndefined({
      actorUnknown: source.actor === undefined,
      mention: options.mention,
      sourceOperation: source.op,
    }) as Readonly<Record<string, unknown>>;

    if (items.has(itemId)) return;

    items.set(
      itemId,
      stripUndefined({
        actorEmail: source.actor?.email,
        actorName: source.actor?.name,
        bodyExcerpt: options.bodyExcerpt,
        createdAt: source.timestamp,
        eventPath: source.eventPath,
        itemId,
        metadataJson: JSON.stringify(metadata),
        reason,
        recordId: options.recordId,
        repositoryId,
        sequence: source.sequence,
        snapshotId: source.snapshotId,
        ticketId: ticket.id,
        title: ticket.title,
        userId: recipient.userId,
      }) as InboxItem,
    );
  };

  for (const source of folded.inboxSources) {
    if (
      source.op === "ticket.create" ||
      source.op === "ticket.update" ||
      source.op === "ticket.replace"
    ) {
      const beforeMentions =
        source.before === null ? new Set<string>() : mentionSet(ticketMentionText(source.before));
      const afterMentions = extractMentionTags(ticketMentionText(source.after));

      for (const mention of afterMentions) {
        if (beforeMentions.has(mention.normalized)) continue;
        for (const recipient of resolver.resolveMention(mention.normalized)) {
          addItem(source, recipient, "mention", source.after, {
            bodyExcerpt: excerptForTicket(source.after),
            mention: mention.tag,
          });
        }
      }

      const beforeAssignee = source.before === null ? undefined : inboxAssigneeValue(source.before);
      const afterAssignee = inboxAssigneeValue(source.after);

      if (afterAssignee !== undefined && afterAssignee !== beforeAssignee) {
        for (const recipient of resolver.resolveAssignee(afterAssignee)) {
          addItem(source, recipient, "assigned", source.after, {
            bodyExcerpt: excerptForTicket(source.after),
          });
        }
      }

      continue;
    }

    if (source.op === "record.add" && normalizeKey(source.record.recordType) === "comment") {
      const ticket = source.ticket ?? folded.tickets.get(source.record.issueId);
      if (ticket === undefined || ticket === null) continue;

      const body = commentPayloadBody(source.record.payload);
      const excerpt = excerptForText(body);

      for (const mention of extractMentionTags(body)) {
        for (const recipient of resolver.resolveMention(mention.normalized)) {
          addItem(source, recipient, "mention", ticket, {
            bodyExcerpt: excerpt,
            mention: mention.tag,
            recordId: source.record.id,
          });
        }
      }

      const assignee = inboxAssigneeValue(ticket);
      if (assignee !== undefined) {
        for (const recipient of resolver.resolveAssignee(assignee)) {
          addItem(source, recipient, "comment_assigned", ticket, {
            bodyExcerpt: excerpt,
            recordId: source.record.id,
          });
        }
      }

      for (const recipient of resolver.resolveActor(ticket.frontmatter.createdBy)) {
        addItem(source, recipient, "comment_created", ticket, {
          bodyExcerpt: excerpt,
          recordId: source.record.id,
        });
      }
    }
  }

  return [...items.values()].sort(
    (a, b) => a.sequence - b.sequence || a.itemId.localeCompare(b.itemId),
  );
};

export const makeInboxRecipientResolver = (users: ReadonlyArray<UserProfileDocument>) => {
  const lookup = new Map<string, Map<string, UserProfileDocument>>();

  const add = (key: string, user: UserProfileDocument): void => {
    for (const normalized of recipientLookupKeys(key)) {
      const current = lookup.get(normalized) ?? new Map<string, UserProfileDocument>();
      current.set(user.id, user);
      lookup.set(normalized, current);
    }
  };

  for (const user of users) {
    if (user.disabledAt !== undefined) continue;

    add(user.id, user);
    add(user.email, user);
    add(user.displayName, user);
    for (const alias of user.aliases ?? []) {
      add(alias, user);
    }
  }

  const resolve = (value: string | undefined): ReadonlyArray<InboxRecipient> => {
    if (value === undefined) return [];

    const matches = new Map<string, UserProfileDocument>();
    for (const key of recipientLookupKeys(value)) {
      for (const [userId, user] of lookup.get(key) ?? []) {
        matches.set(userId, user);
      }
    }

    if (matches.size !== 1) return [];

    const [entry] = matches;
    if (entry === undefined) return [];

    return [{ user: entry[1], userId: entry[0] }];
  };

  return {
    resolveActor: (actor: Actor): ReadonlyArray<InboxRecipient> =>
      resolve(actor.email ?? actor.name),
    resolveAssignee: resolve,
    resolveMention: resolve,
  };
};

export const recipientLookupKeys = (value: string): ReadonlyArray<string> => {
  const raw = value.trim().replace(/^@/u, "").toLowerCase();
  if (raw.length === 0) return [];

  const keys = new Set<string>([raw, normalizeKey(raw)]);

  if (/\s/u.test(raw)) {
    keys.add(raw.replace(/\s+/gu, "."));
    keys.add(raw.replace(/\s+/gu, "-"));
    keys.add(raw.replace(/\s+/gu, ""));
  }

  return [...keys].filter((key) => key.length > 0 && key !== "none");
};

export const ticketMentionText = (ticket: TicketDocument): string =>
  `${ticket.title}\n${ticket.body}`;

export const mentionSet = (value: string): Set<string> =>
  new Set(extractMentionTags(value).map((mention) => mention.normalized));

export const inboxAssigneeValue = (ticket: TicketDocument): string | undefined => {
  const value = ticket.frontmatter.assignee ?? ticket.assignee;
  if (value === null || value === undefined) return undefined;

  const normalized = String(value).trim();
  return normalized.length === 0 || normalizeKey(normalized) === "none" ? undefined : normalized;
};

export const ticketActive = (ticket: TicketDocument): boolean =>
  ticket.archivedAt === undefined && ticket.deletedAt === undefined;

export const sourceAuthoredByRecipient = (source: InboxSourceEvent, userId: string): boolean => {
  const actorEmail = source.actor?.email?.trim().toLowerCase();
  return actorEmail !== undefined && actorEmail === userId.toLowerCase();
};

export const excerptForTicket = (ticket: TicketDocument): string | undefined =>
  excerptForText(ticket.body);

export const excerptForText = (value: string): string | undefined => {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length === 0) return undefined;
  if (compact.length <= 180) return compact;

  return `${compact.slice(0, 177).trimEnd()}...`;
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
