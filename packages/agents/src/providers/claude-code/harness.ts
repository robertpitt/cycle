import { Effect, Stream } from "effect";
import type { AgentEvent, AgentService, JsonObject } from "../../types.ts";
import type {
  AgentHarnessAdapter,
  AgentHarnessCapabilities,
  HarnessExecuteRequest,
} from "../../runtime/harness.ts";
import { harnessError } from "../../runtime/harness.ts";
import { makeClaudeCodeAgentService, type ClaudeCodeAgentServiceOptions } from "./service.ts";
import { claudeCodeProviderId } from "./constants.ts";

const claudeCodeHarnessCapabilities: AgentHarnessCapabilities = {
  approvalRequests: true,
  interrupt: true,
  mcpHttp: true,
  mcpStdio: true,
  nativeThreadResume: true,
  providerNativeCodeTools: true,
  readOnlyWorkspace: true,
  sessionResume: true,
  steering: false,
  streaming: true,
  structuredOutput: true,
  usageReporting: true,
  userInputRequests: false,
  workspaceWrite: true,
};

export const makeClaudeCodeHarnessAdapter = (
  options: ClaudeCodeAgentServiceOptions & {
    readonly service?: AgentService;
  } = {},
): AgentHarnessAdapter => {
  const service = options.service ?? makeClaudeCodeAgentService(options);

  return {
    capabilities: Effect.succeed(claudeCodeHarnessCapabilities),
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
    execute: (request) =>
      Stream.fromAsyncIterable(executeClaudeCode(service, request), harnessError),
    harnessId: claudeCodeProviderId,
    openSession: ({ attempt, run, session }) =>
      Effect.tryPromise({
        try: async () => {
          await service.resumeSession(session.sessionId);
          return {
            attemptId: attempt.attemptId,
            bindingId: `agent_provider_binding_${attempt.attemptId}`,
            createdAt: attempt.startedAt,
            harnessId: run.harnessId,
            native: jsonObject({
              providerSessionId: session.sessionId,
            }),
            providerId: run.providerId,
            runId: run.runId,
            sessionId: session.sessionId,
            status: "active" as const,
            updatedAt: attempt.startedAt,
          };
        },
        catch: harnessError,
      }),
    providerId: claudeCodeProviderId,
    resolveInteraction: () => Effect.succeed({ status: "not_found" }),
    steer: () =>
      Effect.succeed({
        accepted: false,
        reason: "Claude Code steering is not available through this harness yet.",
      }),
  };
};

const executeClaudeCode = (
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
  JSON.parse(JSON.stringify(value)) as JsonObject;
