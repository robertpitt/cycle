import {
  isAgentProviderId,
  type AgentMcpAttachment,
  type AgentProviderId,
  type AgentTurnResult,
} from "@cycle/agents";
import type {
  ChatMessagePayload,
  ChatRepositoryPayload,
  ChatStreamOptions,
  ChatTurnPayload,
  PreparedChatTurn,
} from "./domain.ts";

const defaultHeartbeatMs = 15_000;
const maxHeartbeatMs = 60_000;
const minHeartbeatMs = 250;

const providerFromPayload = (payload: ChatTurnPayload): AgentProviderId =>
  payload.provider !== undefined && isAgentProviderId(payload.provider)
    ? payload.provider
    : "codex";

const primaryRepository = (
  repositories: readonly ChatRepositoryPayload[],
): ChatRepositoryPayload | undefined =>
  repositories.find(
    (repository) => typeof repository.path === "string" && repository.path.length > 0,
  ) ?? repositories[0];

const roleLabel = (role: ChatMessagePayload["role"]): string => {
  switch (role) {
    case "agent":
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "user":
      return "User";
  }
};

const formatConversation = (messages: readonly ChatMessagePayload[]): string =>
  messages
    .map((message) => `${roleLabel(message.role)}: ${message.content}`)
    .join("\n\n")
    .trim();

const formatRepositories = (repositories: readonly ChatRepositoryPayload[]): string => {
  if (repositories.length === 0) return "No repositories were selected in the desktop UI.";

  return repositories
    .map((repository) =>
      [
        `- ${repository.displayName ?? repository.id}`,
        `id: ${repository.id}`,
        repository.path === undefined ? undefined : `path: ${repository.path}`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
};

export const assignedTicketImplementationWorkflowInstructions = (): string =>
  [
    "Assigned ticket implementation workflow:",
    "1. Resolve the repository and ticket through Cycle MCP tools before making repository or ticket claims.",
    "2. Prepare a dedicated git worktree for the ticket and do the implementation work there with full read-write permissions.",
    "3. Before changing code, assign the ticket to the current user when the current user identity is available, and transition the ticket to `In Progress`.",
    "4. Complete the ticket scope. If you discover a separate out-of-scope issue, capture it as a follow-up Cycle ticket using a sub-agent when delegation is available, and continue the original task.",
    "5. After implementation, run relevant tests, commit the branch when appropriate, and push to the configured remote when possible.",
    "6. Move the ticket to `In Review`. If that status is not available through the exposed tools, create it or otherwise make it available when the tools support that operation; otherwise use the closest available workflow operation and report the limitation.",
    "7. Add a ticket comment with a handoff that includes completed work, branch or remote links, testing performed, and known limitations or follow-up tickets.",
    "Do not create a pull request as part of this workflow.",
  ].join("\n");

const chatInstructions = (input: {
  readonly instructions?: string;
  readonly mcpAttached: boolean;
  readonly repositories: readonly ChatRepositoryPayload[];
  readonly requestId: string;
}): string =>
  [
    "You are Cycle's in-app Codex chat for planning, issue triage, reviews, and repository questions.",
    "Use the attached Cycle MCP tools when repository state or database-backed issue context is needed.",
    "Do not call or inspect the Cycle MCP HTTP endpoint with shell commands such as curl. Use the MCP tools exposed by the agent runtime instead.",
    "Global chat has no implicit repository context. Treat markdown links with cycle:// URIs in the user message as explicit context references.",
    "Also treat markdown links using cycle-repository:<repositoryId> or cycle-ticket:<ticketId> URIs as explicit Cycle context references.",
    "Resolve cycle://repository/<repositoryId> and cycle://repository/<repositoryId>/tickets/<ticketId> references through the Cycle MCP tools before answering context-sensitive questions.",
    "If Cycle MCP tools are not available in the agent runtime, say that repository-backed Cycle context is unavailable instead of probing localhost.",
    "Do not mutate repository state from chat unless the user explicitly asks for a change. Prefer explaining proposed changes and next steps.",
    "When the user explicitly asks you to implement, fix, work on, or complete a Cycle ticket, treat that as assigned ticket implementation work and follow this workflow:",
    assignedTicketImplementationWorkflowInstructions(),
    "Keep answers concise, concrete, and grounded in the context the user explicitly provided.",
    `Request id: ${input.requestId}`,
    `Cycle MCP: ${input.mcpAttached ? "attached as agent tools" : "not attached for this request"}`,
    "Selected repositories:",
    formatRepositories(input.repositories),
    input.instructions,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n\n");

export const requestOrigin = (request: {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly url: string;
}): string => {
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = forwardedHost ?? request.headers.host;
  if (host !== undefined && host.length > 0) {
    const proto = request.headers["x-forwarded-proto"] ?? "http";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
};

export const bodyFromResult = (result: AgentTurnResult): string =>
  result.text.trim().length > 0
    ? result.text
    : (result.error?.message ?? "Codex did not return a response.");

export const messageFromTurnResult = (result: AgentTurnResult) => ({
  actor: "agent" as const,
  body: bodyFromResult(result),
  createdAt: (result.completedAt ?? result.createdAt).toISOString(),
  id: result.id,
});

export const prepareChatTurn = (input: {
  readonly mcp?: AgentMcpAttachment;
  readonly payload: ChatTurnPayload;
  readonly requestId: string;
}): PreparedChatTurn => {
  const provider = providerFromPayload(input.payload);
  const repositories = input.payload.repositories ?? [];
  const repository = primaryRepository(repositories);
  const sessionId = input.payload.sessionId ?? input.payload.threadId ?? `chat_${input.requestId}`;
  const threadId = input.payload.threadId ?? sessionId;
  const mcp =
    input.mcp === undefined
      ? undefined
      : {
          ...input.mcp,
          ...(input.payload.mcpRequired === true ? { required: true } : {}),
        };
  const conversation = formatConversation(input.payload.messages ?? []);

  return {
    agentRequest: {
      context: {
        ...(repository?.path === undefined ? {} : { cwd: repository.path }),
        provider,
        repositories: repositories.map((entry) => ({
          displayName: entry.displayName ?? entry.id,
          id: entry.id,
          ...(entry.path === undefined ? {} : { path: entry.path }),
        })),
        requestId: input.requestId,
        threadId,
      },
      input: [
        conversation.length === 0 ? undefined : `Conversation so far:\n${conversation}`,
        `Current user message:\n${input.payload.message}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join("\n\n"),
      instructions: chatInstructions({
        instructions: input.payload.instructions,
        mcpAttached: mcp !== undefined,
        repositories,
        requestId: input.requestId,
      }),
      ...(mcp === undefined ? {} : { mcp }),
      ...(input.payload.model === undefined ? {} : { model: { id: input.payload.model } }),
      ...(input.payload.responseFormat === undefined
        ? {}
        : { responseFormat: input.payload.responseFormat }),
      ...(input.payload.runtimeMode === undefined
        ? {}
        : { runtimeMode: input.payload.runtimeMode }),
      metadata: {
        requestId: input.requestId,
        threadId,
      },
    },
    provider,
    sessionId,
    threadId,
  };
};

export const streamOptionsFromPayload = (payload: ChatTurnPayload): ChatStreamOptions => {
  const heartbeatMs = payload.stream?.heartbeatMs;
  const normalizedHeartbeatMs =
    typeof heartbeatMs === "number" && Number.isFinite(heartbeatMs) && heartbeatMs > 0
      ? Math.min(maxHeartbeatMs, Math.max(minHeartbeatMs, Math.trunc(heartbeatMs)))
      : defaultHeartbeatMs;

  return {
    heartbeatMs: normalizedHeartbeatMs,
    includeArtifacts: payload.stream?.includeArtifacts ?? true,
    includeProgress: payload.stream?.includeProgress ?? true,
  };
};
