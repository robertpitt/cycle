import { DateTime, Effect, Schema } from "effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentStorageError, agentStorageError } from "../AgentErrors.ts";
import { AgentEventAppend, AgentRuntimeEvent } from "../AgentEvents.ts";
import type { AgentEventId, AgentThreadId } from "../AgentIds.ts";

type LastSequenceRow = { readonly last_sequence: number };

export const now = DateTime.now;

export const makeAgentId = <A extends string>(prefix: string): Effect.Effect<A> =>
  Effect.sync(() => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}` as A);

export const encodeRecord = <S extends Schema.Top>(
  operation: string,
  schema: S,
  value: S["Type"],
): Effect.Effect<string, AgentStorageError, S["EncodingServices"]> =>
  Schema.encodeUnknownEffect(Schema.toCodecJson(schema))(value, { errors: "all" }).pipe(
    Effect.flatMap((encoded) =>
      Effect.try({
        try: () => JSON.stringify(encoded),
        catch: (cause) => agentStorageError(operation, cause),
      }),
    ),
    Effect.mapError((cause) =>
      cause instanceof AgentStorageError ? cause : agentStorageError(operation, cause),
    ),
  );

export const decodeRecord = <S extends Schema.Top>(
  operation: string,
  schema: S,
  value: string,
): Effect.Effect<S["Type"], AgentStorageError, S["DecodingServices"]> =>
  Effect.try({
    try: () => JSON.parse(value) as unknown,
    catch: (cause) => agentStorageError(operation, cause),
  }).pipe(
    Effect.flatMap((json) => Schema.decodeUnknownEffect(Schema.toCodecJson(schema))(json)),
    Effect.mapError((cause) =>
      cause instanceof AgentStorageError ? cause : agentStorageError(operation, cause),
    ),
  ) as Effect.Effect<S["Type"], AgentStorageError, S["DecodingServices"]>;

export const appendEventTransaction = Effect.fn("appendEventTransaction")(function* (
  sql: SqlClient.SqlClient,
  input: AgentEventAppend,
) {
  const persistedAt = yield* now;
  const rows = yield* sql<LastSequenceRow>`
    UPDATE agent_threads
    SET last_sequence = last_sequence + 1, updated_at = ${DateTime.formatIso(persistedAt)}
    WHERE thread_id = ${input.threadId}
    RETURNING last_sequence
  `.pipe(Effect.mapError((cause) => agentStorageError("event.thread-sequence", cause)));
  const row = rows[0];
  if (row === undefined) {
    return yield* agentStorageError(
      "event.thread-sequence",
      new Error(`Thread not found: ${input.threadId}`),
    );
  }

  const sequence = row.last_sequence;
  const event = new AgentRuntimeEvent({
    ...input,
    persistedAt,
    schemaVersion: 1,
    sequence,
  });
  const recordJson = yield* encodeRecord("event.encode", AgentRuntimeEvent, event);

  yield* sql`
    INSERT INTO agent_events(
      event_id, thread_id, sequence, task_id, run_id, attempt_id, event_type, visibility,
      retention, occurred_at, persisted_at, record_json
    ) VALUES (
      ${input.eventId}, ${input.threadId}, ${sequence}, ${input.taskId ?? null},
      ${input.runId ?? null}, ${input.attemptId ?? null}, ${input.eventType},
      ${input.visibility}, ${input.retention}, ${DateTime.formatIso(input.occurredAt)},
      ${DateTime.formatIso(persistedAt)}, ${recordJson}
    )
  `.pipe(Effect.mapError((cause) => agentStorageError("event.insert", cause)));
  return event;
});

export const makeEventAppend = Effect.fn("makeEventAppend")(function* (
  input: Omit<AgentEventAppend, "eventId" | "occurredAt">,
) {
  const eventId = yield* makeAgentId<AgentEventId>("agent_event");
  const occurredAt = yield* now;
  return new AgentEventAppend({ ...input, eventId, occurredAt });
});

export type AgentEventNotice = {
  readonly sequence: number;
  readonly threadId: AgentThreadId;
};
