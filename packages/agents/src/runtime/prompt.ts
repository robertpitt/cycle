import { Context, Effect, Layer, Schema } from "effect";
import type {
  AgentPromptBundle,
  AgentRunRecord,
  AgentRunSource,
  AgentRunStartRequest,
  AgentRuntimeError,
  JsonObject,
} from "./contracts.ts";
import { AgentRuntimeFailure } from "./contracts.ts";
import type { AgentAuthorityProfile, AgentMcpConnection } from "./policy.ts";

export type AgentPromptTemplate = {
  readonly contextSchema: Schema.Schema<unknown>;
  readonly inputSchema: Schema.Schema<unknown>;
  readonly mcpPolicy: "disabled" | "optional" | "required";
  readonly outputPolicy: "final-message" | "mcp-completion" | "implementation-summary";
  readonly renderSystem: (input: AgentPromptRenderInput) => string;
  readonly renderUser: (input: AgentPromptRenderInput) => string;
  readonly supportedAuthorityModes: readonly string[];
  readonly supportedSources: readonly string[];
  readonly templateId: string;
  readonly version: string;
  readonly workspacePolicy: "implementation-worktree" | "read-only";
};

export type AgentPromptRenderInput = {
  readonly authorityProfile: AgentAuthorityProfile;
  readonly context: JsonObject;
  readonly input: JsonObject;
  readonly mcp: AgentMcpConnection | undefined;
  readonly request: AgentRunStartRequest;
  readonly run: AgentRunRecord;
};

export type PromptTemplateRegistryShape = {
  readonly get: (templateId: string) => Effect.Effect<AgentPromptTemplate, AgentRuntimeError>;
  readonly list: () => Effect.Effect<readonly AgentPromptTemplate[], AgentRuntimeError>;
};

export class PromptTemplateRegistry extends Context.Service<
  PromptTemplateRegistry,
  PromptTemplateRegistryShape
>()("@cycle/agents/PromptTemplateRegistry") {}

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

const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown);

export const makePromptTemplateRegistry = (
  templates: readonly AgentPromptTemplate[] = defaultPromptTemplates,
): PromptTemplateRegistryShape => {
  const byId = new Map(templates.map((template) => [template.templateId, template]));

  return {
    get: (templateId) => {
      const template = byId.get(templateId);
      return template === undefined
        ? Effect.fail(
            new AgentRuntimeFailure({
              code: "invalid_request",
              message: `Agent prompt template '${templateId}' is not registered.`,
              retryable: false,
            }),
          )
        : Effect.succeed(template);
    },
    list: () => Effect.succeed([...templates]),
  };
};

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

const validateTemplateSupport = (
  template: AgentPromptTemplate,
  source: AgentRunSource,
  authorityMode: string,
): Effect.Effect<void, AgentRuntimeError> => {
  if (!template.supportedSources.includes(source)) {
    return Effect.fail(
      new AgentRuntimeFailure({
        code: "invalid_request",
        message: `Prompt template '${template.templateId}' does not support source '${source}'.`,
        retryable: false,
      }),
    );
  }
  if (!template.supportedAuthorityModes.includes(authorityMode)) {
    return Effect.fail(
      new AgentRuntimeFailure({
        code: "authority_denied",
        message: `Prompt template '${template.templateId}' does not support authority '${authorityMode}'.`,
        retryable: false,
      }),
    );
  }
  return Effect.void;
};

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

const stringField = (input: JsonObject, key: string): string | undefined => {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

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

const baseSystem = (input: AgentPromptRenderInput, purpose: string): string =>
  [
    "You are Cycle's local agent runtime.",
    purpose,
    `Run id: ${input.run.runId}`,
    `Session id: ${input.run.sessionId}`,
    `Authority mode: ${input.request.authority.mode}`,
    input.authorityProfile.codebaseReadOnly
      ? "Repository code access is read-only. Do not write files or run mutating commands."
      : "Repository code access is writable only inside the configured implementation worktree.",
    input.mcp === undefined
      ? "Cycle MCP is not attached for this run."
      : "Use the attached Cycle MCP tools for ticket and repository context. Do not probe localhost manually.",
    input.mcp === undefined
      ? undefined
      : `Allowed MCP operations: ${input.mcp.scope.allowedOperations.join(", ")}`,
    input.request.authority.workspacePath === undefined
      ? undefined
      : `Workspace path: ${input.request.authority.workspacePath}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n");

const ticketLine = (input: AgentPromptRenderInput): string =>
  input.request.authority.ticketId === undefined
    ? `Repository: ${input.request.authority.repositoryId}`
    : `Ticket: cycle://repository/${input.request.authority.repositoryId}/tickets/${input.request.authority.ticketId}`;

export const defaultPromptTemplates: readonly AgentPromptTemplate[] = [
  {
    contextSchema: JsonObjectSchema,
    inputSchema: JsonObjectSchema,
    mcpPolicy: "optional",
    outputPolicy: "final-message",
    renderSystem: (input) =>
      [
        baseSystem(input, "Answer the user's chat request with concise, grounded detail."),
        stringField(input.input, "instructions"),
      ]
        .filter((part): part is string => part !== undefined)
        .join("\n\n"),
    renderUser: (input) => stringField(input.input, "message") ?? "",
    supportedAuthorityModes: ["implementation-worktree", "ticket-context"],
    supportedSources: ["chat", "manual"],
    templateId: "chat.reply",
    version: "1.0.0",
    workspacePolicy: "read-only",
  },
  {
    contextSchema: JsonObjectSchema,
    inputSchema: JsonObjectSchema,
    mcpPolicy: "required",
    outputPolicy: "final-message",
    renderSystem: (input) =>
      baseSystem(input, "Inspect the triggering ticket comment and produce a ticket-ready reply."),
    renderUser: (input) =>
      [
        ticketLine(input),
        input.request.authority.commentId === undefined
          ? undefined
          : `Triggering comment id: ${input.request.authority.commentId}`,
        stringField(input.input, "message") ?? "Inspect the ticket and triggering comment.",
      ]
        .filter((part): part is string => part !== undefined)
        .join("\n"),
    supportedAuthorityModes: ["ticket-context"],
    supportedSources: ["comment-tag", "agent-work"],
    templateId: "ticket.comment_mention",
    version: "1.0.0",
    workspacePolicy: "read-only",
  },
  {
    contextSchema: JsonObjectSchema,
    inputSchema: JsonObjectSchema,
    mcpPolicy: "required",
    outputPolicy: "mcp-completion",
    renderSystem: (input) =>
      baseSystem(
        input,
        "Scan scoped Cycle tickets for actionable work and report only concrete findings.",
      ),
    renderUser: (input) =>
      stringField(input.input, "message") ??
      `Scan repository ${input.request.authority.repositoryId} for tickets needing agent attention.`,
    supportedAuthorityModes: ["ticket-context"],
    supportedSources: ["schedule"],
    templateId: "ticket.schedule_scan",
    version: "1.0.0",
    workspacePolicy: "read-only",
  },
  {
    contextSchema: JsonObjectSchema,
    inputSchema: JsonObjectSchema,
    mcpPolicy: "required",
    outputPolicy: "final-message",
    renderSystem: (input) =>
      baseSystem(input, "Research or plan the ticket. Do not edit repository files."),
    renderUser: (input) =>
      [ticketLine(input), stringField(input.input, "message") ?? "Research the ticket."].join("\n"),
    supportedAuthorityModes: ["ticket-context"],
    supportedSources: ["agent-work", "manual"],
    templateId: "ticket.research",
    version: "1.0.0",
    workspacePolicy: "read-only",
  },
  {
    contextSchema: JsonObjectSchema,
    inputSchema: JsonObjectSchema,
    mcpPolicy: "required",
    outputPolicy: "implementation-summary",
    renderSystem: (input) =>
      baseSystem(
        input,
        "Implement the ticket in the assigned worktree. Leave branch finalization and ticket transitions to Cycle.",
      ),
    renderUser: (input) =>
      [ticketLine(input), stringField(input.input, "message") ?? "Implement the ticket."].join(
        "\n",
      ),
    supportedAuthorityModes: ["implementation-worktree"],
    supportedSources: ["agent-work", "manual"],
    templateId: "ticket.implementation",
    version: "1.0.0",
    workspacePolicy: "implementation-worktree",
  },
];

export const PromptTemplateRegistryLive = Layer.succeed(
  PromptTemplateRegistry,
  PromptTemplateRegistry.of(makePromptTemplateRegistry()),
);
