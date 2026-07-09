import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  makeSqliteLayer,
  SqliteCapabilities,
  SqliteMigrationError,
  SqliteVectorUnavailableError,
} from "../src/index.ts";
import { openSqliteSync } from "../src/sync.ts";
import { makeInMemorySqliteLayer } from "../src/testing/index.ts";

describe("@cycle/sqlite", () => {
  it("opens an in-memory Effect SQL database with foreign keys enabled", async () => {
    const value = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql.unsafe<{ readonly foreign_keys: number }>("PRAGMA foreign_keys");
        return rows[0]?.foreign_keys;
      }).pipe(Effect.provide(makeInMemorySqliteLayer())),
    );

    expect(value).toBe(1);
  });

  it("creates parent directories for file-backed Effect SQL databases", async () => {
    const root = mkdtempSync(join(tmpdir(), "cycle-sqlite-"));
    const databasePath = join(root, "nested", "test.db");

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`;
          yield* sql`INSERT INTO example (value) VALUES (${"ok"})`;
        }).pipe(Effect.provide(makeSqliteLayer({ filename: databasePath }))),
      );

      expect(existsSync(databasePath)).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("surfaces the native SQLite open failure message", async () => {
    const root = mkdtempSync(join(tmpdir(), "cycle-sqlite-open-failure-"));
    const databasePath = join(root, "missing", "test.db");

    try {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`SELECT 1`;
        }).pipe(
          Effect.provide(
            makeSqliteLayer({
              createParentDirectory: false,
              filename: databasePath,
            }),
          ),
        ),
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(String(result.cause)).toContain("SqliteOpenError");
        expect(String(result.cause)).toContain("directory does not exist");
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("runs caller migrations before the layer is ready", async () => {
    const count = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql.unsafe<{ readonly count: number }>(
          "SELECT count(*) AS count FROM migrated",
        );
        return rows[0]?.count;
      }).pipe(
        Effect.provide(
          makeInMemorySqliteLayer({
            migrations: {
              "0001_create_migrated": Effect.gen(function* () {
                const sql = yield* SqlClient.SqlClient;
                yield* sql`CREATE TABLE migrated (id INTEGER PRIMARY KEY)`;
                yield* sql`INSERT INTO migrated (id) VALUES (1)`;
              }),
            },
          }),
        ),
      ),
    );

    expect(count).toBe(1);
  });

  it("maps migration failures to SqliteMigrationError", async () => {
    const result = await Effect.runPromiseExit(
      Effect.void.pipe(
        Effect.provide(
          makeInMemorySqliteLayer({
            migrations: {
              "0001_fail": Effect.fail("nope"),
            },
          }),
        ),
      ),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.cause)).toContain("SqliteMigrationError");
    }
  });

  it("reports disabled vector capability for base layers", async () => {
    const capability = await Effect.runPromise(
      Effect.gen(function* () {
        const capabilities = yield* SqliteCapabilities;
        return capabilities.vector;
      }).pipe(Effect.provide(makeInMemorySqliteLayer())),
    );

    expect(capability.status).toBe("disabled");
  });

  it("fails vector-required layers when the extension cannot be loaded", async () => {
    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        return yield* SqliteCapabilities;
      }).pipe(
        Effect.provide(
          makeInMemorySqliteLayer({
            vector: "required",
          }),
        ),
      ),
    );

    if (result._tag === "Failure") {
      expect(String(result.cause)).toContain("SqliteVectorUnavailableError");
    } else {
      expect(result.value.vector.status).toBe("loaded");
    }
  });

  it("opens a sync compatibility database without node:sqlite consumers", () => {
    const db = openSqliteSync(":memory:");

    try {
      db.exec("CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
      db.prepare("INSERT INTO example (value) VALUES (?)").run("ok");
      const row = db.prepare("SELECT value FROM example WHERE id = ?").get(1) as
        | { readonly value: string }
        | undefined;

      expect(row?.value).toBe("ok");
    } finally {
      db.close();
    }
  });

  it("exposes typed vector errors from sync compatibility loading", () => {
    try {
      const db = openSqliteSync(":memory:", { vector: "required" });
      db.close();
    } catch (error) {
      expect(error).toBeInstanceOf(SqliteVectorUnavailableError);
    }
  });

  it("exports the migration error class", () => {
    expect(SqliteMigrationError).toBeDefined();
  });
});
