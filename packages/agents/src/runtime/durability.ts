import { Context, Effect, Layer } from "effect";
import type {
  AgentAttemptRecord,
  AgentInteractionRecord,
  AgentProviderBindingRecord,
  AgentRunRecord,
  AgentSessionRecord,
} from "./contracts.ts";
import { AgentRuntimeFailure, type AgentRuntimeError } from "../errors/index.ts";
import type { AgentRuntimeEvent } from "./events.ts";

export type AgentRunLease = {
  readonly expiresAt: string;
  readonly ownerId: string;
  readonly runId: string;
};

export type AgentDurabilityShape = {
  readonly appendEvent: (
    event: AgentRuntimeEvent,
  ) => Effect.Effect<AgentRuntimeEvent, AgentRuntimeError>;
  readonly claimRun: (
    runId: string,
    ownerId: string,
    leaseDurationMs: number,
  ) => Effect.Effect<AgentRunLease | undefined, AgentRuntimeError>;
  readonly close: () => Effect.Effect<void, AgentRuntimeError>;
  readonly createAttempt: (
    attempt: AgentAttemptRecord,
  ) => Effect.Effect<AgentAttemptRecord, AgentRuntimeError>;
  readonly createRun: (run: AgentRunRecord) => Effect.Effect<AgentRunRecord, AgentRuntimeError>;
  readonly findRunByIdempotencyKey: (
    idempotencyKey: string,
  ) => Effect.Effect<AgentRunRecord | undefined, AgentRuntimeError>;
  readonly findSessionByConversationKey: (
    conversationKey: string,
  ) => Effect.Effect<AgentSessionRecord | undefined, AgentRuntimeError>;
  readonly getAttempt: (
    attemptId: string,
  ) => Effect.Effect<AgentAttemptRecord | undefined, AgentRuntimeError>;
  readonly getInteraction: (
    interactionId: string,
  ) => Effect.Effect<AgentInteractionRecord | undefined, AgentRuntimeError>;
  readonly getProviderBinding: (
    bindingId: string,
  ) => Effect.Effect<AgentProviderBindingRecord | undefined, AgentRuntimeError>;
  readonly getRun: (runId: string) => Effect.Effect<AgentRunRecord | undefined, AgentRuntimeError>;
  readonly getSession: (
    sessionId: string,
  ) => Effect.Effect<AgentSessionRecord | undefined, AgentRuntimeError>;
  readonly heartbeatRun: (
    runId: string,
    ownerId: string,
    leaseDurationMs: number,
  ) => Effect.Effect<AgentRunLease | undefined, AgentRuntimeError>;
  readonly listActiveRuns: (
    ownerId?: string,
  ) => Effect.Effect<readonly AgentRunRecord[], AgentRuntimeError>;
  readonly listAttemptsByRun: (
    runId: string,
  ) => Effect.Effect<readonly AgentAttemptRecord[], AgentRuntimeError>;
  readonly listEvents: (
    runId: string,
    afterSequence?: number,
  ) => Effect.Effect<readonly AgentRuntimeEvent[], AgentRuntimeError>;
  readonly listOpenInteractions: (
    runId?: string,
  ) => Effect.Effect<readonly AgentInteractionRecord[], AgentRuntimeError>;
  readonly releaseRun: (
    runId: string,
    ownerId: string,
  ) => Effect.Effect<boolean, AgentRuntimeError>;
  readonly updateAttempt: (
    attemptId: string,
    patch: Partial<AgentAttemptRecord>,
  ) => Effect.Effect<AgentAttemptRecord | undefined, AgentRuntimeError>;
  readonly updateRun: (
    runId: string,
    patch: Partial<AgentRunRecord>,
  ) => Effect.Effect<AgentRunRecord | undefined, AgentRuntimeError>;
  readonly upsertInteraction: (
    interaction: AgentInteractionRecord,
  ) => Effect.Effect<AgentInteractionRecord, AgentRuntimeError>;
  readonly upsertProviderBinding: (
    binding: AgentProviderBindingRecord,
  ) => Effect.Effect<AgentProviderBindingRecord, AgentRuntimeError>;
  readonly upsertSession: (
    session: AgentSessionRecord,
  ) => Effect.Effect<AgentSessionRecord, AgentRuntimeError>;
};

export class AgentDurability extends Context.Service<AgentDurability, AgentDurabilityShape>()(
  "@cycle/agents/AgentDurability",
) {}

const terminalRunStatuses = new Set(["cancelled", "completed", "failed", "interrupted"]);

const storageDefect = (cause: unknown): AgentRuntimeError =>
  new AgentRuntimeFailure({
    cause,
    code: "storage_error",
    message: cause instanceof Error ? cause.message : "Agent durability operation failed.",
    retryable: false,
  });

export const makeInMemoryAgentDurability = (): AgentDurabilityShape => {
  const sessions = new Map<string, AgentSessionRecord>();
  const runs = new Map<string, AgentRunRecord>();
  const attempts = new Map<string, AgentAttemptRecord>();
  const providerBindings = new Map<string, AgentProviderBindingRecord>();
  const interactions = new Map<string, AgentInteractionRecord>();
  const eventsByRun = new Map<string, AgentRuntimeEvent[]>();
  const leases = new Map<string, AgentRunLease>();

  const effect = <A>(body: () => A): Effect.Effect<A, AgentRuntimeError> =>
    Effect.try({
      try: body,
      catch: storageDefect,
    });

  const now = () => new Date();
  const leaseFor = (runId: string, ownerId: string, leaseDurationMs: number): AgentRunLease => ({
    expiresAt: new Date(now().getTime() + leaseDurationMs).toISOString(),
    ownerId,
    runId,
  });

  return {
    appendEvent: (event) =>
      effect(() => {
        const current = eventsByRun.get(event.runId) ?? [];
        const sequenced = {
          ...event,
          sequence: current.length + 1,
        } as AgentRuntimeEvent;
        eventsByRun.set(event.runId, [...current, sequenced]);
        return sequenced;
      }),
    claimRun: (runId, ownerId, leaseDurationMs) =>
      effect(() => {
        const existing = leases.get(runId);
        const existingExpiresAt =
          existing === undefined ? 0 : new Date(existing.expiresAt).getTime();
        if (
          existing !== undefined &&
          existing.ownerId !== ownerId &&
          existingExpiresAt > now().getTime()
        ) {
          return undefined;
        }
        const next = leaseFor(runId, ownerId, leaseDurationMs);
        leases.set(runId, next);
        return next;
      }),
    close: () => Effect.void,
    createAttempt: (attempt) =>
      effect(() => {
        attempts.set(attempt.attemptId, attempt);
        return attempt;
      }),
    createRun: (run) =>
      effect(() => {
        runs.set(run.runId, run);
        return run;
      }),
    findRunByIdempotencyKey: (idempotencyKey) =>
      effect(() =>
        [...runs.values()].find(
          (run) => run.idempotencyKey === idempotencyKey && !terminalRunStatuses.has(run.status),
        ),
      ),
    findSessionByConversationKey: (conversationKey) =>
      effect(() =>
        [...sessions.values()].find((session) => session.conversationKey === conversationKey),
      ),
    getAttempt: (attemptId) => effect(() => attempts.get(attemptId)),
    getInteraction: (interactionId) => effect(() => interactions.get(interactionId)),
    getProviderBinding: (bindingId) => effect(() => providerBindings.get(bindingId)),
    getRun: (runId) => effect(() => runs.get(runId)),
    getSession: (sessionId) => effect(() => sessions.get(sessionId)),
    heartbeatRun: (runId, ownerId, leaseDurationMs) =>
      effect(() => {
        const existing = leases.get(runId);
        if (existing === undefined || existing.ownerId !== ownerId) return undefined;
        const next = leaseFor(runId, ownerId, leaseDurationMs);
        leases.set(runId, next);
        return next;
      }),
    listActiveRuns: (ownerId) =>
      effect(() =>
        [...runs.values()].filter((run) => {
          if (terminalRunStatuses.has(run.status)) return false;
          if (ownerId === undefined) return true;
          return leases.get(run.runId)?.ownerId === ownerId;
        }),
      ),
    listAttemptsByRun: (runId) =>
      effect(() => [...attempts.values()].filter((attempt) => attempt.runId === runId)),
    listEvents: (runId, afterSequence = 0) =>
      effect(() =>
        (eventsByRun.get(runId) ?? []).filter((event) => event.sequence > afterSequence),
      ),
    listOpenInteractions: (runId) =>
      effect(() =>
        [...interactions.values()].filter(
          (interaction) =>
            interaction.status === "open" && (runId === undefined || interaction.runId === runId),
        ),
      ),
    releaseRun: (runId, ownerId) =>
      effect(() => {
        const existing = leases.get(runId);
        if (existing === undefined || existing.ownerId !== ownerId) return false;
        leases.delete(runId);
        return true;
      }),
    updateAttempt: (attemptId, patch) =>
      effect(() => {
        const existing = attempts.get(attemptId);
        if (existing === undefined) return undefined;
        const updated = { ...existing, ...patch };
        attempts.set(attemptId, updated);
        return updated;
      }),
    updateRun: (runId, patch) =>
      effect(() => {
        const existing = runs.get(runId);
        if (existing === undefined) return undefined;
        const updated = { ...existing, ...patch };
        runs.set(runId, updated);
        return updated;
      }),
    upsertInteraction: (interaction) =>
      effect(() => {
        interactions.set(interaction.interactionId, interaction);
        return interaction;
      }),
    upsertProviderBinding: (binding) =>
      effect(() => {
        providerBindings.set(binding.bindingId, binding);
        return binding;
      }),
    upsertSession: (session) =>
      effect(() => {
        sessions.set(session.sessionId, session);
        return session;
      }),
  };
};

export const AgentDurabilityInMemory = Layer.succeed(
  AgentDurability,
  AgentDurability.of(makeInMemoryAgentDurability()),
);
