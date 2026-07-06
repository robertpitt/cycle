import {
  AgentProviderId as ContractAgentProviderId,
  AgentWorkJobType as ContractAgentWorkJobType,
  AgentCapabilities as ContractAgentCapabilities,
  DetectedAgentProvider as ContractDetectedAgentProvider,
} from "@cycle/contracts/schemas";

export const AgentProviderId = ContractAgentProviderId;
export type AgentProviderId = typeof AgentProviderId.Type;

export type AgentProviderDefinition = {
  readonly defaultEnabled?: boolean;
  readonly defaultMaxConcurrentRuns?: number | null;
  readonly executable: string;
  readonly id: AgentProviderId;
  readonly name: string;
};

export const supportedAgentProviders = [
  {
    defaultEnabled: true,
    defaultMaxConcurrentRuns: null,
    executable: "codex",
    id: "codex",
    name: "Codex",
  },
  {
    defaultEnabled: true,
    defaultMaxConcurrentRuns: null,
    executable: "claude",
    id: "claude-code",
    name: "Claude Code",
  },
] as const satisfies readonly AgentProviderDefinition[];

export const isAgentProviderId = (value: unknown): value is AgentProviderId =>
  supportedAgentProviders.some((provider) => provider.id === value);

export const AgentWorkJobType = ContractAgentWorkJobType;
export type AgentWorkJobType = typeof AgentWorkJobType.Type;

export const AgentCapabilities = ContractAgentCapabilities;
export type AgentCapabilities = typeof AgentCapabilities.Type;

export const DetectedAgentProvider = ContractDetectedAgentProvider;
export type DetectedAgentProvider = typeof DetectedAgentProvider.Type;
