import { Cause, Context, Duration, Effect, Result, Schema } from "effect";
import type { DatabaseService, IssueRelation, TicketDocument } from "@cycle/database";
import {
  contractFor,
  type UseCaseActor,
  type UseCaseIdempotency,
  type UseCaseInput,
  type UseCaseMeta,
  type UseCaseName,
  type UseCaseFailure,
  type UseCaseRepositoryScope,
  type UseCaseSideEffect,
  type UseCaseSuccess,
} from "@cycle/contracts/contracts";
import { invalidInputFailure, useCaseFailure } from "./UseCaseFailure.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const UseCaseActorSchema = Schema.Struct({
  email: Schema.optional(Schema.String),
  name: Schema.String,
  provider: Schema.optional(Schema.String),
  type: Schema.Literals(["agent", "human", "import"]),
});

export const UseCaseMetaSchema = Schema.Struct({
  actor: Schema.optional(UseCaseActorSchema),
  deadline: Schema.optional(Schema.Finite),
  dryRun: Schema.optional(Schema.Boolean),
  idempotencyKey: Schema.optional(Schema.String),
  requestId: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  traceContext: Schema.optional(Schema.Unknown),
});

export type UseCaseContext<Name extends UseCaseName = UseCaseName> = {
  readonly actor?: UseCaseActor;
  readonly deadline?: number;
  readonly dryRun: boolean;
  readonly idempotencyKey?: string;
  readonly input: UseCaseInput<Name>;
  readonly name: Name;
  readonly repositoryId?: string;
  readonly requestId: string;
  readonly sideEffect: UseCaseSideEffect;
  readonly source: string;
};

export type UseCaseDefinition<Name extends UseCaseName, R = never> = {
  readonly category?: string;
  readonly description?: string;
  readonly idempotency: UseCaseIdempotency;
  readonly inputSchema: Schema.Top;
  readonly name: Name;
  readonly repositoryScope: UseCaseRepositoryScope;
  readonly run: (
    input: UseCaseInput<Name>,
    meta?: UseCaseMeta,
  ) => Effect.Effect<UseCaseSuccess<Name>, UseCaseFailure, R>;
  readonly sideEffect: UseCaseSideEffect;
  readonly successSchema: Schema.Top;
};

type DefineUseCaseOptions<
  Name extends UseCaseName,
  InputSchema extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
> = {
  readonly category?: string;
  readonly description?: string;
  readonly handler: (
    input: InputSchema["Type"],
    context: UseCaseContext<Name>,
  ) => Effect.Effect<unknown, UseCaseFailure, R>;
  readonly idempotency: UseCaseIdempotency;
  readonly input: InputSchema;
  readonly name: Name;
  readonly repositoryScope: UseCaseRepositoryScope;
  readonly sideEffect: UseCaseSideEffect;
  readonly success: SuccessSchema;
};

let requestCounter = 0;

export const defineUseCase = <
  const Name extends UseCaseName,
  InputSchema extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
>(
  definition: DefineUseCaseOptions<Name, InputSchema, SuccessSchema, R>,
): UseCaseDefinition<Name, R> => {
  const run = (
    input: UseCaseInput<Name>,
    meta?: UseCaseMeta,
  ): Effect.Effect<UseCaseSuccess<Name>, UseCaseFailure, R> => {
    const fallbackRequestId = requestIdFromMeta(meta) ?? `usecase-${++requestCounter}`;

    return Schema.decodeUnknownEffect(
      UseCaseMetaSchema,
      StrictDecodeOptions,
    )(meta ?? {}).pipe(
      Effect.mapError((error) =>
        invalidInputFailure({
          details: { parseError: String(error) },
          message: `Invalid metadata for ${definition.name}.`,
          requestId: fallbackRequestId,
          useCase: definition.name,
        }),
      ),
      Effect.flatMap((decodedMeta) => {
        const context = useCaseContext(definition, decodedMeta, fallbackRequestId, input);
        const annotations = useCaseAnnotations(context);

        const program = validateMetadata(context, definition).pipe(
          Effect.andThen(
            Schema.decodeUnknownEffect(
              definition.input,
              StrictDecodeOptions,
            )(input).pipe(
              Effect.mapError((error) =>
                invalidInputFailure({
                  details: { parseError: String(error) },
                  message: `Invalid input for ${definition.name}.`,
                  requestId: context.requestId,
                  useCase: definition.name,
                }),
              ),
            ),
          ),
          Effect.flatMap((decodedInput) =>
            definition.handler(decodedInput, {
              ...context,
              input: decodedInput as UseCaseInput<Name>,
              repositoryId: repositoryIdFromInput(decodedInput),
            }),
          ),
          Effect.flatMap((value) =>
            Schema.decodeUnknownEffect(
              definition.success,
              StrictDecodeOptions,
            )(value).pipe(
              Effect.mapError((error) =>
                useCaseFailure({
                  code: "INVALID_USECASE_SUCCESS",
                  details: { parseError: String(error) },
                  message: `Usecase ${definition.name} produced an invalid success value.`,
                  requestId: context.requestId,
                  tag: "UnexpectedDefectFailure",
                  useCase: definition.name,
                }),
              ),
            ),
          ),
          Effect.tapCause((cause) => logUnexpectedCause(annotations, cause)),
        ) as Effect.Effect<UseCaseSuccess<Name>, UseCaseFailure, R>;

        return applyDeadline(context, program).pipe(
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
          Effect.annotateLogs(annotations),
          Effect.annotateSpans(annotations),
          Effect.withSpan(useCaseSpanName(context), { attributes: annotations }),
        );
      }),
    );
  };

  return {
    category: definition.category,
    description: definition.description,
    idempotency: definition.idempotency,
    inputSchema: definition.input,
    name: definition.name,
    repositoryScope: definition.repositoryScope,
    run,
    sideEffect: definition.sideEffect,
    successSchema: definition.success,
  };
};

export const defineContractUseCase = <Name extends UseCaseName, R>(
  name: Name,
  handler: (
    input: UseCaseInput<Name>,
    context: UseCaseContext<Name>,
  ) => Effect.Effect<unknown, UseCaseFailure, R>,
): UseCaseDefinition<Name, R> => {
  const contract = contractFor(name);

  return defineUseCase({
    category: contract.category,
    description: contract.description,
    handler: handler as any,
    idempotency: contract.idempotency,
    input: contract.inputSchema,
    name,
    repositoryScope: contract.repositoryScope,
    sideEffect: contract.sideEffect,
    success: contract.successSchema,
  }) as UseCaseDefinition<Name, R>;
};

const useCaseContext = <Name extends UseCaseName>(
  definition: Pick<
    DefineUseCaseOptions<Name, Schema.Top, Schema.Top, never>,
    "name" | "sideEffect"
  >,
  meta: typeof UseCaseMetaSchema.Type,
  fallbackRequestId: string,
  input: UseCaseInput<Name>,
): UseCaseContext<Name> => ({
  ...(meta.actor === undefined ? {} : { actor: meta.actor }),
  ...(meta.deadline === undefined ? {} : { deadline: meta.deadline }),
  dryRun: meta.dryRun ?? false,
  ...(meta.idempotencyKey === undefined ? {} : { idempotencyKey: meta.idempotencyKey }),
  input,
  name: definition.name,
  repositoryId: repositoryIdFromInput(input),
  requestId: meta.requestId ?? fallbackRequestId,
  sideEffect: definition.sideEffect,
  source: meta.source ?? "internal",
});

const validateMetadata = <Name extends UseCaseName>(
  context: UseCaseContext<Name>,
  definition: Pick<DefineUseCaseOptions<Name, Schema.Top, Schema.Top, never>, "idempotency">,
): Effect.Effect<void, UseCaseFailure> => {
  if (context.idempotencyKey !== undefined && definition.idempotency === "not-supported") {
    return Effect.fail(
      invalidInputFailure({
        details: { idempotency: definition.idempotency },
        field: "meta.idempotencyKey",
        message: `Usecase ${context.name} does not accept an idempotency key.`,
        requestId: context.requestId,
        useCase: context.name,
      }),
    );
  }

  if (context.idempotencyKey === undefined && definition.idempotency === "required") {
    return Effect.fail(
      invalidInputFailure({
        details: { idempotency: definition.idempotency },
        field: "meta.idempotencyKey",
        message: `Usecase ${context.name} requires an idempotency key.`,
        requestId: context.requestId,
        useCase: context.name,
      }),
    );
  }

  if (
    context.dryRun &&
    (context.sideEffect === "push" ||
      context.sideEffect === "sync" ||
      context.sideEffect === "write")
  ) {
    return Effect.fail(
      invalidInputFailure({
        details: { sideEffect: context.sideEffect },
        field: "meta.dryRun",
        message: `Usecase ${context.name} does not support dry-run execution.`,
        requestId: context.requestId,
        useCase: context.name,
      }),
    );
  }

  return Effect.void;
};

const applyDeadline = <A, E, R, Name extends UseCaseName>(
  context: UseCaseContext<Name>,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | UseCaseFailure, R> => {
  const deadline = deadlineFromInput(context);
  if (deadline === undefined) return effect;

  const remainingMs = deadline - Date.now();
  const timeoutFailure = () =>
    useCaseFailure({
      code: "DEADLINE_EXCEEDED",
      details: { deadline },
      message: `Usecase ${context.name} exceeded its deadline.`,
      requestId: context.requestId,
      retryable: true,
      tag: "TimeoutFailure",
      useCase: context.name,
    });

  if (remainingMs <= 0) return Effect.fail(timeoutFailure());

  return effect.pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(remainingMs),
      orElse: () => Effect.fail(timeoutFailure()),
    }),
  );
};

const deadlineFromInput = <Name extends UseCaseName>(
  context: UseCaseContext<Name>,
): number | undefined => context.deadline;

const useCaseAnnotations = <Name extends UseCaseName>(
  context: UseCaseContext<Name>,
): Record<string, unknown> => ({
  actorType: context.actor?.type ?? null,
  dryRun: context.dryRun,
  hasIdempotencyKey: context.idempotencyKey !== undefined,
  requestId: context.requestId,
  repositoryId: context.repositoryId ?? null,
  service: "@cycle/usecases",
  sideEffect: context.sideEffect,
  source: context.source,
  useCase: context.name,
});

const useCaseSpanName = <Name extends UseCaseName>(context: UseCaseContext<Name>): string =>
  `${spanSegment(context.source)}.usecase.${context.name}`;

const spanSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-|-$/gu, "") || "unknown";

const logUnexpectedCause = (
  annotations: Readonly<Record<string, unknown>>,
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> => {
  if (!Cause.hasDies(cause) && !Cause.hasInterrupts(cause)) return Effect.void;

  return Effect.logError("usecase execution interrupted or defected").pipe(
    Effect.annotateLogs({
      ...annotations,
      cause: Cause.pretty(cause),
      defect: Cause.hasDies(cause),
      interrupted: Cause.hasInterrupts(cause),
    }),
  );
};

const requestIdFromMeta = (meta: unknown): string | undefined => {
  if (typeof meta !== "object" || meta === null) return undefined;
  const requestId = (meta as { readonly requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
};

export const repositoryIdFromInput = (input: unknown): string | undefined => {
  if (typeof input !== "object" || input === null) return undefined;
  const repository = (input as { readonly repository?: unknown }).repository;
  if (typeof repository !== "object" || repository === null) return undefined;
  const id = (repository as { readonly id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
};

export const ticketIdFromInput = (input: unknown): string | undefined => {
  if (typeof input !== "object" || input === null) return undefined;
  const inner = (input as { readonly input?: unknown }).input;
  if (typeof inner !== "object" || inner === null) return undefined;
  const id = (inner as { readonly id?: unknown; readonly issueId?: unknown }).id;
  if (typeof id === "string") return id;
  const issueId = (inner as { readonly issueId?: unknown }).issueId;
  return typeof issueId === "string" ? issueId : undefined;
};

export type UseCaseServices = DatabaseService | WorkflowPolicy;

export type WorkflowPolicyShape = {
  readonly validateIssueUpdate: (
    context: UseCaseContext,
    current: TicketDocument,
    patch: {
      readonly body?: string;
      readonly frontmatter?: Readonly<Record<string, unknown>>;
    },
  ) => Effect.Effect<void, UseCaseFailure>;
  readonly validateRelationAdd: (
    context: UseCaseContext,
    ticket: TicketDocument,
    relation: IssueRelation,
  ) => Effect.Effect<void, UseCaseFailure>;
  readonly validateTransition: (
    context: UseCaseContext,
    ticket: TicketDocument,
    to: string,
  ) => Effect.Effect<void, UseCaseFailure>;
};

export class WorkflowPolicy extends Context.Service<WorkflowPolicy, WorkflowPolicyShape>()(
  "@cycle/usecases/WorkflowPolicy",
) {}
