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
