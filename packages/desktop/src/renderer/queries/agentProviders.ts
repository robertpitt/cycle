import { useQuery } from "@tanstack/react-query";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import { fallbackAgentProviders } from "../lib/agentProviders.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

const agentProvidersQueryKey = ["desktop", "agentProviders"] as const;

const detectAgentProvidersForRenderer = async (): Promise<ReadonlyArray<DetectedAgentProvider>> => {
  const bridge = getDesktopBridge();

  if (!bridge) {
    console.warn(
      "Cycle desktop bridge is unavailable; harness detection only works in the Electron renderer.",
    );
    return fallbackAgentProviders();
  }

  const providers = await bridge.detectAgentProviders();
  console.info("Cycle detected agent providers", providers);
  return providers;
};

export const useAgentProvidersQuery = () =>
  useQuery({
    queryFn: detectAgentProvidersForRenderer,
    queryKey: agentProvidersQueryKey,
  });
