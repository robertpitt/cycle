import type { InitialSetupHarness } from "@cycle/ui/organisms";
import {
  supportedAgentProviders,
  type AgentProviderId,
  type DetectedAgentProvider,
} from "../../shared/AgentProviders.ts";

export const isAgentProviderId = (value: string): value is AgentProviderId =>
  value === "codex" || value === "claude" || value === "opencode";

export const fallbackAgentProviders = (): ReadonlyArray<DetectedAgentProvider> =>
  supportedAgentProviders.map((provider) => ({
    detectedAt: new Date().toISOString(),
    executable: provider.executable,
    id: provider.id,
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
    status: provider.status,
  }));
