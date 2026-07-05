import type { AgentChatMessageRecord, AgentChatThreadRecord } from "./records.ts";
import { isRecord, stringValue } from "./domain.ts";

const chatThreadStatus = (value: unknown): AgentChatThreadRecord["status"] =>
  value === "active" || value === "waiting" ? value : "draft";

const chatMessageActor = (value: unknown): AgentChatMessageRecord["actor"] =>
  value === "agent" ? "agent" : "user";

export const chatThreadFromPayload = (input: {
  readonly now: string;
  readonly payload: unknown;
  readonly threadId: string;
}): AgentChatThreadRecord => {
  const payload = isRecord(input.payload) ? input.payload : {};
  const agentId = stringValue(payload.agentId);
  const sessionId = stringValue(payload.sessionId);
  const origin = isRecord(payload.origin) ? payload.origin : undefined;

  return {
    createdAt: stringValue(payload.createdAt) ?? input.now,
    id: input.threadId,
    ...(agentId === undefined ? {} : { agentId }),
    ...(origin === undefined ? {} : { origin }),
    ...(sessionId === undefined ? {} : { sessionId }),
    status: chatThreadStatus(payload.status),
    summary: stringValue(payload.summary) ?? "New conversation",
    title: stringValue(payload.title) ?? "New chat",
    updatedAt: stringValue(payload.updatedAt) ?? input.now,
  };
};

export const chatMessageFromPayload = (input: {
  readonly messageId: string;
  readonly now: string;
  readonly payload: unknown;
  readonly threadId: string;
}): AgentChatMessageRecord => {
  const payload = isRecord(input.payload) ? input.payload : {};
  const sequence = typeof payload.sequence === "number" ? payload.sequence : undefined;

  return {
    actor: chatMessageActor(payload.actor),
    body: stringValue(payload.body) ?? "",
    createdAt: stringValue(payload.createdAt) ?? input.now,
    id: input.messageId,
    ...(sequence === undefined ? {} : { sequence }),
    threadId: input.threadId,
  };
};
