import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { defaultAgentCapabilities, supportedAgentProviders } from "./providers.ts";
import type { DetectedAgentProvider } from "./types.ts";

export type AgentProviderDetectionEnvironment = {
  readonly HOME?: string;
  readonly PATH?: string;
  readonly PATHEXT?: string;
  readonly SHELL?: string;
};

export class AgentProviderDetectionError extends Data.TaggedError("AgentProviderDetectionError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}

export const agentProviderDetectionError = (
  operation: string,
  message: string,
  cause?: unknown,
): AgentProviderDetectionError =>
  new AgentProviderDetectionError({
    cause,
    message,
    operation,
  });

export type AgentProviderDetectorService = {
  readonly detect: () => Effect.Effect<
    ReadonlyArray<DetectedAgentProvider>,
    AgentProviderDetectionError
  >;
};

export class AgentProviderDetector extends Context.Service<
  AgentProviderDetector,
  AgentProviderDetectorService
>()("@cycle/agents/AgentProviderDetector") {}

const pathExtensions = (env: AgentProviderDetectionEnvironment): ReadonlyArray<string> => {
  if (process.platform !== "win32") return [""];
  const value = env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
  return value
    .split(";")
    .map((extension) => extension.trim())
    .filter((extension) => extension !== "");
};

const unique = (values: Iterable<string>): ReadonlyArray<string> => [...new Set(values)];

const pathDirectories = (pathValue: string | undefined): ReadonlyArray<string> =>
  (pathValue ?? "").split(delimiter).filter((entry) => entry !== "");

const commonExecutableDirectories = (
  env: AgentProviderDetectionEnvironment,
): ReadonlyArray<string> => {
  if (process.platform === "win32") return pathDirectories(env.PATH);

  const home = env.HOME;
  return unique([
    ...pathDirectories(env.PATH),
    ...(home
      ? [
          join(home, ".local/bin"),
          join(home, "Library/pnpm"),
          join(home, ".bun/bin"),
          join(home, ".deno/bin"),
          join(home, ".cargo/bin"),
          join(home, ".npm-global/bin"),
        ]
      : []),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ]);
};

const nvmExecutableDirectories = (
  env: AgentProviderDetectionEnvironment,
): Effect.Effect<ReadonlyArray<string>, AgentProviderDetectionError> => {
  if (process.platform === "win32" || !env.HOME) return Effect.succeed([]);

  const nodeVersions = join(env.HOME, ".nvm/versions/node");
  return Effect.tryPromise({
    try: async () => {
      const versions = await readdir(nodeVersions, {
        withFileTypes: true,
      });

      return versions
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(nodeVersions, entry.name, "bin"));
    },
    catch: (cause) =>
      agentProviderDetectionError(
        "AgentProviderDetector.nvm",
        "Unable to inspect NVM executable directories.",
        cause,
      ),
  }).pipe(Effect.catch(() => Effect.succeed([])));
};

const isExecutablePath = (path: string): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: async () => {
      await access(path, constants.X_OK);
      return true;
    },
    catch: (cause) => cause,
  }).pipe(Effect.catch(() => Effect.succeed(false)));

const findExecutable = (
  executable: string,
  env: AgentProviderDetectionEnvironment,
): Effect.Effect<string | undefined, AgentProviderDetectionError> =>
  Effect.gen(function* () {
    const directories = unique([
      ...commonExecutableDirectories(env),
      ...(yield* nvmExecutableDirectories(env)),
    ]);
    const extensions = pathExtensions(env);

    for (const directory of directories) {
      for (const extension of extensions) {
        const candidate = join(directory, `${executable}${extension}`);
        if (yield* isExecutablePath(candidate)) return candidate;
      }
    }

    return undefined;
  });

const shellForEnvironment = (env: AgentProviderDetectionEnvironment): string | undefined => {
  if (process.platform === "win32") return undefined;
  return env.SHELL ?? process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
};

const shellLookupScript = supportedAgentProviders
  .map(
    (provider) =>
      `printf '${provider.executable}\\t'; command -v ${provider.executable} 2>/dev/null || true`,
  )
  .join("\n");

const shellArgumentSets = (shell: string): ReadonlyArray<readonly string[]> => {
  const lower = shell.toLowerCase();
  if (lower.includes("fish"))
    return [
      ["-lc", shellLookupScript],
      ["-ic", shellLookupScript],
    ];
  return [
    ["-lc", shellLookupScript],
    ["-ilc", shellLookupScript],
  ];
};

const parseShellLookupOutput = (stdout: string): ReadonlyMap<string, string> => {
  const paths = new Map<string, string>();
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  for (const line of lines) {
    const [executable, candidate] = line.split("\t");
    if (executable && candidate && isAbsolute(candidate)) {
      paths.set(executable, candidate);
    }
  }

  return paths;
};

const runShellLookups = (
  shell: string,
  env: AgentProviderDetectionEnvironment,
): Promise<ReadonlyMap<string, string>> =>
  new Promise((resolve) => {
    const argumentSets = shellArgumentSets(shell);
    const merged = new Map<string, string>();
    let completed = 0;

    if (argumentSets.length === 0) {
      resolve(merged);
      return;
    }

    for (const args of argumentSets) {
      execFile(
        shell,
        [...args],
        {
          env: {
            ...process.env,
            ...env,
          },
          timeout: 3000,
        },
        (_error, stdout) => {
          for (const [executable, candidate] of parseShellLookupOutput(stdout)) {
            merged.set(executable, candidate);
          }

          completed += 1;
          if (completed === argumentSets.length) resolve(merged);
        },
      );
    }
  });

const findShellExecutables = (
  env: AgentProviderDetectionEnvironment,
): Effect.Effect<ReadonlyMap<string, string>, AgentProviderDetectionError> => {
  const shell = shellForEnvironment(env);
  if (!shell) return Effect.succeed(new Map());

  return Effect.tryPromise({
    try: () => runShellLookups(shell, env),
    catch: (cause) =>
      agentProviderDetectionError(
        "AgentProviderDetector.shell",
        "Unable to inspect shell for local agent providers.",
        cause,
      ),
  }).pipe(
    Effect.catch(() => Effect.succeed(new Map())),
    Effect.flatMap((paths) =>
      Effect.gen(function* () {
        const normalized = new Map<string, string>();

        for (const [executable, path] of paths) {
          if (yield* isExecutablePath(path)) {
            normalized.set(executable, path);
          }
        }

        return normalized;
      }),
    ),
  );
};

export const detectAgentProviders = (
  env: AgentProviderDetectionEnvironment = process.env,
): Effect.Effect<ReadonlyArray<DetectedAgentProvider>, AgentProviderDetectionError> =>
  Effect.gen(function* () {
    const detectedAt = new Date().toISOString();
    const shellExecutables = yield* findShellExecutables(env);
    const providers: Array<DetectedAgentProvider> = [];

    for (const provider of supportedAgentProviders) {
      const pathExecutable = yield* findExecutable(provider.executable, env);
      const executablePath = pathExecutable ?? shellExecutables.get(provider.executable);
      providers.push({
        capabilities: defaultAgentCapabilities(provider.id),
        detectedAt,
        executable: provider.executable,
        executablePath,
        id: provider.id,
        name: provider.name,
        status: executablePath === undefined ? "missing" : "available",
      });
    }

    return providers;
  });

export const AgentProviderDetectorLive = Layer.succeed(AgentProviderDetector)({
  detect: () => detectAgentProviders(process.env),
});
