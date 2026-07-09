import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import type { SqliteMigrationOptions, SqliteMigrationRecord } from "../migrations/index.ts";

export const normalizeMigrationOptions = <R>(
  migrations: SqliteMigrationOptions<R> | SqliteMigrationRecord | undefined,
): SqliteMigrationOptions<R> | undefined => {
  if (migrations === undefined) return undefined;
  if (isMigrationOptions<R>(migrations)) return migrations;

  return {
    loader: SqliteMigrator.fromRecord(migrations),
  } as SqliteMigrationOptions<R>;
};

const isMigrationOptions = <R>(
  migrations: SqliteMigrationOptions<R> | SqliteMigrationRecord,
): migrations is SqliteMigrationOptions<R> =>
  typeof migrations === "object" &&
  migrations !== null &&
  "loader" in migrations &&
  typeof migrations.loader !== "undefined";
