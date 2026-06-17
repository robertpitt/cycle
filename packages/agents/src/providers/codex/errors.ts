import type { AgentError } from "../../types.ts";
import { codexProviderId } from "./constants.ts";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonMessage = (message: string): unknown => {
  try {
    return JSON.parse(message) as unknown;
  } catch {
    return undefined;
  }
};

const messageFromProviderError = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = parseJsonMessage(value);
    return parsed === undefined ? value : (messageFromProviderError(parsed) ?? value);
  }
  if (!isRecord(value)) return undefined;

  const nestedError = value.error;
  if (nestedError !== undefined) {
    const nestedMessage = messageFromProviderError(nestedError);
    if (nestedMessage !== undefined) return nestedMessage;
  }

  const message = value.message;
  return typeof message === "string" && message.trim().length > 0 ? message : undefined;
};

const codeFromProviderError = (value: unknown, message: string): AgentError["code"] => {
  const lower = message.toLowerCase();
  const parsed = typeof value === "string" ? parseJsonMessage(value) : value;
  const nestedError = isRecord(parsed) ? parsed.error : undefined;
  const providerType = isRecord(nestedError) ? nestedError.type : undefined;

  if (providerType === "invalid_request_error" || lower.includes("invalid_request_error")) {
    return "provider_error";
  }
  if (lower.includes("login") || lower.includes("auth")) return "authentication_error";
  if (lower.includes("aborted") || lower.includes("abort")) return "cancelled";
  if (lower.includes("timed out") || lower.includes("timeout")) return "timeout";
  return "provider_error";
};

export const normalizeCodexError = (error: unknown): AgentError => {
  const rawMessage = error instanceof Error ? error.message : undefined;
  const message =
    messageFromProviderError(rawMessage) ??
    messageFromProviderError(error) ??
    "Codex failed to complete the turn.";
  const code = codeFromProviderError(rawMessage ?? error, message);

  return {
    code,
    message,
    provider: codexProviderId,
    raw: error,
    retryable: code !== "provider_error",
  };
};
