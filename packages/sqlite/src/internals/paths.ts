import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as Effect from "effect/Effect";
import { SqlitePathError } from "../SqlitePathError.ts";

export const IN_MEMORY_SQLITE_PATH = ":memory:";

export const isInMemorySqlitePath = (path: string): boolean => path === IN_MEMORY_SQLITE_PATH;

export const ensureSqliteParentDirectorySync = (path: string): void => {
  if (isInMemorySqlitePath(path)) return;
  mkdirSync(dirname(path), { recursive: true });
};

export const ensureSqliteParentDirectory = (path: string): Effect.Effect<void, SqlitePathError> =>
  Effect.try({
    catch: (cause) =>
      new SqlitePathError({
        cause,
        message: `Failed to create SQLite database parent directory: ${path}`,
        operation: "ensureParentDirectory",
        path,
      }),
    try: () => {
      ensureSqliteParentDirectorySync(path);
    },
  });
