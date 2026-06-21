import type {
  AgentCapabilities,
  AgentProviderDefinition,
  AgentProviderId,
  AgentProviderProfile,
  DetectedAgentProvider,
} from "../types.ts";
import { codexAgentCapabilities, codexProviderDefinition } from "./codex/capabilities.ts";

export const supportedAgentProviders: ReadonlyArray<AgentProviderDefinition> = [
  codexProviderDefinition,
];

export const isAgentProviderId = (value: string): value is AgentProviderId => value === "codex";

export const agentProviderDefinitionById = (providerId: AgentProviderId): AgentProviderDefinition =>
  supportedAgentProviders.find((provider) => provider.id === providerId) ??
  missingProviderDefinition(providerId);

const missingProviderDefinition = (providerId: AgentProviderId): AgentProviderDefinition => ({
  executable: providerId,
  id: providerId,
  name: providerId,
});

export const defaultAgentCapabilities = (_provider: AgentProviderId): AgentCapabilities =>
  codexAgentCapabilities;

export const agentProviderProfileFromDetection = (
  detected: DetectedAgentProvider,
): AgentProviderProfile => {
  const status = detected.status === "available" ? "available" : "missing";

  return {
    capabilities: detected.capabilities ?? defaultAgentCapabilities(detected.id),
    checkedAt: detected.detectedAt,
    configuration: {
      execution: "local",
    },
    displayName: detected.name,
    executableName: detected.executable,
    ...(detected.executablePath === undefined ? {} : { executablePath: detected.executablePath }),
    message: detected.status === "available" ? undefined : `${detected.name} executable was not found.`,
    models: [],
    provider: detected.id,
    status,
  };
};

export const staticAgentProviderProfile = (
  provider: AgentProviderId,
  checkedAt: string = new Date().toISOString(),
): AgentProviderProfile => {
  const definition = agentProviderDefinitionById(provider);

  return {
    capabilities: defaultAgentCapabilities(provider),
    checkedAt,
    configuration: {
      execution: "local",
    },
    displayName: definition.name,
    executableName: definition.executable,
    message: `${definition.name} executable status has not been checked.`,
    models: [],
    provider,
    status: "missing",
  };
};
