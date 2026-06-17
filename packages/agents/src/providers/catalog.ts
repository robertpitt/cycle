import type {
  AgentCapabilities,
  AgentProviderDefinition,
  AgentProviderId,
  AgentProviderProfile,
  DetectedAgentProvider,
} from "../types.ts";
import { claudeAgentCapabilities, claudeProviderDefinition } from "./claude/capabilities.ts";
import { codexAgentCapabilities, codexProviderDefinition } from "./codex/capabilities.ts";
import { opencodeAgentCapabilities, opencodeProviderDefinition } from "./opencode/capabilities.ts";

export const supportedAgentProviders: ReadonlyArray<AgentProviderDefinition> = [
  codexProviderDefinition,
  claudeProviderDefinition,
  opencodeProviderDefinition,
];

export const isAgentProviderId = (value: string): value is AgentProviderId =>
  value === "codex" || value === "claude" || value === "opencode";

export const agentProviderDefinitionById = (providerId: AgentProviderId): AgentProviderDefinition =>
  supportedAgentProviders.find((provider) => provider.id === providerId) ??
  missingProviderDefinition(providerId);

const missingProviderDefinition = (providerId: AgentProviderId): AgentProviderDefinition => ({
  executable: providerId,
  id: providerId,
  name: providerId,
});

export const defaultAgentCapabilities = (provider: AgentProviderId): AgentCapabilities => {
  switch (provider) {
    case "codex":
      return codexAgentCapabilities;
    case "claude":
      return claudeAgentCapabilities;
    case "opencode":
      return opencodeAgentCapabilities;
  }
};

export const agentProviderProfileFromDetection = (
  detected: DetectedAgentProvider,
): AgentProviderProfile => {
  const unsupported = detected.id !== "codex";
  const status = unsupported
    ? "unsupported"
    : detected.status === "available"
      ? "available"
      : "missing";

  return {
    capabilities: detected.capabilities ?? defaultAgentCapabilities(detected.id),
    checkedAt: detected.detectedAt,
    configuration: {
      execution: "local",
      unsupported,
    },
    displayName: detected.name,
    executableName: detected.executable,
    ...(detected.executablePath === undefined ? {} : { executablePath: detected.executablePath }),
    message: unsupported
      ? `${detected.name} detection is available, but execution is not supported yet.`
      : detected.status === "available"
        ? undefined
        : `${detected.name} executable was not found.`,
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
  const unsupported = provider !== "codex";

  return {
    capabilities: defaultAgentCapabilities(provider),
    checkedAt,
    configuration: {
      execution: "local",
      unsupported,
    },
    displayName: definition.name,
    executableName: definition.executable,
    message: unsupported
      ? `${definition.name} execution is not supported yet.`
      : `${definition.name} executable status has not been checked.`,
    models: [],
    provider,
    status: unsupported ? "unsupported" : "missing",
  };
};
