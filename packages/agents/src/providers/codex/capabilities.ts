import type { AgentCapabilities, AgentProviderDefinition } from "../../types.ts";
import { codexAuthorityCapabilities } from "../capabilities.ts";
import { planningJobTypes } from "../shared.ts";

export const codexAgentCapabilities: AgentCapabilities = {
  authorityModes: codexAuthorityCapabilities,
  provider: "codex",
  providerFeatures: {
    abortInterrupt: true,
    approvalInteractions: true,
    commandExecution: true,
    fileChanges: true,
    mcpAttachments: true,
    modelSelection: true,
    sessionResume: true,
    streaming: true,
    structuredOutput: true,
    usageReporting: true,
    userInputInteractions: true,
    workspaceWriteMode: true,
  },
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

export const codexProviderDefinition: AgentProviderDefinition = {
  capabilities: codexAgentCapabilities,
  configurationSchema: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  defaultEnabled: true,
  defaultMaxConcurrentRuns: null,
  executable: "codex",
  id: "codex",
  name: "Codex",
  packageName: "@cycle/codex-app-server",
};
