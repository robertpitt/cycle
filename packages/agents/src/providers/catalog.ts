import type {
  AgentCapabilities,
  AgentProviderDefinition,
  AgentProviderId,
  AgentProviderProfile,
  DetectedAgentProvider,
  JsonObject,
} from "../types.ts";
import {
  claudeCodeAgentCapabilities,
  claudeCodeProviderDefinition,
} from "./claude-code/capabilities.ts";
import { codexAgentCapabilities, codexProviderDefinition } from "./codex/capabilities.ts";

export const supportedAgentProviders: ReadonlyArray<AgentProviderDefinition> = [
  codexProviderDefinition,
  claudeCodeProviderDefinition,
];

export const isAgentProviderId = (value: string): value is AgentProviderId =>
  value === "codex" || value === "claude-code";

export const agentProviderDefinitionById = (providerId: AgentProviderId): AgentProviderDefinition =>
  supportedAgentProviders.find((provider) => provider.id === providerId) ??
  missingProviderDefinition(providerId);

const missingProviderDefinition = (providerId: AgentProviderId): AgentProviderDefinition => ({
  executable: providerId,
  id: providerId,
  name: providerId,
});

export const defaultAgentCapabilities = (_provider: AgentProviderId): AgentCapabilities =>
  _provider === "claude-code" ? claudeCodeAgentCapabilities : codexAgentCapabilities;

export const agentProviderProfileFromDetection = (
  detected: DetectedAgentProvider,
): AgentProviderProfile => {
  const status =
    detected.status === "available" ||
    detected.status === "degraded" ||
    detected.status === "disabled" ||
    detected.status === "unsupported"
      ? detected.status
      : "missing";
  const definition = agentProviderDefinitionById(detected.id);

  return {
    capabilities: detected.capabilities ?? defaultAgentCapabilities(detected.id),
    activeRunCount: 0,
    checkedAt: detected.detectedAt,
    configurationSchema: jsonObject(definition.configurationSchema ?? {}),
    configuration: {
      execution: "local",
    },
    displayName: detected.name,
    executableName: detected.executable,
    ...(detected.executablePath === undefined ? {} : { executablePath: detected.executablePath }),
    maxConcurrentRuns: definition.defaultMaxConcurrentRuns ?? null,
    message:
      detected.message ??
      (detected.status === "available" ? undefined : `${detected.name} is not available.`),
    models: [],
    ...(detected.packageName === undefined && definition.packageName === undefined
      ? {}
      : { packageName: detected.packageName ?? definition.packageName }),
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
    activeRunCount: 0,
    checkedAt,
    configurationSchema: jsonObject(definition.configurationSchema ?? {}),
    configuration: {
      execution: "local",
    },
    displayName: definition.name,
    executableName: definition.executable,
    maxConcurrentRuns: definition.defaultMaxConcurrentRuns ?? null,
    message: `${definition.name} executable status has not been checked.`,
    models: [],
    ...(definition.packageName === undefined ? {} : { packageName: definition.packageName }),
    provider,
    status: "missing",
  };
};

const jsonObject = (value: Readonly<Record<string, unknown>>): JsonObject =>
  JSON.parse(JSON.stringify(value)) as JsonObject;
