import {
  DatabaseService,
  DatabaseTest,
  normalizeKey,
  protectedSectionsChanged,
  type DatabaseServiceShape,
  type IssueRelation,
  type TicketDocument,
  type TicketQuery,
} from "@cycle/database";
import { Cause, Context, Duration, Effect, Layer, Result, Schema } from "effect";
import {
  contractFor,
  type AutomationEvaluation,
  type AutomationViolation,
  type CycleUseCase,
  type UseCaseContract,
  type UseCaseInput,
  type UseCaseName,
  type UseCaseSuccess,
} from "./contracts/index.ts";
import {
  invalidInputFailure,
  mapDatabaseFailure,
  policyViolationFailure,
  useCaseFailure,
  type UseCaseFailure,
} from "./UseCaseFailure.ts";

export type UseCaseRunnerShape = {
  readonly run: <Name extends UseCaseName>(
    useCase: CycleUseCase<Name>,
  ) => Effect.Effect<UseCaseSuccess<Name>, UseCaseFailure>;
};

export type UseCasePersistenceGatewayShape = DatabaseServiceShape;

export class UseCaseRunner extends Context.Service<UseCaseRunner, UseCaseRunnerShape>()(
  "@cycle/usecases/UseCaseRunner",
) {}

type RequestContext<Name extends UseCaseName = UseCaseName> = {
  readonly requestId: string;
  readonly source: string;
  readonly useCase: CycleUseCase<Name>;
};

const defaultTransitions: Readonly<Record<string, ReadonlyArray<string>>> = {
  backlog: ["todo", "ready", "canceled"],
  canceled: ["backlog", "todo"],
  done: ["in-review"],
  "in-progress": ["needs-review", "in-review", "canceled"],
  "in-review": ["needs-review", "done", "in-progress", "canceled"],
  "needs-review": ["todo", "ready", "in-progress", "in-review", "canceled"],
  ready: ["in-progress", "todo", "canceled"],
  todo: ["backlog", "ready", "canceled"],
};

export const makeUseCaseRunner = (database: UseCasePersistenceGatewayShape): UseCaseRunnerShape => {
  let requestCounter = 0;

  const requestContext = <Name extends UseCaseName>(
    useCase: CycleUseCase<Name>,
  ): RequestContext<Name> => ({
    requestId: useCase.meta?.requestId ?? `usecase-${++requestCounter}`,
    source: useCase.meta?.source ?? "internal",
    useCase,
  });

  const run = <Name extends UseCaseName>(
    useCase: CycleUseCase<Name>,
  ): Effect.Effect<UseCaseSuccess<Name>, UseCaseFailure> => {
    const context = requestContext(useCase);
    const contract = contractFor(useCase.name);
    const annotations = useCaseExecutionAnnotations(context, contract.sideEffect);

    const program = validateUseCaseMetadata(context, contract).pipe(
      Effect.andThen(
        Schema.decodeUnknownEffect(contract.inputSchema)(useCase.input).pipe(
          Effect.mapError((error) =>
            invalidInputFailure({
              details: {
                parseError: String(error),
              },
              message: `Invalid input for ${useCase.name}.`,
              requestId: context.requestId,
              useCase: useCase.name,
            }),
          ),
        ),
      ),
      Effect.flatMap((decoded) =>
        execute(database, {
          ...context,
          useCase: {
            ...useCase,
            input: decoded as UseCaseInput<Name>,
          },
        }),
      ),
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(contract.successSchema)(value).pipe(
          Effect.mapError((error) =>
            useCaseFailure({
              code: "INVALID_USECASE_SUCCESS",
              details: { parseError: String(error) },
              message: `Usecase ${useCase.name} produced an invalid success value.`,
              requestId: context.requestId,
              tag: "UnexpectedDefectFailure",
              useCase: useCase.name,
            }),
          ),
        ),
      ),
      Effect.map((value) => value as UseCaseSuccess<Name>),
    ) as Effect.Effect<UseCaseSuccess<Name>, UseCaseFailure>;

    return applyDeadline(context, program).pipe(
      Effect.tapCause((cause) => logUnexpectedUseCaseCause(annotations, cause)),
      Effect.result,
      Effect.timed,
      Effect.tap(([duration, result]) =>
        Effect.logInfo("usecase execution completed").pipe(
          Effect.annotateLogs({
            ...annotations,
            durationMs: Duration.toMillis(duration),
            failureTag: Result.isFailure(result) ? result.failure._tag : null,
            result: Result.isSuccess(result) ? "success" : "failure",
          }),
        ),
      ),
      Effect.flatMap(([, result]) =>
        Result.isSuccess(result) ? Effect.succeed(result.success) : Effect.fail(result.failure),
      ),
      Effect.withSpan("cycle.usecase", {
        attributes: annotations,
      }),
      Effect.annotateLogs(annotations),
    );
  };

  return { run };
};

const logUnexpectedUseCaseCause = (
  annotations: Readonly<Record<string, unknown>>,
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> => {
  if (!Cause.hasDies(cause) && !Cause.hasInterrupts(cause)) {
    return Effect.void;
  }

  return Effect.logError("usecase execution interrupted or defected").pipe(
    Effect.annotateLogs({
      ...annotations,
      cause: Cause.pretty(cause),
      defect: Cause.hasDies(cause),
      interrupted: Cause.hasInterrupts(cause),
    }),
  );
};

const execute = <Name extends UseCaseName>(
  database: DatabaseServiceShape,
  context: RequestContext<Name>,
): Effect.Effect<unknown, UseCaseFailure> => {
  const useCase = context.useCase as CycleUseCase & {
    readonly input: any;
  };

  switch (useCase.name) {
    case "RepositoryOpen":
      return database.openRepository(useCase.input).pipe(Effect.mapError(mapFailure(context)));
    case "RepositoryClose":
      return database.close();
    case "RepositoryList":
      return database.listRepositories().pipe(Effect.mapError(mapFailure(context)));
    case "RepositoryStatusGet":
      return database
        .repositoryStatus(useCase.input.repository.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "RepositoryMaterializationWarningsList":
      return database
        .materializationWarnings(useCase.input.repository.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "RepositorySync":
      return database
        .syncRepository(useCase.input.repository.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "RepositoryPush":
      return database
        .pushRepository(useCase.input.repository.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "RepositoryHistoryList": {
      const input = useCase.input.input;
      return database
        .repositoryHistory(useCase.input.repository.id, {
          cursor: input.cursor,
          limit: input.limit ?? input.max,
          ticketId: input.ticketId,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    }
    case "IssueCreate":
      return database
        .createTicket(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "IssueGet":
      return database
        .getTicket(useCase.input.repository.id, useCase.input.input.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "IssueList": {
      const input = useCase.input.input ?? {};
      const repositoryIds =
        input.repositoryIds !== undefined && input.repositoryIds.length > 0
          ? input.repositoryIds
          : [useCase.input.repository.id];
      return database
        .listTickets({
          ...input,
          repositoryIds,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    }
    case "IssueSearch": {
      const input = useCase.input.input;
      return database
        .searchTickets({
          ...input,
          repositoryIds:
            input.repositoryIds !== undefined && input.repositoryIds.length > 0
              ? input.repositoryIds
              : [useCase.input.repository.id],
        })
        .pipe(Effect.mapError(mapFailure(context)));
    }
    case "IssueUpdate":
      return Effect.gen(function* () {
        const current = yield* readRequiredTicket(database, context, useCase.input.input.id);
        yield* validateIssueUpdatePolicy(context, current, useCase.input.input.patch);
        return yield* database
          .updateTicket(
            useCase.input.repository.id,
            useCase.input.input.id,
            useCase.input.input.patch,
          )
          .pipe(Effect.mapError(mapFailure(context)));
      });
    case "IssueTransition":
      return Effect.gen(function* () {
        const current = yield* readRequiredTicket(database, context, useCase.input.input.id);
        yield* validateTransitionPolicy(context, current, useCase.input.input.status);
        return yield* database
          .transitionTicket(useCase.input.repository.id, useCase.input.input.id, {
            reason: useCase.input.input.reason,
            status: useCase.input.input.status,
          })
          .pipe(Effect.mapError(mapFailure(context)));
      });
    case "IssueArchive":
      return database
        .archiveTicket(useCase.input.repository.id, useCase.input.input.id, {
          reason: useCase.input.input.reason,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    case "IssueRestore":
      return database
        .restoreTicket(useCase.input.repository.id, useCase.input.input.id, {
          reason: useCase.input.input.reason,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    case "IssueDelete":
      return database
        .deleteTicket(useCase.input.repository.id, useCase.input.input.id, {
          reason: useCase.input.input.reason,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    case "IssueHistoryList": {
      const input = useCase.input.input;
      return database
        .ticketHistory(useCase.input.repository.id, input.id, {
          cursor: input.options?.cursor,
          limit: input.options?.limit ?? input.options?.max,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    }
    case "IssueRevisionGet":
      return database
        .ticketRevision(
          useCase.input.repository.id,
          useCase.input.input.id,
          useCase.input.input.snapshotId,
        )
        .pipe(Effect.mapError(mapFailure(context)));
    case "IssueDiff":
      return database
        .ticketDiff(
          useCase.input.repository.id,
          useCase.input.input.id,
          useCase.input.input.fromSnapshotId,
          useCase.input.input.toSnapshotId,
        )
        .pipe(Effect.mapError(mapFailure(context)));
    case "IssueRelationAdd":
      return Effect.gen(function* () {
        const current = yield* readRequiredTicket(database, context, useCase.input.input.id);
        yield* validateRelationAddPolicy(context, current, useCase.input.input.relation);
        return yield* database
          .addIssueRelation(
            useCase.input.repository.id,
            useCase.input.input.id,
            useCase.input.input.relation,
          )
          .pipe(Effect.mapError(mapFailure(context)));
      });
    case "IssueRelationRemove":
      return database
        .removeIssueRelation(
          useCase.input.repository.id,
          useCase.input.input.id,
          useCase.input.input.relation,
        )
        .pipe(Effect.mapError(mapFailure(context)));
    case "DraftCreate":
      return database
        .createDraft(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "DraftUpdate":
      return database
        .updateDraft(useCase.input.repository.id, useCase.input.input.draftId, {
          body: useCase.input.input.body,
          frontmatter: useCase.input.input.frontmatter,
          status: useCase.input.input.status,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    case "DraftCommit":
      return database
        .commitDraft(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "CommentAdd":
      return database
        .addComment(useCase.input.repository.id, useCase.input.input.issueId, {
          body: useCase.input.input.body,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    case "RecordAdd":
      return database
        .addRecord(useCase.input.repository.id, useCase.input.input.issueId, {
          payload: useCase.input.input.payload,
          recordType: useCase.input.input.recordType,
          userVisible: useCase.input.input.userVisible,
        })
        .pipe(Effect.mapError(mapFailure(context)));
    case "RecordListForIssue":
      return database
        .ticketRecords(
          useCase.input.repository.id,
          useCase.input.input.issueId,
          useCase.input.input.query,
        )
        .pipe(Effect.mapError(mapFailure(context)));
    case "InitiativeCreate":
      return database
        .createInitiative(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "InitiativeProgressGet":
      return database
        .initiativeProgress(useCase.input.repository.id, useCase.input.input.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "InitiativeUpdateAdd":
      return database
        .addInitiativeUpdate(
          useCase.input.repository.id,
          useCase.input.input.id,
          useCase.input.input.update,
        )
        .pipe(Effect.mapError(mapFailure(context)));
    case "LabelList":
      return database
        .listLabels(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "LabelUpsert":
      return database
        .upsertLabel(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "LabelArchive":
      return database
        .archiveLabel(useCase.input.repository.id, useCase.input.input.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "UserGet":
      return database
        .getUser(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "UserList":
      return database
        .listUsers(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "UserUpsert":
      return database
        .upsertUser(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "ViewCreate":
      return database
        .createView(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "ViewGet":
      return database
        .getView(useCase.input.repository.id, useCase.input.input.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "ViewList":
      return database
        .listViews(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "ViewUpdate":
      return database
        .updateView(useCase.input.repository.id, useCase.input.input.id, useCase.input.input.patch)
        .pipe(Effect.mapError(mapFailure(context)));
    case "ViewDelete":
      return database
        .deleteView(useCase.input.repository.id, useCase.input.input.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "TemplateCreate":
      return database
        .createTemplate(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "TemplateGet":
      return database
        .getTemplate(useCase.input.repository.id, useCase.input.input.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "TemplateList":
      return database
        .listTemplates(useCase.input.repository.id, useCase.input.input)
        .pipe(Effect.mapError(mapFailure(context)));
    case "TemplateUpdate":
      return database
        .updateTemplate(
          useCase.input.repository.id,
          useCase.input.input.id,
          useCase.input.input.patch,
        )
        .pipe(Effect.mapError(mapFailure(context)));
    case "TemplateArchive":
      return database
        .archiveTemplate(useCase.input.repository.id, useCase.input.input.id)
        .pipe(Effect.mapError(mapFailure(context)));
    case "AutomationEvaluateRepository":
      return evaluateRepository(database, context);
    case "AutomationEvaluateIssues":
      return evaluateIssues(database, context, {
        ticketIds: useCase.input.issueIds,
      });
    case "AutomationEvaluateQuery":
      return evaluateIssues(database, context, {
        query: useCase.input.query,
      });
  }

  return unhandledUseCase(useCase.name);
};

const useCaseExecutionAnnotations = <Name extends UseCaseName>(
  context: RequestContext<Name>,
  sideEffect: string,
): Record<string, unknown> => ({
  actorType: context.useCase.meta?.actor?.type ?? null,
  dryRun: context.useCase.meta?.dryRun ?? false,
  hasIdempotencyKey: context.useCase.meta?.idempotencyKey !== undefined,
  hasTraceContext: context.useCase.meta?.traceContext !== undefined,
  requestId: context.requestId,
  repositoryId: repositoryIdFromInput(context.useCase.input) ?? null,
  sideEffect,
  source: context.source,
  useCase: context.useCase.name,
});

const validateUseCaseMetadata = <Name extends UseCaseName>(
  context: RequestContext<Name>,
  contract: UseCaseContract<Name>,
): Effect.Effect<void, UseCaseFailure> => {
  const meta = context.useCase.meta;

  if (meta?.idempotencyKey !== undefined && contract.idempotency === "not-supported") {
    return Effect.fail(
      invalidInputFailure({
        details: {
          idempotency: contract.idempotency,
        },
        field: "meta.idempotencyKey",
        message: `Usecase ${context.useCase.name} does not accept an idempotency key.`,
        requestId: context.requestId,
        useCase: context.useCase.name,
      }),
    );
  }

  if (meta?.idempotencyKey === undefined && contract.idempotency === "required") {
    return Effect.fail(
      invalidInputFailure({
        details: {
          idempotency: contract.idempotency,
        },
        field: "meta.idempotencyKey",
        message: `Usecase ${context.useCase.name} requires an idempotency key.`,
        requestId: context.requestId,
        useCase: context.useCase.name,
      }),
    );
  }

  if (
    meta?.dryRun === true &&
    (contract.sideEffect === "push" ||
      contract.sideEffect === "sync" ||
      contract.sideEffect === "write")
  ) {
    return Effect.fail(
      invalidInputFailure({
        details: {
          sideEffect: contract.sideEffect,
        },
        field: "meta.dryRun",
        message: `Usecase ${context.useCase.name} does not support dry-run execution.`,
        requestId: context.requestId,
        useCase: context.useCase.name,
      }),
    );
  }

  if (meta?.deadline !== undefined && !Number.isFinite(meta.deadline)) {
    return Effect.fail(
      invalidInputFailure({
        field: "meta.deadline",
        message: `Usecase ${context.useCase.name} has an invalid deadline.`,
        requestId: context.requestId,
        useCase: context.useCase.name,
      }),
    );
  }

  return Effect.void;
};

const applyDeadline = <A, Name extends UseCaseName>(
  context: RequestContext<Name>,
  effect: Effect.Effect<A, UseCaseFailure>,
): Effect.Effect<A, UseCaseFailure> => {
  const deadline = context.useCase.meta?.deadline;

  if (deadline === undefined) return effect;

  const remainingMs = deadline - Date.now();
  const timeoutFailure = () =>
    useCaseFailure({
      code: "DEADLINE_EXCEEDED",
      details: {
        deadline,
      },
      message: `Usecase ${context.useCase.name} exceeded its deadline.`,
      requestId: context.requestId,
      retryable: true,
      tag: "TimeoutFailure",
      useCase: context.useCase.name,
    });

  if (remainingMs <= 0) {
    return Effect.fail(timeoutFailure());
  }

  return effect.pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(remainingMs),
      orElse: () => Effect.fail(timeoutFailure()),
    }),
  );
};

const unhandledUseCase = (name: never): Effect.Effect<never, UseCaseFailure> =>
  Effect.die(new Error(`Unhandled usecase: ${String(name)}`));

const mapFailure =
  <Name extends UseCaseName>(context: RequestContext<Name>) =>
  (error: unknown): UseCaseFailure => {
    const failure = mapDatabaseFailure(error, {
      requestId: context.requestId,
      repositoryId: repositoryIdFromInput(context.useCase.input),
      ticketId: ticketIdFromInput(context.useCase.input),
      useCase: context.useCase.name,
    });

    return context.useCase.name === "RepositoryPush" &&
      (failure._tag === "StorageFailure" || failure._tag === "SyncFailure")
      ? {
          ...failure,
          _tag: "PushFailure",
          code: "PUSH_FAILURE",
        }
      : failure;
  };

const readRequiredTicket = <Name extends UseCaseName>(
  database: DatabaseServiceShape,
  context: RequestContext<Name>,
  ticketId: string,
): Effect.Effect<TicketDocument, UseCaseFailure> =>
  database.getTicket(repositoryIdFromInput(context.useCase.input) ?? "", ticketId).pipe(
    Effect.mapError(mapFailure(context)),
    Effect.flatMap((ticket) =>
      ticket === null
        ? Effect.fail(
            useCaseFailure({
              code: "TICKET_NOT_FOUND",
              message: `Ticket not found: ${ticketId}`,
              repositoryId: repositoryIdFromInput(context.useCase.input),
              requestId: context.requestId,
              tag: "NotFoundFailure",
              ticketId,
              useCase: context.useCase.name,
            }),
          )
        : Effect.succeed(ticket),
    ),
  );

const validateIssueUpdatePolicy = <Name extends UseCaseName>(
  context: RequestContext<Name>,
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
            repositoryId: repositoryIdFromInput(context.useCase.input),
            requestId: context.requestId,
            ticketId: current.id,
            useCase: context.useCase.name,
          }),
        );
      }
    }

    const nextStatus = patch.frontmatter?.["status"];
    if (typeof nextStatus === "string" && nextStatus !== current.status) {
      yield* validateTransitionPolicy(context, current, nextStatus);
    }
  });

const validateTransitionPolicy = <Name extends UseCaseName>(
  context: RequestContext<Name>,
  ticket: TicketDocument,
  to: string,
): Effect.Effect<void, UseCaseFailure> => {
  const fromKey = normalizeKey(ticket.status);
  const toKey = normalizeKey(to);
  const actor = context.useCase.meta?.actor;
  const allowed = defaultTransitions[fromKey] ?? [];

  if (toKey === "done" && actor !== undefined && actor.type !== "human") {
    return Effect.fail(
      policyViolationFailure({
        code: "HUMAN_APPROVAL_REQUIRED",
        message: `Only a human actor can mark ticket ${ticket.id} done.`,
        repositoryId: repositoryIdFromInput(context.useCase.input),
        requestId: context.requestId,
        ticketId: ticket.id,
        useCase: context.useCase.name,
      }),
    );
  }

  if (fromKey === "done" && actor !== undefined && actor.type !== "human") {
    return Effect.fail(
      policyViolationFailure({
        code: "HUMAN_REOPEN_REQUIRED",
        message: `Only a human actor can transition ticket ${ticket.id} away from done.`,
        repositoryId: repositoryIdFromInput(context.useCase.input),
        requestId: context.requestId,
        ticketId: ticket.id,
        useCase: context.useCase.name,
      }),
    );
  }

  if (
    toKey === "ready" &&
    !ticket.frontmatter.planningNotRequired &&
    !ticket.frontmatter.planAcceptedAt
  ) {
    return Effect.fail(
      policyViolationFailure({
        code: "PLAN_REQUIRED",
        message: `Ticket ${ticket.id} requires accepted planning before ready.`,
        repositoryId: repositoryIdFromInput(context.useCase.input),
        requestId: context.requestId,
        ticketId: ticket.id,
        useCase: context.useCase.name,
      }),
    );
  }

  if (!allowed.includes(toKey) && actor !== undefined && actor.type !== "human") {
    return Effect.fail(
      policyViolationFailure({
        code: "TRANSITION_NOT_ALLOWED",
        details: { from: fromKey, to: toKey },
        message: `Transition from ${fromKey} to ${toKey} is not allowed.`,
        repositoryId: repositoryIdFromInput(context.useCase.input),
        requestId: context.requestId,
        ticketId: ticket.id,
        useCase: context.useCase.name,
      }),
    );
  }

  return Effect.void;
};

const validateRelationAddPolicy = <Name extends UseCaseName>(
  context: RequestContext<Name>,
  ticket: TicketDocument,
  relation: IssueRelation,
): Effect.Effect<void, UseCaseFailure> => {
  if (relation.issueId === ticket.id) {
    return Effect.fail(
      policyViolationFailure({
        code: "SELF_RELATION",
        message: "An issue cannot relate to itself.",
        repositoryId: repositoryIdFromInput(context.useCase.input),
        requestId: context.requestId,
        ticketId: ticket.id,
        useCase: context.useCase.name,
      }),
    );
  }

  const duplicate = (ticket.frontmatter.relations ?? []).some(
    (current) => current.issueId === relation.issueId && current.type === relation.type,
  );

  if (duplicate) {
    return Effect.fail(
      policyViolationFailure({
        code: "DUPLICATE_RELATION",
        message: "The issue relation already exists.",
        repositoryId: repositoryIdFromInput(context.useCase.input),
        requestId: context.requestId,
        ticketId: ticket.id,
        useCase: context.useCase.name,
      }),
    );
  }

  return Effect.void;
};

const evaluateRepository = <Name extends UseCaseName>(
  database: DatabaseServiceShape,
  context: RequestContext<Name>,
): Effect.Effect<AutomationEvaluation, UseCaseFailure> =>
  Effect.gen(function* () {
    const repositoryId = repositoryIdFromInput(context.useCase.input);
    if (repositoryId === undefined) {
      return yield* Effect.fail(
        invalidInputFailure({
          message: "Automation evaluation requires a repository id.",
          requestId: context.requestId,
          useCase: context.useCase.name,
        }),
      );
    }

    const status = yield* database
      .repositoryStatus(repositoryId)
      .pipe(Effect.mapError(mapFailure(context)));
    const warnings = yield* database
      .materializationWarnings(repositoryId)
      .pipe(Effect.mapError(mapFailure(context)));
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
      repositoryId,
      violations,
      warnings: warnings.map((warning) => warning.message),
    });
  });

const evaluateIssues = <Name extends UseCaseName>(
  database: DatabaseServiceShape,
  context: RequestContext<Name>,
  input: {
    readonly query?: TicketQuery;
    readonly ticketIds?: ReadonlyArray<string>;
  },
): Effect.Effect<AutomationEvaluation, UseCaseFailure> =>
  Effect.gen(function* () {
    const repositoryId = repositoryIdFromInput(context.useCase.input);
    if (repositoryId === undefined) {
      return yield* Effect.fail(
        invalidInputFailure({
          message: "Automation evaluation requires a repository id.",
          requestId: context.requestId,
          useCase: context.useCase.name,
        }),
      );
    }

    const page =
      input.ticketIds === undefined
        ? yield* database
            .listTickets({
              ...input.query,
              repositoryIds: [repositoryId],
            })
            .pipe(Effect.mapError(mapFailure(context)))
        : yield* Effect.forEach(input.ticketIds, (ticketId) =>
            database.getTicket(repositoryId, ticketId).pipe(Effect.mapError(mapFailure(context))),
          ).pipe(
            Effect.map((entries) => ({
              entries: entries.filter((ticket): ticket is TicketDocument => ticket !== null),
            })),
          );

    const warnings = yield* database
      .materializationWarnings(repositoryId)
      .pipe(Effect.mapError(mapFailure(context)));
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
        context.useCase.name === "AutomationEvaluateQuery"
          ? "AutomationEvaluateQuery"
          : "AutomationEvaluateIssues",
      repositoryId,
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

const repositoryIdFromInput = (input: unknown): string | undefined => {
  if (!isRecord(input)) return undefined;
  const repository = input["repository"];
  if (!isRecord(repository)) return undefined;
  return typeof repository["id"] === "string" ? repository["id"] : undefined;
};

const ticketIdFromInput = (input: unknown): string | undefined => {
  if (!isRecord(input)) return undefined;
  const inner = input["input"];
  if (!isRecord(inner)) return undefined;
  if (typeof inner["id"] === "string") return inner["id"];
  if (typeof inner["issueId"] === "string") return inner["issueId"];
  return undefined;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

export const UseCaseRunnerLive = Layer.effect(
  UseCaseRunner,
  Effect.gen(function* () {
    const database = yield* DatabaseService;
    return UseCaseRunner.of(makeUseCaseRunner(database));
  }),
);

export const UseCaseRunnerTest = (prefix?: string) =>
  UseCaseRunnerLive.pipe(Layer.provide(DatabaseTest(prefix)));
