import { defaultRuntimeDiscoveryPath, RuntimeDiscoveryFile } from "@cycle/config";
import { Config, Effect, Path, Schema } from "effect";

export type BackendPaths = {
  readonly agentsDatabasePath: string;
  readonly agentWorktreesPath: string;
  readonly cycleHome: string;
  readonly databasePath: string;
  readonly runtimeDiscoveryPath: string;
};

export type BackendStartOptions = {
  readonly host?: "127.0.0.1" | "localhost";
  readonly port?: number | "auto";
  readonly runtimeFile?: string;
};

export const homeDirectoryConfig = Config.string("HOME").pipe(
  Config.withDefault("."),
  Config.map((value) => value.trim() || "."),
);

export const backendPaths = (options: BackendStartOptions = {}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const homeDirectory = yield* homeDirectoryConfig;
    const cycleHome = path.join(homeDirectory, ".cycle");
    const runtimeDiscoveryPath =
      options.runtimeFile === undefined || options.runtimeFile.trim().length === 0
        ? yield* defaultRuntimeDiscoveryPath
        : options.runtimeFile;

    return {
      agentWorktreesPath: path.join(cycleHome, "agent-task-worktrees"),
      agentsDatabasePath: path.join(cycleHome, "agents.sqlite"),
      cycleHome,
      databasePath: path.join(cycleHome, "cycle.db"),
      runtimeDiscoveryPath,
    };
  });

export const runtimeBaseUrlFromDiscovery = (value: unknown): string | undefined => {
  const parsed = Schema.decodeUnknownSync(RuntimeDiscoveryFile)(value);
  return parsed.baseUrl === undefined || parsed.baseUrl.length === 0
    ? undefined
    : parsed.baseUrl.replace(/\/+$/u, "");
};

export const parseRuntimeBaseUrlFromDiscoveryText = (text: string): string | undefined =>
  runtimeBaseUrlFromDiscovery(JSON.parse(text) as unknown);
