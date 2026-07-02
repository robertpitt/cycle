import { Effect, Stream } from "effect";
import { makeCodexAgentService } from "../providers/codex/service.ts";
import type { CodexAgentServiceOptions } from "../providers/codex/types.ts";
import type { AgentEvent, AgentService, JsonObject } from "../types.ts";
import type {
  AgentHarnessAdapter,
  AgentHarnessCapabilities,
  HarnessExecuteRequest,
} from "./harness.ts";
import { harnessError } from "./harness.ts";

const codexHarnessCapabilities: AgentHarnessCapabilities = {
  approvalRequests: true,
  interrupt: true,
  mcpHttp: true,
  mcpStdio: false,
  nativeThreadResume: true,
  providerNativeCodeTools: true,
  readOnlyWorkspace: true,
  sessionResume: true,
  steering: false,
  streaming: true,
  structuredOutput: true,
  usageReporting: true,
  userInputRequests: true,
  workspaceWrite: true,
};

export const makeCodexHarnessAdapter = (
  options: CodexAgentServiceOptions & {
    readonly service?: AgentService;
  } = {},
): AgentHarnessAdapter => {
  const service = options.service ?? makeCodexAgentService(options);

  return {
    capabilities: Effect.succeed(codexHarnessCapabilities),
    cancel: ({ attempt, reason, session }) =>
      Effect.tryPromise({
        try: () => service.abortTurn(session.sessionId, attempt.providerTurnId),
        catch: harnessError,
      }).pipe(
        Effect.map((result) => ({
          accepted: result.accepted,
          reason: result.reason ?? reason,
        })),
      ),
    execute: (request) => Stream.fromAsyncIterable(executeCodex(service, request), harnessError),
    harnessId: "codex",
    openSession: ({ attempt, run, session }) =>
      Effect.tryPromise({
        try: async () => {
          const providerSession = await service.resumeSession(session.sessionId);
          return {
            attemptId: attempt.attemptId,
            bindingId: `agent_provider_binding_${attempt.attemptId}`,
            createdAt: attempt.startedAt,
            harnessId: run.harnessId,
            native: jsonObject(providerSession.native ?? {}),
            providerId: run.providerId,
            runId: run.runId,
            sessionId: session.sessionId,
            status: "active" as const,
            updatedAt: attempt.startedAt,
          };
        },
        catch: harnessError,
      }),
    providerId: "codex",
    resolveInteraction: (request) =>
      Effect.tryPromise({
        try: async () => {
          const result =
            request.type === "approval"
              ? await service.respondToApproval(
                  request.sessionId,
                  request.requestId,
                  request.decision,
                )
              : await service.respondToUserInput(
                  request.sessionId,
                  request.requestId,
                  request.answers,
                );
          return { status: result.status };
        },
        catch: harnessError,
      }),
    steer: () =>
      Effect.succeed({
        accepted: false,
        reason: "Codex app-server steering is not available through this harness.",
      }),
  };
};

const executeCodex = (
  service: AgentService,
  request: HarnessExecuteRequest,
): AsyncIterable<AgentEvent> => {
  const cwd = request.authorityProfile.workspacePath ?? request.run.authority.workspacePath;

  return service.stream(request.session.sessionId, {
    context: jsonObject({
      authorityMode: request.run.authority.mode,
      jobId: request.run.authority.jobId,
      repositoryId: request.run.authority.repositoryId,
      runId: request.run.runId,
      sessionId: request.session.sessionId,
      ticketId: request.run.authority.ticketId,
      ...(cwd === undefined ? {} : { cwd }),
      workspacePath: request.run.authority.workspacePath,
    }),
    input: request.prompt.user,
    instructions: request.prompt.system,
    ...(request.mcp === undefined ? {} : { mcp: request.mcp.attachment }),
    ...(request.run.model === undefined ? {} : { model: { id: request.run.model } }),
    runtimeMode: request.authorityProfile.providerRuntimeMode,
    signal: request.signal,
    metadata: jsonObject({
      agentId: request.run.agentId,
      attemptId: request.attempt.attemptId,
      authorityMode: request.run.authority.mode,
      promptId: request.prompt.promptId,
      runId: request.run.runId,
      source: request.run.source,
    }),
  });
};

const jsonObject = (value: Readonly<Record<string, unknown>>): JsonObject =>
  Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, JsonObject[string]] =>
      isJsonValue(entry[1]),
    ),
  );

const isJsonValue = (value: unknown): value is JsonObject[string] => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
};
