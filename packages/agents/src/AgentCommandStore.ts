import { Context, DateTime, Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentCommand, AgentCommandReceipt } from "./AgentCommand.ts";
import { AgentStorageError, agentStorageError } from "./AgentErrors.ts";
import type { AgentCommandId } from "./AgentIds.ts";
import { decodeRecord, encodeRecord, now } from "./internal/persistence.ts";

type RecordRow = { readonly record_json: string };

export type AgentCommandStoreShape = {
  readonly deliver: (
    commandId: AgentCommandId,
  ) => Effect.Effect<AgentCommandReceipt, AgentStorageError>;
  readonly record: (command: AgentCommand) => Effect.Effect<AgentCommandReceipt, AgentStorageError>;
};

export class AgentCommandStore extends Context.Service<AgentCommandStore, AgentCommandStoreShape>()(
  "@cycle/agents/AgentCommandStore",
) {}

export const AgentCommandStoreLive = Layer.effect(
  AgentCommandStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const record = Effect.fn("AgentCommandStore.record")(function* (command: AgentCommand) {
      const existing = yield* sql<RecordRow>`
        SELECT record_json FROM agent_commands WHERE command_id = ${command.commandId}
      `.pipe(Effect.mapError((cause) => agentStorageError("command.get", cause)));
      const persisted =
        existing[0] === undefined
          ? command
          : yield* decodeRecord("command.decode", AgentCommand, existing[0].record_json);
      if (existing[0] === undefined) {
        const recordJson = yield* encodeRecord("command.encode", AgentCommand, command);
        yield* sql`
          INSERT INTO agent_commands(
            command_id, thread_id, task_id, run_id, command_type, status, created_at, record_json
          ) VALUES (
            ${command.commandId}, ${command.threadId}, ${command.taskId ?? null},
            ${command.runId ?? null}, ${command.commandType}, ${command.status},
            ${DateTime.formatIso(command.createdAt)}, ${recordJson}
          )
        `.pipe(Effect.mapError((cause) => agentStorageError("command.insert", cause)));
      }
      return new AgentCommandReceipt({
        commandId: persisted.commandId,
        status: persisted.status,
        threadId: persisted.threadId,
        ...(persisted.taskId === undefined ? {} : { taskId: persisted.taskId }),
      });
    });

    const deliver = Effect.fn("AgentCommandStore.deliver")(function* (commandId: AgentCommandId) {
      const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_commands WHERE command_id = ${commandId}
      `.pipe(Effect.mapError((cause) => agentStorageError("command.get", cause)));
      if (rows[0] === undefined) {
        return yield* agentStorageError("command.deliver", new Error("Command was not recorded."));
      }
      const command = yield* decodeRecord("command.decode", AgentCommand, rows[0].record_json);
      if (command.status === "delivered") {
        return new AgentCommandReceipt({
          commandId,
          status: "delivered",
          threadId: command.threadId,
          ...(command.taskId === undefined ? {} : { taskId: command.taskId }),
        });
      }
      const deliveredAt = yield* now;
      const delivered = new AgentCommand({ ...command, deliveredAt, status: "delivered" });
      const recordJson = yield* encodeRecord("command.encode", AgentCommand, delivered);
      yield* sql`
        UPDATE agent_commands SET status = 'delivered', delivered_at = ${DateTime.formatIso(
          deliveredAt,
        )}, record_json = ${recordJson} WHERE command_id = ${commandId}
      `.pipe(Effect.mapError((cause) => agentStorageError("command.deliver", cause)));
      return new AgentCommandReceipt({
        commandId,
        status: "delivered",
        threadId: command.threadId,
        ...(command.taskId === undefined ? {} : { taskId: command.taskId }),
      });
    });

    return AgentCommandStore.of({ deliver, record });
  }),
);
