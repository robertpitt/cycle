import { Context, Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentArtifact } from "./AgentArtifact.ts";
import { AgentAttempt } from "./AgentAttempt.ts";
import { AgentStorageError, agentStorageError } from "./AgentErrors.ts";
import type { AgentTaskId, AgentThreadId } from "./AgentIds.ts";
import { AgentInteraction } from "./AgentInteraction.ts";
import { AgentMessage } from "./AgentMessage.ts";
import { AgentRun } from "./AgentRun.ts";
import { AgentSessionBinding } from "./AgentSessionBinding.ts";
import { AgentTask } from "./AgentTask.ts";
import { AgentTaskSnapshot, AgentThreadSnapshot } from "./AgentSnapshots.ts";
import { AgentThread } from "./AgentThread.ts";
import { AgentWorkflowStep } from "./AgentWorkflowStep.ts";
import { decodeRecord } from "./internal/persistence.ts";

type RecordRow = { readonly record_json: string };
type SequenceRow = { readonly value: number | null };

const decodeRows = <S extends Schema.Top>(
  operation: string,
  schema: S,
  rows: ReadonlyArray<RecordRow>,
) => Effect.forEach(rows, (row) => decodeRecord(operation, schema, row.record_json));

export type AgentReadStoreShape = {
  readonly latestSessionBinding: (input: {
    readonly harnessId: string;
    readonly threadId: AgentThreadId;
  }) => Effect.Effect<Option.Option<AgentSessionBinding>, AgentStorageError>;
  readonly taskSnapshot: (
    taskId: AgentTaskId,
  ) => Effect.Effect<Option.Option<AgentTaskSnapshot>, AgentStorageError>;
  readonly threadSnapshot: (
    threadId: AgentThreadId,
  ) => Effect.Effect<Option.Option<AgentThreadSnapshot>, AgentStorageError>;
};

export class AgentReadStore extends Context.Service<AgentReadStore, AgentReadStoreShape>()(
  "@cycle/agents/AgentReadStore",
) {}

export const AgentReadStoreLive = Layer.effect(
  AgentReadStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const latestSessionBinding = Effect.fn("AgentReadStore.latestSessionBinding")(
      function* (input: { readonly harnessId: string; readonly threadId: AgentThreadId }) {
        const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_session_bindings
        WHERE thread_id = ${input.threadId} AND harness_id = ${input.harnessId}
        ORDER BY updated_at DESC, created_at DESC LIMIT 1
      `.pipe(Effect.mapError((cause) => agentStorageError("snapshot.session-binding", cause)));
        if (rows[0] === undefined) return Option.none();
        return Option.some(
          yield* decodeRecord("session-binding.decode", AgentSessionBinding, rows[0].record_json),
        );
      },
    );

    const threadSnapshot = Effect.fn("AgentReadStore.threadSnapshot")(function* (
      threadId: AgentThreadId,
    ) {
      const threadRows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_threads WHERE thread_id = ${threadId}
      `.pipe(Effect.mapError((cause) => agentStorageError("snapshot.thread", cause)));
      if (threadRows[0] === undefined) return Option.none();
      const [thread, messages, tasks, interactions, artifacts, sequence] = yield* Effect.all(
        [
          decodeRecord("thread.decode", AgentThread, threadRows[0].record_json),
          sql<RecordRow>`
            SELECT record_json FROM agent_messages
            WHERE thread_id = ${threadId} AND visibility = 'public'
            ORDER BY created_at, message_id
          `.pipe(
            Effect.mapError((cause) => agentStorageError("snapshot.messages", cause)),
            Effect.flatMap((rows) => decodeRows("message.decode", AgentMessage, rows)),
          ),
          sql<RecordRow>`
            SELECT record_json FROM agent_tasks WHERE thread_id = ${threadId}
            ORDER BY enqueue_sequence
          `.pipe(
            Effect.mapError((cause) => agentStorageError("snapshot.tasks", cause)),
            Effect.flatMap((rows) => decodeRows("task.decode", AgentTask, rows)),
          ),
          sql<RecordRow>`
            SELECT record_json FROM agent_interactions
            WHERE thread_id = ${threadId} AND status = 'open' ORDER BY created_at
          `.pipe(
            Effect.mapError((cause) => agentStorageError("snapshot.interactions", cause)),
            Effect.flatMap((rows) => decodeRows("interaction.decode", AgentInteraction, rows)),
          ),
          sql<RecordRow>`
            SELECT record_json FROM agent_artifacts WHERE thread_id = ${threadId} ORDER BY created_at
          `.pipe(
            Effect.mapError((cause) => agentStorageError("snapshot.artifacts", cause)),
            Effect.flatMap((rows) => decodeRows("artifact.decode", AgentArtifact, rows)),
          ),
          sql<SequenceRow>`
            SELECT last_sequence AS value FROM agent_threads WHERE thread_id = ${threadId}
          `.pipe(Effect.mapError((cause) => agentStorageError("snapshot.sequence", cause))),
        ],
        { concurrency: "unbounded" },
      );
      return Option.some(
        new AgentThreadSnapshot({
          artifacts,
          interactions,
          lastSequence: sequence[0]?.value ?? 0,
          messages,
          tasks,
          thread: new AgentThread({ ...thread, lastSequence: sequence[0]?.value ?? 0 }),
        }),
      );
    });

    const taskSnapshot = Effect.fn("AgentReadStore.taskSnapshot")(function* (taskId: AgentTaskId) {
      const taskRows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_tasks WHERE task_id = ${taskId}
      `.pipe(Effect.mapError((cause) => agentStorageError("snapshot.task", cause)));
      if (taskRows[0] === undefined) return Option.none();
      const [task, runs, attempts, interactions, artifacts, workflowSteps, sequence] =
        yield* Effect.all(
          [
            decodeRecord("task.decode", AgentTask, taskRows[0].record_json),
            sql<RecordRow>`SELECT record_json FROM agent_runs WHERE task_id = ${taskId} ORDER BY created_at`.pipe(
              Effect.mapError((cause) => agentStorageError("snapshot.runs", cause)),
              Effect.flatMap((rows) => decodeRows("run.decode", AgentRun, rows)),
            ),
            sql<RecordRow>`
              SELECT a.record_json FROM agent_attempts a
              JOIN agent_runs r ON r.run_id = a.run_id
              WHERE r.task_id = ${taskId} ORDER BY a.started_at
            `.pipe(
              Effect.mapError((cause) => agentStorageError("snapshot.attempts", cause)),
              Effect.flatMap((rows) => decodeRows("attempt.decode", AgentAttempt, rows)),
            ),
            sql<RecordRow>`SELECT record_json FROM agent_interactions WHERE task_id = ${taskId} ORDER BY created_at`.pipe(
              Effect.mapError((cause) => agentStorageError("snapshot.interactions", cause)),
              Effect.flatMap((rows) => decodeRows("interaction.decode", AgentInteraction, rows)),
            ),
            sql<RecordRow>`SELECT record_json FROM agent_artifacts WHERE task_id = ${taskId} ORDER BY created_at`.pipe(
              Effect.mapError((cause) => agentStorageError("snapshot.artifacts", cause)),
              Effect.flatMap((rows) => decodeRows("artifact.decode", AgentArtifact, rows)),
            ),
            sql<RecordRow>`SELECT record_json FROM agent_workflow_steps WHERE task_id = ${taskId} ORDER BY created_at`.pipe(
              Effect.mapError((cause) => agentStorageError("snapshot.workflow", cause)),
              Effect.flatMap((rows) => decodeRows("workflow.decode", AgentWorkflowStep, rows)),
            ),
            sql<SequenceRow>`
              SELECT max(sequence) AS value FROM agent_events WHERE task_id = ${taskId}
            `.pipe(Effect.mapError((cause) => agentStorageError("snapshot.sequence", cause))),
          ],
          { concurrency: "unbounded" },
        );
      return Option.some(
        new AgentTaskSnapshot({
          artifacts,
          attempts,
          interactions,
          lastSequence: sequence[0]?.value ?? 0,
          runs,
          task,
          workflowSteps,
        }),
      );
    });

    return AgentReadStore.of({ latestSessionBinding, taskSnapshot, threadSnapshot });
  }),
);
