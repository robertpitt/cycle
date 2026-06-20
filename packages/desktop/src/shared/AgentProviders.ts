import { isAgentProviderId, supportedAgentProviders } from "@cycle/agents/providers";
import {
  AgentCapabilities as ContractAgentCapabilities,
  AgentProviderId as ContractAgentProviderId,
  AgentWorkJobType as ContractAgentWorkJobType,
  DetectedAgentProvider as ContractDetectedAgentProvider,
} from "@cycle/contracts/schemas";

export type { AgentProviderDefinition } from "@cycle/agents/types";
export { isAgentProviderId, supportedAgentProviders };

export const AgentProviderId = ContractAgentProviderId;
export type AgentProviderId = typeof AgentProviderId.Type;

export const AgentWorkJobType = ContractAgentWorkJobType;
export type AgentWorkJobType = typeof AgentWorkJobType.Type;

export const AgentCapabilities = ContractAgentCapabilities;
export type AgentCapabilities = typeof AgentCapabilities.Type;

export const DetectedAgentProvider = ContractDetectedAgentProvider;
export type DetectedAgentProvider = typeof DetectedAgentProvider.Type;
