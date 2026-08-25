import { Context, Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { DatabaseFailure } from "../../DatabaseErrors.ts";
import type { buildMaterialization } from "../../DatabaseMaterialization.ts";
import type { RepositoryStatus } from "../../domain/index.ts";
import { ProjectionCatalogStore } from "./ProjectionCatalogStore.ts";
import { ProjectionInboxStore } from "./ProjectionInboxStore.ts";
import { ProjectionPageStore } from "./ProjectionPageStore.ts";
import { ProjectionRepositoryStore } from "./ProjectionRepositoryStore.ts";
import { makeProjectionSql } from "./ProjectionSql.ts";
import { ProjectionTicketStore } from "./ProjectionTicketStore.ts";

type EffectSuccess<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;

export type MaterializationPlan = EffectSuccess<ReturnType<typeof buildMaterialization>>;

export type ProjectionWriterShape = {
  readonly apply: (
    repositoryId: string,
    snapshotId: string,
    completedAt: string,
    plan: MaterializationPlan,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly reset: (
    repositoryId: string,
    completedAt: string,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
};

export class ProjectionWriter extends Context.Service<ProjectionWriter, ProjectionWriterShape>()(
  "@cycle/database/internals/projection/ProjectionWriter",
) {}

const repositoryTables = [
  "users",
  "labels",
  "saved_views",
  "issue_templates",
  "ticket_labels",
  "ticket_external_links",
  "comments",
  "records",
  "ticket_relations",
  "tickets",
  "commit_parents",
  "commit_changes",
  "commits",
  "inbox_items",
  "materialization_warnings",
  "search_documents",
  "search_fts",
] as const;

export const ProjectionWriterLive = Layer.effect(
  ProjectionWriter,
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient.SqlClient;
    const sql = makeProjectionSql(sqlClient);
    const catalog = yield* ProjectionCatalogStore;
    const inbox = yield* ProjectionInboxStore;
    const pages = yield* ProjectionPageStore;
    const repositories = yield* ProjectionRepositoryStore;
    const tickets = yield* ProjectionTicketStore;

    const clear = Effect.fn("ProjectionWriter.clear")(function* (repositoryId: string) {
      yield* pages.clearRepository(repositoryId);
      yield* Effect.forEach(
        repositoryTables,
        (table) =>
          sql.run(
            `clear repository projection ${table}`,
            `DELETE FROM ${table} WHERE repository_id = ?`,
            [repositoryId],
          ),
        { discard: true },
      );
    });

    const reset = Effect.fn("ProjectionWriter.reset")(function* (
      repositoryId: string,
      completedAt: string,
    ) {
      return yield* sql.transaction(
        Effect.gen(function* () {
          yield* clear(repositoryId);
          yield* repositories.setCycleMetadata(repositoryId, undefined);
          return yield* repositories.activateSnapshot({
            completedAt,
            repositoryId,
            snapshotId: null,
          });
        }),
      );
    });

    const apply = Effect.fn("ProjectionWriter.apply")(function* (
      repositoryId: string,
      snapshotId: string,
      completedAt: string,
      plan: MaterializationPlan,
    ) {
      return yield* sql.transaction(
        Effect.gen(function* () {
          if (plan.fullRebuild) yield* clear(repositoryId);

          yield* Effect.forEach(
            plan.deletedTickets,
            (id) => tickets.deleteTicket(repositoryId, id),
            {
              discard: true,
            },
          );
          yield* Effect.forEach(
            plan.deletedRecords,
            (id) => tickets.deleteRecord(repositoryId, id),
            {
              discard: true,
            },
          );
          yield* Effect.forEach(plan.deletedUsers, (id) => catalog.deleteUser(repositoryId, id), {
            discard: true,
          });
          yield* Effect.forEach(plan.deletedLabels, (id) => catalog.deleteLabel(repositoryId, id), {
            discard: true,
          });
          yield* Effect.forEach(plan.deletedViews, (id) => catalog.deleteView(repositoryId, id), {
            discard: true,
          });
          yield* Effect.forEach(
            plan.deletedTemplates,
            (id) => catalog.deleteTemplate(repositoryId, id),
            {
              discard: true,
            },
          );

          yield* Effect.forEach(
            plan.tickets,
            (entry) =>
              tickets.upsertTicket({
                path: entry.path,
                repositoryId,
                snapshotId,
                ticket: entry.value,
              }),
            { discard: true },
          );
          yield* Effect.forEach(
            plan.users,
            (entry) => catalog.upsertUser({ repositoryId, snapshotId, user: entry.value }),
            { discard: true },
          );
          yield* Effect.forEach(
            plan.labels,
            (entry) => catalog.upsertLabel({ label: entry.value, repositoryId, snapshotId }),
            { discard: true },
          );
          yield* Effect.forEach(
            plan.views,
            (entry) => catalog.upsertView({ repositoryId, snapshotId, view: entry.value }),
            { discard: true },
          );
          yield* Effect.forEach(
            plan.templates,
            (entry) => catalog.upsertTemplate({ repositoryId, snapshotId, template: entry.value }),
            { discard: true },
          );
          yield* Effect.forEach(plan.pages, (page) => pages.upsertPage(page), { discard: true });
          yield* Effect.forEach(
            plan.records,
            (entry) =>
              tickets
                .ticketVisible(repositoryId, entry.value.issueId)
                .pipe(
                  Effect.flatMap((visible) =>
                    visible
                      ? tickets.upsertRecord({ record: entry.value, repositoryId, snapshotId })
                      : Effect.void,
                  ),
                ),
            { discard: true },
          );
          yield* Effect.forEach(plan.comments, (comment) => pages.upsertComment(comment), {
            discard: true,
          });
          yield* Effect.forEach(plan.pageHistory, (entry) => pages.upsertHistory(entry), {
            discard: true,
          });
          yield* Effect.forEach(plan.commits, (commit) => repositories.upsertCommit(commit), {
            discard: true,
          });
          yield* Effect.forEach(
            plan.commitChanges,
            (changes) => repositories.replaceCommitChanges(changes),
            { discard: true },
          );
          yield* Effect.forEach(plan.warnings, (warning) => repositories.addWarning(warning), {
            discard: true,
          });
          yield* Effect.forEach(plan.inboxItems, (item) => inbox.upsert(item), { discard: true });

          yield* repositories.setCycleMetadata(repositoryId, plan.cycleMetadata);
          return yield* repositories.activateSnapshot({ completedAt, repositoryId, snapshotId });
        }),
      );
    });

    return ProjectionWriter.of({ apply, reset });
  }),
);
