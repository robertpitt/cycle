import { stat } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { ImplementationContextIncomplete } from "./AgentErrors.ts";
import type { AgentTask } from "./AgentTask.ts";
import type { AgentThread } from "./AgentThread.ts";

export class ImplementationContext extends Schema.Class<ImplementationContext>(
  "@cycle/agents/ImplementationContext",
)({
  assignedUserId: Schema.String,
  branchName: Schema.String,
  repositoryId: Schema.String,
  ticketId: Schema.String,
  worktreeId: Schema.String,
  worktreePath: Schema.String,
}) {}

const fieldNames = [
  "repositoryId",
  "ticketId",
  "worktreeId",
  "worktreePath",
  "branchName",
  "assignedUserId",
] as const;

type ImplementationOwner = Pick<
  AgentThread,
  "authority" | "kind" | "metadata" | "repositoryId" | "threadId" | "ticketId" | "workflowId"
>;

const incomplete = (
  owner: Pick<ImplementationOwner, "threadId" | "ticketId">,
  reason: "missing" | "mismatch" | "stale",
  missingBindings: ReadonlyArray<string>,
  message: string,
) =>
  new ImplementationContextIncomplete({
    code: "implementation_context_incomplete",
    message,
    missingBindings,
    reason,
    recoveryAction:
      reason === "stale"
        ? "Restore the managed worktree or explicitly end this implementation and start a new one."
        : "Open the ticket and use its implementation recovery action to restore the managed context.",
    retryable: false,
    threadId: owner.threadId,
    ...(owner.ticketId === undefined ? {} : { ticketId: owner.ticketId }),
  });

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const fromThread = Effect.fn("ImplementationContextService.fromThread")(function* (
  thread: ImplementationOwner,
) {
  if (
    thread.kind !== "ticket-implementation" ||
    thread.workflowId !== "ticket-implementation" ||
    thread.authority.mode !== "implementation-worktree"
  ) {
    return yield* incomplete(
      thread,
      "mismatch",
      ["kind", "workflowId", "authority"],
      "The ticket implementation thread no longer has its managed workflow authority.",
    );
  }

  const values = {
    assignedUserId: thread.metadata.assignedUserId,
    branchName: thread.metadata.branchName,
    repositoryId: thread.repositoryId ?? thread.metadata.repositoryId,
    ticketId: thread.ticketId ?? thread.metadata.ticketId,
    worktreeId: thread.authority.worktreeId ?? thread.metadata.worktreeId,
    worktreePath: thread.authority.workspacePath ?? thread.metadata.worktreePath,
  };
  const missingBindings = fieldNames.filter((field) => !nonEmpty(values[field]));
  if (missingBindings.length > 0) {
    return yield* incomplete(
      thread,
      "missing",
      missingBindings,
      `Ticket implementation context is incomplete: ${missingBindings.join(", ")}.`,
    );
  }

  const context = new ImplementationContext(values as typeof ImplementationContext.Type);
  const mismatches = [
    thread.authority.repositoryId !== undefined &&
    thread.authority.repositoryId !== context.repositoryId
      ? "authority.repositoryId"
      : undefined,
    thread.authority.ticketId !== undefined && thread.authority.ticketId !== context.ticketId
      ? "authority.ticketId"
      : undefined,
    thread.metadata.repositoryId !== undefined &&
    thread.metadata.repositoryId !== context.repositoryId
      ? "repositoryId"
      : undefined,
    thread.metadata.ticketId !== undefined && thread.metadata.ticketId !== context.ticketId
      ? "ticketId"
      : undefined,
    thread.metadata.worktreeId !== undefined && thread.metadata.worktreeId !== context.worktreeId
      ? "worktreeId"
      : undefined,
    thread.metadata.worktreePath !== undefined &&
    thread.metadata.worktreePath !== context.worktreePath
      ? "worktreePath"
      : undefined,
  ].filter((field): field is string => field !== undefined);
  if (mismatches.length > 0) {
    return yield* incomplete(
      thread,
      "mismatch",
      mismatches,
      `Ticket implementation bindings disagree: ${mismatches.join(", ")}.`,
    );
  }
  return context;
});

const metadata = (
  context: ImplementationContext,
  extras: Readonly<Record<string, Schema.Json>> = {},
): Readonly<Record<string, Schema.Json>> => ({
  ...extras,
  assignedUserId: context.assignedUserId,
  branchName: context.branchName,
  repositoryId: context.repositoryId,
  ticketId: context.ticketId,
  worktreeId: context.worktreeId,
  worktreePath: context.worktreePath,
});

const validateTask = Effect.fn("ImplementationContextService.validateTask")(function* (
  task: AgentTask,
) {
  if (task.kind !== "ticket-implementation") return undefined;
  const context = yield* fromThread({
    authority: task.authority,
    kind: "ticket-implementation",
    metadata: task.metadata,
    repositoryId: task.repositoryId,
    threadId: task.threadId,
    ticketId:
      typeof task.metadata.ticketId === "string" ? task.metadata.ticketId : task.authority.ticketId,
    workflowId: task.workflowId,
  });
  return context;
});

const ensureWorkspace = Effect.fn("ImplementationContextService.ensureWorkspace")(function* (
  context: ImplementationContext,
  owner: Pick<ImplementationOwner, "threadId" | "ticketId">,
) {
  const available = yield* Effect.tryPromise(() => stat(context.worktreePath)).pipe(
    Effect.map((entry) => entry.isDirectory()),
    Effect.catch(() => Effect.succeed(false)),
  );
  if (!available) {
    return yield* incomplete(
      owner,
      "stale",
      ["worktreePath"],
      `The managed implementation worktree is unavailable: ${context.worktreePath}.`,
    );
  }
});

/** Canonical implementation context operations shared by every durable task path. */
export const ImplementationContextService = {
  ensureWorkspace,
  fromThread,
  metadata,
  validateTask,
} as const;
