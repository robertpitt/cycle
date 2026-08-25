import { Context, Effect, Layer } from "effect";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import type {
  InboxMutationInput,
  InboxMutationResult,
  InboxPage,
  InboxQuery,
  InboxSummary,
} from "../../domain/index.ts";
import { normalizeUserIdEffect } from "./CatalogDocuments.ts";
import { nowIso } from "../DatabaseBoundary.ts";
import { validateRequiredString } from "./TicketCommandRules.ts";
import {
  DatabaseProjectionService,
  type DatabaseProjection,
} from "../projection/DatabaseProjection.ts";

export const makeInboxOperations = (projection: DatabaseProjection) => {
  const normalizeQuery = Effect.fn("InboxOperations.normalizeQuery")(function* (query: InboxQuery) {
    return { ...query, userId: yield* normalizeUserIdEffect(query.userId) };
  });

  const normalizeMutation = Effect.fn("InboxOperations.normalizeMutation")(function* (
    input: InboxMutationInput,
  ) {
    const userId = yield* normalizeUserIdEffect(input.userId);
    const itemIds = [...new Set(input.itemIds.map((itemId) => itemId.trim()))];
    yield* Effect.try({
      catch: (cause) =>
        new DatabaseValidationError({
          cause,
          field: "itemIds",
          message: cause instanceof Error ? cause.message : "invalid inbox item ids",
        }),
      try: () => {
        for (const itemId of itemIds) validateRequiredString("itemId", itemId);
      },
    });
    return { ...input, itemIds, userId };
  });

  const listInbox = Effect.fn("InboxOperations.listInbox")(function* (
    query: InboxQuery,
  ): Effect.fn.Return<InboxPage, DatabaseFailure> {
    return yield* projection.listInbox(yield* normalizeQuery(query));
  });

  const inboxSummary = Effect.fn("InboxOperations.inboxSummary")(function* (
    query: InboxQuery,
  ): Effect.fn.Return<InboxSummary, DatabaseFailure> {
    return yield* projection.inboxSummary(yield* normalizeQuery(query));
  });

  const markInboxRead = Effect.fn("InboxOperations.markInboxRead")(function* (
    input: InboxMutationInput,
  ): Effect.fn.Return<InboxMutationResult, DatabaseFailure> {
    return yield* projection.markInboxRead(yield* normalizeMutation(input), yield* nowIso());
  });

  const markInboxUnread = Effect.fn("InboxOperations.markInboxUnread")(function* (
    input: InboxMutationInput,
  ): Effect.fn.Return<InboxMutationResult, DatabaseFailure> {
    return yield* projection.markInboxUnread(yield* normalizeMutation(input), yield* nowIso());
  });

  const archiveInboxItems = Effect.fn("InboxOperations.archiveInboxItems")(function* (
    input: InboxMutationInput,
  ): Effect.fn.Return<InboxMutationResult, DatabaseFailure> {
    return yield* projection.archiveInboxItems(yield* normalizeMutation(input), yield* nowIso());
  });

  return { archiveInboxItems, inboxSummary, listInbox, markInboxRead, markInboxUnread };
};

export type InboxOperationsShape = ReturnType<typeof makeInboxOperations>;

export class InboxOperations extends Context.Service<InboxOperations, InboxOperationsShape>()(
  "@cycle/database/internals/commands/InboxOperations",
) {}

export const InboxOperationsLive = Layer.effect(
  InboxOperations,
  Effect.gen(function* () {
    const projection = yield* DatabaseProjectionService;
    return InboxOperations.of(makeInboxOperations(projection));
  }),
);
