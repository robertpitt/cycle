import { Clock, Effect } from "effect";
import { elapsedMs, nowIso, storage } from "./internals/DatabaseBoundary.ts";
import type { MaterializationTrace, RepositoryRuntime } from "./internals/DatabaseRuntime.ts";
import { buildCommitRows } from "./internals/materialization/CommitProjection.ts";
import {
  emptyFoldedEvents,
  eventAggregatePath,
  foldRepositoryEvents,
} from "./internals/materialization/EventFold.ts";
import {
  deriveInboxItems,
  inboxRecipientLookupKeys,
  mergeUsers,
} from "./internals/materialization/InboxDerivation.ts";
import {
  readMaterializationHistory,
  seedIncrementalFoldedEvents,
  valuesForIds,
} from "./internals/materialization/MaterializationHistory.ts";
import type { MaterializationProjectionReader } from "./internals/materialization/MaterializationTypes.ts";
import { warning } from "./internals/materialization/MaterializationWarning.ts";
export const buildMaterialization = Effect.fn("DatabaseMaterialization.buildMaterialization")(
  function* (
    projection: MaterializationProjectionReader,
    repository: RepositoryRuntime,
    previousSnapshotId: string | null,
    currentSnapshotId: string,
    trace?: MaterializationTrace,
  ) {
    let history = yield* readMaterializationHistory(
      projection,
      repository,
      previousSnapshotId,
      currentSnapshotId,
      trace,
    );
    const foldStartedAt = yield* Clock.currentTimeMillis;
    let folded = yield* foldRepositoryEvents(repository, currentSnapshotId, trace, {
      history: history.snapshots,
      seed: history.fullRebuild
        ? emptyFoldedEvents()
        : yield* seedIncrementalFoldedEvents(projection, repository.repositoryId),
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
        foldMs: elapsedMs(foldStartedAt, yield* Clock.currentTimeMillis),
        fullRebuild: history.fullRebuild,
        labels: folded.labels.size,
        pages: folded.pages.size,
        replayedCommits: history.snapshots.length,
        records: folded.records.size,
        templates: folded.templates.size,
        tickets: folded.tickets.size,
        users: folded.users.size,
        views: folded.views.size,
        warnings: folded.warnings.length,
      });

    const assembleStartedAt = yield* Clock.currentTimeMillis;
    const ticketValues = history.fullRebuild
      ? [...folded.tickets.values()]
      : valuesForIds(folded.tickets, folded.changedTickets);
    const recordValues = history.fullRebuild
      ? [...folded.records.values()]
      : valuesForIds(folded.records, folded.changedRecords);
    const pageValues = history.fullRebuild
      ? [...folded.pages.values()]
      : valuesForIds(folded.pages, folded.changedPages);
    const commentValues = history.fullRebuild
      ? [...folded.comments.values()]
      : valuesForIds(folded.comments, folded.changedComments);
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
    const pages = pageValues;
    const comments = commentValues;
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
    const now = yield* nowIso();

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
        assembleMs: elapsedMs(assembleStartedAt, yield* Clock.currentTimeMillis),
        labels: labels.length,
        pages: pages.length,
        comments: comments.length,
        records: records.length,
        templates: templates.length,
        tickets: tickets.length,
        users: users.length,
        views: views.length,
        warnings: warnings.length,
      });

    const commitsStartedAt = yield* Clock.currentTimeMillis;
    const commits = buildCommitRows(repository, history.snapshots, history.sequenceStart);
    if (trace !== undefined)
      yield* trace("sync materialization commits built", {
        commits: commits.length,
        commitsMs: elapsedMs(commitsStartedAt, yield* Clock.currentTimeMillis),
      });

    const commitChangesStartedAt = yield* Clock.currentTimeMillis;
    const commitChanges = folded.commitChanges;
    if (trace !== undefined)
      yield* trace("sync materialization commit changes built", {
        commitChanges: commitChanges.length,
        commitChangesMs: elapsedMs(commitChangesStartedAt, yield* Clock.currentTimeMillis),
      });

    const inboxStartedAt = yield* Clock.currentTimeMillis;
    const inboxUsers = history.fullRebuild
      ? [...folded.users.values()]
      : mergeUsers(
          userValues,
          yield* projection.catalog.usersByRecipientLookupKeys(
            repository.repositoryId,
            inboxRecipientLookupKeys(folded),
          ),
        );
    const inboxItems = deriveInboxItems(repository.repositoryId, folded, inboxUsers);
    if (trace !== undefined)
      yield* trace("sync materialization inbox derived", {
        inboxItems: inboxItems.length,
        inboxMs: elapsedMs(inboxStartedAt, yield* Clock.currentTimeMillis),
        users: inboxUsers.length,
      });

    return {
      commitChanges,
      commits,
      comments,
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
      pageHistory: folded.pageHistory,
      pages,
      records,
      templates,
      tickets,
      users,
      views,
      warnings,
    };
  },
);
