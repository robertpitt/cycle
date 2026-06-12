import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CYCLE_HOME_DIRECTORY_NAME = ".cycle";
export const CYCLE_DATABASE_FILE_NAME = "cycle.db";

export const cycleHomeDirectory = (homeDirectory = homedir()): string =>
  join(homeDirectory, CYCLE_HOME_DIRECTORY_NAME);

export const cycleDatabasePath = (homeDirectory = homedir()): string =>
  join(cycleHomeDirectory(homeDirectory), CYCLE_DATABASE_FILE_NAME);

export const isInMemoryDatabasePath = (path: string): boolean => path === ":memory:";

export const ensureDatabaseParentDirectorySync = (path: string): void => {
  if (isInMemoryDatabasePath(path)) return;
  mkdirSync(dirname(path), { recursive: true });
};
