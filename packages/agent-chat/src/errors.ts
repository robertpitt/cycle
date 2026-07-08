import { Schema } from "effect";

export type AgentChatErrorCode =
  | "invalid_payload"
  | "thread_not_found"
  | "thread_turn_active"
  | "chat_store_unavailable"
  | "chat_store_failed"
  | "chat_delete_unavailable"
  | "provider_unavailable"
  | "provider_disabled"
  | "provider_concurrency_limit"
  | "provider_execution_failed"
  | "unsupported_operation"
  | "unknown";

export type AgentChatErrorResult = {
  readonly _tag: "error";
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
};

export type AgentChatOkResult<T> = {
  readonly _tag: "ok";
  readonly result: T;
};

export type AgentChatResult<T> = AgentChatErrorResult | AgentChatOkResult<T>;

export const agentChatError = (
  code: string,
  message: string,
  retryable = false,
): AgentChatErrorResult => ({
  _tag: "error",
  code,
  message,
  retryable,
});

export const agentChatOk = <T>(result: T): AgentChatOkResult<T> => ({
  _tag: "ok",
  result,
});

export class AgentChatFailure extends Schema.TaggedErrorClass<AgentChatFailure>(
  "@cycle/agent-chat/AgentChatFailure",
)("AgentChatFailure", {
  cause: Schema.optional(Schema.Defect()),
  code: Schema.Literals([
    "invalid_payload",
    "thread_not_found",
    "turn_already_active",
    "store_unavailable",
    "store_failed",
    "provider_unavailable",
    "provider_execution_failed",
    "cancellation_failed",
    "unsupported_operation",
    "unknown",
  ]),
  message: Schema.String,
  retryable: Schema.optional(Schema.Boolean),
}) {}

export const agentChatFailureFromUnknown = (
  cause: unknown,
  fallback: {
    readonly code: AgentChatFailure["code"];
    readonly message: string;
    readonly retryable?: boolean;
  },
): AgentChatFailure => {
  if (cause instanceof AgentChatFailure) return cause;
  return new AgentChatFailure({
    cause,
    code: fallback.code,
    message: cause instanceof Error ? cause.message : fallback.message,
    retryable: fallback.retryable,
  });
};
