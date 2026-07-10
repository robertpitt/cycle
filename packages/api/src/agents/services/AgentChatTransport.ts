import type { AgentChatMessage, AgentChatThread, AgentChatView } from "@cycle/agent-chat";
import type { AgentProviderProfile } from "@cycle/agents";

export const chatThreadRecord = (thread: AgentChatThread) => ({
  activeTurnId: thread.activeTaskId ?? null,
  agentId: thread.providerId,
  createdAt: thread.createdAt,
  id: thread.threadId,
  model: thread.model ?? null,
  origin:
    thread.metadata !== undefined &&
    typeof thread.metadata.origin === "object" &&
    thread.metadata.origin !== null &&
    !Array.isArray(thread.metadata.origin)
      ? thread.metadata.origin
      : thread.ticketId === undefined
        ? null
        : {
            issueId: thread.ticketId,
            kind: "ticket-agent-work",
            label: thread.title ?? `Work on ${thread.ticketId}`,
            repositoryId: thread.repositoryId ?? null,
            ticketId: thread.ticketId,
            trigger: "ticket-view",
          },
  providerId: thread.providerId,
  runtimeMode: thread.runtimeMode ?? "read-only",
  status: thread.status === "archived" ? "archived" : thread.status === "busy" ? "active" : "draft",
  summary: thread.title ?? "Agent conversation",
  title: thread.title ?? "Agent conversation",
  updatedAt: thread.updatedAt,
});

export const chatProtocolMessageRecord = (message: AgentChatMessage) => ({
  createdAt: message.createdAt,
  id: message.messageId,
  role: message.role === "tool" ? "assistant" : message.role,
  streaming: message.status === "streaming",
  text: message.content,
  updatedAt: message.updatedAt,
  ...(message.taskId === undefined ? {} : { turnId: message.taskId }),
});

export const chatMessageRecord = (threadId: string, message: AgentChatMessage) => ({
  actor: message.role === "user" ? "user" : "agent",
  body: message.content,
  createdAt: message.createdAt,
  id: message.messageId,
  streaming: message.status === "streaming",
  threadId,
  updatedAt: message.updatedAt,
  ...(message.taskId === undefined ? {} : { turnId: message.taskId }),
});

export const chatTurnRecord = (view: AgentChatView, taskId: string) => ({
  createdAt: view.thread.updatedAt,
  id: taskId,
  inputMessageId:
    view.messages.find((message) => message.taskId === taskId && message.role === "user")
      ?.messageId ?? `input_${taskId}`,
  providerId: view.thread.providerId,
  status: view.thread.activeTaskId === taskId ? "running" : "completed",
  threadId: view.thread.threadId,
  updatedAt: view.thread.updatedAt,
});

export const chatSnapshotRecord = (view: AgentChatView) => ({
  activities: [],
  lastSequence: view.lastSequence,
  messages: view.messages.map(chatProtocolMessageRecord),
  questions: view.interactions
    .filter((interaction) => interaction.type === "user-input")
    .map((interaction) => ({
      createdAt: view.thread.updatedAt,
      id: interaction.interactionId,
      prompt: interaction.prompt,
      questions: interaction.fields,
      status: interaction.status,
      threadId: view.thread.threadId,
      turnId: interaction.taskId,
    })),
  thread: chatThreadRecord(view.thread),
  turns: [
    ...new Set(
      view.messages.flatMap((message) => (message.taskId === undefined ? [] : [message.taskId])),
    ),
  ].map((taskId) => chatTurnRecord(view, taskId)),
});

export const chatProviderProfile = (profile: AgentProviderProfile) => {
  const availability =
    profile.status === "available"
      ? "available"
      : profile.status === "unsupported"
        ? "unsupported"
        : "unavailable";
  return {
    availability,
    defaultModel: profile.defaultModel ?? profile.models[0] ?? null,
    defaultThinkingLevel: profile.defaultReasoningEffortId ?? null,
    description: profile.message ?? profile.executableName,
    id: profile.provider,
    label: profile.displayName,
    models: profile.models.map((model) => ({
      disabled: availability !== "available",
      id: model,
      label: model,
    })),
    statusLabel: profile.status,
    thinkingLevels:
      profile.reasoningEfforts?.map((effort) => ({
        description: effort.description ?? null,
        disabled: effort.disabled === true,
        id: effort.id,
        label: effort.label,
      })) ?? [],
  };
};
