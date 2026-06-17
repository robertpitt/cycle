import type { RunResult, ThreadItem, Usage } from "@openai/codex-sdk";
import type { AgentArtifact, AgentError, AgentToolArtifact, AgentUsage } from "../../types.ts";
import { codexProviderId } from "./constants.ts";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorFromMcpToolCall = (error: unknown): AgentError | undefined => {
  if (error === undefined || error === null) return undefined;
  if (isRecord(error)) {
    const message = error.message;
    return {
      code: "provider_error",
      message: typeof message === "string" ? message : "MCP tool call failed.",
      provider: codexProviderId,
    };
  }

  return {
    code: "provider_error",
    message: String(error),
    provider: codexProviderId,
  };
};

export const normalizeUsage = (usage: Usage | null | undefined): AgentUsage | undefined =>
  usage === null || usage === undefined
    ? undefined
    : {
        cacheReadTokens: usage.cached_input_tokens,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        reasoningTokens: usage.reasoning_output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
      };

export const itemArtifact = (item: ThreadItem): AgentArtifact | undefined => {
  switch (item.type) {
    case "command_execution":
      return {
        input: {
          command: item.command,
        },
        metadata: {
          itemId: item.id,
        },
        name: "command_execution",
        output: item.aggregated_output,
        status:
          item.status === "failed"
            ? "failed"
            : item.status === "completed"
              ? "completed"
              : "started",
        type: "tool",
      } satisfies AgentToolArtifact;

    case "file_change":
      return {
        files: item.changes.map((change) => change.path),
        metadata: {
          changes: item.changes,
          itemId: item.id,
          status: item.status,
        },
        summary: item.changes.map((change) => `${change.kind} ${change.path}`).join("\n"),
        type: "patch",
      };

    case "mcp_tool_call":
      return {
        error: errorFromMcpToolCall(item.error),
        input: item.arguments,
        metadata: {
          itemId: item.id,
        },
        name: `${item.server}.${item.tool}`,
        output: item.result,
        status:
          item.status === "failed"
            ? "failed"
            : item.status === "completed"
              ? "completed"
              : "started",
        type: "tool",
      } satisfies AgentToolArtifact;

    case "error":
      return undefined;

    case "reasoning":
    case "todo_list":
    case "web_search":
      return {
        name: item.type,
        value: item,
        type: "raw",
      };

    case "agent_message":
      return undefined;
  }
};

export const artifactsFromTurn = (turn: RunResult): readonly AgentArtifact[] =>
  turn.items.flatMap((item) => {
    const artifact = itemArtifact(item);
    return artifact === undefined ? [] : [artifact];
  });

export const progressMessageForItem = (item: ThreadItem): string | undefined => {
  switch (item.type) {
    case "agent_message":
      return undefined;

    case "command_execution": {
      const command = item.command.length > 96 ? `${item.command.slice(0, 93)}...` : item.command;
      switch (item.status) {
        case "completed":
          return `Command completed: ${command}`;
        case "failed":
          return `Command failed: ${command}`;
        case "in_progress":
          return `Running command: ${command}`;
      }
    }

    case "file_change":
      return item.status === "completed" ? "Applied file changes." : "File changes failed.";

    case "mcp_tool_call": {
      const toolName = `${item.server}.${item.tool}`;
      switch (item.status) {
        case "completed":
          return `Tool completed: ${toolName}`;
        case "failed":
          return `Tool failed: ${toolName}`;
        case "in_progress":
          return `Calling tool: ${toolName}`;
      }
    }

    case "reasoning":
      return "Reasoning.";

    case "todo_list":
      return "Updated plan.";

    case "web_search":
      return `Searching: ${item.query}`;

    case "error":
      return item.message;
  }
};
