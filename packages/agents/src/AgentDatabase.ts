import { makeSqliteLayer, migrationsFromRecord, type SqliteLayerError } from "@cycle/sqlite";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentConfig } from "./AgentConfig.ts";
import { agentMigrations } from "./migrations/AgentMigrations.ts";

export const AgentDatabaseLive: Layer.Layer<SqlClient.SqlClient, SqliteLayerError, AgentConfig> =
  Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* AgentConfig;
      return makeSqliteLayer({
        disableWAL: false,
        filename: config.databasePath,
        migrations: {
          loader: migrationsFromRecord(agentMigrations),
          table: "agent_schema_migrations",
        },
        pragmas: [`PRAGMA busy_timeout = ${config.busyTimeoutMs}`],
      });
    }),
  );
