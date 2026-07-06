import { DatabaseSync } from "node:sqlite";
import { SqliteOpenError } from "./SqliteOpenError.ts";
import { SqlitePragmaError } from "./SqlitePragmaError.ts";
import { SqliteVectorUnavailableError } from "./SqliteVectorUnavailableError.ts";
import { ensureSqliteParentDirectorySync, isInMemorySqlitePath } from "./internals/paths.ts";
import { resolveSqliteVectorExtensionPathSync } from "./internals/vector.ts";

export type SqliteRunResult = {
  readonly changes?: number | bigint;
  readonly lastInsertRowid?: number | bigint;
};

export type SqliteStatementLike = {
  readonly all: (...args: ReadonlyArray<unknown>) => ReadonlyArray<unknown>;
  readonly get: (...args: ReadonlyArray<unknown>) => unknown;
  readonly run: (...args: ReadonlyArray<unknown>) => SqliteRunResult;
};

export type SqliteDatabaseLike = {
  readonly close: () => void;
  readonly enableLoadExtension?: (allow: boolean) => void;
  readonly exec: (sql: string) => void;
  readonly loadExtension?: (path: string) => void;
  readonly prepare: (sql: string) => SqliteStatementLike;
  readonly pragma?: (source: string) => unknown;
};

export type OpenSqliteSyncOptions = {
  readonly createParentDirectory?: boolean;
  readonly pragmas?: ReadonlyArray<string>;
  readonly readonly?: boolean;
  readonly vector?: "disabled" | "required";
};

export const openSqliteSync = (
  filename: string,
  options: OpenSqliteSyncOptions = {},
): SqliteDatabaseLike => {
  if (options.createParentDirectory !== false) {
    ensureSqliteParentDirectorySync(filename);
  }

  let db: SqliteDatabaseLike;
  try {
    db = (options.readonly === undefined
      ? new DatabaseSync(filename)
      : new DatabaseSync(filename, {
          readOnly: options.readonly,
        })) as unknown as SqliteDatabaseLike;
  } catch (cause) {
    throw new SqliteOpenError({
      cause,
      message: `Failed to open SQLite database: ${filename}`,
      operation: "openSync",
      path: filename,
    });
  }

  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const pragma of options.pragmas ?? []) {
      db.exec(`PRAGMA ${pragma}`);
    }
  } catch (cause) {
    db.close();
    throw new SqlitePragmaError({
      cause,
      message: "Failed to apply SQLite pragma",
      operation: "applyPragmaSync",
    });
  }

  if (options.vector === "required") {
    const extensionPath = resolveSqliteVectorExtensionPathSync();
    try {
      db.enableLoadExtension?.(true);
      db.loadExtension?.(extensionPath);
    } catch (cause) {
      db.close();
      throw new SqliteVectorUnavailableError({
        cause,
        extensionPath,
        message: `Failed to load sqlite-vector extension: ${extensionPath}`,
        operation: "loadVectorExtensionSync",
        reason: "load_failed",
      });
    }
  }

  return db;
};

export { ensureSqliteParentDirectorySync, isInMemorySqlitePath };
