import type { InitialSetupHarness } from "@cycle/ui/organisms";
import {
  isAgentProviderId,
  supportedAgentProviders,
  type DetectedAgentProvider,
} from "../../shared/AgentProviders.ts";

export { isAgentProviderId };

export const fallbackAgentProviders = (): ReadonlyArray<DetectedAgentProvider> =>
  supportedAgentProviders.map((provider) => ({
    detectedAt: new Date().toISOString(),
    executable: provider.executable,
    id: provider.id,
    message: `${provider.name} provider status has not been checked.`,
    name: provider.name,
    status: "missing",
  }));

export const toSetupHarnesses = (
  providers: ReadonlyArray<DetectedAgentProvider>,
): readonly InitialSetupHarness[] =>
  providers.map((provider) => ({
    description: provider.executable,
    executablePath: provider.executablePath,
    id: provider.id,
    name: provider.name,
    status: provider.status === "available" ? "available" : "missing",
  }));
