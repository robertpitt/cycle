import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { projectionSchemaMigration } from "./migrations/0001_projection_schema.ts";

export const databaseProjectionMigrations = {
  "0001_projection_schema": projectionSchemaMigration,
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>;
