import type { AgentCapabilities, AgentProviderDefinition } from "../../types.ts";
import { planningJobTypes } from "../shared.ts";

export const opencodeProviderDefinition: AgentProviderDefinition = {
  executable: "opencode",
  id: "opencode",
  name: "OpenCode",
};

export const opencodeAgentCapabilities: AgentCapabilities = {
  provider: "opencode",
  sessionPersistence: "provider-server",
  streaming: true,
  structuredOutput: true,
  supportedJobTypes: [...planningJobTypes, "implement_issue", "review_implementation"],
  supports: {
    abort: true,
    artifacts: true,
    fileChanges: true,
    mcp: true,
    toolEvents: true,
    usage: true,
  },
  workspace: "provider-defined",
};
