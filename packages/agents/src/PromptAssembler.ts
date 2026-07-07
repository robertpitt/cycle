import { Context, Effect, Layer, Schema } from "effect";
import type {
  AgentPromptBundle,
  AgentRunRecord,
  AgentRunSource,
  AgentRunStartRequest,
  JsonObject,
} from "./AgentRuntimeContracts.ts";
import { AgentRuntimeFailure, type AgentRuntimeError } from "./errors/index.ts";
import type { AgentAuthorityProfile } from "./AgentAuthorityPolicy.ts";
import type { AgentMcpConnection } from "./AgentMcpConnector.ts";
import {
  PromptTemplateRegistry,
  type AgentPromptRenderInput,
  type AgentPromptTemplate,
  type PromptTemplateRegistryShape,
} from "./PromptTemplateRegistry.ts";

export type PromptAssemblerShape = {
  readonly assemble: (input: {
    readonly authorityProfile: AgentAuthorityProfile;
    readonly mcp?: AgentMcpConnection;
    readonly request: AgentRunStartRequest;
    readonly run: AgentRunRecord;
  }) => Effect.Effect<AgentPromptBundle, AgentRuntimeError>;
};

export class PromptAssembler extends Context.Service<PromptAssembler, PromptAssemblerShape>()(
  "@cycle/agents/PromptAssembler",
) {}

export const makePromptAssembler = (
  registry: PromptTemplateRegistryShape,
  now: () => Date,
  makeId: (prefix: string) => string,
): PromptAssemblerShape => ({
  assemble: ({ authorityProfile, mcp, request, run }) =>
    Effect.gen(function* () {
      const template = yield* registry.get(request.prompt.templateId);
      yield* validateTemplateSupport(template, request.source, request.authority.mode);

      const decodedInput = yield* Schema.decodeUnknownEffect(template.inputSchema)(
        request.prompt.input,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new AgentRuntimeFailure({
              cause,
              code: "invalid_request",
              message: `Invalid input for agent prompt template '${template.templateId}'.`,
              retryable: false,
            }),
        ),
      ) as Effect.Effect<unknown, AgentRuntimeError>;
      const context = promptContext({ authorityProfile, mcp, request, run });
      yield* Schema.decodeUnknownEffect(template.contextSchema)(context).pipe(
        Effect.mapError(
          (cause) =>
            new AgentRuntimeFailure({
              cause,
              code: "invalid_request",
              message: `Invalid context for agent prompt template '${template.templateId}'.`,
              retryable: false,
            }),
        ),
      ) as Effect.Effect<unknown, AgentRuntimeError>;

      const renderInput: AgentPromptRenderInput = {
        authorityProfile,
        context,
        input: toJsonObject(decodedInput),
        mcp,
        request,
        run,
      };
      const system = template.renderSystem(renderInput);
      const user = template.renderUser(renderInput);

      return {
        context,
        createdAt: now().toISOString(),
        promptId: makeId("agent_prompt"),
        redactedSystemPreview: preview(redact(system)),
        redactedUserPreview: preview(redact(user)),
        system,
        systemHash: stableHash(redact(system)),
        templateId: template.templateId,
        templateVersion: template.version,
        user,
        userHash: stableHash(redact(user)),
      };
    }),
});

export const PromptAssemblerLive = (options: {
  readonly makeId: (prefix: string) => string;
  readonly now: () => Date;
}) =>
  Layer.effect(
    PromptAssembler,
    Effect.gen(function* () {
      const registry = yield* PromptTemplateRegistry;
      return PromptAssembler.of(makePromptAssembler(registry, options.now, options.makeId));
    }),
  );

const validateTemplateSupport = Effect.fn("validateTemplateSupport")(function* (
  template: AgentPromptTemplate,
  source: AgentRunSource,
  authorityMode: string,
) {
  if (!template.supportedSources.includes(source)) {
    return yield* new AgentRuntimeFailure({
      code: "invalid_request",
      message: `Prompt template '${template.templateId}' does not support source '${source}'.`,
      retryable: false,
    });
  }
  if (!template.supportedAuthorityModes.includes(authorityMode)) {
    return yield* new AgentRuntimeFailure({
      code: "authority_denied",
      message: `Prompt template '${template.templateId}' does not support authority '${authorityMode}'.`,
      retryable: false,
    });
  }
});

const promptContext = (input: {
  readonly authorityProfile: AgentAuthorityProfile;
  readonly mcp?: AgentMcpConnection;
  readonly request: AgentRunStartRequest;
  readonly run: AgentRunRecord;
}): JsonObject => ({
  agentId: input.request.agent.agentId,
  authorityMode: input.request.authority.mode,
  codebaseReadOnly: input.authorityProfile.codebaseReadOnly,
  harnessId: input.run.harnessId,
  mcpAttached: input.mcp !== undefined,
  mcpScope: input.mcp?.scope,
  model: input.run.model,
  providerId: input.run.providerId,
  repositoryId: input.request.authority.repositoryId,
  runId: input.run.runId,
  sessionId: input.run.sessionId,
  source: input.request.source,
  ticketId: input.request.authority.ticketId,
  workspacePath: input.request.authority.workspacePath,
  workspaceWrite: input.authorityProfile.workspaceWrite,
});

const toJsonObject = (value: unknown): JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : {};

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const preview = (value: string): string =>
  value.length > 1200 ? `${value.slice(0, 1200)}...` : value;

const redact = (value: string): string =>
  value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, "Bearer [redacted]")
    .replace(/(token|secret|password|api[_-]?key)=\S+/giu, "$1=[redacted]");

