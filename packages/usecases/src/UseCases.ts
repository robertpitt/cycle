import {
  DatabaseService,
  normalizeKey,
  protectedSectionsChanged,
  type DatabaseServiceShape,
  type IssueRelation,
  type TicketDocument,
  type TicketQuery,
} from "@cycle/database";
import { Effect, Layer } from "effect";
import {
  CanonicalTicketTypeIds,
  normalizeTicketTypeForRead,
  validateTicketTypeForWrite,
  type TicketTypeId,
} from "@cycle/contracts/schemas";
import {
  WorkflowPolicy,
  defineContractUseCase,
  ticketIdFromInput,
  type UseCaseContext,
  type WorkflowPolicyShape,
} from "./UseCaseDefinition.ts";
import { AgentTaskUsecasesLive } from "./AgentTasks.ts";
import {
  invalidInputFailure,
  mapDatabaseFailure,
  policyViolationFailure,
  useCaseFailure,
  type UseCaseFailure,
} from "./UseCaseFailure.ts";
import {
  RepositoryOpenService,
  RepositoryOpenServiceUnavailableLive,
} from "./RepositoryOpenService.ts";
import type { AutomationEvaluation, AutomationViolation } from "@cycle/contracts/schemas";
import type { UseCaseName } from "./contracts/index.ts";

const defaultTransitions: Readonly<Record<string, ReadonlyArray<string>>> = {
  backlog: ["todo", "ready", "canceled"],
  canceled: ["backlog", "todo"],
  done: ["in-review"],
  "in-progress": ["needs-review", "in-review", "todo", "canceled"],
  "in-review": ["needs-review", "done", "in-progress", "canceled"],
  "needs-review": ["todo", "ready", "in-progress", "in-review", "canceled"],
  ready: ["in-progress", "todo", "canceled"],
  todo: ["backlog", "ready", "in-progress", "canceled"],
};

const database = <A>(
  context: UseCaseContext,
  f: (db: DatabaseServiceShape) => Effect.Effect<A, unknown>,
): Effect.Effect<A, UseCaseFailure, DatabaseService> =>
  DatabaseService.use((db) => f(db).pipe(Effect.mapError(mapFailure(context))));

export const RepositoryOpen = defineContractUseCase("RepositoryOpen", (input, context) =>
  RepositoryOpenService.use((service) => service.open(input, context)),
);

export const RepositoryClose = defineContractUseCase("RepositoryClose", (_input, context) =>
  database(context, (db) => db.close),
);

export const RepositoryList = defineContractUseCase("RepositoryList", (_input, context) =>
  database(context, (db) => db.listRepositories),
);

export const RepositoryStatusGet = defineContractUseCase("RepositoryStatusGet", (input, context) =>
  database(context, (db) => db.repositoryStatus(input.repository.id)),
);

export const RepositoryMaterializationWarningsList = defineContractUseCase(
  "RepositoryMaterializationWarningsList",
  (input, context) => database(context, (db) => db.materializationWarnings(input.repository.id)),
);

export const RepositorySync = defineContractUseCase("RepositorySync", (input, context) =>
  database(context, (db) => db.syncRepository(input.repository.id)),
);

export const RepositoryPush = defineContractUseCase("RepositoryPush", (input, context) =>
  database(context, (db) => db.pushRepository(input.repository.id)),
);

export const RepositoryHistoryList = defineContractUseCase(
  "RepositoryHistoryList",
  (input, context) =>
    database(context, (db) =>
      db.repositoryHistory(input.repository.id, {
        cursor: input.input.cursor,
        limit: input.input.limit ?? input.input.max,
        ticketId: input.input.ticketId,
      }),
    ),
);

export const InboxList = defineContractUseCase("InboxList", (input, context) =>
  database(context, (db) => db.listInbox(input)),
);

export const InboxSummaryGet = defineContractUseCase("InboxSummaryGet", (input, context) =>
  database(context, (db) => db.inboxSummary(input)),
);

export const InboxMarkRead = defineContractUseCase("InboxMarkRead", (input, context) =>
  database(context, (db) => db.markInboxRead(input)),
);

export const InboxMarkUnread = defineContractUseCase("InboxMarkUnread", (input, context) =>
  database(context, (db) => db.markInboxUnread(input)),
);

export const InboxArchive = defineContractUseCase("InboxArchive", (input, context) =>
  database(context, (db) => db.archiveInboxItems(input)),
);

export const IssueCreate = defineContractUseCase("IssueCreate", (input, context) =>
  database(context, (db) =>
    db
      .createTicket(input.repository.id, input.input)
      .pipe(Effect.map(normalizeTicketDocumentForRead)),
  ),
);

export const IssueGet = defineContractUseCase("IssueGet", (input, context) =>
  database(context, (db) =>
    db
      .getTicket(input.repository.id, input.input.id)
      .pipe(
        Effect.map((ticket) => (ticket === null ? null : normalizeTicketDocumentForRead(ticket))),
      ),
  ),
);

export const IssueList = defineContractUseCase("IssueList", (input, context) =>
  database(context, (db) => {
    const query = input.input ?? {};
    const repositoryIds =
      query.repositoryIds !== undefined && query.repositoryIds.length > 0
        ? query.repositoryIds
        : [input.repository.id];

    return db.listTickets({ ...query, repositoryIds }).pipe(
      Effect.map((page) => ({
        ...page,
        entries: page.entries.map(normalizeTicketDocumentForRead),
      })),
    );
  }),
);

export const IssueSearch = defineContractUseCase("IssueSearch", (input, context) =>
  database(context, (db) =>
    db
      .searchTickets({
        ...input.input,
        repositoryIds:
          input.input.repositoryIds !== undefined && input.input.repositoryIds.length > 0
            ? input.input.repositoryIds
            : [input.repository.id],
      })
      .pipe(
        Effect.map((page) => ({
          ...page,
          entries: page.entries.map((entry) => ({
            ...entry,
            ticket: normalizeTicketDocumentForRead(entry.ticket),
          })),
        })),
      ),
  ),
);

export const IssueUpdate = defineContractUseCase("IssueUpdate", (input, context) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const policy = yield* WorkflowPolicy;
    const current = yield* readRequiredTicket(db, context, input.input.id);
    yield* policy.validateIssueUpdate(context, current, input.input.patch);

    return yield* db
      .updateTicket(input.repository.id, input.input.id, input.input.patch)
      .pipe(Effect.map(normalizeTicketDocumentForRead), Effect.mapError(mapFailure(context)));
  }),
);

export const IssueTransition = defineContractUseCase("IssueTransition", (input, context) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const policy = yield* WorkflowPolicy;
    const current = yield* readRequiredTicket(db, context, input.input.id);
    yield* policy.validateTransition(context, current, input.input.status);

    return yield* db
      .transitionTicket(input.repository.id, input.input.id, {
        reason: input.input.reason,
        status: input.input.status,
      })
      .pipe(Effect.map(normalizeTicketDocumentForRead), Effect.mapError(mapFailure(context)));
  }),
);

export const IssueArchive = defineContractUseCase("IssueArchive", (input, context) =>
  database(context, (db) =>
    db
      .archiveTicket(input.repository.id, input.input.id, { reason: input.input.reason })
      .pipe(Effect.map(normalizeTicketDocumentForRead)),
  ),
);

export const IssueRestore = defineContractUseCase("IssueRestore", (input, context) =>
  database(context, (db) =>
    db
      .restoreTicket(input.repository.id, input.input.id, { reason: input.input.reason })
      .pipe(Effect.map(normalizeTicketDocumentForRead)),
  ),
);

export const IssueDelete = defineContractUseCase("IssueDelete", (input, context) =>
  database(context, (db) =>
    db
      .deleteTicket(input.repository.id, input.input.id, { reason: input.input.reason })
      .pipe(Effect.map(normalizeTicketDocumentForRead)),
  ),
);

export const IssueHistoryList = defineContractUseCase("IssueHistoryList", (input, context) =>
  database(context, (db) =>
    db.ticketHistory(input.repository.id, input.input.id, {
      cursor: input.input.options?.cursor,
      limit: input.input.options?.limit ?? input.input.options?.max,
    }),
  ),
);

export const IssueRevisionGet = defineContractUseCase("IssueRevisionGet", (input, context) =>
  database(context, (db) =>
    db.ticketRevision(input.repository.id, input.input.id, input.input.snapshotId),
  ),
);

export const IssueDiff = defineContractUseCase("IssueDiff", (input, context) =>
  database(context, (db) =>
    db.ticketDiff(
      input.repository.id,
      input.input.id,
      input.input.fromSnapshotId,
      input.input.toSnapshotId,
    ),
  ),
);

export const IssueRelationAdd = defineContractUseCase("IssueRelationAdd", (input, context) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const policy = yield* WorkflowPolicy;
    const current = yield* readRequiredTicket(db, context, input.input.id);
    yield* policy.validateRelationAdd(context, current, input.input.relation);

    return yield* db
      .addIssueRelation(input.repository.id, input.input.id, input.input.relation)
      .pipe(Effect.map(normalizeTicketDocumentForRead), Effect.mapError(mapFailure(context)));
  }),
);

export const IssueRelationRemove = defineContractUseCase("IssueRelationRemove", (input, context) =>
  database(context, (db) =>
    db
      .removeIssueRelation(input.repository.id, input.input.id, input.input.relation)
      .pipe(Effect.map(normalizeTicketDocumentForRead)),
  ),
);

export const DraftCreate = defineContractUseCase("DraftCreate", (input, context) =>
  database(context, (db) => db.createDraft(input.repository.id, input.input)),
);

export const DraftUpdate = defineContractUseCase("DraftUpdate", (input, context) =>
  database(context, (db) =>
    db.updateDraft(input.repository.id, input.input.draftId, {
      body: input.input.body,
      frontmatter: input.input.frontmatter,
      status: input.input.status,
    }),
  ),
);

export const DraftCommit = defineContractUseCase("DraftCommit", (input, context) =>
  database(context, (db) =>
    db
      .commitDraft(input.repository.id, input.input)
      .pipe(Effect.map(normalizeTicketDocumentForRead)),
  ),
);

export const CommentAdd = defineContractUseCase("CommentAdd", (input, context) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    return yield* db
      .addComment(input.repository.id, input.input.issueId, { body: input.input.body })
      .pipe(Effect.mapError(mapFailure(context)));
  }),
);

export const RecordAdd = defineContractUseCase("RecordAdd", (input, context) =>
  database(context, (db) =>
    db.addRecord(input.repository.id, input.input.issueId, {
      payload: input.input.payload,
      recordType: input.input.recordType,
      userVisible: input.input.userVisible,
    }),
  ),
);

export const RecordListForIssue = defineContractUseCase("RecordListForIssue", (input, context) =>
  database(context, (db) =>
    db.ticketRecords(input.repository.id, input.input.issueId, input.input.query),
  ),
);

export const InitiativeCreate = defineContractUseCase("InitiativeCreate", (input, context) =>
  database(context, (db) => db.createInitiative(input.repository.id, input.input)),
);

export const InitiativeProgressGet = defineContractUseCase(
  "InitiativeProgressGet",
  (input, context) =>
    database(context, (db) => db.initiativeProgress(input.repository.id, input.input.id)),
);

export const InitiativeUpdateAdd = defineContractUseCase("InitiativeUpdateAdd", (input, context) =>
  database(context, (db) =>
    db.addInitiativeUpdate(input.repository.id, input.input.id, input.input.update),
  ),
);

export const LabelList = defineContractUseCase("LabelList", (input, context) =>
  database(context, (db) => db.listLabels(input.repository.id, input.input)),
);

export const LabelUpsert = defineContractUseCase("LabelUpsert", (input, context) =>
  database(context, (db) => db.upsertLabel(input.repository.id, input.input)),
);

export const LabelArchive = defineContractUseCase("LabelArchive", (input, context) =>
  database(context, (db) => db.archiveLabel(input.repository.id, input.input.id)),
);

export const UserGet = defineContractUseCase("UserGet", (input, context) =>
  database(context, (db) => db.getUser(input.repository.id, input.input)),
);

export const UserList = defineContractUseCase("UserList", (input, context) =>
  database(context, (db) => db.listUsers(input.repository.id, input.input)),
);

export const UserUpsert = defineContractUseCase("UserUpsert", (input, context) =>
  database(context, (db) => db.upsertUser(input.repository.id, input.input)),
);

export const ViewCreate = defineContractUseCase("ViewCreate", (input, context) =>
  database(context, (db) => db.createView(input.repository.id, input.input)),
);

export const ViewGet = defineContractUseCase("ViewGet", (input, context) =>
  database(context, (db) => db.getView(input.repository.id, input.input.id)),
);

export const ViewList = defineContractUseCase("ViewList", (input, context) =>
  database(context, (db) => db.listViews(input.repository.id, input.input)),
);

export const ViewUpdate = defineContractUseCase("ViewUpdate", (input, context) =>
  database(context, (db) => db.updateView(input.repository.id, input.input.id, input.input.patch)),
);

export const ViewDelete = defineContractUseCase("ViewDelete", (input, context) =>
  database(context, (db) => db.deleteView(input.repository.id, input.input.id)),
);

export const TemplateCreate = defineContractUseCase("TemplateCreate", (input, context) =>
  database(context, (db) => db.createTemplate(input.repository.id, input.input)),
);

export const TemplateGet = defineContractUseCase("TemplateGet", (input, context) =>
  database(context, (db) => db.getTemplate(input.repository.id, input.input.id)),
);

export const TemplateList = defineContractUseCase("TemplateList", (input, context) =>
  database(context, (db) => db.listTemplates(input.repository.id, input.input)),
);

export const TemplateUpdate = defineContractUseCase("TemplateUpdate", (input, context) =>
  database(context, (db) =>
    db.updateTemplate(input.repository.id, input.input.id, input.input.patch),
  ),
);

export const TemplateArchive = defineContractUseCase("TemplateArchive", (input, context) =>
  database(context, (db) => db.archiveTemplate(input.repository.id, input.input.id)),
);

export const AutomationEvaluateRepository = defineContractUseCase(
  "AutomationEvaluateRepository",
  (_input, context) => evaluateRepository(context),
);

export const AutomationEvaluateIssues = defineContractUseCase(
  "AutomationEvaluateIssues",
  (input, context) => evaluateIssues(context, { ticketIds: input.issueIds }),
);

export const AutomationEvaluateQuery = defineContractUseCase(
  "AutomationEvaluateQuery",
  (input, context) => evaluateIssues(context, { query: input.query }),
);

const mapFailure =
  (context: UseCaseContext) =>
  (error: unknown): UseCaseFailure => {
    const failure = mapDatabaseFailure(error, {
      requestId: context.requestId,
      repositoryId: context.repositoryId,
      ticketId: ticketIdFromInput(context.input),
      useCase: context.name,
    });

    return context.name === "RepositoryPush" &&
      (failure._tag === "StorageFailure" || failure._tag === "SyncFailure")
      ? {
          ...failure,
          _tag: "PushFailure",
          code: "PUSH_FAILURE",
        }
      : failure;
  };

const readRequiredTicket = (
  db: DatabaseServiceShape,
  context: UseCaseContext,
  ticketId: string,
): Effect.Effect<TicketDocument, UseCaseFailure> =>
  db.getTicket(context.repositoryId ?? "", ticketId).pipe(
    Effect.mapError(mapFailure(context)),
    Effect.flatMap((ticket) =>
      ticket === null
        ? Effect.fail(
            useCaseFailure({
              code: "TICKET_NOT_FOUND",
              message: `Ticket not found: ${ticketId}`,
              repositoryId: context.repositoryId,
              requestId: context.requestId,
              tag: "NotFoundFailure",
              ticketId,
              useCase: context.name,
            }),
          )
        : Effect.succeed(ticket),
    ),
  );

const normalizeTicketDocumentForRead = (ticket: TicketDocument): TicketDocument => {
  const topLevelType = (ticket as { readonly type?: unknown }).type;
  const frontmatterType = (ticket.frontmatter as { readonly type?: unknown }).type;
  const rawType =
    typeof topLevelType === "string" && topLevelType.trim() !== "" ? topLevelType : frontmatterType;
  const normalized = normalizeTicketTypeForRead(rawType);

  if (ticket.type === normalized.type && ticket.frontmatter.type === normalized.type) {
    return ticket;
  }

  return {
    ...ticket,
    frontmatter: {
      ...ticket.frontmatter,
      type: normalized.type,
    },
    type: normalized.type,
  };
};

const validateTicketTypeWritePolicy = (
  context: UseCaseContext,
  value: unknown,
  field: string,
): Effect.Effect<TicketTypeId, UseCaseFailure> => {
  const validation = validateTicketTypeForWrite(value);
  if (validation.type === "valid") return Effect.succeed(validation.value);

  const messages = {
    "display-label": "Ticket type must be a canonical ID, not a display label.",
    empty: "Ticket type is required.",
    missing: "Ticket type is required.",
    unknown: "Ticket type must be one of the canonical ticket type IDs.",
  } as const;

  return Effect.fail(
    invalidInputFailure({
      details: {
        allowedTypeIds: CanonicalTicketTypeIds,
        reason: validation.reason,
        value: validation.value,
      },
      field,
      message: messages[validation.reason],
      requestId: context.requestId,
      useCase: context.name,
    }),
  );
};

const validateIssueUpdate = (
  context: UseCaseContext,
  current: TicketDocument,
  patch: { readonly body?: string; readonly frontmatter?: Readonly<Record<string, unknown>> },
): Effect.Effect<void, UseCaseFailure> =>
  Effect.gen(function* () {
    if (current.status === "in-progress" && patch.body !== undefined) {
      const changed = protectedSectionsChanged(current.body, patch.body);

      if (changed.length > 0) {
        return yield* Effect.fail(
          policyViolationFailure({
            code: "PROTECTED_SECTIONS_CHANGED",
            details: { sections: changed },
            message: `Protected sections changed: ${changed.join(", ")}`,
            repositoryId: context.repositoryId,
            requestId: context.requestId,
            ticketId: current.id,
            useCase: context.name,
          }),
        );
      }
    }

    const nextStatus = patch.frontmatter?.["status"];
    if (typeof nextStatus === "string" && nextStatus !== current.status) {
      yield* validateTransition(context, current, nextStatus);
    }

    if (Object.hasOwn(patch.frontmatter ?? {}, "type")) {
      yield* validateTicketTypeWritePolicy(
        context,
        patch.frontmatter?.["type"],
        "patch.frontmatter.type",
      );
    }
  });

const validateTransition = (
  context: UseCaseContext,
  ticket: TicketDocument,
  to: string,
): Effect.Effect<void, UseCaseFailure> => {
  const fromKey = normalizeKey(ticket.status);
  const toKey = normalizeKey(to);
  const actor = context.actor;
  const allowed = defaultTransitions[fromKey] ?? [];

  return toKey === "done" && actor?.type !== "human"
    ? Effect.fail(
        policyViolationFailure({
          code: "HUMAN_APPROVAL_REQUIRED",
          message: `Only an explicit human actor can mark ticket ${ticket.id} done.`,
          repositoryId: context.repositoryId,
          requestId: context.requestId,
          ticketId: ticket.id,
          useCase: context.name,
        }),
      )
    : fromKey === "done" && actor?.type !== "human"
      ? Effect.fail(
          policyViolationFailure({
            code: "HUMAN_REOPEN_REQUIRED",
            message: `Only an explicit human actor can transition ticket ${ticket.id} away from done.`,
            repositoryId: context.repositoryId,
            requestId: context.requestId,
            ticketId: ticket.id,
            useCase: context.name,
          }),
        )
      : toKey === "ready" &&
          !ticket.frontmatter.planningNotRequired &&
          !ticket.frontmatter.planAcceptedAt
        ? Effect.fail(
            policyViolationFailure({
              code: "PLAN_REQUIRED",
              message: `Ticket ${ticket.id} requires accepted planning before ready.`,
              repositoryId: context.repositoryId,
              requestId: context.requestId,
              ticketId: ticket.id,
              useCase: context.name,
            }),
          )
        : !allowed.includes(toKey) && actor !== undefined && actor.type !== "human"
          ? Effect.fail(
              policyViolationFailure({
                code: "TRANSITION_NOT_ALLOWED",
                details: { from: fromKey, to: toKey },
                message: `Transition from ${fromKey} to ${toKey} is not allowed.`,
                repositoryId: context.repositoryId,
                requestId: context.requestId,
                ticketId: ticket.id,
                useCase: context.name,
              }),
            )
          : Effect.void;
};

const validateRelationAdd = (
  context: UseCaseContext,
  ticket: TicketDocument,
  relation: IssueRelation,
): Effect.Effect<void, UseCaseFailure> => {
  const duplicate = (ticket.frontmatter.relations ?? []).some(
    (current) => current.issueId === relation.issueId && current.type === relation.type,
  );

  return relation.issueId === ticket.id
    ? Effect.fail(
        policyViolationFailure({
          code: "SELF_RELATION",
          message: "An issue cannot relate to itself.",
          repositoryId: context.repositoryId,
          requestId: context.requestId,
          ticketId: ticket.id,
          useCase: context.name,
        }),
      )
    : duplicate
      ? Effect.fail(
          policyViolationFailure({
            code: "DUPLICATE_RELATION",
            message: "The issue relation already exists.",
            repositoryId: context.repositoryId,
            requestId: context.requestId,
            ticketId: ticket.id,
            useCase: context.name,
          }),
        )
      : Effect.void;
};

const evaluateRepository = (
  context: UseCaseContext,
): Effect.Effect<AutomationEvaluation, UseCaseFailure, DatabaseService> =>
  Effect.gen(function* () {
    if (context.repositoryId === undefined) {
      return yield* Effect.fail(
        invalidInputFailure({
          message: "Automation evaluation requires a repository id.",
          requestId: context.requestId,
          useCase: context.name,
        }),
      );
    }

    const status = yield* database(context, (db) => db.repositoryStatus(context.repositoryId!));
    const warnings = yield* database(context, (db) =>
      db.materializationWarnings(context.repositoryId!),
    );
    const violations: Array<AutomationViolation> = [];

    if (status.status === "failed") {
      violations.push({
        code: "REPOSITORY_SYNC_FAILED",
        message: status.lastSyncError ?? "Repository sync failed.",
        severity: "error",
      });
    }

    if (warnings.length > 0) {
      violations.push({
        code: "MATERIALIZATION_WARNINGS",
        message: `Repository has ${warnings.length} materialization warning(s).`,
        severity: "warning",
      });
    }

    return automationReport({
      checkedTicketIds: [],
      checkedUseCase: "AutomationEvaluateRepository",
      repositoryId: context.repositoryId,
      violations,
      warnings: warnings.map((warning) => warning.message),
    });
  });

const evaluateIssues = (
  context: UseCaseContext,
  input: {
    readonly query?: TicketQuery;
    readonly ticketIds?: ReadonlyArray<string>;
  },
): Effect.Effect<AutomationEvaluation, UseCaseFailure, DatabaseService> =>
  Effect.gen(function* () {
    if (context.repositoryId === undefined) {
      return yield* Effect.fail(
        invalidInputFailure({
          message: "Automation evaluation requires a repository id.",
          requestId: context.requestId,
          useCase: context.name,
        }),
      );
    }

    const page =
      input.ticketIds === undefined
        ? yield* database(context, (db) =>
            db.listTickets({
              ...input.query,
              repositoryIds: [context.repositoryId!],
            }),
          )
        : yield* Effect.forEach(input.ticketIds, (ticketId) =>
            database(context, (db) => db.getTicket(context.repositoryId!, ticketId)),
          ).pipe(
            Effect.map((entries) => ({
              entries: entries.filter((ticket): ticket is TicketDocument => ticket !== null),
            })),
          );

    const warnings = yield* database(context, (db) =>
      db.materializationWarnings(context.repositoryId!),
    );
    const violations = page.entries.flatMap(issueViolations);

    if (warnings.length > 0) {
      violations.push({
        code: "MATERIALIZATION_WARNINGS",
        message: `Repository has ${warnings.length} materialization warning(s).`,
        severity: "warning",
      });
    }

    return automationReport({
      checkedTicketIds: page.entries.map((ticket) => ticket.id),
      checkedUseCase:
        context.name === "AutomationEvaluateQuery"
          ? "AutomationEvaluateQuery"
          : "AutomationEvaluateIssues",
      repositoryId: context.repositoryId,
      violations,
      warnings: warnings.map((warning) => warning.message),
    });
  });

const issueViolations = (ticket: TicketDocument): ReadonlyArray<AutomationViolation> => {
  const violations: Array<AutomationViolation> = [];
  const status = normalizeKey(ticket.status);

  if (
    (status === "ready" || status === "in-progress") &&
    !ticket.frontmatter.planningNotRequired &&
    !ticket.frontmatter.planAcceptedAt
  ) {
    violations.push({
      code: "PLAN_REQUIRED",
      message: `Ticket ${ticket.id} is ${status} without accepted planning.`,
      remediation: "Accept the plan or mark planning as not required.",
      severity: "error",
      ticketId: ticket.id,
    });
  }

  if (status === "done" && ticket.frontmatter.planAcceptedBy?.type !== "human") {
    violations.push({
      code: "HUMAN_APPROVAL_REQUIRED",
      message: `Ticket ${ticket.id} is done without a human approval marker.`,
      remediation: "Record human approval before treating the ticket as complete.",
      severity: "error",
      ticketId: ticket.id,
    });
  }

  return violations;
};

const automationReport = (input: {
  readonly checkedTicketIds: ReadonlyArray<string>;
  readonly checkedUseCase: AutomationEvaluation["checkedUseCase"];
  readonly repositoryId: string;
  readonly violations: ReadonlyArray<AutomationViolation>;
  readonly warnings: ReadonlyArray<string>;
}): AutomationEvaluation => {
  const hasError = input.violations.some(
    (violation) => violation.severity === "error" || violation.severity === "fatal",
  );
  const hasWarning = input.violations.some((violation) => violation.severity === "warning");
  const status = hasError ? "fail" : hasWarning ? "warn" : "pass";

  return {
    checkedAt: new Date(0).toISOString(),
    checkedTicketIds: input.checkedTicketIds,
    checkedUseCase: input.checkedUseCase,
    repositoryId: input.repositoryId,
    status,
    summary:
      status === "pass"
        ? "Automation checks passed."
        : `Automation checks found ${input.violations.length} issue(s).`,
    violations: input.violations,
    warnings: input.warnings,
  };
};

export const WorkflowPolicyLive = Layer.succeed(
  WorkflowPolicy,
  WorkflowPolicy.of({
    validateIssueUpdate,
    validateRelationAdd,
    validateTransition,
  } satisfies WorkflowPolicyShape),
);

export const UseCaseServicesLive = Layer.mergeAll(
  WorkflowPolicyLive,
  AgentTaskUsecasesLive,
  RepositoryOpenServiceUnavailableLive,
);

export type CycleUseCaseName = UseCaseName;
