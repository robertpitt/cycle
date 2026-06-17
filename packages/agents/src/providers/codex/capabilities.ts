import type { AgentCapabilities, AgentProviderDefinition } from "../../types.ts";
import { planningJobTypes } from "../shared.ts";

export const codexProviderDefinition: AgentProviderDefinition = {
  executable: "codex",
  id: "codex",
  name: "Codex",
};

export const codexAgentCapabilities: AgentCapabilities = {
  provider: "codex",
  sessionPersistence: "provider-local",
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
