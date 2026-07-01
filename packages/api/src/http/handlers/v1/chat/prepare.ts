import { isAgentProviderId, type AgentProviderId, type AgentTurnResult } from "@cycle/agents";
import type { CycleApiRuntimeShape } from "../../../runtime/CycleApiRuntime.ts";
import { urlFromRequest } from "../../shared.ts";
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
    "Resolve cycle://repository/<repositoryId> and cycle://repository/<repositoryId>/tickets/<ticketId> references through the Cycle MCP tools before answering context-sensitive questions.",
    "If Cycle MCP tools are not available in the agent runtime, say that repository-backed Cycle context is unavailable instead of probing localhost.",
    "Do not mutate repository state from chat unless the user explicitly asks for a change. Prefer explaining proposed changes and next steps.",
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

  return urlFromRequest(request).origin;
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
  readonly origin: string;
  readonly payload: ChatTurnPayload;
  readonly requestId: string;
  readonly runtime: CycleApiRuntimeShape;
}): PreparedChatTurn => {
  const provider = providerFromPayload(input.payload);
  const repositories = input.payload.repositories ?? [];
  const repository = primaryRepository(repositories);
  const sessionId = input.payload.sessionId ?? input.payload.threadId ?? `chat_${input.requestId}`;
  const threadId = input.payload.threadId ?? sessionId;
  const mcpUrl =
    input.runtime.mcpUrl ??
    (input.runtime.mcpPath === undefined ? undefined : `${input.origin}${input.runtime.mcpPath}`);
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
        mcpAttached: mcpUrl !== undefined,
        repositories,
        requestId: input.requestId,
      }),
      ...(mcpUrl === undefined
        ? {}
        : {
            mcp: {
              headers: {
                authorization: `Bearer ${input.runtime.staticToken}`,
              },
              mode: "http",
              ...(input.payload.mcpRequired === true ? { required: true } : {}),
              url: mcpUrl,
            },
          }),
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
