import type { Schema } from "effect";

export type UseCaseSource = "api" | "ci" | "cli" | "desktop" | "mcp" | "test" | string;

export type UseCaseActor = {
  readonly email?: string;
  readonly name: string;
  readonly provider?: string;
  readonly type: "agent" | "human" | "import";
};

export type UseCaseMeta = {
  readonly actor?: UseCaseActor;
  readonly deadline?: number;
  readonly dryRun?: boolean;
  readonly idempotencyKey?: string;
  readonly requestId?: string;
  readonly source?: UseCaseSource;
  readonly traceContext?: unknown;
};

export type AutomationViolation = {
  readonly code: string;
  readonly field?: string;
  readonly message: string;
  readonly remediation?: string;
  readonly severity: "error" | "fatal" | "warning";
  readonly ticketId?: string;
};

export type AutomationEvaluation = {
  readonly checkedAt: string;
  readonly checkedTicketIds: ReadonlyArray<string>;
  readonly checkedUseCase:
    | "AutomationEvaluateIssues"
    | "AutomationEvaluateQuery"
    | "AutomationEvaluateRepository";
  readonly repositoryId: string;
  readonly status: "fail" | "pass" | "warn";
  readonly summary: string;
  readonly violations: ReadonlyArray<AutomationViolation>;
  readonly warnings: ReadonlyArray<string>;
};

export type UseCaseSideEffect = "evaluate" | "push" | "read" | "sync" | "write";
export type UseCaseRepositoryScope = "multi" | "none" | "single";
export type UseCaseIdempotency = "not-supported" | "read-only" | "required" | "supported";

export type UseCaseContract<
  Name extends string = string,
  InputSchema extends Schema.Top = Schema.Top,
  SuccessSchema extends Schema.Top = Schema.Top,
  FailureSchema extends Schema.Top = Schema.Top,
> = {
  readonly aliases: ReadonlyArray<string>;
  readonly category: string;
  readonly description: string;
  readonly failureSchema: FailureSchema;
  readonly idempotency: UseCaseIdempotency;
  readonly inputSchema: InputSchema;
  readonly name: Name;
  readonly repositoryScope: UseCaseRepositoryScope;
  readonly sideEffect: UseCaseSideEffect;
  readonly successSchema: SuccessSchema;
  readonly version: string;
};
