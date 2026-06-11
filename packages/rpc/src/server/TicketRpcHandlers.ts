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
        return yield* database
          .listTickets({
            ...ignoreRepository(scoped),
            repositoryIds: [repositoryId(scoped)],
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
      default:
        return yield* Effect.fail(unknownRpcMethod(method));
    }
  });
