import type { AgentCapabilities, AgentProviderDefinition } from "../../types.ts";
import { planningJobTypes } from "../shared.ts";
import { claudeCodeExecutable, claudeCodePackageName, claudeCodeProviderId } from "./constants.ts";
import { claudeCodeConfigurationSchema } from "./config.ts";

const claudeCodeAuthorityCapabilities = {
  "disposable-worktree": true,
  "implementation-worktree": true,
  "ticket-context": true,
} as const;

export const claudeCodeAgentCapabilities: AgentCapabilities = {
  authorityModes: claudeCodeAuthorityCapabilities,
  provider: claudeCodeProviderId,
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
    userInputInteractions: false,
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

export const claudeCodeProviderDefinition: AgentProviderDefinition = {
  capabilities: claudeCodeAgentCapabilities,
  configurationSchema: claudeCodeConfigurationSchema,
  defaultEnabled: true,
  defaultMaxConcurrentRuns: null,
  documentationUrl: "https://code.claude.com/docs/en/agent-sdk/typescript",
  executable: claudeCodeExecutable,
  id: claudeCodeProviderId,
  name: "Claude Code",
  packageName: claudeCodePackageName,
};
