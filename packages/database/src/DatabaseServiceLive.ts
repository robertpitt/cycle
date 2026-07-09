import { makeSqliteLayer } from "@cycle/sqlite";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { DatabaseIdGenerator, type DatabaseIdGeneratorShape } from "./DatabaseIdGenerator.ts";
import { DatabaseIdentity, type DatabaseIdentityShape } from "./DatabaseIdentity.ts";
import { databaseProjectionMigrations } from "./DatabaseProjectionMigrations.ts";
import {
  DatabaseService,
  type DatabaseServiceOptions,
  type DatabaseServiceShape,
} from "./DatabaseService.ts";
import { makeDatabaseServiceWithProjection } from "./DatabaseServiceImplementation.ts";
import { Projection } from "./Projection.ts";

const DEFAULT_PROJECTION_PATH = ":memory:";

/**
 * @deprecated Prefer `DatabaseLiveWithOptions`, which composes the SQLite layer and provides
 * `SqlClient` to the projection through Effect layer wiring.
 */
export const makeDatabaseService = (
  identity: DatabaseIdentityShape,
  ids: DatabaseIdGeneratorShape,
  options: DatabaseServiceOptions = {},
): DatabaseServiceShape =>
  makeDatabaseServiceWithProjection(
    identity,
    ids,
    new Projection(options.projectionPath ?? DEFAULT_PROJECTION_PATH),
  );

const makeDatabaseServiceLayer = (options: DatabaseServiceOptions) =>
  Layer.effect(
    DatabaseService,
    Effect.gen(function* () {
      const identity = yield* DatabaseIdentity;
      const ids = yield* DatabaseIdGenerator;
      const sql = yield* SqlClient.SqlClient;

      return yield* Effect.acquireRelease(
        Effect.sync(() =>
          DatabaseService.of(
            makeDatabaseServiceWithProjection(identity, ids, Projection.fromSqlClient(sql)),
          ),
        ),
        (service) => service.close,
      );
    }),
  ).pipe(
    Layer.provide(
      makeSqliteLayer({
        filename: options.projectionPath ?? DEFAULT_PROJECTION_PATH,
        migrations: databaseProjectionMigrations,
      }),
    ),
  );

export const DatabaseLive = makeDatabaseServiceLayer({});

export const DatabaseLiveWithOptions = (options: DatabaseServiceOptions) =>
  makeDatabaseServiceLayer(options);
