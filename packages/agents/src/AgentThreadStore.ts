import { Context, DateTime, Effect, Layer, Option } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentNotFoundError, AgentStorageError, agentStorageError } from "./AgentErrors.ts";
import { AgentThread, AgentThreadCreateInput } from "./AgentThread.ts";
import type { AgentThreadId } from "./AgentIds.ts";
import { AgentEventHub } from "./internal/AgentEventHub.ts";
import {
  appendEventTransaction,
  decodeRecord,
  encodeRecord,
  makeAgentId,
  makeEventAppend,
  now,
} from "./internal/persistence.ts";

type ThreadRow = { readonly record_json: string };

export type AgentThreadStoreShape = {
  readonly archive: (
    threadId: AgentThreadId,
  ) => Effect.Effect<AgentThread, AgentStorageError | AgentNotFoundError>;
  readonly create: (input: AgentThreadCreateInput) => Effect.Effect<AgentThread, AgentStorageError>;
  readonly get: (
    threadId: AgentThreadId,
  ) => Effect.Effect<Option.Option<AgentThread>, AgentStorageError>;
  readonly list: (input?: {
    readonly includeArchived?: boolean;
    readonly limit?: number;
    readonly repositoryId?: string;
  }) => Effect.Effect<ReadonlyArray<AgentThread>, AgentStorageError>;
};

export class AgentThreadStore extends Context.Service<AgentThreadStore, AgentThreadStoreShape>()(
  "@cycle/agents/AgentThreadStore",
) {}

export const AgentThreadStoreLive = Layer.effect(
  AgentThreadStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const hub = yield* AgentEventHub;

    const get = Effect.fn("AgentThreadStore.get")(function* (threadId: AgentThreadId) {
      const rows = yield* sql<ThreadRow>`
        SELECT record_json FROM agent_threads WHERE thread_id = ${threadId}
      `.pipe(Effect.mapError((cause) => agentStorageError("thread.get", cause)));
      const row = rows[0];
      return row === undefined
        ? Option.none()
        : Option.some(yield* decodeRecord("thread.decode", AgentThread, row.record_json));
    });

    const create = Effect.fn("AgentThreadStore.create")(function* (input: AgentThreadCreateInput) {
      if (input.idempotencyKey !== undefined) {
        const rows = yield* sql<ThreadRow>`
          SELECT record_json FROM agent_threads WHERE idempotency_key = ${input.idempotencyKey}
        `.pipe(Effect.mapError((cause) => agentStorageError("thread.idempotency", cause)));
        if (rows[0] !== undefined) {
          return yield* decodeRecord("thread.decode", AgentThread, rows[0].record_json);
        }
      }

      const threadId = yield* makeAgentId<AgentThreadId>("agent_thread");
      const timestamp = yield* now;
      const thread = new AgentThread({
        agentId: input.agentId,
        authority: input.authority,
        createdAt: timestamp,
        harnessId: input.harnessId,
        kind: input.kind,
        lastSequence: 0,
        metadata: input.metadata ?? {},
        providerId: input.providerId,
        schemaVersion: 1,
        status: "open",
        threadId,
        updatedAt: timestamp,
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.repositoryId === undefined ? {} : { repositoryId: input.repositoryId }),
        ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.workflowId === undefined ? {} : { workflowId: input.workflowId }),
      });
      const recordJson = yield* encodeRecord("thread.encode", AgentThread, thread);
      const eventInput = yield* makeEventAppend({
        eventType: "thread.opened",
        payload: {},
        retention: "permanent",
        threadId,
        visibility: "public",
      });
      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
            INSERT INTO agent_threads(
              thread_id, kind, status, provider_id, harness_id, repository_id, ticket_id,
              idempotency_key, last_sequence, created_at, updated_at, record_json
            ) VALUES (
              ${thread.threadId}, ${thread.kind}, ${thread.status}, ${thread.providerId},
              ${thread.harnessId}, ${thread.repositoryId ?? null}, ${thread.ticketId ?? null},
              ${input.idempotencyKey ?? null}, 0, ${DateTime.formatIso(timestamp)},
              ${DateTime.formatIso(timestamp)}, ${recordJson}
            )
          `.pipe(Effect.mapError((cause) => agentStorageError("thread.insert", cause)));
            const event = yield* appendEventTransaction(sql, eventInput);
            const persisted = new AgentThread({
              ...thread,
              lastSequence: event.sequence,
              updatedAt: event.persistedAt,
            });
            const persistedJson = yield* encodeRecord("thread.encode", AgentThread, persisted);
            yield* sql`
              UPDATE agent_threads SET record_json = ${persistedJson}
              WHERE thread_id = ${threadId}
            `.pipe(Effect.mapError((cause) => agentStorageError("thread.project", cause)));
            return event;
          }),
        )
        .pipe(Effect.mapError((cause) => agentStorageError("thread.create.transaction", cause)));
      yield* hub.publish({ sequence: event.sequence, threadId });
      return new AgentThread({
        ...thread,
        lastSequence: event.sequence,
        updatedAt: event.persistedAt,
      });
    });

    const archive = Effect.fn("AgentThreadStore.archive")(function* (threadId: AgentThreadId) {
      const current = yield* get(threadId);
      if (Option.isNone(current)) {
        return yield* new AgentNotFoundError({
          code: "agent_thread_not_found",
          entityId: threadId,
          entityType: "thread",
          message: `Agent thread not found: ${threadId}`,
          retryable: false,
        });
      }
      if (current.value.status === "archived") return current.value;
      const archivedAt = yield* now;
      const archived = new AgentThread({
        ...current.value,
        archivedAt,
        status: "archived",
        updatedAt: archivedAt,
      });
      const recordJson = yield* encodeRecord("thread.encode", AgentThread, archived);
      const eventInput = yield* makeEventAppend({
        eventType: "thread.archived",
        payload: {},
        retention: "permanent",
        threadId,
        visibility: "public",
      });
      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
            UPDATE agent_threads SET status = 'archived', archived_at = ${DateTime.formatIso(
              archivedAt,
            )}, updated_at = ${DateTime.formatIso(archivedAt)}, record_json = ${recordJson}
            WHERE thread_id = ${threadId} AND status = 'open'
          `.pipe(Effect.mapError((cause) => agentStorageError("thread.archive", cause)));
            const event = yield* appendEventTransaction(sql, eventInput);
            const persisted = new AgentThread({
              ...archived,
              lastSequence: event.sequence,
              updatedAt: event.persistedAt,
            });
            const persistedJson = yield* encodeRecord("thread.encode", AgentThread, persisted);
            yield* sql`
              UPDATE agent_threads SET record_json = ${persistedJson}
              WHERE thread_id = ${threadId}
            `.pipe(Effect.mapError((cause) => agentStorageError("thread.project", cause)));
            return event;
          }),
        )
        .pipe(Effect.mapError((cause) => agentStorageError("thread.archive.transaction", cause)));
      yield* hub.publish({ sequence: event.sequence, threadId });
      return new AgentThread({
        ...archived,
        lastSequence: event.sequence,
        updatedAt: event.persistedAt,
      });
    });

    const list = Effect.fn("AgentThreadStore.list")(function* (
      input: Parameters<AgentThreadStoreShape["list"]>[0] = {},
    ) {
      const rows = yield* sql<ThreadRow>`
        SELECT record_json FROM agent_threads
        WHERE (${input.includeArchived === true ? 1 : 0} = 1 OR status <> 'archived')
          AND (${input.repositoryId ?? null} IS NULL OR repository_id = ${input.repositoryId ?? null})
        ORDER BY updated_at DESC
        LIMIT ${input.limit ?? 100}
      `.pipe(Effect.mapError((cause) => agentStorageError("thread.list", cause)));
      return yield* Effect.forEach(rows, (row) =>
        decodeRecord("thread.decode", AgentThread, row.record_json),
      );
    });

    return AgentThreadStore.of({ archive, create, get, list });
  }),
);
