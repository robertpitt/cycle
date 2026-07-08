import { Context, Effect, FileSystem, Layer, Path } from "effect";
import {
  causeMessage,
  InvalidCommonDirFileError,
  InvalidGitDirFileError,
  RepositoryNotFoundError,
  UnsupportedObjectFormatError,
  type GitStoreError,
} from "./GitStoreErrors.ts";
import type { GitStoreConfig, GitStoreKey, GitStoreOpenOptions } from "./GitStoreSchemas.ts";
import { pointerRef } from "./internal/refs.ts";
import { normalizeNamespace, validateDatabaseName, validatePointerName } from "./internal/refs.ts";
import {
  gitConfigSectionPattern,
  gitDirLinePattern,
  gitObjectFormatPattern,
} from "./internal/patterns.ts";
import { firstLine, splitLines } from "./internal/strings.ts";

export type ResolvedRepository = {
  readonly config: GitStoreConfig;
  readonly key: GitStoreKey;
};

export type RepositoryPathsShape = {
  readonly resolve: (
    options?: GitStoreOpenOptions,
  ) => Effect.Effect<ResolvedRepository, GitStoreError>;
};

export class RepositoryPaths extends Context.Service<RepositoryPaths, RepositoryPathsShape>()(
  "@cycle/git-store/RepositoryPaths",
) {}

export const RepositoryPathsLive = Layer.effect(
  RepositoryPaths,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const fileExists = (target: string) =>
      fs.exists(target).pipe(Effect.catch(() => Effect.succeed(false)));

    const readFirstLine = (target: string) => fs.readFileString(target).pipe(Effect.map(firstLine));

    const resolveGitDirFile = (gitFile: string): Effect.Effect<string, GitStoreError> =>
      Effect.gen(function* () {
      const line = yield* readFirstLine(gitFile).pipe(
        Effect.mapError(
          () =>
            new InvalidGitDirFileError({
              message: `Invalid .git file: ${gitFile}`,
              path: gitFile,
            }),
        ),
      );
      const match = gitDirLinePattern.exec(line);

      if (match === null) {
        return yield* new InvalidGitDirFileError({
          message: `Invalid .git file: ${gitFile}`,
          path: gitFile,
        });
      }

      const value = match[1] ?? "";

      return path.isAbsolute(value)
        ? path.resolve(value)
        : path.resolve(path.dirname(gitFile), value);
    });

    const readCommonGitDir = (gitDir: string): Effect.Effect<string, GitStoreError> =>
      Effect.gen(function* () {
      const commonDirFile = path.join(gitDir, "commondir");
      const exists = yield* fileExists(commonDirFile);

      if (!exists) return gitDir;

      const line = yield* readFirstLine(commonDirFile).pipe(
        Effect.mapError(
          () =>
            new InvalidCommonDirFileError({
              message: `Invalid commondir file: ${commonDirFile}`,
              path: commonDirFile,
            }),
        ),
      );
      const value = line.trim();

      if (value.length === 0) {
        return yield* new InvalidCommonDirFileError({
          message: `Invalid commondir file: ${commonDirFile}`,
          path: commonDirFile,
        });
      }

      return path.isAbsolute(value) ? path.resolve(value) : path.resolve(gitDir, value);
    });

    const readObjectFormat = (commonGitDir: string): Effect.Effect<string, GitStoreError> =>
      Effect.gen(function* () {
      const configPath = path.join(commonGitDir, "config");
      const exists = yield* fileExists(configPath);

      if (!exists) return "sha1";

      const raw = yield* fs.readFileString(configPath).pipe(Effect.catch(() => Effect.succeed("")));
      let section = "";

      for (const line of splitLines(raw)) {
        const trimmed = line.trim();
        const sectionMatch = gitConfigSectionPattern.exec(trimmed);

        if (sectionMatch !== null) {
          section = (sectionMatch[1] ?? "").toLowerCase();
          continue;
        }

        const match = gitObjectFormatPattern.exec(trimmed);
        if (section === "extensions" && match !== null) return (match[1] ?? "sha1").toLowerCase();
      }

      return "sha1";
    });

    const resolve = (
      options: GitStoreOpenOptions = {},
    ): Effect.Effect<ResolvedRepository, GitStoreError> =>
      Effect.gen(function* () {
      const cwd = path.resolve(options.cwd ?? ".");
      const initialGitDir = path.resolve(cwd, options.gitDir ?? ".git");
      const verify = options.verifyGitDir ?? true;
      const initialExists = yield* fileExists(initialGitDir);

      if (verify && !initialExists) {
        return yield* new RepositoryNotFoundError({
          message: `Git directory not found: ${initialGitDir}`,
          path: initialGitDir,
        });
      }

      let gitDir = initialGitDir;

      if (initialExists) {
        const stat = yield* fs.stat(initialGitDir).pipe(
          Effect.mapError(
            (cause) =>
              new RepositoryNotFoundError({
                cause,
                message: `Cannot inspect Git path ${initialGitDir}: ${causeMessage(cause)}`,
                path: initialGitDir,
              }),
          ),
        );

        if (stat.type === "File") {
          gitDir = yield* resolveGitDirFile(initialGitDir);
        }
      }

      const commonGitDir =
        options.commonGitDir === undefined
          ? yield* readCommonGitDir(gitDir)
          : path.resolve(cwd, options.commonGitDir);
      const format = yield* readObjectFormat(commonGitDir);

      if (format !== "sha1") {
        return yield* new UnsupportedObjectFormatError({
          format,
          message: `Unsupported Git object format: ${format}`,
          path: commonGitDir,
        });
      }

      const namespace = yield* normalizeNamespace(options.namespace ?? "refs/gitdb");
      const database = yield* validateDatabaseName(options.database ?? "cycle");
      const defaultPointer = yield* validatePointerName(options.defaultPointer ?? "main");
      const config: GitStoreConfig = {
        commonGitDir,
        cwd,
        database,
        defaultPointer,
        gitDir,
        identity: options.identity,
        namespace,
      };
      const key: GitStoreKey = {
        commonGitDir,
        database,
        id: `${commonGitDir}\0${namespace}\0${database}`,
        namespace,
      };

      pointerRef(namespace, database, defaultPointer);

      return { config, key };
    });

    return RepositoryPaths.of({ resolve });
  }),
);
