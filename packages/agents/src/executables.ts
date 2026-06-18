import { NodeServices } from "@effect/platform-node";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const ENV_NAME_PATTERN = /^[A-Z0-9_]+$/u;
const POSIX_PATH_DELIMITER = ":";
const WINDOWS_PATH_DELIMITER = ";";
const WINDOWS_SHELL_CANDIDATES = ["pwsh.exe", "powershell.exe"] as const;

export type ExecutableResolverEnvironment = NodeJS.ProcessEnv;

export type ExecutableResolverOptions = {
  readonly env?: ExecutableResolverEnvironment;
  readonly hydrate?: boolean;
  readonly platform?: NodeJS.Platform;
};

export type ExecutableResolution = {
  readonly available: boolean;
  readonly checkedAt: string;
  readonly executable: string;
  readonly executablePath?: string;
};

export type ExecutableResolverService = {
  readonly hydrateEnvironment: (
    options?: ExecutableResolverOptions,
  ) => Effect.Effect<ExecutableResolverEnvironment>;
  readonly resolve: (
    executable: string,
    options?: ExecutableResolverOptions,
  ) => Effect.Effect<ExecutableResolution>;
  readonly resolveMany: (
    executables: ReadonlyArray<string>,
    options?: ExecutableResolverOptions,
  ) => Effect.Effect<ReadonlyMap<string, ExecutableResolution>>;
};

export class ExecutableResolver extends Context.Service<
  ExecutableResolver,
  ExecutableResolverService
>()("@cycle/agents/ExecutableResolver") {}

const trimNonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const pathDelimiterForPlatform = (platform: NodeJS.Platform): string =>
  platform === "win32" ? WINDOWS_PATH_DELIMITER : POSIX_PATH_DELIMITER;

const readEnvPath = (env: ExecutableResolverEnvironment): string | undefined =>
  env.PATH ?? env.Path ?? env.path;

const stripWrappingQuotes = (value: string): string => value.replace(/^"+|"+$/gu, "");

const normalizePathEntryForComparison = (entry: string, platform: NodeJS.Platform): string => {
  const normalized = stripWrappingQuotes(entry.trim());
  return platform === "win32" ? normalized.toLowerCase() : normalized;
};

export const mergePathValues = (
  preferredPath: string | undefined,
  inheritedPath: string | undefined,
  platform: NodeJS.Platform = process.platform,
): string | undefined => {
  const delimiter = pathDelimiterForPlatform(platform);
  const merged: Array<string> = [];
  const seen = new Set<string>();

  for (const rawValue of [preferredPath, inheritedPath]) {
    if (!rawValue) continue;

    for (const entry of rawValue.split(delimiter)) {
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;

      const normalized = normalizePathEntryForComparison(trimmed, platform);
      if (normalized.length === 0 || seen.has(normalized)) continue;

      seen.add(normalized);
      merged.push(trimmed);
    }
  }

  return merged.length === 0 ? undefined : merged.join(delimiter);
};

const readUserLoginShell = (): string | undefined => {
  return trimNonEmpty(process.env.SHELL);
};

export const listLoginShellCandidates = (
  platform: NodeJS.Platform,
  shell: string | undefined,
  userShell = readUserLoginShell(),
): ReadonlyArray<string> => {
  const fallbackShell =
    platform === "darwin" ? "/bin/zsh" : platform === "linux" ? "/bin/bash" : undefined;
  const seen = new Set<string>();
  const candidates: Array<string> = [];

  for (const candidate of [trimNonEmpty(shell), trimNonEmpty(userShell), fallbackShell]) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
};

const envCaptureStart = (name: string): string => `__CYCLE_ENV_${name}_START__`;
const envCaptureEnd = (name: string): string => `__CYCLE_ENV_${name}_END__`;

const buildPosixEnvironmentCaptureCommand = (names: ReadonlyArray<string>): string =>
  names
    .map((name) => {
      if (!ENV_NAME_PATTERN.test(name)) {
        throw new Error(`Unsupported environment variable name: ${name}`);
      }

      return [
        `printf '%s\\n' '${envCaptureStart(name)}'`,
        `printenv ${name} || true`,
        `printf '%s\\n' '${envCaptureEnd(name)}'`,
      ].join("; ");
    })
    .join("; ");

const buildWindowsEnvironmentCaptureCommand = (names: ReadonlyArray<string>): string =>
  [
    "$ErrorActionPreference = 'Stop'",
    ...names.flatMap((name) => {
      if (!ENV_NAME_PATTERN.test(name)) {
        throw new Error(`Unsupported environment variable name: ${name}`);
      }

      return [
        `Write-Output '${envCaptureStart(name)}'`,
        `$value = [Environment]::GetEnvironmentVariable('${name}')`,
        "if ($null -ne $value -and $value.Length -gt 0) { Write-Output $value }",
        `Write-Output '${envCaptureEnd(name)}'`,
      ];
    }),
  ].join("; ");

const extractEnvironmentValue = (output: string, name: string): string | undefined => {
  const startMarker = envCaptureStart(name);
  const endMarker = envCaptureEnd(name);
  const startIndex = output.indexOf(startMarker);
  if (startIndex === -1) return undefined;

  const valueStartIndex = startIndex + startMarker.length;
  const endIndex = output.indexOf(endMarker, valueStartIndex);
  if (endIndex === -1) return undefined;

  const value = output
    .slice(valueStartIndex, endIndex)
    .replace(/^\r?\n/u, "")
    .replace(/\r?\n$/u, "");

  return value.length === 0 ? undefined : value;
};

const execFileText = (
  file: string,
  args: ReadonlyArray<string>,
  options: {
    readonly env?: ExecutableResolverEnvironment;
    readonly timeout: number;
  },
): Effect.Effect<string, unknown, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const command = ChildProcess.make(file, [...args], {
      env: options.env,
      stderr: "ignore",
      stdout: "pipe",
    });

    return yield* spawner.string(command).pipe(Effect.timeout(options.timeout));
  });

const readEnvironmentFromLoginShell = (
  shell: string,
  names: ReadonlyArray<string>,
  env: ExecutableResolverEnvironment,
): Effect.Effect<
  Partial<Record<string, string>>,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> => {
  if (names.length === 0) return Effect.succeed({});

  return execFileText(shell, ["-ilc", buildPosixEnvironmentCaptureCommand(names)], {
    env: {
      ...process.env,
      ...env,
    },
    timeout: 5000,
  }).pipe(
    Effect.map((output) => {
      const environment: Partial<Record<string, string>> = {};
      for (const name of names) {
        const value = extractEnvironmentValue(output, name);
        if (value !== undefined) environment[name] = value;
      }
      return environment;
    }),
    Effect.catch(() => Effect.succeed({})),
  );
};

const readPathFromLaunchctl = (): Effect.Effect<
  string | undefined,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  execFileText("/bin/launchctl", ["getenv", "PATH"], { timeout: 2000 }).pipe(
    Effect.map((value) => trimNonEmpty(value)),
    Effect.catch(() => Effect.succeed(undefined)),
  );

const readEnvironmentFromWindowsShell = (
  names: ReadonlyArray<string>,
  options?: {
    readonly loadProfile?: boolean;
  },
): Effect.Effect<
  Partial<Record<string, string>>,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> => {
  if (names.length === 0) return Effect.succeed({});

  const args = [
    "-NoLogo",
    ...(options?.loadProfile === true ? [] : ["-NoProfile"]),
    "-NonInteractive",
    "-Command",
    buildWindowsEnvironmentCaptureCommand(names),
  ];

  return Effect.gen(function* () {
    for (const shell of WINDOWS_SHELL_CANDIDATES) {
      const output = yield* execFileText(shell, args, { timeout: 5000 }).pipe(
        Effect.catch(() => Effect.succeed(undefined)),
      );

      if (output === undefined) continue;

      const environment: Partial<Record<string, string>> = {};
      for (const name of names) {
        const value = extractEnvironmentValue(output, name);
        if (value !== undefined) environment[name] = value;
      }
      return environment;
    }

    return {};
  });
};

const resolveWindowsPathExtensions = (
  env: ExecutableResolverEnvironment,
): ReadonlyArray<string> => {
  const fallback = [".COM", ".EXE", ".BAT", ".CMD"];
  const rawValue = env.PATHEXT;
  if (!rawValue) return fallback;

  const parsed = rawValue
    .split(WINDOWS_PATH_DELIMITER)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.startsWith(".") ? entry.toUpperCase() : `.${entry.toUpperCase()}`));

  return parsed.length === 0 ? fallback : [...new Set(parsed)];
};

const resolveCommandCandidates = (
  path: Path.Path,
  executable: string,
  platform: NodeJS.Platform,
  windowsPathExtensions: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (platform !== "win32") return [executable];

  const extension = path.extname(executable);
  const normalizedExtension = extension.toUpperCase();

  if (extension.length > 0 && windowsPathExtensions.includes(normalizedExtension)) {
    const executableWithoutExtension = executable.slice(0, -extension.length);
    return [
      ...new Set([
        executable,
        `${executableWithoutExtension}${normalizedExtension}`,
        `${executableWithoutExtension}${normalizedExtension.toLowerCase()}`,
      ]),
    ];
  }

  const candidates: Array<string> = [];
  for (const candidateExtension of windowsPathExtensions) {
    candidates.push(`${executable}${candidateExtension}`);
    candidates.push(`${executable}${candidateExtension.toLowerCase()}`);
  }

  return [...new Set(candidates)];
};

const isExecutableFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  filePath: string,
  platform: NodeJS.Platform,
  windowsPathExtensions: ReadonlyArray<string>,
): Effect.Effect<boolean> =>
  fs.stat(filePath).pipe(
    Effect.flatMap((fileStat) => {
      if (fileStat.type !== "File") return Effect.succeed(false);

      if (platform === "win32") {
        const extension = path.extname(filePath);
        return Effect.succeed(
          extension.length > 0 && windowsPathExtensions.includes(extension.toUpperCase()),
        );
      }

      return Effect.succeed((fileStat.mode & 0o111) !== 0);
    }),
    Effect.catch(() => Effect.succeed(false)),
  );

const resolvePathEnvironmentVariable = (env: ExecutableResolverEnvironment): string =>
  readEnvPath(env) ?? "";

export const resolveKnownWindowsCliDirs = (
  env: ExecutableResolverEnvironment,
): ReadonlyArray<string> => {
  const appData = env.APPDATA?.trim();
  const localAppData = env.LOCALAPPDATA?.trim();
  const userProfile = env.USERPROFILE?.trim();

  return [
    ...(appData ? [`${appData}\\npm`] : []),
    ...(localAppData ? [`${localAppData}\\Programs\\nodejs`, `${localAppData}\\Volta\\bin`] : []),
    ...(localAppData ? [`${localAppData}\\pnpm`] : []),
    ...(userProfile ? [`${userProfile}\\.bun\\bin`, `${userProfile}\\scoop\\shims`] : []),
  ];
};

const mergeEnvironment = (
  env: ExecutableResolverEnvironment,
  patch: Partial<Record<string, string>>,
): ExecutableResolverEnvironment => {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
};

const resolveExecutablePathFromEnvironment = (
  executable: string,
  env: ExecutableResolverEnvironment,
  platform: NodeJS.Platform,
): Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const windowsPathExtensions = platform === "win32" ? resolveWindowsPathExtensions(env) : [];
    const candidates = resolveCommandCandidates(path, executable, platform, windowsPathExtensions);

    if (executable.includes("/") || executable.includes("\\")) {
      for (const candidate of candidates) {
        if (yield* isExecutableFile(fs, path, candidate, platform, windowsPathExtensions)) {
          return candidate;
        }
      }
      return undefined;
    }

    const pathValue = resolvePathEnvironmentVariable(env);
    if (pathValue.length === 0) return undefined;

    const pathEntries = pathValue
      .split(pathDelimiterForPlatform(platform))
      .map((entry) => stripWrappingQuotes(entry.trim()))
      .filter((entry) => entry.length > 0);

    for (const pathEntry of pathEntries) {
      for (const candidate of candidates) {
        const candidatePath = path.join(pathEntry, candidate);
        if (yield* isExecutableFile(fs, path, candidatePath, platform, windowsPathExtensions)) {
          return candidatePath;
        }
      }
    }

    return undefined;
  });

const hydratePosixEnvironment = (
  env: ExecutableResolverEnvironment,
  platform: NodeJS.Platform,
): Effect.Effect<ExecutableResolverEnvironment, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    let shellPath: string | undefined;

    for (const shell of listLoginShellCandidates(platform, env.SHELL)) {
      const shellEnvironment = yield* readEnvironmentFromLoginShell(shell, ["PATH"], env);
      shellPath = shellEnvironment.PATH;
      if (shellPath) break;
    }

    const launchctlPath =
      platform === "darwin" && !shellPath ? yield* readPathFromLaunchctl() : undefined;
    const mergedPath = mergePathValues(shellPath ?? launchctlPath, readEnvPath(env), platform);

    return mergedPath ? mergeEnvironment(env, { PATH: mergedPath }) : { ...env };
  });

const hydrateWindowsEnvironment = (
  env: ExecutableResolverEnvironment,
): Effect.Effect<
  ExecutableResolverEnvironment,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const shellEnvironment = yield* readEnvironmentFromWindowsShell(["PATH"], {
      loadProfile: false,
    });
    const mergedPath = mergePathValues(shellEnvironment.PATH, readEnvPath(env), "win32");
    const knownCliPath = resolveKnownWindowsCliDirs(env).join(WINDOWS_PATH_DELIMITER);
    const baselinePath = mergePathValues(knownCliPath, mergedPath, "win32");
    const baselineEnv = baselinePath ? mergeEnvironment(env, { PATH: baselinePath }) : { ...env };
    const nodePath = yield* resolveExecutablePathFromEnvironment("node", baselineEnv, "win32");

    if (nodePath !== undefined) return baselineEnv;

    const profiledEnvironment = yield* readEnvironmentFromWindowsShell(
      ["PATH", "FNM_DIR", "FNM_MULTISHELL_PATH"],
      { loadProfile: true },
    );
    const profiledPath = mergePathValues(profiledEnvironment.PATH, baselinePath, "win32");

    return mergeEnvironment(baselineEnv, {
      ...(profiledPath ? { PATH: profiledPath } : {}),
      ...(profiledEnvironment.FNM_DIR ? { FNM_DIR: profiledEnvironment.FNM_DIR } : {}),
      ...(profiledEnvironment.FNM_MULTISHELL_PATH
        ? { FNM_MULTISHELL_PATH: profiledEnvironment.FNM_MULTISHELL_PATH }
        : {}),
    });
  });

const hydrateExecutableEnvironmentEffect = (
  options: ExecutableResolverOptions = {},
): Effect.Effect<
  ExecutableResolverEnvironment,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> => {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;

  if (options.hydrate === false) return Effect.succeed({ ...env });
  if (platform === "win32") return hydrateWindowsEnvironment(env);
  if (platform === "darwin" || platform === "linux") return hydratePosixEnvironment(env, platform);
  return Effect.succeed({ ...env });
};

export const hydrateExecutableEnvironment = (
  options: ExecutableResolverOptions = {},
): Effect.Effect<ExecutableResolverEnvironment> =>
  hydrateExecutableEnvironmentEffect(options).pipe(Effect.provide(NodeServices.layer));

const resolveExecutableEffect = (
  executable: string,
  options: ExecutableResolverOptions = {},
): Effect.Effect<
  ExecutableResolution,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const platform = options.platform ?? process.platform;
    const env = yield* hydrateExecutableEnvironmentEffect(options);
    const executablePath = yield* resolveExecutablePathFromEnvironment(executable, env, platform);

    return {
      available: executablePath !== undefined,
      checkedAt: new Date().toISOString(),
      executable,
      ...(executablePath === undefined ? {} : { executablePath }),
    };
  });

export const resolveExecutable = (
  executable: string,
  options: ExecutableResolverOptions = {},
): Effect.Effect<ExecutableResolution> =>
  resolveExecutableEffect(executable, options).pipe(Effect.provide(NodeServices.layer));

const resolveExecutablesEffect = (
  executables: ReadonlyArray<string>,
  options: ExecutableResolverOptions = {},
): Effect.Effect<
  ReadonlyMap<string, ExecutableResolution>,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const platform = options.platform ?? process.platform;
    const env = yield* hydrateExecutableEnvironmentEffect(options);
    const checkedAt = new Date().toISOString();
    const results = new Map<string, ExecutableResolution>();

    for (const executable of executables) {
      const executablePath = yield* resolveExecutablePathFromEnvironment(executable, env, platform);
      results.set(executable, {
        available: executablePath !== undefined,
        checkedAt,
        executable,
        ...(executablePath === undefined ? {} : { executablePath }),
      });
    }

    return results;
  });

export const resolveExecutables = (
  executables: ReadonlyArray<string>,
  options: ExecutableResolverOptions = {},
): Effect.Effect<ReadonlyMap<string, ExecutableResolution>> =>
  resolveExecutablesEffect(executables, options).pipe(Effect.provide(NodeServices.layer));

export const ExecutableResolverLive = Layer.succeed(ExecutableResolver)({
  hydrateEnvironment: (options) => hydrateExecutableEnvironment(options),
  resolve: (executable, options) => resolveExecutable(executable, options),
  resolveMany: (executables, options) => resolveExecutables(executables, options),
});
