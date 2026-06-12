import { join } from "node:path";
import { Effect } from "effect";
import { ElectronApp } from "../platform/ElectronApp.ts";

export const cycleDirectoryName = ".cycle";
export const cycleAppConfigFileName = "app-config.json";
export const cycleDatabaseFileName = "cycle.db";
export const cycleCliConfigFileName = "config.json";

export const cycleDirectoryPath = (homeDirectory: string): string =>
  join(homeDirectory, cycleDirectoryName);

export const cycleAppConfigPathFromHome = (homeDirectory: string): string =>
  join(cycleDirectoryPath(homeDirectory), cycleAppConfigFileName);

export const cycleDatabasePathFromHome = (homeDirectory: string): string =>
  join(cycleDirectoryPath(homeDirectory), cycleDatabaseFileName);

export const cycleCliConfigPathFromHome = (homeDirectory: string): string =>
  join(cycleDirectoryPath(homeDirectory), cycleCliConfigFileName);

export const cycleLogPathFromHome = (homeDirectory: string): string =>
  join(cycleDirectoryPath(homeDirectory), "logs", "main.log");

const homeDirectory = Effect.gen(function* () {
  const app = yield* ElectronApp;
  return yield* app.getPath("home");
});

export const cycleDirectory = homeDirectory.pipe(Effect.map(cycleDirectoryPath));

export const cycleAppConfigPath = homeDirectory.pipe(Effect.map(cycleAppConfigPathFromHome));

export const cycleDatabasePath = homeDirectory.pipe(Effect.map(cycleDatabasePathFromHome));

export const cycleLogPath = homeDirectory.pipe(Effect.map(cycleLogPathFromHome));
