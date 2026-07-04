import { Context, Effect, Layer } from "effect";
import { defaultAgentCapabilities, supportedAgentProviders } from "./providers/index.ts";
import { claudeCodePackageName, claudeCodeProviderId } from "./providers/claude-code/constants.ts";
import { ExecutableResolver, ExecutableResolverLive, resolveExecutables } from "./executables.ts";
import type { ExecutableResolverEnvironment, ExecutableResolverOptions } from "./executables.ts";
import type { DetectedAgentProvider } from "./types.ts";

export type AgentProviderDetectionEnvironment = ExecutableResolverEnvironment;

export type AgentProviderDetectorService = {
  readonly detect: () => Effect.Effect<ReadonlyArray<DetectedAgentProvider>>;
};

export class AgentProviderDetector extends Context.Service<
  AgentProviderDetector,
  AgentProviderDetectorService
>()("@cycle/agents/AgentProviderDetector") {}

export const detectAgentProviders = (
  env: AgentProviderDetectionEnvironment = process.env,
  options: Omit<ExecutableResolverOptions, "env"> = {},
): Effect.Effect<ReadonlyArray<DetectedAgentProvider>> =>
  Effect.gen(function* () {
    const executableResults = yield* resolveExecutables(
      supportedAgentProviders.map((provider) => provider.executable),
      {
        ...options,
        env,
      },
    );
    const claudeSdkAvailable = yield* detectClaudeCodeSdkAvailability();

    return supportedAgentProviders.map((provider) => {
      const result = executableResults.get(provider.executable);
      const hasExecutable = result?.available === true;
      const sdkBacked = provider.id === claudeCodeProviderId && claudeSdkAvailable;
      const available = hasExecutable || sdkBacked;

      return {
        capabilities: defaultAgentCapabilities(provider.id),
        detectedAt: result?.checkedAt ?? new Date().toISOString(),
        executable: provider.executable,
        ...(result?.executablePath === undefined ? {} : { executablePath: result.executablePath }),
        id: provider.id,
        ...(provider.packageName === undefined ? {} : { packageName: provider.packageName }),
        ...(provider.id === claudeCodeProviderId && !claudeSdkAvailable
          ? { message: `${provider.name} SDK package '${claudeCodePackageName}' is not available.` }
          : {}),
        name: provider.name,
        status: available ? "available" : "missing",
      } satisfies DetectedAgentProvider;
    });
  });

const AgentProviderDetectorWithResolverLive = Layer.effect(
  AgentProviderDetector,
  Effect.gen(function* () {
    const executableResolver = yield* ExecutableResolver;

    return {
      detect: () =>
        Effect.gen(function* () {
          const executableResults = yield* executableResolver.resolveMany(
            supportedAgentProviders.map((provider) => provider.executable),
          );
          const claudeSdkAvailable = yield* detectClaudeCodeSdkAvailability();

          return supportedAgentProviders.map((provider) => {
            const result = executableResults.get(provider.executable);
            const hasExecutable = result?.available === true;
            const sdkBacked = provider.id === claudeCodeProviderId && claudeSdkAvailable;
            const available = hasExecutable || sdkBacked;

            return {
              capabilities: defaultAgentCapabilities(provider.id),
              detectedAt: result?.checkedAt ?? new Date().toISOString(),
              executable: provider.executable,
              ...(result?.executablePath === undefined
                ? {}
                : { executablePath: result.executablePath }),
              id: provider.id,
              ...(provider.packageName === undefined ? {} : { packageName: provider.packageName }),
              ...(provider.id === claudeCodeProviderId && !claudeSdkAvailable
                ? {
                    message: `${provider.name} SDK package '${claudeCodePackageName}' is not available.`,
                  }
                : {}),
              name: provider.name,
              status: available ? "available" : "missing",
            } satisfies DetectedAgentProvider;
          });
        }),
    };
  }),
);

export const AgentProviderDetectorLive = AgentProviderDetectorWithResolverLive.pipe(
  Layer.provide(ExecutableResolverLive),
);

const detectClaudeCodeSdkAvailability = (): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: async () => {
      await import("@anthropic-ai/claude-agent-sdk");
      return true;
    },
    catch: (cause) => cause,
  }).pipe(Effect.catch(() => Effect.succeed(false)));
