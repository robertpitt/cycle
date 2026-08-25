import { Context, Effect, Layer } from "effect";
import { DatabaseIdGenerator, type DatabaseIdGeneratorShape } from "../../DatabaseIdGenerator.ts";
import { DatabaseIdentity, type DatabaseIdentityShape } from "../../DatabaseIdentity.ts";
import { foldRepositoryEvents } from "../materialization/EventFold.ts";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  CURRENT_SCHEMA_VERSION,
  defaultIssueBody,
  makeFrontmatter,
  makeTicketDocument,
  type CommitOptions,
  type CreateTicketDraftInput,
  type TicketDocument,
  type TicketDraftDocument,
  type UpdateTicketDraftInput,
} from "../../domain/index.ts";
import {
  assertNoUnsafeContent,
  draftCreatedMessage,
  draftUpdatedMessage,
  initialProvenanceRecord,
  mergeDraftInput,
  quotedTicketTitle,
  statusChangeRecord,
  validateTicket,
} from "./TicketCommandRules.ts";
import { gitIdentity, nowIso } from "../DatabaseBoundary.ts";
import { makeRecordId } from "./RecordDocuments.ts";
import { CommandWriter, type CommandWriterShape } from "./CommandWriter.ts";
import {
  DatabaseProjectionService,
  type DatabaseProjection,
} from "../projection/DatabaseProjection.ts";
import { RepositoryRegistry, type RepositoryRegistryShape } from "../RepositoryRegistry.ts";
import { WriteCoordinator, type WriteCoordinatorShape } from "../repository/WriteCoordinator.ts";

export const makeDraftCommands = (dependencies: {
  readonly commandWriter: CommandWriterShape;
  readonly identity: DatabaseIdentityShape;
  readonly ids: DatabaseIdGeneratorShape;
  readonly projection: DatabaseProjection;
  readonly registry: RepositoryRegistryShape;
  readonly writeCoordinator: WriteCoordinatorShape;
}) => {
  const { commandWriter, identity, ids, projection, registry, writeCoordinator } = dependencies;
  const { appendEvent, beginWritePlan, ensureActorUserProfile, generateTicketId } = commandWriter;
  const getRepository = registry.get;
  const writeAndSync = writeCoordinator.writeAndSync;
  const createDraft = Effect.fn("DraftCommands.createDraft")(function* (
    repositoryId: string,
    input: CreateTicketDraftInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDraftDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("draft input", input);

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const draftId = yield* ids.draftId;
    const draft: TicketDraftDocument = {
      createdAt: now,
      createdBy: actor,
      id: draftId,
      input,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      status: "open",
      updatedAt: now,
    };

    return yield* writeAndSync(
      repositoryId,
      "createDraft",
      draftId,
      (repository) =>
        Effect.gen(function* () {
          let plan = yield* beginWritePlan(repository, "create draft", actor, now);
          plan = yield* ensureActorUserProfile(repository, plan, actor, now);

          plan = yield* appendEvent(plan, "draft", draftId, {
            op: "draft.create",
            value: draft,
          });

          return {
            commit: {
              author: gitIdentity(actor),
              committer: gitIdentity(actor),
              message: options.message ?? draftCreatedMessage(actor, draft),
            },
            plan,
            resolve: () => draft,
          };
        }),
      () => Effect.succeed(true),
    );
  });

  const listDrafts = Effect.fn("DraftCommands.listDrafts")(function* (
    repositoryId: string,
  ): Effect.fn.Return<ReadonlyArray<TicketDraftDocument>, DatabaseFailure> {
    const repository = yield* getRepository(repositoryId);
    const folded = yield* foldRepositoryEvents(repository);

    return [...folded.drafts.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  });

  const updateDraft = Effect.fn("DraftCommands.updateDraft")(function* (
    repositoryId: string,
    draftId: string,
    input: UpdateTicketDraftInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDraftDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("draft patch", input);

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();

    return yield* writeAndSync(
      repositoryId,
      "updateDraft",
      draftId,
      (repository) =>
        Effect.gen(function* () {
          let plan = yield* beginWritePlan(repository, "update draft", actor, now);
          const current = (yield* foldRepositoryEvents(repository)).drafts.get(draftId) ?? null;

          if (current === null) {
            return yield* new DatabaseValidationError({
              field: "draftId",
              message: "draft not found",
            });
          }
          plan = yield* ensureActorUserProfile(repository, plan, actor, now);

          const next: TicketDraftDocument = {
            ...current,
            input: mergeDraftInput(current.input, input),
            updatedAt: now,
          };

          plan = yield* appendEvent(plan, "draft", draftId, {
            op: "draft.update",
            value: next,
          });

          return {
            commit: {
              author: gitIdentity(actor),
              committer: gitIdentity(actor),
              message: options.message ?? draftUpdatedMessage(actor, next),
            },
            plan,
            resolve: () => next,
          };
        }),
      () => Effect.succeed(true),
    );
  });

  const commitDraft = Effect.fn("DraftCommands.commitDraft")(function* (
    repositoryId: string,
    draftId: string,
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    const actor = yield* identity.currentActor;
    const repository = yield* getRepository(repositoryId);
    const ticketId = yield* generateTicketId(repository);
    const now = yield* nowIso();

    return yield* writeAndSync(
      repositoryId,
      "commitDraft",
      draftId,
      (repository) =>
        Effect.gen(function* () {
          let plan = yield* beginWritePlan(repository, "commit draft", actor, now);
          const draft = (yield* foldRepositoryEvents(repository)).drafts.get(draftId) ?? null;

          if (draft === null) {
            return yield* new DatabaseValidationError({
              field: "draftId",
              message: "draft not found",
            });
          }
          plan = yield* ensureActorUserProfile(repository, plan, actor, now);

          const ticket = makeTicketDocument(
            makeFrontmatter(draft.input, ticketId, actor, now),
            draft.input.body ?? defaultIssueBody(),
          );
          const provenanceRecordId = yield* ids.recordId;
          const statusRecordId = yield* ids.recordId;
          const provenance = initialProvenanceRecord(
            ticketId,
            makeRecordId(ticketId, "provenance", provenanceRecordId),
            actor,
            now,
          );
          const status = statusChangeRecord(
            ticketId,
            makeRecordId(ticketId, "status-change", statusRecordId),
            actor,
            now,
            null,
            ticket.status,
          );

          yield* validateTicket(ticket);
          plan = yield* appendEvent(plan, "ticket", ticketId, {
            op: "ticket.create",
            value: ticket,
          });
          plan = yield* appendEvent(plan, "record", provenance.id, {
            op: "record.add",
            value: provenance,
          });
          plan = yield* appendEvent(plan, "record", status.id, {
            op: "record.add",
            value: status,
          });
          plan = yield* appendEvent(plan, "draft", draftId, {
            op: "draft.commit",
            value: {
              ...draft,
              status: "committed",
              updatedAt: now,
            },
          });

          return {
            commit: {
              author: gitIdentity(actor),
              committer: gitIdentity(actor),
              message:
                options.message ??
                `${actor.name} created ${quotedTicketTitle(ticket)} ticket from draft`,
            },
            plan,
            resolve: () => ticket,
          };
        }),
      () => projection.ticketVisible(repositoryId, ticketId),
    );
  });
  return { commitDraft, createDraft, listDrafts, updateDraft };
};

export type DraftCommandsShape = ReturnType<typeof makeDraftCommands>;

export class DraftCommands extends Context.Service<DraftCommands, DraftCommandsShape>()(
  "@cycle/database/internals/commands/DraftCommands",
) {}

export const DraftCommandsLive = Layer.effect(
  DraftCommands,
  Effect.gen(function* () {
    const commandWriter = yield* CommandWriter;
    const identity = yield* DatabaseIdentity;
    const ids = yield* DatabaseIdGenerator;
    const projection = yield* DatabaseProjectionService;
    const registry = yield* RepositoryRegistry;
    const writeCoordinator = yield* WriteCoordinator;
    return DraftCommands.of(
      makeDraftCommands({ commandWriter, identity, ids, projection, registry, writeCoordinator }),
    );
  }),
);
