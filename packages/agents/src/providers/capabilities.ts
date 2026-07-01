import type {
  AgentAuthorityMode,
  AgentCapabilities,
  AgentJobRequestMetadata,
  CreateAgentJobRequestMetadataInput,
} from "../types.ts";

export const codexAuthorityCapabilities = {
  "disposable-worktree": true,
  "implementation-worktree": true,
  "ticket-context": true,
} satisfies Readonly<Record<AgentAuthorityMode, boolean>>;

export const capabilitySupportsAuthorityMode = (
  capabilities: AgentCapabilities,
  authorityMode: AgentAuthorityMode,
): boolean => capabilities.authorityModes?.[authorityMode] === true;

export const makeAgentJobRequestMetadata = (
  input: CreateAgentJobRequestMetadataInput,
): AgentJobRequestMetadata => ({
  agent: {
    id: input.agentId,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.providerId === undefined ? {} : { providerId: input.providerId }),
  },
  agentId: input.agentId,
  authorityMode: input.authorityMode,
  ...(input.branchName === undefined ? {} : { branchName: input.branchName }),
  jobId: input.jobId,
  repositoryId: input.repositoryId,
  ticketId: input.ticketId,
  trigger: input.trigger,
  triggerType: input.trigger,
  ...(input.triggerCommentId === undefined ? {} : { triggerCommentId: input.triggerCommentId }),
  ...(input.worktreePath === undefined ? {} : { worktreePath: input.worktreePath }),
});
