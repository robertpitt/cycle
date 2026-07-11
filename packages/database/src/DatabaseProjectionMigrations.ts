import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { projectionSchemaMigration } from "./migrations/0001_projection_schema.ts";
import { pagesProjectionMigration } from "./migrations/0002_pages.ts";

export const databaseProjectionMigrations = {
  "0001_projection_schema": projectionSchemaMigration,
  "0002_pages": pagesProjectionMigration,
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>;
