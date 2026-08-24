import { Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { CURRENT_PROJECTION_SCHEMA_VERSION } from "../Projection.ts";
import { pageProjectionSchemaSql } from "../PageProjection.ts";

const SqlStatement = Schema.Struct({ source: Schema.String });

export const pagesProjectionMigration = SqlClient.SqlClient.pipe(
  Effect.flatMap((sql) => {
    const execute = SqlSchema.void({
      Request: SqlStatement,
      execute: ({ source }) => sql.unsafe(source),
    });

    return Effect.forEach(
      pageProjectionSchemaSql
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0),
      (source) => execute({ source }),
      { discard: true },
    );
  }),
  Effect.andThen(
    SqlClient.SqlClient.pipe(
      Effect.flatMap((sql) => sql.unsafe(`PRAGMA user_version = ${CURRENT_PROJECTION_SCHEMA_VERSION}`)),
      Effect.asVoid,
    ),
  ),
);
