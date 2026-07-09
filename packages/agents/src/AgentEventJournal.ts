import { Context, Effect, Layer, Ref, Schema, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentStorageError, agentStorageError } from "./AgentErrors.ts";
import { AgentRuntimeEvent } from "./AgentEvents.ts";
import type { AgentThreadId } from "./AgentIds.ts";
import { AgentVisibility } from "./AgentMessage.ts";
import { AgentEventHub } from "./internal/AgentEventHub.ts";
import { decodeRecord } from "./internal/persistence.ts";

export class AgentObserveInput extends Schema.Class<AgentObserveInput>(
  "@cycle/agents/AgentObserveInput",
)({
  afterSequence: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  pageSize: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000 }))),
  tail: Schema.optional(Schema.Boolean),
  threadId: Schema.String,
  visibility: Schema.optional(Schema.Array(AgentVisibility)),
}) {}

type EventRow = { readonly record_json: string };
type HighWaterRow = { readonly last_sequence: number };

export type AgentEventJournalShape = {
  readonly get: (
    threadId: AgentThreadId,
    sequence: number,
  ) => Effect.Effect<AgentRuntimeEvent | undefined, AgentStorageError>;
  readonly highWater: (threadId: AgentThreadId) => Effect.Effect<number, AgentStorageError>;
  readonly list: (input: {
    readonly afterSequence?: number;
    readonly limit?: number;
    readonly throughSequence?: number;
    readonly threadId: AgentThreadId;
    readonly visibility?: ReadonlyArray<typeof AgentVisibility.Type>;
  }) => Effect.Effect<ReadonlyArray<AgentRuntimeEvent>, AgentStorageError>;
  readonly observe: (
    input: AgentObserveInput,
  ) => Stream.Stream<AgentRuntimeEvent, AgentStorageError>;
};

export class AgentEventJournal extends Context.Service<AgentEventJournal, AgentEventJournalShape>()(
  "@cycle/agents/AgentEventJournal",
) {}

export const AgentEventJournalLive = Layer.effect(
  AgentEventJournal,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const hub = yield* AgentEventHub;

    const list = Effect.fn("AgentEventJournal.list")(function* (
      input: Parameters<AgentEventJournalShape["list"]>[0],
    ) {
      const rows = yield* sql<EventRow>`
        SELECT record_json FROM agent_events
        WHERE thread_id = ${input.threadId}
          AND sequence > ${input.afterSequence ?? 0}
          AND sequence <= ${input.throughSequence ?? Number.MAX_SAFE_INTEGER}
        ORDER BY sequence ASC
        LIMIT ${input.limit ?? 10_000}
      `.pipe(Effect.mapError((cause) => agentStorageError("events.list", cause)));
      const events = yield* Effect.forEach(rows, (row) =>
        decodeRecord("events.decode", AgentRuntimeEvent, row.record_json),
      );
      if (input.visibility === undefined) return events;
      const allowed = new Set(input.visibility);
      return events.filter((event) => allowed.has(event.visibility));
    });

    const highWater = Effect.fn("AgentEventJournal.highWater")(function* (threadId: AgentThreadId) {
      const rows = yield* sql<HighWaterRow>`
        SELECT last_sequence FROM agent_threads WHERE thread_id = ${threadId}
      `.pipe(Effect.mapError((cause) => agentStorageError("events.high-water", cause)));
      return rows[0]?.last_sequence ?? 0;
    });

    const get = Effect.fn("AgentEventJournal.get")(function* (
      threadId: AgentThreadId,
      sequence: number,
    ) {
      const rows = yield* sql<EventRow>`
        SELECT record_json FROM agent_events
        WHERE thread_id = ${threadId} AND sequence = ${sequence}
      `.pipe(Effect.mapError((cause) => agentStorageError("events.get", cause)));
      const row = rows[0];
      return row === undefined
        ? undefined
        : yield* decodeRecord("events.decode", AgentRuntimeEvent, row.record_json);
    });

    const readRange = (
      input: {
        readonly pageSize: number;
        readonly threadId: AgentThreadId;
        readonly throughSequence: number;
        readonly visibility?: ReadonlyArray<typeof AgentVisibility.Type>;
      },
      afterSequence: number,
      accumulated: ReadonlyArray<AgentRuntimeEvent> = [],
    ): Effect.Effect<ReadonlyArray<AgentRuntimeEvent>, AgentStorageError> =>
      list({
        afterSequence,
        limit: input.pageSize,
        threadId: input.threadId,
        throughSequence: input.throughSequence,
      }).pipe(
        Effect.flatMap((page) => {
          const last = page.at(-1);
          const next = [...accumulated, ...page];
          if (last === undefined || last.sequence >= input.throughSequence) {
            if (input.visibility === undefined) return Effect.succeed(next);
            const allowed = new Set(input.visibility);
            return Effect.succeed(next.filter((event) => allowed.has(event.visibility)));
          }
          return readRange(input, last.sequence, next);
        }),
      );

    const observe = (
      input: AgentObserveInput,
    ): Stream.Stream<AgentRuntimeEvent, AgentStorageError> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const notices = yield* hub.subscribe;
          const highWaterMark = yield* highWater(input.threadId as AgentThreadId);
          const replay = yield* readRange(
            {
              pageSize: input.pageSize ?? 1_000,
              threadId: input.threadId as AgentThreadId,
              throughSequence: highWaterMark,
              visibility: input.visibility,
            },
            input.afterSequence ?? 0,
          );
          if (input.tail === false) return Stream.fromIterable(replay);

          const cursor = yield* Ref.make(replay.at(-1)?.sequence ?? highWaterMark);
          const live = notices.pipe(
            Stream.filter((notice) => notice.threadId === input.threadId),
            Stream.mapEffect((notice) =>
              Effect.gen(function* () {
                const current = yield* Ref.get(cursor);
                if (notice.sequence <= current) return [];
                const events = yield* readRange(
                  {
                    pageSize: input.pageSize ?? 1_000,
                    threadId: input.threadId as AgentThreadId,
                    throughSequence: notice.sequence,
                    visibility: input.visibility,
                  },
                  current,
                );
                yield* Ref.set(cursor, notice.sequence);
                return events;
              }),
            ),
            Stream.flattenIterable,
          );
          return Stream.fromIterable(replay).pipe(Stream.concat(live));
        }),
      );

    return AgentEventJournal.of({ get, highWater, list, observe });
  }),
);
