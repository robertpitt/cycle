import type { AgentProviderId } from "../../types.ts";
import { makeRandomId } from "../../internal/id.ts";

export const codexProviderId: AgentProviderId = "codex";
export const defaultCodexTimeoutMs = 10 * 60_000;
export const mcpBearerTokenEnvVar = "CYCLE_AGENT_MCP_TOKEN";

export const newCodexId = makeRandomId;

export const now = (): Date => new Date();
