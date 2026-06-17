import type { AgentCapabilities, AgentProviderDefinition } from "../../types.ts";
import { planningJobTypes } from "../shared.ts";

export const claudeProviderDefinition: AgentProviderDefinition = {
  executable: "claude",
  id: "claude",
  name: "Claude Code",
};

export const claudeAgentCapabilities: AgentCapabilities = {
  provider: "claude",
  sessionPersistence: "provider-local",
  streaming: true,
  structuredOutput: true,
  supportedJobTypes: planningJobTypes,
  supports: {
    abort: true,
    artifacts: false,
    fileChanges: false,
    mcp: true,
    toolEvents: true,
    usage: true,
  },
  workspace: "provider-defined",
};
