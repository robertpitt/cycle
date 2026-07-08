import { Context, Effect, Layer, Schema } from "effect";
import type { AgentRunRecord, AgentRunStartRequest, JsonObject } from "./AgentRuntimeContracts.ts";
import { AgentRuntimeFailure, type AgentRuntimeError } from "./errors/index.ts";
import type { AgentAuthorityProfile } from "./AgentAuthorityPolicy.ts";
import type { AgentMcpConnection } from "./AgentMcpConnector.ts";

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
  readonly list: Effect.Effect<readonly AgentPromptTemplate[], AgentRuntimeError>;
};

export class PromptTemplateRegistry extends Context.Service<
  PromptTemplateRegistry,
  PromptTemplateRegistryShape
>()("@cycle/agents/PromptTemplateRegistry") {}

const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown);

export const makePromptTemplateRegistry = (
  templates: readonly AgentPromptTemplate[] = defaultPromptTemplates,
): PromptTemplateRegistryShape => {
  const byId = new Map(templates.map((template) => [template.templateId, template]));

  return {
    get: (templateId) => {
      const template = byId.get(templateId);
      return template === undefined
        ? Effect.fail(promptTemplateNotRegistered(templateId))
        : Effect.succeed(template);
    },
    list: Effect.sync(() => [...templates]),
  };
};

const promptTemplateNotRegistered = (templateId: string): AgentRuntimeError =>
  new AgentRuntimeFailure({
    code: "invalid_request",
    message: `Agent prompt template '${templateId}' is not registered.`,
    retryable: false,
  });

const stringField = (input: JsonObject, key: string): string | undefined => {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

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
