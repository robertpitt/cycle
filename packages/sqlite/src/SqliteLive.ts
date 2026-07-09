import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqliteCapabilities } from "./SqliteCapabilities.ts";
import { SqliteMigrationError } from "./SqliteMigrationError.ts";
import { SqliteOpenError } from "./SqliteOpenError.ts";
import { SqlitePathError } from "./SqlitePathError.ts";
import { SqlitePragmaError } from "./SqlitePragmaError.ts";
import { SqliteVectorUnavailableError } from "./SqliteVectorUnavailableError.ts";
import { normalizeMigrationOptions } from "./internals/migrations.ts";
import { ensureSqliteParentDirectory } from "./internals/paths.ts";
import {
  resolveSqliteVectorExtensionPath,
  type SqliteVectorCapability,
} from "./internals/vector.ts";
import type { SqliteMigrationOptions, SqliteMigrationRecord } from "./migrations/index.ts";

export type SqliteVectorMode = "disabled" | "required";

export type SqliteLayerOptions<R = never> = {
  readonly createParentDirectory?: boolean;
  readonly disableWAL?: boolean;
  readonly filename: string;
  readonly migrations?: SqliteMigrationOptions<R> | SqliteMigrationRecord;
  readonly pragmas?: ReadonlyArray<string>;
  readonly readonly?: boolean;
  readonly vector?: SqliteVectorMode;
};

export type SqliteLayerError =
  | SqliteMigrationError
  | SqliteOpenError
  | SqlitePathError
  | SqlitePragmaError
  | SqliteVectorUnavailableError;

const causeMessage = (cause: Cause.Cause<unknown>): string => {
  const squashed = Cause.squash(cause);
  return squashed instanceof Error ? squashed.message : String(squashed);
};

const applyPragmas = (
  pragmas: ReadonlyArray<string>,
): Effect.Effect<void, SqlitePragmaError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`PRAGMA foreign_keys = ON`;

    for (const pragma of pragmas) {
      yield* sql.unsafe(pragma).pipe(
        Effect.mapError(
          (cause) =>
            new SqlitePragmaError({
              cause,
              message: `Failed to apply SQLite pragma: ${pragma}`,
              operation: "applyPragma",
              pragma,
            }),
        ),
      );
    }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof SqlitePragmaError
        ? cause
        : new SqlitePragmaError({
            cause,
            message: "Failed to apply SQLite foreign key pragma",
            operation: "applyForeignKeysPragma",
            pragma: "PRAGMA foreign_keys = ON",
          }),
    ),
  );

const loadVectorCapability = (
  mode: SqliteVectorMode,
): Effect.Effect<
  SqliteVectorCapability,
  SqliteVectorUnavailableError,
  SqliteClient.SqliteClient
> => {
  if (mode === "disabled") {
    return Effect.succeed({ status: "disabled" });
  }

  return Effect.gen(function* () {
    const extensionPath = yield* resolveSqliteVectorExtensionPath;
    const client = yield* SqliteClient.SqliteClient;
    yield* client.loadExtension(extensionPath).pipe(
      Effect.mapError(
        (cause) =>
          new SqliteVectorUnavailableError({
            cause,
            extensionPath,
            message: `Failed to load sqlite-vector extension: ${extensionPath}`,
            operation: "loadVectorExtension",
            reason: "load_failed",
          }),
      ),
    );

    return {
      extensionPath,
      status: "loaded" as const,
    };
  });
};

const provideClient = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  client: SqliteClient.SqliteClient,
): Effect.Effect<A, E, Exclude<R, SqlClient.SqlClient | SqliteClient.SqliteClient>> =>
  effect.pipe(
    Effect.provideService(SqliteClient.SqliteClient, client),
    Effect.provideService(SqlClient.SqlClient, client),
  ) as Effect.Effect<A, E, Exclude<R, SqlClient.SqlClient | SqliteClient.SqliteClient>>;

export const makeSqliteLayer = <R = never>(
  options: SqliteLayerOptions<R>,
): Layer.Layer<
  SqliteCapabilities | SqlClient.SqlClient | SqliteClient.SqliteClient,
  SqliteLayerError,
  R
> =>
  Layer.effectContext(
    Effect.gen(function* () {
      if (options.createParentDirectory !== false) {
        yield* ensureSqliteParentDirectory(options.filename);
      }

      const client = yield* SqliteClient.make({
        disableWAL: options.disableWAL ?? true,
        filename: options.filename,
        readonly: options.readonly,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.fail(
            new SqliteOpenError({
              cause: Cause.squash(cause),
              message: `Failed to open SQLite database: ${options.filename}: ${causeMessage(cause)}`,
              operation: "open",
              path: options.filename,
            }),
          ),
        ),
      );

      const vectorMode = options.vector ?? "disabled";
      const capability = yield* provideClient(
        Effect.gen(function* () {
          yield* applyPragmas(options.pragmas ?? []);
          return yield* loadVectorCapability(vectorMode);
        }),
        client,
      );

      const migrations = normalizeMigrationOptions(options.migrations);
      if (migrations !== undefined) {
        yield* provideClient(SqliteMigrator.run(migrations), client).pipe(
          Effect.catchCause((cause) =>
            Effect.fail(
              new SqliteMigrationError({
                cause: Cause.squash(cause),
                message: `Failed to run SQLite migrations: ${causeMessage(cause)}`,
                operation: "runMigrations",
              }),
            ),
          ),
          Effect.mapError((cause) =>
            cause instanceof SqliteMigrationError
              ? cause
              : new SqliteMigrationError({
                  cause,
                  message: "Failed to run SQLite migrations",
                  operation: "runMigrations",
                }),
          ),
        );
      }

      return Context.make(SqliteClient.SqliteClient, client).pipe(
        Context.add(SqlClient.SqlClient, client),
        Context.add(
          SqliteCapabilities,
          SqliteCapabilities.of({
            vector: capability,
          }),
        ),
      );
    }),
  ).pipe(Layer.provide(Reactivity.layer));

export const makeVectorSqliteLayer = <R = never>(options: Omit<SqliteLayerOptions<R>, "vector">) =>
  makeSqliteLayer({
    ...options,
    vector: "required",
  });
