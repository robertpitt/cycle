import { TicketDbService } from "@cycle/ticket-db";
import { Effect, Schema } from "effect";
import type { RepositoryScoped } from "../schemas/index.ts";
import {
  invalidRpcRequest,
  ticketDbFailureToRpcError,
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

export const invokeTicketRpc = (
  method: TicketRpcMethod,
  payload: unknown,
): Effect.Effect<unknown, TicketRpcError, TicketDbService> =>
  Effect.gen(function* () {
    const ticketDb = yield* TicketDbService;

    switch (method) {
      case "ticket.draft.commit": {
        const scoped = yield* decodePayload<RepositoryScoped<string>>(
          method,
          TicketRpcPayloadSchemas[method],
          payload,
        );
        return yield* ticketDb
          .commitDraft(ignoreRepository(scoped))
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.draft.create": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof ticketDb.createDraft>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* ticketDb
          .createDraft(ignoreRepository(scoped))
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.draft.update": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof ticketDb.updateDraft>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* ticketDb
          .updateDraft(ignoreRepository(scoped))
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.issue.create": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof ticketDb.createIssue>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* ticketDb
          .createIssue(ignoreRepository(scoped))
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.issue.get": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly options?: Parameters<typeof ticketDb.getIssue>[1];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* ticketDb
          .getIssue(input.id, input.options)
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.issue.history": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly options?: Parameters<typeof ticketDb.issueHistory>[1];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* ticketDb
          .issueHistory(input.id, input.options)
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.issue.list": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof ticketDb.listIssues>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* ticketDb
          .listIssues(ignoreRepository(scoped))
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.issue.transition": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof ticketDb.transitionIssue>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* ticketDb
          .transitionIssue(ignoreRepository(scoped))
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.issue.update": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly id: string;
            readonly patch: Parameters<typeof ticketDb.updateIssue>[1];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* ticketDb
          .updateIssue(input.id, input.patch)
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.record.add": {
        const scoped = yield* decodePayload<
          RepositoryScoped<Parameters<typeof ticketDb.addRecord>[0]>
        >(method, TicketRpcPayloadSchemas[method], payload);
        return yield* ticketDb
          .addRecord(ignoreRepository(scoped))
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      case "ticket.record.listForIssue": {
        const scoped = yield* decodePayload<
          RepositoryScoped<{
            readonly issueId: string;
            readonly query?: Parameters<typeof ticketDb.recordsForIssue>[1];
          }>
        >(method, TicketRpcPayloadSchemas[method], payload);
        const input = ignoreRepository(scoped);
        return yield* ticketDb
          .recordsForIssue(input.issueId, input.query)
          .pipe(Effect.mapError(ticketDbFailureToRpcError));
      }
      default:
        return yield* Effect.fail(unknownRpcMethod(method));
    }
  });
