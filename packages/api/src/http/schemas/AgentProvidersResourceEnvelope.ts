import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import { ResourceEnvelopeOf } from "./shared.ts";

export const AgentProviderId = ContractSchemas.AgentProviderId;
export const AgentCapabilitiesOutput = ContractSchemas.AgentCapabilities;
export const AgentProviderProfileOutput = ContractSchemas.AgentProviderProfile;
export const AgentProvidersOutput = Schema.Struct({
  providers: Schema.Array(AgentProviderProfileOutput),
});
export const AgentProvidersResourceEnvelope = ResourceEnvelopeOf(AgentProvidersOutput);
