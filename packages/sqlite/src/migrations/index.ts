import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

export type SqliteMigrationRecord = Record<
  string,
  Effect.Effect<void, unknown, SqlClient.SqlClient>
>;

export type SqliteMigrationOptions<R = never> = SqliteMigrator.MigratorOptions<R>;

export const migrationsFromRecord = SqliteMigrator.fromRecord;

export const runMigrations = SqliteMigrator.run;

export const migrationLayer = SqliteMigrator.layer;
