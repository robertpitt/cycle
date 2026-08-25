import { Effect } from "effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import { DatabaseSqliteError } from "../../DatabaseErrors.ts";

export type ProjectionSql = {
  readonly all: <A extends object = Record<string, unknown>>(
    operation: string,
    source: string,
    params?: ReadonlyArray<unknown>,
  ) => Effect.Effect<ReadonlyArray<A>, DatabaseSqliteError>;
  readonly get: <A extends object = Record<string, unknown>>(
    operation: string,
    source: string,
    params?: ReadonlyArray<unknown>,
  ) => Effect.Effect<A | undefined, DatabaseSqliteError>;
  readonly run: (
    operation: string,
    source: string,
    params?: ReadonlyArray<unknown>,
  ) => Effect.Effect<void, DatabaseSqliteError>;
  readonly transaction: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | DatabaseSqliteError, R>;
};

const mapSqlError = (operation: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new DatabaseSqliteError({
        cause,
        message: `SQLite operation failed: ${operation}`,
        operation,
      }),
  );

export const makeProjectionSql = (sql: SqlClient.SqlClient): ProjectionSql => {
  const all = <A extends object = Record<string, unknown>>(
    operation: string,
    source: string,
    params: ReadonlyArray<unknown> = [],
  ): Effect.Effect<ReadonlyArray<A>, DatabaseSqliteError> =>
    sql.unsafe<A>(source, params).pipe(mapSqlError(operation));

  const get = <A extends object = Record<string, unknown>>(
    operation: string,
    source: string,
    params: ReadonlyArray<unknown> = [],
  ): Effect.Effect<A | undefined, DatabaseSqliteError> =>
    all<A>(operation, source, params).pipe(Effect.map((rows) => rows.at(0)));

  const run: ProjectionSql["run"] = (operation, source, params = []) =>
    sql.unsafe(source, params).pipe(Effect.asVoid, mapSqlError(operation));

  const transaction: ProjectionSql["transaction"] = (effect) =>
    sql.withTransaction(effect).pipe(mapSqlError("projection transaction"));

  return { all, get, run, transaction };
};
