import type { SDKMessage, SDKResultError, SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentError,
  AgentEvent,
  AgentProviderId,
  AgentTurnResult,
  AgentUsage,
  JsonObject,
} from "../../types.ts";
import { claudeCodeProviderId } from "./constants.ts";

export type ClaudeCodeEventMappingInput = {
  readonly message: SDKMessage;
  readonly provider?: AgentProviderId;
  readonly sessionId: string;
  readonly turnId: string;
  readonly at?: Date;
};

export const mapClaudeCodeSdkMessage = (
  input: ClaudeCodeEventMappingInput,
): readonly AgentEvent[] => {
  const at = input.at ?? new Date();
  const provider = input.provider ?? claudeCodeProviderId;

  switch (input.message.type) {
    case "assistant":
      return assistantMessageEvents(input.message.message.content, input.sessionId, input.turnId, at);
    case "stream_event":
      return streamEventEvents(input.message.event, input.sessionId, input.turnId, at);
    case "result":
      return resultEvents(input.message, provider, input.sessionId, input.turnId, at);
    case "tool_progress":
      return [
        {
          at,
          item: {
            elapsedTimeSeconds: input.message.elapsed_time_seconds,
            toolName: input.message.tool_name,
          },
          itemId: input.message.tool_use_id,
          itemType: input.message.tool_name,
          sessionId: input.sessionId,
          turnId: input.turnId,
          type: "item.updated",
        },
      ];
    case "tool_use_summary":
      return [
        {
          at,
          message: input.message.summary,
          sessionId: input.sessionId,
          turnId: input.turnId,
          type: "progress",
        },
      ];
    case "rate_limit_event":
      return input.message.rate_limit_info.status === "rejected"
        ? [
            {
              at,
              message: "Claude Code reported that the current rate limit rejected this run.",
              sessionId: input.sessionId,
              turnId: input.turnId,
              type: "runtime.warning",
            },
          ]
        : [];
    case "system":
      return systemMessageEvents(input.message, input.sessionId, input.turnId, at);
    case "auth_status":
      return input.message.error === undefined
        ? []
        : [
            {
              at,
              message: input.message.error,
              sessionId: input.sessionId,
              turnId: input.turnId,
              type: "runtime.warning",
            },
          ];
    default:
      return [];
  }
};

const assistantMessageEvents = (
  content: unknown,
  sessionId: string,
  turnId: string,
  at: Date,
): readonly AgentEvent[] => {
  if (!Array.isArray(content)) return [];
  const events: AgentEvent[] = [];

  for (const block of content) {
    if (!isRecord(block)) continue;
    const type = stringValue(block.type);
    if (type === "text") {
      const text = stringValue(block.text);
      if (text === undefined) continue;
      events.push({
        at,
        delta: text,
        sessionId,
        streamKind: "assistant_text",
        turnId,
        type: "content.delta",
      });
      continue;
    }
    if (type === "thinking") {
      const thinking = stringValue(block.thinking);
      if (thinking === undefined) continue;
      events.push({
        at,
        delta: thinking,
        sessionId,
        streamKind: "reasoning_text",
        turnId,
        type: "content.delta",
      });
      continue;
    }
    if (type === "tool_use" || type === "server_tool_use") {
      const itemId = stringValue(block.id) ?? `claude-tool-${events.length + 1}`;
      const itemType = stringValue(block.name) ?? type;
      events.push({
        at,
        item: jsonObject({
          input: block.input,
          name: itemType,
        }),
        itemId,
        itemType,
        sessionId,
        turnId,
        type: "item.started",
      });
      continue;
    }
  }

  return events;
};

const streamEventEvents = (
  event: unknown,
  sessionId: string,
  turnId: string,
  at: Date,
): readonly AgentEvent[] => {
  if (!isRecord(event)) return [];
  const eventType = stringValue(event.type);
  if (eventType === "content_block_start" && isRecord(event.content_block)) {
    const block = event.content_block;
    const blockType = stringValue(block.type);
    if (blockType === "tool_use" || blockType === "server_tool_use") {
      const itemId = stringValue(block.id) ?? `claude-tool-${numberValue(event.index) ?? 0}`;
      const itemType = stringValue(block.name) ?? blockType;
      return [
        {
          at,
          item: jsonObject({
            input: block.input,
            name: itemType,
          }),
          itemId,
          itemType,
          sessionId,
          turnId,
          type: "item.started",
        },
      ];
    }
    return [];
  }

  if (eventType !== "content_block_delta" || !isRecord(event.delta)) return [];

  const delta = event.delta;
  const deltaType = stringValue(delta.type);
  const text = stringValue(delta.text) ?? stringValue(delta.thinking);
  if (text === undefined) return [];

  return [
    {
      at,
      delta: text,
      itemId:
        typeof event.index === "number" ? `claude-content-${event.index.toString()}` : undefined,
      sessionId,
      streamKind: deltaType === "thinking_delta" ? "reasoning_text" : "assistant_text",
      turnId,
      type: "content.delta",
    },
  ];
};

const resultEvents = (
  message: SDKResultSuccess | SDKResultError,
  provider: AgentProviderId,
  sessionId: string,
  turnId: string,
  at: Date,
): readonly AgentEvent[] => {
  const usage = usageFromResult(message);
  const events: AgentEvent[] = usage === undefined
    ? []
    : [
        {
          at,
          sessionId,
          turnId,
          type: "usage",
          usage,
        },
      ];

  if (message.subtype === "success") {
    events.push({
      at,
      result: {
        artifacts: [],
        completedAt: at,
        createdAt: at,
        finishReason: finishReasonFromStopReason(message.stop_reason),
        id: turnId,
        provider,
        sessionId,
        status: "completed",
        text: message.result,
        metadata: jsonObject({
          durationMs: message.duration_ms,
          numTurns: message.num_turns,
          stopReason: message.stop_reason,
          totalCostUsd: message.total_cost_usd,
        }),
      } satisfies AgentTurnResult,
      sessionId,
      turnId,
      type: "turn.completed",
    });
    return events;
  }

  events.push({
    at,
    error: {
      code:
        message.subtype === "error_max_turns" ||
        message.subtype === "error_max_budget_usd" ||
        message.subtype === "error_max_structured_output_retries"
          ? "unsupported_option"
          : "provider_error",
      message: message.errors[0] ?? "Claude Code run failed.",
      provider,
      retryable: message.subtype === "error_during_execution",
    },
    sessionId,
    turnId,
    type: "turn.failed",
  });
  return events;
};

const systemMessageEvents = (
  message: Extract<SDKMessage, { readonly type: "system" }>,
  sessionId: string,
  turnId: string,
  at: Date,
): readonly AgentEvent[] => {
  switch (message.subtype) {
    case "local_command_output":
      return [
        {
          at,
          message: message.content,
          sessionId,
          turnId,
          type: "progress",
        },
      ];
    case "permission_denied":
      return [
        {
          artifact: {
            error: {
              code: "provider_error",
              message: message.message,
              provider: claudeCodeProviderId,
              retryable: false,
            },
            metadata: jsonObject({
              itemId: message.tool_use_id,
              reason: message.decision_reason,
              reasonType: message.decision_reason_type,
            }),
            name: message.tool_name,
            status: "failed",
            type: "tool",
          },
          at,
          sessionId,
          turnId,
          type: "artifact",
        },
      ];
    case "task_started":
      return [
        {
          at,
          item: jsonObject({
            description: message.description,
            prompt: message.prompt,
            taskType: message.task_type,
          }),
          itemId: message.task_id,
          itemType: message.task_type ?? "Task",
          sessionId,
          turnId,
          type: "item.started",
        },
      ];
    case "task_progress":
      return [
        {
          at,
          message: message.summary ?? message.description,
          raw: jsonObject({
            lastToolName: message.last_tool_name,
            taskId: message.task_id,
            usage: message.usage,
          }),
          sessionId,
          turnId,
          type: "progress",
        },
      ];
    case "task_notification":
      return [
        {
          at,
          item: jsonObject({
            outputFile: message.output_file,
            status: message.status,
            summary: message.summary,
            usage: message.usage,
          }),
          itemId: message.task_id,
          itemType: "Task",
          sessionId,
          turnId,
          type: "item.completed",
        },
      ];
    case "notification":
      return [
        {
          at,
          message: message.text,
          sessionId,
          turnId,
          type: "progress",
        },
      ];
    default:
      return [];
  }
};

export const claudeCodeError = (
  cause: unknown,
  provider: AgentProviderId = claudeCodeProviderId,
): AgentError => {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/auth|login|credential|oauth/iu.test(message)) {
    return { code: "authentication_error", message, provider, retryable: false };
  }
  if (/rate.?limit|overloaded/iu.test(message)) {
    return { code: "rate_limit", message, provider, retryable: true };
  }
  if (/timeout/iu.test(message)) {
    return { code: "timeout", message, provider, retryable: true };
  }
  if (/abort|cancel|interrupt/iu.test(message)) {
    return { code: "cancelled", message, provider, retryable: false };
  }
  return { code: "provider_error", message, provider, retryable: false };
};

const usageFromResult = (message: SDKResultSuccess | SDKResultError): AgentUsage | undefined => {
  const inputTokens = numberValue(message.usage.input_tokens);
  const outputTokens = numberValue(message.usage.output_tokens);
  const cacheReadTokens = numberValue(message.usage.cache_read_input_tokens);
  const cacheWriteTokens = numberValue(message.usage.cache_creation_input_tokens);
  const totalTokens = sumDefined([inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens]);
  const cost = numberValue(message.total_cost_usd);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined &&
    cost === undefined
  ) {
    return undefined;
  }

  return {
    cacheReadTokens,
    cacheWriteTokens,
    cost: cost === undefined ? undefined : { amount: cost, currency: "USD" },
    inputTokens,
    outputTokens,
    totalTokens,
  };
};

const finishReasonFromStopReason = (value: string | null): AgentTurnResult["finishReason"] => {
  switch (value) {
    case "end_turn":
    case "stop_sequence":
    case "stop":
    case null:
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_use";
    case "refusal":
      return "refusal";
    default:
      return "unknown";
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const sumDefined = (values: readonly (number | undefined)[]): number | undefined => {
  const numbers = values.filter((value): value is number => value !== undefined);
  return numbers.length === 0
    ? undefined
    : numbers.reduce((total, value) => total + value, 0);
};

const jsonObject = (value: Readonly<Record<string, unknown>>): JsonObject =>
  JSON.parse(JSON.stringify(value)) as JsonObject;
