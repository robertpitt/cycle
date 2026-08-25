import { Context, Effect, Layer } from "effect";
import { DatabaseIdGenerator, type DatabaseIdGeneratorShape } from "../../DatabaseIdGenerator.ts";
import { DatabaseIdentity, type DatabaseIdentityShape } from "../../DatabaseIdentity.ts";
import { foldRepositoryEvents } from "../materialization/EventFold.ts";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  defaultIssueBody,
  makeFrontmatter,
  makeTicketDocument,
  normalizeKey,
  stripUndefined,
  updateTicketDocument,
  validateNewTicketType,
  type Actor,
  type AddRecordInput,
  type ArchiveTicketInput,
  type CommitOptions,
  type CreateTicketInput,
  type DeleteTicketInput,
  type InitiativeProgress,
  type InitiativeUpdatePayload,
  type IssueRelation,
  type LinkedRecord,
  type RestoreTicketInput,
  type TicketDocument,
  type TicketRevisionDiff,
  type UpdateTicketPatch,
} from "../../domain/index.ts";
import {
  addRelation,
  assertNoUnsafeContent,
  commentPayloadBody,
  createdTicketMessage,
  initialProvenanceRecord,
  inverseRelation,
  isIssueRelationType,
  makeRecord,
  metadataChanges,
  quotedTicketTitle,
  recordMessage,
  relationMessage,
  removeRelation,
  statusChangeRecord,
  updatedTicketMessage,
  validateRequiredString,
  validateTicket,
  validateTicketId,
} from "./TicketCommandRules.ts";
import { gitIdentity, nowIso } from "../DatabaseBoundary.ts";
import { makeRecordId } from "./RecordDocuments.ts";
import { createsDependencyCycleEffect, dependencyEdge } from "../TicketDependencies.ts";
import { CommandWriter, type CommandWriterShape } from "./CommandWriter.ts";
import {
  DatabaseProjectionService,
  type DatabaseProjection,
} from "../projection/DatabaseProjection.ts";
import { RepositoryRegistry, type RepositoryRegistryShape } from "../RepositoryRegistry.ts";
import { WriteCoordinator, type WriteCoordinatorShape } from "../repository/WriteCoordinator.ts";

export const makeTicketCommands = (dependencies: {
  readonly commandWriter: CommandWriterShape;
  readonly identity: DatabaseIdentityShape;
  readonly ids: DatabaseIdGeneratorShape;
  readonly projection: DatabaseProjection;
  readonly registry: RepositoryRegistryShape;
  readonly writeCoordinator: WriteCoordinatorShape;
}) => {
  const { commandWriter, identity, ids, projection, registry, writeCoordinator } = dependencies;
  const {
    appendEvent,
    appendTicketUpdateEvents,
    beginWritePlan,
    ensureActorUserProfile,
    generateTicketId,
  } = commandWriter;
  const getRepository = registry.get;
  const writeAndSync = writeCoordinator.writeAndSync;
  const createTicket = Effect.fn("TicketCommands.createTicket")(function* (
    repositoryId: string,
    input: CreateTicketInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    yield* assertNoUnsafeContent("create ticket input", input);

    const actor = yield* identity.currentActor;
    const repository = yield* getRepository(repositoryId);
    const type = validateNewTicketType(input.type);

    if (!type.ok) {
      return yield* new DatabaseValidationError({ field: "type", message: type.reason });
    }

    const id = yield* generateTicketId(repository);
    const now = yield* nowIso();
    const body = input.body ?? defaultIssueBody();
    const ticket = makeTicketDocument(
      makeFrontmatter({ ...input, type: type.type }, id, actor, now),
      body,
    );

    yield* validateTicket(ticket);

    return yield* writeAndSync(
      repositoryId,
      "createTicket",
      id,
      (repository) =>
        Effect.gen(function* () {
          const recordId = yield* ids.recordId;
          const statusRecordId = yield* ids.recordId;
          let plan = yield* beginWritePlan(repository, "create ticket", actor, now);
          plan = yield* ensureActorUserProfile(repository, plan, actor, now);
          const provenance = initialProvenanceRecord(
            id,
            makeRecordId(id, "provenance", recordId),
            actor,
            now,
          );
          const status = statusChangeRecord(
            id,
            makeRecordId(id, "status-change", statusRecordId),
            actor,
            now,
            null,
            ticket.status,
          );

          plan = yield* appendEvent(plan, "ticket", id, {
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

          return {
            commit: {
              author: gitIdentity(actor),
              committer: gitIdentity(actor),
              message: options.message ?? createdTicketMessage(actor, ticket),
            },
            plan,
            resolve: () => ticket,
          };
        }),
      () => projection.ticketVisible(repositoryId, id),
    );
  });

  const updateTicket = Effect.fn("TicketCommands.updateTicket")(function* (
    repositoryId: string,
    ticketId: string,
    patch: UpdateTicketPatch,
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    const current = yield* projection.getTicket(repositoryId, ticketId);

    if (current === null)
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found",
      });

    yield* assertNoUnsafeContent("update ticket patch", patch);

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const next = updateTicketDocument(
      current,
      {
        ...current.frontmatter,
        ...patch.frontmatter,
        createdAt: current.frontmatter.createdAt,
        createdBy: current.frontmatter.createdBy,
        id: ticketId,
        updatedAt: now,
      },
      patch.body ?? current.body,
    );

    yield* validateTicket(next);

    return yield* writeAndSync(
      repositoryId,
      "updateTicket",
      ticketId,
      (repository) =>
        Effect.gen(function* () {
          let plan = yield* beginWritePlan(repository, "update ticket", actor, now);
          plan = yield* ensureActorUserProfile(repository, plan, actor, now);

          plan = yield* appendTicketUpdateEvents(plan, current, next);

          if (next.status !== current.status) {
            const recordId = makeRecordId(ticketId, "status-change", yield* ids.recordId);
            plan = yield* appendEvent(plan, "record", recordId, {
              op: "record.add",
              value: statusChangeRecord(
                ticketId,
                recordId,
                actor,
                now,
                current.status,
                next.status,
              ),
            });
          }

          return {
            commit: {
              author: gitIdentity(actor),
              committer: gitIdentity(actor),
              message: patch.message ?? updatedTicketMessage(actor, current, next),
            },
            plan,
            resolve: () => next,
          };
        }),
      () => projection.ticketVisible(repositoryId, ticketId),
    );
  });

  const writeTicketUpdates = Effect.fn("TicketCommands.writeTicketUpdates")(function* <A>(
    repositoryId: string,
    command: string,
    objectId: string | undefined,
    actor: Actor,
    now: string,
    result: A,
    tickets: ReadonlyArray<TicketDocument>,
    linkedRecords: ReadonlyArray<LinkedRecord>,
    message: string,
    visible: () => Effect.Effect<boolean, DatabaseFailure>,
  ): Effect.fn.Return<A, DatabaseFailure> {
    return yield* writeAndSync(
      repositoryId,
      command,
      objectId,
      (repository) =>
        Effect.gen(function* () {
          let plan = yield* beginWritePlan(repository, command, actor, now);
          plan = yield* ensureActorUserProfile(repository, plan, actor, now);

          for (const ticket of tickets) {
            if (command === "archiveTicket") {
              plan = yield* appendEvent(plan, "ticket", ticket.id, { op: "ticket.archive" });
            } else if (command === "deleteTicket") {
              plan = yield* appendEvent(plan, "ticket", ticket.id, { op: "ticket.delete" });
            } else if (command === "restoreTicket") {
              plan = yield* appendEvent(plan, "ticket", ticket.id, { op: "ticket.restore" });
            } else {
              plan = yield* appendEvent(plan, "ticket", ticket.id, {
                op: "ticket.replace",
                value: ticket,
              });
            }
          }
          for (const record of linkedRecords) {
            plan = yield* appendEvent(plan, "record", record.id, {
              op: "record.add",
              value: record,
            });
          }

          return { commit: { message }, plan, resolve: () => result };
        }),
      visible,
    );
  });

  const archiveTicket = Effect.fn("TicketCommands.archiveTicket")(function* (
    repositoryId: string,
    ticketId: string,
    input: ArchiveTicketInput = {},
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    const current = yield* projection.getTicket(repositoryId, ticketId);

    if (current === null)
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found",
      });

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const next = updateTicketDocument(current, {
      ...current.frontmatter,
      archivedAt: now,
      archivedBy: actor,
      updatedAt: now,
    });
    const recordId = makeRecordId(ticketId, "archive", yield* ids.recordId);
    const record = makeRecord(
      {
        payload: stripUndefined({
          archivedAt: now,
          reason: input.reason,
        }),
        recordType: "archive",
        ticketId,
      },
      recordId,
      actor,
      now,
    );

    yield* validateTicket(next);

    return yield* writeTicketUpdates(
      repositoryId,
      "archiveTicket",
      ticketId,
      actor,
      now,
      next,
      [next],
      [record],
      options.message ?? `${actor.name} archived ${quotedTicketTitle(next)} ticket`,
      () => projection.ticketVisible(repositoryId, ticketId),
    );
  });

  const deleteTicket = Effect.fn("TicketCommands.deleteTicket")(function* (
    repositoryId: string,
    ticketId: string,
    input: DeleteTicketInput = {},
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    const current = yield* projection.getTicket(repositoryId, ticketId);

    if (current === null)
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found",
      });

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const next = updateTicketDocument(current, {
      ...current.frontmatter,
      deletedAt: now,
      deletedBy: actor,
      updatedAt: now,
    });
    const recordId = makeRecordId(ticketId, "delete", yield* ids.recordId);
    const record = makeRecord(
      {
        payload: stripUndefined({
          deletedAt: now,
          reason: input.reason,
        }),
        recordType: "delete",
        ticketId,
      },
      recordId,
      actor,
      now,
    );

    yield* validateTicket(next);

    return yield* writeTicketUpdates(
      repositoryId,
      "deleteTicket",
      ticketId,
      actor,
      now,
      next,
      [next],
      [record],
      options.message ?? `${actor.name} deleted ${quotedTicketTitle(next)} ticket`,
      () => projection.ticketVisible(repositoryId, ticketId),
    );
  });

  const restoreTicket = Effect.fn("TicketCommands.restoreTicket")(function* (
    repositoryId: string,
    ticketId: string,
    input: RestoreTicketInput = {},
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    const current = yield* projection.getTicket(repositoryId, ticketId);

    if (current === null)
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found",
      });

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const next = updateTicketDocument(current, {
      ...current.frontmatter,
      archivedAt: undefined,
      archivedBy: undefined,
      deletedAt: undefined,
      deletedBy: undefined,
      updatedAt: now,
    });
    const recordId = makeRecordId(ticketId, "restore", yield* ids.recordId);
    const record = makeRecord(
      {
        payload: stripUndefined({
          reason: input.reason,
          restoredAt: now,
        }),
        recordType: "restore",
        ticketId,
      },
      recordId,
      actor,
      now,
    );

    yield* validateTicket(next);

    return yield* writeTicketUpdates(
      repositoryId,
      "restoreTicket",
      ticketId,
      actor,
      now,
      next,
      [next],
      [record],
      options.message ?? `${actor.name} restored ${quotedTicketTitle(next)} ticket`,
      () => projection.ticketVisible(repositoryId, ticketId),
    );
  });

  const mutateIssueRelation = Effect.fn("TicketCommands.mutateIssueRelation")(function* (
    repositoryId: string,
    ticketId: string,
    relation: IssueRelation,
    action: "add" | "remove",
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    validateTicketId("ticket id", ticketId);
    validateTicketId("relation issue id", relation.issueId);

    if (!isIssueRelationType(relation.type)) {
      return yield* new DatabaseValidationError({
        field: "relation.type",
        message: "invalid issue relation type",
      });
    }
    if (relation.issueId === ticketId) {
      return yield* new DatabaseValidationError({
        field: "relation.issueId",
        message: "ticket cannot relate to itself",
      });
    }

    const [current, related] = yield* Effect.all([
      projection.getTicket(repositoryId, ticketId),
      projection.getTicket(repositoryId, relation.issueId),
    ]);

    if (current === null)
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found",
      });
    if (related === null)
      return yield* new DatabaseValidationError({
        field: "relation.issueId",
        message: "related ticket not found",
      });

    const edge = dependencyEdge(ticketId, relation);
    if (
      action === "add" &&
      edge !== undefined &&
      (yield* createsDependencyCycleEffect(edge, (id) => projection.getTicket(repositoryId, id)))
    ) {
      return yield* new DatabaseValidationError({
        field: "relation",
        message: "dependency relation would create a circular dependency",
      });
    }

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const normalizedRelation = {
      issueId: relation.issueId,
      type: relation.type,
    } satisfies IssueRelation;
    const inverse = inverseRelation(normalizedRelation, ticketId);
    const next = updateTicketDocument(current, {
      ...current.frontmatter,
      duplicateOf:
        action === "add" && normalizedRelation.type === "duplicate"
          ? normalizedRelation.issueId
          : action === "remove" && normalizedRelation.type === "duplicate"
            ? undefined
            : current.frontmatter.duplicateOf,
      relations:
        action === "add"
          ? addRelation(current.frontmatter.relations, normalizedRelation)
          : removeRelation(current.frontmatter.relations, normalizedRelation),
      updatedAt: now,
    });
    const nextRelated = updateTicketDocument(related, {
      ...related.frontmatter,
      relations:
        action === "add"
          ? addRelation(related.frontmatter.relations, inverse)
          : removeRelation(related.frontmatter.relations, inverse),
      updatedAt: now,
    });
    const sourceRecordId = makeRecordId(ticketId, "relation-change", yield* ids.recordId);
    const relatedRecordId = makeRecordId(relation.issueId, "relation-change", yield* ids.recordId);
    const payload = {
      action,
      relation: normalizedRelation,
    };
    const sourceRecord = makeRecord(
      {
        payload,
        recordType: "relation-change",
        ticketId,
      },
      sourceRecordId,
      actor,
      now,
    );
    const relatedRecord = makeRecord(
      {
        payload: {
          action,
          relation: inverse,
        },
        recordType: "relation-change",
        ticketId: relation.issueId,
      },
      relatedRecordId,
      actor,
      now,
    );

    yield* validateTicket(next);
    yield* validateTicket(nextRelated);

    return yield* writeTicketUpdates(
      repositoryId,
      action === "add" ? "addIssueRelation" : "removeIssueRelation",
      ticketId,
      actor,
      now,
      next,
      [next, nextRelated],
      [sourceRecord, relatedRecord],
      options.message ?? relationMessage(actor, action, normalizedRelation.type, current, related),
      () => projection.ticketVisible(repositoryId, ticketId),
    );
  });

  const listIssueRelations = Effect.fn("TicketCommands.listIssueRelations")(function* (
    repositoryId: string,
    ticketId: string,
  ): Effect.fn.Return<ReadonlyArray<IssueRelation>, DatabaseFailure> {
    validateTicketId("ticket id", ticketId);
    const ticket = yield* projection.getTicket(repositoryId, ticketId);
    if (ticket === null) {
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found",
      });
    }

    return ticket.frontmatter.relations ?? [];
  });

  const addRecord = Effect.fn("TicketCommands.addRecord")(function* <TPayload = unknown>(
    repositoryId: string,
    ticketId: string,
    input: AddRecordInput<TPayload>,
    options: CommitOptions = {},
  ): Effect.fn.Return<LinkedRecord, DatabaseFailure> {
    const ticket = yield* projection.getTicket(repositoryId, ticketId);

    if (ticket === null)
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found",
      });

    yield* assertNoUnsafeContent("record payload", input.payload);

    if (
      normalizeKey(input.recordType) === "comment" &&
      commentPayloadBody(input.payload).trim().length === 0
    ) {
      return yield* new DatabaseValidationError({
        field: "comment.body",
        message: "comment body must not be empty",
      });
    }

    const actor = yield* identity.currentActor;
    const now = yield* nowIso();
    const recordId = makeRecordId(ticketId, input.recordType, yield* ids.recordId);
    const record = makeRecord(
      {
        payload: input.payload,
        recordType: input.recordType,
        ticketId,
      },
      recordId,
      actor,
      now,
    );
    return yield* writeAndSync(
      repositoryId,
      "addRecord",
      recordId,
      (repository) =>
        Effect.gen(function* () {
          let plan = yield* beginWritePlan(repository, "add record", actor, now);
          plan = yield* ensureActorUserProfile(repository, plan, actor, now);

          if (input.userVisible !== false) {
            plan = yield* appendEvent(plan, "ticket", ticketId, {
              field: "updatedAt",
              op: "ticket.update",
              value: now,
            });
          }

          plan = yield* appendEvent(plan, "record", record.id, {
            op: "record.add",
            value: record,
          });

          return {
            commit: {
              author: gitIdentity(actor),
              committer: gitIdentity(actor),
              message: options.message ?? recordMessage(actor, record.recordType, ticket),
            },
            plan,
            resolve: () => record,
          };
        }),
      () => projection.recordVisible(repositoryId, recordId),
    );
  });

  const ticketRevision = Effect.fn("TicketCommands.ticketRevision")(function* (
    repositoryId: string,
    ticketId: string,
    snapshotId: string,
  ): Effect.fn.Return<TicketDocument | null, DatabaseFailure> {
    const repository = yield* getRepository(repositoryId);
    const folded = yield* foldRepositoryEvents(repository, snapshotId);

    return folded.tickets.get(ticketId) ?? null;
  });

  const ticketDiff = Effect.fn("TicketCommands.ticketDiff")(function* (
    repositoryId: string,
    ticketId: string,
    fromSnapshotId: string,
    toSnapshotId: string,
  ): Effect.fn.Return<TicketRevisionDiff, DatabaseFailure> {
    const fromTicket = yield* ticketRevision(repositoryId, ticketId, fromSnapshotId);
    const toTicket = yield* ticketRevision(repositoryId, ticketId, toSnapshotId);

    if (fromTicket === null && toTicket === null) {
      return yield* new DatabaseValidationError({
        field: "ticketId",
        message: "ticket not found in either revision",
      });
    }

    return {
      files: [
        {
          language: "markdown",
          newContent: toTicket?.body ?? "",
          newPath: `${ticketId}.md`,
          oldContent: fromTicket?.body ?? "",
          oldPath: `${ticketId}.md`,
        },
      ],
      fromSnapshotId,
      metadataChanges: metadataChanges(fromTicket, toTicket),
      ticketId,
      toSnapshotId,
    };
  });

  const createInitiative = Effect.fn("TicketCommands.createInitiative")(function* (
    repositoryId: string,
    input: CreateTicketInput,
    options: CommitOptions = {},
  ): Effect.fn.Return<TicketDocument, DatabaseFailure> {
    return yield* createTicket(
      repositoryId,
      {
        ...input,
        type: input.type ?? "epic",
      },
      options,
    );
  });

  const initiativeProgress = Effect.fn("TicketCommands.initiativeProgress")(function* (
    repositoryId: string,
    initiativeId: string,
  ): Effect.fn.Return<InitiativeProgress, DatabaseFailure> {
    const children = (yield* projection.listTickets({
      archived: false,
      deleted: false,
      parent: initiativeId,
      repositoryIds: [repositoryId],
    })).entries;
    const statusCounts: Record<string, number> = {};
    let estimateTotal = 0;
    let completedEstimate = 0;
    let completedIssues = 0;

    for (const child of children) {
      statusCounts[child.status] = (statusCounts[child.status] ?? 0) + 1;
      const estimate =
        typeof child.estimate === "number"
          ? child.estimate
          : typeof child.estimate === "string"
            ? Number(child.estimate)
            : 0;
      const normalizedEstimate = Number.isFinite(estimate) ? estimate : 0;
      estimateTotal += normalizedEstimate;
      if (child.status === "done") {
        completedIssues += 1;
        completedEstimate += normalizedEstimate;
      }
    }

    return {
      completedEstimate,
      completedIssues,
      estimateTotal,
      issueTotal: children.length,
      statusCounts,
    };
  });

  const addInitiativeUpdate = Effect.fn("TicketCommands.addInitiativeUpdate")(function* (
    repositoryId: string,
    initiativeId: string,
    input: InitiativeUpdatePayload,
    options: CommitOptions = {},
  ): Effect.fn.Return<LinkedRecord, DatabaseFailure> {
    yield* Effect.try({
      catch: (cause) =>
        cause instanceof Error
          ? new DatabaseValidationError({
              field: "initiative-update",
              message: cause.message,
              cause: cause,
            })
          : new DatabaseValidationError({
              field: "initiative-update",
              message: "invalid initiative update",
              cause: cause,
            }),
      try: () => validateRequiredString("initiative update summary", input.summary),
    });

    return yield* addRecord(
      repositoryId,
      initiativeId,
      {
        payload: input,
        recordType: "initiative-update",
      },
      options,
    );
  });

  return {
    addInitiativeUpdate,
    addRecord,
    archiveTicket,
    createInitiative,
    createTicket,
    deleteTicket,
    initiativeProgress,
    listIssueRelations,
    mutateIssueRelation,
    restoreTicket,
    ticketDiff,
    ticketRevision,
    updateTicket,
  };
};

export type TicketCommandsShape = ReturnType<typeof makeTicketCommands>;

export class TicketCommands extends Context.Service<TicketCommands, TicketCommandsShape>()(
  "@cycle/database/internals/commands/TicketCommands",
) {}

export const TicketCommandsLive = Layer.effect(
  TicketCommands,
  Effect.gen(function* () {
    const commandWriter = yield* CommandWriter;
    const identity = yield* DatabaseIdentity;
    const ids = yield* DatabaseIdGenerator;
    const projection = yield* DatabaseProjectionService;
    const registry = yield* RepositoryRegistry;
    const writeCoordinator = yield* WriteCoordinator;
    return TicketCommands.of(
      makeTicketCommands({ commandWriter, identity, ids, projection, registry, writeCoordinator }),
    );
  }),
);
