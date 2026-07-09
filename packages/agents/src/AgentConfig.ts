import { Config, Context, Layer, Option, Schema } from "effect";

const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const MaintenanceInterval = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1_000));
const DeltaFlushBytes = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1_024));

export class AgentRuntimeConfigValue extends Schema.Class<AgentRuntimeConfigValue>(
  "@cycle/agents/AgentRuntimeConfigValue",
)({
  busyTimeoutMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  databasePath: Schema.String,
  defaultAgentId: Schema.String,
  defaultHarnessId: Schema.String,
  defaultModel: Schema.optional(Schema.String),
  defaultProviderId: Schema.String,
  deltaFlushBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1024)),
  deltaFlushMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  globalConcurrency: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  heartbeatMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  leaseDurationMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  maintenanceIntervalMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1000)),
  maxAttempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  maxDelegationDepth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  maxRunningChildrenPerParent: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  maxTotalChildrenPerTask: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  ownerId: Schema.String,
  perProviderConcurrency: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  perRepositoryConcurrency: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  shutdownDrainMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export class AgentConfig extends Context.Service<AgentConfig, AgentRuntimeConfigValue>()(
  "@cycle/agents/AgentConfig",
) {
  static readonly layer = (databasePath: string) =>
    Layer.effect(
      AgentConfig,
      Config.all({
        busyTimeoutMs: Config.schema(PositiveInt, "BUSY_TIMEOUT_MS").pipe(
          Config.withDefault(5_000),
        ),
        databasePath: Config.string("DATABASE_PATH").pipe(Config.withDefault(databasePath)),
        defaultAgentId: Config.string("DEFAULT_AGENT_ID").pipe(Config.withDefault("default")),
        defaultHarnessId: Config.string("DEFAULT_HARNESS_ID").pipe(Config.withDefault("codex")),
        defaultModel: Config.option(Config.string("DEFAULT_MODEL")),
        defaultProviderId: Config.string("DEFAULT_PROVIDER_ID").pipe(Config.withDefault("codex")),
        deltaFlushBytes: Config.schema(DeltaFlushBytes, "DELTA_FLUSH_BYTES").pipe(
          Config.withDefault(32 * 1024),
        ),
        deltaFlushMs: Config.schema(PositiveInt, "DELTA_FLUSH_MS").pipe(Config.withDefault(50)),
        globalConcurrency: Config.schema(PositiveInt, "GLOBAL_CONCURRENCY").pipe(
          Config.withDefault(4),
        ),
        heartbeatMs: Config.schema(PositiveInt, "HEARTBEAT_MS").pipe(Config.withDefault(10_000)),
        leaseDurationMs: Config.schema(PositiveInt, "LEASE_DURATION_MS").pipe(
          Config.withDefault(30_000),
        ),
        maintenanceIntervalMs: Config.schema(MaintenanceInterval, "MAINTENANCE_INTERVAL_MS").pipe(
          Config.withDefault(30_000),
        ),
        maxAttempts: Config.schema(PositiveInt, "MAX_ATTEMPTS").pipe(Config.withDefault(3)),
        maxDelegationDepth: Config.schema(NonNegativeInt, "MAX_DELEGATION_DEPTH").pipe(
          Config.withDefault(3),
        ),
        maxRunningChildrenPerParent: Config.schema(
          PositiveInt,
          "MAX_RUNNING_CHILDREN_PER_PARENT",
        ).pipe(Config.withDefault(4)),
        maxTotalChildrenPerTask: Config.schema(PositiveInt, "MAX_TOTAL_CHILDREN_PER_TASK").pipe(
          Config.withDefault(16),
        ),
        ownerId: Config.string("OWNER_ID").pipe(Config.withDefault("cycle-backend")),
        perProviderConcurrency: Config.schema(PositiveInt, "PER_PROVIDER_CONCURRENCY").pipe(
          Config.withDefault(2),
        ),
        perRepositoryConcurrency: Config.schema(PositiveInt, "PER_REPOSITORY_CONCURRENCY").pipe(
          Config.withDefault(2),
        ),
        shutdownDrainMs: Config.schema(NonNegativeInt, "SHUTDOWN_DRAIN_MS").pipe(
          Config.withDefault(10_000),
        ),
      }).pipe(
        Config.nested("AGENTS"),
        Config.map((value) => {
          const { defaultModel, ...required } = value;
          return new AgentRuntimeConfigValue({
            ...required,
            ...(Option.isSome(defaultModel) ? { defaultModel: defaultModel.value } : {}),
          });
        }),
      ),
    );
}
