import { Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import {
  CURRENT_PROJECTION_SCHEMA_VERSION,
  inboxSchemaSql,
  schemaSql,
  sharedMetadataSchemaSql,
} from "../Projection.ts";

const SqlStatementRequest = Schema.Struct({
  source: Schema.String,
});

const sqlStatements = (source: string): ReadonlyArray<string> =>
  source
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const runSqlBatch = (sql: SqlClient.SqlClient, source: string): Effect.Effect<void, unknown> => {
  const runSqlStatement = SqlSchema.void({
    Request: SqlStatementRequest,
    execute: (request) => sql.unsafe(request.source),
  });

  return Effect.forEach(
    sqlStatements(source),
    (statement) => runSqlStatement({ source: statement }),
    {
      discard: true,
    },
  );
};

export const projectionSchemaMigration = SqlClient.SqlClient.pipe(
  Effect.flatMap((sql) =>
    runSqlBatch(
      sql,
      `${schemaSql}
${sharedMetadataSchemaSql}
${inboxSchemaSql}
PRAGMA user_version = ${CURRENT_PROJECTION_SCHEMA_VERSION}`,
    ),
  ),
);
