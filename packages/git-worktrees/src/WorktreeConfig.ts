import { Config, Context, Effect, Layer, Path, Schema } from "effect";
import type { WorktreeRuntimeConfig } from "./WorktreeSchemas.ts";
import { WorktreeCleanupPolicy, WorktreePushPolicy } from "./WorktreeSchemas.ts";

export type WorktreeConfigShape = {
  readonly config: WorktreeRuntimeConfig;
};

export class WorktreeConfig extends Context.Service<WorktreeConfig, WorktreeConfigShape>()(
  "@cycle/git-worktrees/WorktreeConfig",
) {}

const positiveInt = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1, { expected: "a positive integer" }),
);

const RuntimeConfigFromConfig = Config.all({
  backupAggregateBytes: Config.schema(positiveInt, "backup_aggregate_bytes").pipe(
    Config.withDefault(100 * 1024 * 1024),
  ),
  backupFileBytes: Config.schema(positiveInt, "backup_file_bytes").pipe(
    Config.withDefault(20 * 1024 * 1024),
  ),
  cleanupPolicy: Config.schema(WorktreeCleanupPolicy, "cleanup_policy").pipe(
    Config.withDefault("delete_after_handover" as const),
  ),
  databasePath: Config.schema(Schema.String, "database_path").pipe(
    Config.withDefault("~/.cycle/worktrees/worktrees.sqlite"),
  ),
  defaultPushPolicy: Config.schema(WorktreePushPolicy, "default_push_policy").pipe(
    Config.withDefault("required" as const),
  ),
  leaseDurationMs: Config.schema(positiveInt, "lease_duration_ms").pipe(
    Config.withDefault(5 * 60 * 1000),
  ),
  maxActiveWorktreesPerRepository: Config.schema(
    positiveInt,
    "max_active_worktrees_per_repository",
  ).pipe(Config.withDefault(64)),
  maxReconciliationConcurrency: Config.schema(positiveInt, "max_reconciliation_concurrency").pipe(
    Config.withDefault(4),
  ),
  maxSetupConcurrency: Config.schema(positiveInt, "max_setup_concurrency").pipe(
    Config.withDefault(4),
  ),
  pushTimeoutMs: Config.schema(positiveInt, "push_timeout_ms").pipe(Config.withDefault(60_000)),
  setupTimeoutMs: Config.schema(positiveInt, "setup_timeout_ms").pipe(
    Config.withDefault(10 * 60_000),
  ),
  storageRoot: Config.schema(Schema.String, "storage_root").pipe(
    Config.withDefault("~/.cycle/worktrees"),
  ),
}).pipe(Config.nested("git_worktrees"));

const HomeDirectory = Config.schema(Schema.String, "HOME").pipe(Config.withDefault(""));

export const WorktreeConfigLive = Layer.effect(
  WorktreeConfig,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const raw = yield* RuntimeConfigFromConfig;
    const home = yield* HomeDirectory;
    const expandHome = (value: string): string =>
      value === "~" || value.startsWith("~/")
        ? path.join(home, value.slice(value === "~" ? 1 : 2))
        : value;

    return WorktreeConfig.of({
      config: {
        ...raw,
        databasePath: path.resolve(expandHome(raw.databasePath)),
        storageRoot: path.resolve(expandHome(raw.storageRoot)),
      },
    });
  }),
);

export const makeWorktreeConfigLayer = (config: WorktreeRuntimeConfig) =>
  Layer.succeed(
    WorktreeConfig,
    WorktreeConfig.of({
      config,
    }),
  );
