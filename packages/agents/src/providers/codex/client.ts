import { Codex, type CodexOptions, type ThreadOptions, type TurnOptions } from "@openai/codex-sdk";
import type { AgentMcpAttachment, AgentResponseFormat, AgentTurnRequest } from "../../types.ts";
import { mcpBearerTokenEnvVar } from "./constants.ts";
import type { CodexAgentServiceOptions, CodexClientLike } from "./types.ts";

type CodexConfig = NonNullable<CodexOptions["config"]>;

const inputText = (request: AgentTurnRequest): string =>
  typeof request.input === "string"
    ? request.input
    : request.input.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n");

const bearerTokenFromMcp = (mcp: AgentMcpAttachment | undefined): string | undefined => {
  if (mcp?.mode !== "http") return undefined;

  const authorization =
    mcp.headers?.authorization ?? mcp.headers?.Authorization ?? mcp.headers?.["AUTHORIZATION"];
  const prefix = "Bearer ";

  return authorization?.startsWith(prefix) ? authorization.slice(prefix.length) : undefined;
};

const codexMcpConfig = (mcp: AgentMcpAttachment | undefined): CodexConfig =>
  mcp?.mode === "http"
    ? {
        mcp_servers: {
          cycle: {
            bearer_token_env_var: mcpBearerTokenEnvVar,
            enabled: true,
            url: mcp.url,
          },
        },
      }
    : {};

const environmentForRequest = (
  options: CodexAgentServiceOptions,
  request: AgentTurnRequest,
): Record<string, string> => {
  const token = bearerTokenFromMcp(request.mcp);
  const entries = Object.entries({
    ...process.env,
    ...options.env,
    ...(token === undefined ? {} : { [mcpBearerTokenEnvVar]: token }),
  }).filter((entry): entry is [string, string] => typeof entry[1] === "string");

  return Object.fromEntries(entries);
};

export const cwdFromRequest = (
  request: AgentTurnRequest,
  fallback: string | undefined,
): string | undefined => {
  const cwd = request.context?.cwd;
  return typeof cwd === "string" && cwd.length > 0 ? cwd : fallback;
};

export const timeoutSignal = (
  signal: AbortSignal | undefined,
  timeoutMs: number,
): {
  readonly cleanup: () => void;
  readonly controller: AbortController;
  readonly signal: AbortSignal;
} => {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  const timeout = setTimeout(() => controller.abort(new Error("Codex turn timed out.")), timeoutMs);

  if (signal?.aborted) controller.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });

  return {
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    },
    controller,
    signal: controller.signal,
  };
};

export const buildPrompt = (request: AgentTurnRequest): string =>
  [request.instructions, inputText(request)].filter(Boolean).join("\n\n");

export const buildThreadOptions = (
  request: AgentTurnRequest,
  cwd: string | undefined,
  options: CodexAgentServiceOptions,
): ThreadOptions => ({
  approvalPolicy: "never",
  ...(cwd === undefined ? {} : { workingDirectory: cwd }),
  ...(request.model?.id === undefined ? {} : { model: request.model.id }),
  sandboxMode: options.sandboxMode ?? "read-only",
  skipGitRepoCheck: true,
});

export const buildTurnOptions = (request: AgentTurnRequest, signal: AbortSignal): TurnOptions => ({
  ...(request.responseFormat?.type === "json_schema"
    ? { outputSchema: request.responseFormat.schema }
    : {}),
  signal,
});

export const makeCodexClient = (
  options: CodexAgentServiceOptions,
  request: AgentTurnRequest,
): CodexClientLike => {
  if (typeof options.codex === "object" && options.codex !== null) return options.codex;

  const codexOptions: CodexOptions = {
    ...options.codexOptions,
    config: {
      ...options.codexOptions?.config,
      ...codexMcpConfig(request.mcp),
    },
    ...(options.executablePath === undefined ? {} : { codexPathOverride: options.executablePath }),
    env: environmentForRequest(options, request),
  };

  if (typeof options.codex === "function") return options.codex(codexOptions);

  return new Codex(codexOptions);
};

export const parseStructured = <TStructured>(
  format: AgentResponseFormat<TStructured> | undefined,
  text: string,
): TStructured | undefined => {
  if (format?.type !== "json_schema") return undefined;
  if (format.parse !== undefined) return format.parse(text);

  return JSON.parse(text) as TStructured;
};
