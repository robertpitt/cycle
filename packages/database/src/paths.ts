import { homedir } from "node:os";
import { join } from "node:path";
import { ensureSqliteParentDirectorySync, isInMemorySqlitePath } from "@cycle/sqlite/sync";

export const CYCLE_HOME_DIRECTORY_NAME = ".cycle";
export const CYCLE_DATABASE_FILE_NAME = "cycle.db";

export const cycleHomeDirectory = (homeDirectory = homedir()): string =>
  join(homeDirectory, CYCLE_HOME_DIRECTORY_NAME);

export const cycleDatabasePath = (homeDirectory = homedir()): string =>
  join(cycleHomeDirectory(homeDirectory), CYCLE_DATABASE_FILE_NAME);

export const isInMemoryDatabasePath = isInMemorySqlitePath;

export const ensureDatabaseParentDirectorySync = ensureSqliteParentDirectorySync;
