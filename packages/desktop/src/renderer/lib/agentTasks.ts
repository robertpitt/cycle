import {
  AgentTask as AgentTaskSchema,
  AgentTaskEvent as AgentTaskEventSchema,
  type AgentTaskAuthority,
  type AgentTaskRequest,
  type AgentTaskWorkspace,
} from "@cycle/contracts/schemas/agents";
import { Schema } from "effect";

export type AgentTask = typeof AgentTaskSchema.Type;
export type AgentTaskEvent = typeof AgentTaskEventSchema.Type;
export type AgentTaskStatus = AgentTask["status"];

export type StartIssueAgentTaskInput = {
  readonly agentId: string;
  readonly authority?: AgentTaskAuthority;
  readonly instructions?: string | null;
  readonly model?: string | null;
  readonly providerId?: string;
  readonly requestedBy?: string;
  readonly workspace?: AgentTaskWorkspace;
};

export type CreateAgentTaskInput = AgentTaskRequest;

export const terminalAgentTaskStatuses = new Set<AgentTaskStatus>([
  "cancelled",
  "completed",
  "failed",
]);

export const resumableAgentTaskStatuses = new Set<AgentTaskStatus>(["failed"]);

export const taskStatusTone = (
  status: AgentTaskStatus | string,
): "danger" | "info" | "neutral" | "success" | "warning" => {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "neutral";
  if (status === "waiting_for_input") return "warning";
  if (status === "queued") return "neutral";
  return "info";
};

export const statusLabel = (status: string): string =>
  status
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export const parseAgentTask = (value: unknown): AgentTask | null => {
  try {
    return Schema.decodeUnknownSync(AgentTaskSchema)(value);
  } catch {
    return null;
  }
};

export const parseAgentTaskEvent = (value: unknown): AgentTaskEvent | null => {
  try {
    return Schema.decodeUnknownSync(AgentTaskEventSchema)(value);
  } catch {
    return null;
  }
};
