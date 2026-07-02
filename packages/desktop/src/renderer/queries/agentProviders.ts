import { useQuery } from "@tanstack/react-query";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import { fallbackAgentProviders } from "../lib/agentProviders.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const agentProvidersQueryKey = ["desktop", "agentProviders"] as const;

const detectAgentProvidersForRenderer = async (): Promise<ReadonlyArray<DetectedAgentProvider>> => {
  try {
    const providers = await cycleApiClient.listAgentProviders();
    console.info("Cycle detected agent providers", providers);
    return providers;
  } catch (error) {
    console.warn("Unable to read agent providers from the Cycle API.", error);
    return fallbackAgentProviders();
  }
};

export const useAgentProvidersQuery = () =>
  useQuery({
    queryFn: detectAgentProvidersForRenderer,
    queryKey: agentProvidersQueryKey,
  });
