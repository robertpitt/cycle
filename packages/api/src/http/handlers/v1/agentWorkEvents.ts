import { Effect } from "effect";
import { CycleApiRuntime } from "../../runtime/CycleApiRuntime.ts";
import { launchAgentWorkJob, launchAgentWorkJobs } from "./agentWorkRunner.ts";

export const emitTicketEvent = (input: {
  readonly eventType: string;
  readonly repositoryId: string;
  readonly ticketId?: string;
  readonly requestId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly actor?: unknown;
}): Effect.Effect<void, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    yield* Effect.promise(() =>
      runtime.agentWork.emit({
        actor: input.actor,
        dedupeKey: `${input.eventType}:${input.repositoryId}:${input.ticketId ?? "none"}:${input.requestId}`,
        eventType: input.eventType,
        payload: input.payload,
        repositoryId: input.repositoryId,
        source: "api",
        ticketId: input.ticketId,
      }),
    );
  }).pipe(Effect.catch(() => Effect.void));

export const handleSuccessfulComment = (input: {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly commentId: string;
  readonly body: string;
  readonly requestId: string;
  readonly comment: unknown;
  readonly origin: string;
}): Effect.Effect<void, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    yield* Effect.promise(() =>
      runtime.agentWork.emit({
        dedupeKey: `ticket.comment_added:${input.repositoryId}:${input.ticketId}:${input.commentId}`,
        eventType: "ticket.comment_added",
        payload: {
          comment: input.comment,
          commentId: input.commentId,
          requestId: input.requestId,
        },
        repositoryId: input.repositoryId,
        source: "api",
        ticketId: input.ticketId,
      }),
    );
    const jobs = yield* Effect.promise(() =>
      runtime.agentWork.handleSuccessfulComment({
        body: input.body,
        commentId: input.commentId,
        repositoryId: input.repositoryId,
        source: "api",
        ticketId: input.ticketId,
      }),
    );
    yield* Effect.sync(() =>
      launchAgentWorkJobs({
        jobs,
        origin: input.origin,
        requestId: input.requestId,
        runtime,
      }),
    );
  }).pipe(Effect.catch(() => Effect.void));

export const evaluateAssignmentPickup = (input: {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly ticketStatus?: string;
  readonly requestId: string;
  readonly origin: string;
}): Effect.Effect<void, never, CycleApiRuntime> =>
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const job = yield* Effect.promise(() =>
      runtime.agentWork.evaluateAssignmentPickup({
        repositoryId: input.repositoryId,
        requestedBy: `api:${input.requestId}`,
        ticketId: input.ticketId,
        ticketStatus: input.ticketStatus,
      }),
    );
    yield* Effect.sync(() =>
      launchAgentWorkJob({
        job,
        origin: input.origin,
        requestId: input.requestId,
        runtime,
      }),
    );
  }).pipe(Effect.catch(() => Effect.void));

export const idFromResult = (value: unknown, fallback: string): string => {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of ["id", "recordId", "commentId"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return fallback;
};
