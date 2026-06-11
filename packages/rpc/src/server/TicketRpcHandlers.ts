import type { DatabaseServiceShape } from "@cycle/database";
import { Effect, Schema } from "effect";
import type { RepositoryScoped } from "../schemas/index.ts";
import {
  databaseFailureToRpcError,
  invalidRpcRequest,
  TicketRpcPayloadSchemas,
  type TicketRpcMethod,
  type TicketRpcError,
  unknownRpcMethod,
} from "../protocol/index.ts";

const decodePayload = <A>(
  method: TicketRpcMethod,
  schema: Schema.Top,
  payload: unknown,
): Effect.Effect<A, TicketRpcError> =>
  Schema.decodeUnknownEffect(schema)(payload).pipe(
    Effect.map((value) => value as A),
    Effect.mapError((error) =>
      invalidRpcRequest(`Invalid payload for ${method}.`, {
        method,
        parseError: String(error),
      }),
    ),
  ) as Effect.Effect<A, TicketRpcError>;

const ignoreRepository = <A>(payload: RepositoryScoped<A>): A => payload.input;
const repositoryId = <A>(payload: RepositoryScoped<A>): string => payload.repository.id;

export const invokeTicketRpc = (
  database: DatabaseServiceShape,
  method: TicketRpcMethod,
  payload: unknown,
): Effect.Effect<unknown, TicketRpcError> =>
  Effect.gen(function* () {
    switch (method) {
      case "repository.history.list": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly cursor?: string;
            readonly limit?: number;
            readonly max?: number;
            readonly ticketId?: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .repositoryHistory(repositoryId(scoped), {
            cursor: input.cursor,
            limit: input.limit ?? input.max,
            ticketId: input.ticketId,
          })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "repository.materializationWarnings": {
        const scoped = yield* decodePayload<RepositoryScoped<Record<string, never>>>(
          method,
          TicketRpcPayloadSchemas[method],
          payload,
        );
        return yield* database
          .materializationWarnings(repositoryId(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "repository.status.get": {
        const scoped = yield* decodePayload<RepositoryScoped<Record<string, never>>>(
          method,
          TicketRpcPayloadSchemas[method],
          payload,
        );
        return yield* database
          .repositoryStatus(repositoryId(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "repository.status.list": {
        yield* decodePayload<Record<string, never>>(
          method,
          TicketRpcPayloadSchemas[method],
          payload,
        );
        return yield* database.listRepositories().pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "repository.sync": {
        const scoped = yield* decodePayload<RepositoryScoped<Record<string, never>>>(
          method,
          TicketRpcPayloadSchemas[method],
          payload,
        );
        return yield* database
          .syncRepository(repositoryId(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.draft.commit": {
        const scoped = yield* decodePayload<RepositoryScoped<string>>(
          method,
          TicketRpcPayloadSchemas[method],
          payload,
        );
        return yield* database
          .commitDraft(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.draft.create": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.createDraft>[1]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .createDraft(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.draft.update": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly body?: string;
            readonly draftId: string;
            readonly frontmatter?: Readonly<Record<string, unknown>>;
            readonly status?: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .updateDraft(repositoryId(scoped), input.draftId, {
            body: input.body,
            frontmatter: input.frontmatter,
            status: input.status,
          })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.archive": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly reason?: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .archiveTicket(repositoryId(scoped), input.id, { reason: input.reason })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.create": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.createTicket>[1]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .createTicket(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.delete": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly reason?: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .deleteTicket(repositoryId(scoped), input.id, { reason: input.reason })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.diff": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly fromSnapshotId: string;
            readonly id: string;
            readonly toSnapshotId: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .ticketDiff(repositoryId(scoped), input.id, input.fromSnapshotId, input.toSnapshotId)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.get": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly options?: { readonly from?: string };
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .getTicket(repositoryId(scoped), input.id)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.history": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly options?: {
              readonly cursor?: string;
              readonly max?: number;
              readonly limit?: number;
            };
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .ticketHistory(repositoryId(scoped), input.id, {
            cursor: input.options?.cursor,
            limit: input.options?.limit ?? input.options?.max,
          })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.list": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.listTickets>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped) ?? {};
        const repositoryIds =
          input.repositoryIds !== undefined && input.repositoryIds.length > 0
            ? input.repositoryIds
            : [repositoryId(scoped)];

        return yield* database
          .listTickets({
            ...input,
            repositoryIds,
          })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.relation.add": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly relation: Parameters<typeof database.addIssueRelation>[2];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .addIssueRelation(repositoryId(scoped), input.id, input.relation)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.relation.remove": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly relation: Parameters<typeof database.removeIssueRelation>[2];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .removeIssueRelation(repositoryId(scoped), input.id, input.relation)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.restore": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly reason?: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .restoreTicket(repositoryId(scoped), input.id, { reason: input.reason })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.revision.get": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly snapshotId: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .ticketRevision(repositoryId(scoped), input.id, input.snapshotId)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.search": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.searchTickets>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .searchTickets({
            ...ignoreRepository(scoped),
            repositoryIds: [repositoryId(scoped)],
          })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.transition": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly reason?: string;
            readonly status: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .transitionTicket(repositoryId(scoped), input.id, {
            reason: input.reason,
            status: input.status,
          })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.issue.update": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly patch: Parameters<typeof database.updateTicket>[2];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .updateTicket(repositoryId(scoped), input.id, input.patch)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.initiative.create": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.createInitiative>[1]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .createInitiative(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.initiative.progress": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .initiativeProgress(repositoryId(scoped), input.id)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.initiative.update.add": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly update: Parameters<typeof database.addInitiativeUpdate>[2];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .addInitiativeUpdate(repositoryId(scoped), input.id, input.update)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.label.archive": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .archiveLabel(repositoryId(scoped), ignoreRepository(scoped).id)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.label.list": {
        const scoped = yield* decodePayload<
          RepositoryScoped<NonNullable<Parameters<typeof database.listLabels>[1]>>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .listLabels(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.label.upsert": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.upsertLabel>[1]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .upsertLabel(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.record.add": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly issueId: string;
            readonly payload: unknown;
            readonly recordType: string;
            readonly userVisible?: boolean;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .addRecord(repositoryId(scoped), input.issueId, {
            payload: input.payload,
            recordType: input.recordType,
            userVisible: input.userVisible,
          })
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.record.listForIssue": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly issueId: string;
            readonly query?: Parameters<typeof database.ticketRecords>[2];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        const page = yield* database
          .ticketRecords(repositoryId(scoped), input.issueId, input.query)
          .pipe(Effect.mapError(databaseFailureToRpcError));
        return page.entries;
      }
      case "ticket.template.archive": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .archiveTemplate(repositoryId(scoped), ignoreRepository(scoped).id)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.template.create": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.createTemplate>[1]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .createTemplate(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.template.get": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .getTemplate(repositoryId(scoped), ignoreRepository(scoped).id)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.template.list": {
        const scoped = yield* decodePayload<
          RepositoryScoped<NonNullable<Parameters<typeof database.listTemplates>[1]>>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .listTemplates(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.template.update": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly patch: Parameters<typeof database.updateTemplate>[2];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .updateTemplate(repositoryId(scoped), input.id, input.patch)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.user.get": {
        const scoped = yield* decodePayload<RepositoryScoped<string>>(
          method,
          TicketRpcPayloadSchemas[method],
          payload,
        );
        return yield* database
          .getUser(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.user.list": {
        const scoped = yield* decodePayload<
          RepositoryScoped<NonNullable<Parameters<typeof database.listUsers>[1]>>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .listUsers(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.user.upsert": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.upsertUser>[1]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .upsertUser(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.view.create": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof database.createView>[1]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .createView(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.view.delete": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .deleteView(repositoryId(scoped), ignoreRepository(scoped).id)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.view.get": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .getView(repositoryId(scoped), ignoreRepository(scoped).id)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.view.list": {
        const scoped = yield* decodePayload<
          RepositoryScoped<NonNullable<Parameters<typeof database.listViews>[1]>>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* database
          .listViews(repositoryId(scoped), ignoreRepository(scoped))
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      case "ticket.view.update": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly patch: Parameters<typeof database.updateView>[2];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* database
          .updateView(repositoryId(scoped), input.id, input.patch)
          .pipe(Effect.mapError(databaseFailureToRpcError));
      }
      default:
        return yield* Effect.fail(unknownRpcMethod(method));
    }
  });
