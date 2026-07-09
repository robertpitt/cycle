import { Context, DateTime, Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentConfig } from "./AgentConfig.ts";
import { AgentRetentionError } from "./AgentErrors.ts";
import { makeAgentId, now } from "./internal/persistence.ts";

export type AgentRetentionResult = {
  readonly diagnosticsDeleted: number;
  readonly runId: string;
};

export type AgentRetentionShape = {
  readonly run: Effect.Effect<AgentRetentionResult, AgentRetentionError>;
};

export class AgentRetention extends Context.Service<AgentRetention, AgentRetentionShape>()(
  "@cycle/agents/AgentRetention",
) {}

type RunResult = { readonly changes?: bigint | number };

export const AgentRetentionLive = Layer.effect(
  AgentRetention,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const run: Effect.Effect<AgentRetentionResult, AgentRetentionError> = Effect.gen(function* () {
      const runId = yield* makeAgentId<string>("agent_retention");
      const startedAt = yield* now;
      yield* sql`
        INSERT INTO agent_retention_runs(retention_run_id, status, started_at)
        VALUES (${runId}, 'running', ${DateTime.formatIso(startedAt)})
      `;
      const deleted = yield* sql`
        DELETE FROM agent_provider_diagnostics
        WHERE expires_at <= ${DateTime.formatIso(startedAt)}
      `.raw;
      const completedAt = yield* now;
      yield* sql`
        UPDATE agent_retention_runs SET status = 'completed',
          completed_at = ${DateTime.formatIso(completedAt)}
        WHERE retention_run_id = ${runId}
      `;
      return {
        diagnosticsDeleted: Number((deleted as RunResult).changes ?? 0),
        runId,
      };
    }).pipe(
      Effect.mapError(
        (cause) =>
          new AgentRetentionError({
            code: "agent_retention_failed",
            message: cause instanceof Error ? cause.message : "Agent retention failed.",
            operation: "retention.run",
            retryable: true,
          }),
      ),
    );
    return AgentRetention.of({ run });
  }),
);

export const AgentRetentionBackgroundLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* AgentConfig;
    const retention = yield* AgentRetention;
    const loop = Effect.gen(function* () {
      yield* Effect.sleep(config.maintenanceIntervalMs);
      yield* retention.run.pipe(
        Effect.catch((error) =>
          Effect.logError(error.message).pipe(Effect.annotateLogs({ operation: error.operation })),
        ),
      );
    }).pipe(Effect.forever);
    yield* loop.pipe(Effect.forkScoped);
  }),
);
