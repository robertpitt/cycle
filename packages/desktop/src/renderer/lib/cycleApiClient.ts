import { AgentProvidersOutput as AgentProvidersOutputSchema } from "@cycle/api/schemas/AgentProvidersResourceEnvelope";
import { ApiErrorEnvelope as ApiErrorEnvelopeSchema } from "@cycle/api/schemas/ApiErrorEnvelope";
import {
  AutocompleteOutput as AutocompleteOutputSchema,
  type AutocompleteEntityType as ApiAutocompleteEntityType,
  type HttpAutocompleteResultOutput as ApiAutocompleteResult,
} from "@cycle/api/schemas/AutocompleteResourceEnvelope";
import { InboxPageResourceEnvelope } from "@cycle/api/schemas/InboxPageResourceEnvelope";
import { CollectionEnvelopeOf, ResourceEnvelopeOf } from "@cycle/api/schemas/shared";
import {
  ContractSchemas,
  type InboxPage,
  type RepositoryStatus,
  type TicketDocument,
  type TicketPage,
} from "@cycle/contracts";
import type {
  UseCaseAlias,
  UseCasePayloadsByAlias,
  UseCaseSuccessesByAlias,
} from "@cycle/usecases/contracts";
import { Schema } from "effect";
import {
  AppConfigState as AppConfigStateSchema,
  DEFAULT_API_PORT,
  ProfileConfig as ProfileConfigSchema,
  RepositoryRecord as AppRepositoryRecordSchema,
  type AppConfigState,
  type AgentProviderPreference,
  type InterfaceDensity,
  type ProfileConfig,
  type RepositoryRecord as AppRepositoryRecord,
  type ThemePreference,
} from "../../shared/AppConfig.ts";
import type { AgentProviderId, DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import type { UpdateRepositoryPreferencesInput } from "../../shared/LocalWorkspace.ts";
import type { CompleteOnboardingInput, ProfileUpdateInput } from "../../shared/Profile.ts";
import { getDesktopBridge } from "./desktopBridge.ts";
import {
  parseAgentTask,
  parseAgentTaskEvent,
  type AgentTask,
  type AgentTaskEvent,
  type CreateAgentTaskInput,
  type StartIssueAgentTaskInput,
} from "./agentTasks.ts";

type SupportedCycleApiAlias = Extract<
  UseCaseAlias,
  | "inbox.archive"
  | "inbox.list"
  | "inbox.markRead"
  | "inbox.markUnread"
  | "inbox.summary"
  | "repository.history.list"
  | "repository.materializationWarnings"
  | "repository.status.get"
  | "ticket.initiative.progress"
  | "ticket.issue.create"
  | "ticket.issue.archive"
  | "ticket.issue.get"
  | "ticket.issue.history"
  | "ticket.issue.list"
  | "ticket.issue.update"
  | "ticket.label.list"
  | "ticket.record.add"
  | "ticket.record.listForIssue"
  | "ticket.template.list"
  | "ticket.user.list"
  | "ticket.view.create"
  | "ticket.view.get"
  | "ticket.view.list"
>;

type ApiDiscovery = {
  readonly baseUrl: string;
  readonly profile?: Pick<ProfileConfig, "displayName" | "email">;
  readonly token?: string;
};

export type CycleApiConnection = ApiDiscovery;

type QueryInput = Readonly<Record<string, unknown>>;
type ResourceEnvelope<Data> = {
  readonly data: Data;
};
type CollectionEnvelope<Entry> = {
  readonly data: ReadonlyArray<Entry>;
  readonly page: {
    readonly nextCursor: string | null;
  };
};
type UnknownResourceEnvelope = {
  readonly data?: unknown;
};
type UnknownCollectionEnvelope = {
  readonly data?: unknown;
};
type InboxCollectionEnvelope = {
  readonly data: InboxPage["entries"];
  readonly meta: {
    readonly activeSnapshotIds: InboxPage["activeSnapshotIds"];
  };
  readonly page: {
    readonly nextCursor: string | null;
  };
};
type ApiAgentProviderProfile = (typeof AgentProvidersOutputSchema.Type)["providers"][number];

export type AutocompleteEntityType = ApiAutocompleteEntityType;
export type AutocompleteResult = ApiAutocompleteResult;

export type OpenRepositoryPathInput = {
  readonly displayName?: string;
  readonly path: string;
  readonly syncOnOpen?: boolean;
};

export type StartTicketDraftChatInput = {
  readonly instructions: string;
  readonly providerId?: AgentProviderId;
  readonly repository: Pick<AppRepositoryRecord, "displayName" | "id" | "path">;
};

export type StartTicketDraftChatResult = {
  readonly threadId: string;
};

export type StartIssueAgentChatInput = {
  readonly instructions?: string | null;
  readonly issue: Pick<TicketDocument, "id" | "status" | "title" | "type">;
  readonly model?: string | null;
  readonly providerId?: string;
  readonly repository: Pick<AppRepositoryRecord, "displayName" | "id" | "path">;
};

export type StartIssueAgentChatResult = {
  readonly threadId: string;
};

const API_URL_STORAGE_KEY = "cycle.api.baseUrl";
const API_TOKEN_STORAGE_KEY = "cycle.api.token";
const DEV_PROXY_BASE_URL = "/cycle-api";
const REPOSITORY_ISSUE_CURSOR_KEY = "__cycleRepositoryIssueCursors";
const RepositoryIssueCursorEnvelope = Schema.Struct({
  [REPOSITORY_ISSUE_CURSOR_KEY]: Schema.Record(Schema.String, Schema.String),
});

export class CycleApiRequestError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly retryable?: boolean;
  readonly status: number;

  constructor(input: {
    readonly code: string;
    readonly details?: unknown;
    readonly message: string;
    readonly requestId?: string;
    readonly retryable?: boolean;
    readonly status: number;
  }) {
    super(input.message);
    this.name = "CycleApiRequestError";
    this.code = input.code;
    this.details = input.details;
    this.requestId = input.requestId;
    this.retryable = input.retryable;
    this.status = input.status;
  }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/u, "");

const isRelativeBaseUrl = (value: string): boolean => value.startsWith("/");

const readSearchOverrides = (): Partial<ApiDiscovery> => {
  if (typeof window === "undefined") return {};

  const search = new URLSearchParams(window.location.search);
  const hashQueryStart = window.location.hash.indexOf("?");
  if (hashQueryStart >= 0) {
    const hashSearch = new URLSearchParams(window.location.hash.slice(hashQueryStart + 1));
    for (const [key, value] of hashSearch) {
      if (!search.has(key)) search.set(key, value);
    }
  }

  const baseUrl = search.get("cycleApiUrl") ?? search.get("apiUrl") ?? undefined;
  const token = search.get("cycleApiToken") ?? search.get("apiToken") ?? undefined;

  if (baseUrl !== undefined) window.localStorage.setItem(API_URL_STORAGE_KEY, baseUrl);
  if (token !== undefined) window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token);

  return {
    ...(baseUrl === undefined ? {} : { baseUrl: normalizeBaseUrl(baseUrl) }),
    ...(token === undefined ? {} : { token }),
  };
};

const readStoredOverrides = (): Partial<ApiDiscovery> => {
  if (typeof window === "undefined") return {};

  const baseUrl = window.localStorage.getItem(API_URL_STORAGE_KEY) ?? undefined;
  const token = window.localStorage.getItem(API_TOKEN_STORAGE_KEY) ?? undefined;

  return {
    ...(baseUrl === undefined ? {} : { baseUrl: normalizeBaseUrl(baseUrl) }),
    ...(token === undefined ? {} : { token }),
  };
};

const envString = (key: string): string | undefined => {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const readEnvOverrides = (): Partial<ApiDiscovery> => {
  const baseUrl = envString("VITE_CYCLE_API_URL");
  const token = envString("VITE_CYCLE_API_TOKEN");

  return {
    ...(baseUrl === undefined ? {} : { baseUrl: normalizeBaseUrl(baseUrl) }),
    ...(token === undefined ? {} : { token }),
  };
};

const discoverApi = async (): Promise<ApiDiscovery> => {
  const bridge = getDesktopBridge();
  if (bridge !== undefined) {
    try {
      const connection = await bridge.getApiConnection();
      return {
        baseUrl: normalizeBaseUrl(connection.baseUrl),
        ...(connection.profile === undefined ? {} : { profile: connection.profile }),
        token: connection.token,
      };
    } catch (error) {
      console.warn("Unable to read desktop API runtime connection.", error);
    }
  }

  const search = readSearchOverrides();
  const stored = readStoredOverrides();
  const env = readEnvOverrides();
  const baseUrl = search.baseUrl ?? stored.baseUrl ?? env.baseUrl;
  const token = search.token ?? stored.token ?? env.token;

  if (baseUrl !== undefined) {
    return {
      baseUrl,
      ...(token === undefined ? {} : { token }),
    };
  }

  if (token !== undefined) {
    return {
      baseUrl: `http://127.0.0.1:${DEFAULT_API_PORT}`,
      token,
    };
  }

  if (typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    return {
      baseUrl: DEV_PROXY_BASE_URL,
    };
  }

  return {
    baseUrl: `http://127.0.0.1:${DEFAULT_API_PORT}`,
  };
};

const requireDirectToken = (discovery: ApiDiscovery): void => {
  if (isRelativeBaseUrl(discovery.baseUrl) || discovery.token !== undefined) return;

  throw new CycleApiRequestError({
    code: "API_CREDENTIALS_UNAVAILABLE",
    message:
      "Cycle API credentials are unavailable. Open through the desktop app, use the local /cycle-api dev proxy, or provide cycleApiUrl/cycleApiToken.",
    status: 0,
  });
};

export const discoverCycleApiConnection = async (): Promise<CycleApiConnection> => {
  const discovery = await discoverApi();
  requireDirectToken(discovery);
  return discovery;
};

export const chatWebSocketUrlForConnection = (
  discovery: CycleApiConnection,
  path = "/v1/chat/ws",
): string => {
  const baseUrl = discovery.baseUrl.replace(/\/+$/u, "");
  const httpUrl = isRelativeBaseUrl(baseUrl)
    ? new URL(`${baseUrl}${path}`, window.location.origin)
    : new URL(path, baseUrl);

  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  return httpUrl.toString();
};

type ChatSocketMessage = {
  readonly commandId?: unknown;
  readonly payload?: unknown;
  readonly type?: unknown;
};

const chatRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  isRecord(value) ? value : undefined;

const chatString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const chatCommandResult = (message: ChatSocketMessage): Readonly<Record<string, unknown>> => {
  const payload = chatRecord(message.payload);
  return chatRecord(payload?.result) ?? {};
};

const chatCommandError = (message: ChatSocketMessage): Error => {
  const payload = chatRecord(message.payload);
  return new Error(chatString(payload?.message) ?? "Agent chat command failed.");
};

type StartAgentChatThreadInput = {
  readonly closedMessage: string;
  readonly commandPrefix: string;
  readonly message: string;
  readonly missingThreadMessage: string;
  readonly model?: string | null;
  readonly origin: Readonly<Record<string, unknown>>;
  readonly providerId?: string;
  readonly runtimeMode: "full-access" | "read-only" | "workspace-write";
  readonly thinkingLevel?: string;
  readonly timeoutMessage: string;
  readonly title: string;
};

const ticketDraftPrompt = ({ instructions, repository }: StartTicketDraftChatInput): string =>
  [
    `Target repository: cycle://repository/${repository.id} (${repository.displayName})`,
    "Draft a Cycle ticket for the target repository.",
    "If you are clear, go ahead and create the ticket, otherwise ask for clarification.",
    "Preserve and resolve any Cycle references from the request.",
    "User request:",
    instructions.trim(),
  ].join("\n\n");

const assignedTicketImplementationWorkflow = (): string =>
  [
    "Assigned ticket implementation workflow:",
    "1. Resolve the repository and ticket through Cycle MCP tools before making repository or ticket claims.",
    "2. Prepare a dedicated git worktree for the ticket and do the implementation work there with full read-write permissions.",
    "3. Before changing code, assign the ticket to the current user when the current user identity is available, and transition the ticket to `In Progress`.",
    "4. Complete the ticket scope. If you discover a separate out-of-scope issue, capture it as a follow-up Cycle ticket using a sub-agent when delegation is available, and continue the original task.",
    "5. After implementation, run relevant tests, commit the branch when appropriate, and push to the configured remote when possible.",
    "6. Move the ticket to `In Review`. If that status is not available through the exposed tools, create it or otherwise make it available when the tools support that operation; otherwise use the closest available workflow operation and report the limitation.",
    "7. Add a ticket comment with a handoff that includes completed work, branch or remote links, testing performed, and known limitations or follow-up tickets.",
    "Do not create a pull request as part of this workflow.",
  ].join("\n");

const issueAgentChatPrompt = ({
  instructions,
  issue,
  repository,
}: StartIssueAgentChatInput): string =>
  [
    `Target repository: cycle://repository/${repository.id} (${repository.displayName})`,
    `Ticket: cycle://repository/${repository.id}/tickets/${issue.id}`,
    `Ticket title: ${issue.title}`,
    `Ticket type: ${issue.type}`,
    `Ticket status: ${issue.status}`,
    "Work on this Cycle ticket in implementation mode.",
    assignedTicketImplementationWorkflow(),
    "Use Cycle MCP tools to inspect the ticket and repository context before making claims.",
    instructions?.trim() ? "User instructions:" : undefined,
    instructions?.trim() ? instructions.trim() : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n\n");

const startAgentChatThread = async (
  input: StartAgentChatThreadInput,
): Promise<StartTicketDraftChatResult> => {
  const connection = await discoverCycleApiConnection();

  return new Promise((resolve, reject) => {
    const pendingCommands = new Map<string, (message: ChatSocketMessage) => void>();
    const socket = new WebSocket(chatWebSocketUrlForConnection(connection));
    let commandSequence = 0;
    let settled = false;
    let threadId: string | undefined;

    const timeout = window.setTimeout(() => {
      fail(new Error(input.timeoutMessage));
    }, 15_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      pendingCommands.clear();
      socket.close();
    };

    const finish = () => {
      if (settled || threadId === undefined) return;
      settled = true;
      cleanup();
      resolve({ threadId });
    };

    function fail(error: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    const sendCommand = (
      type: string,
      payload: Readonly<Record<string, unknown>>,
      onResponse?: (message: ChatSocketMessage) => void,
    ) => {
      const commandId = `${input.commandPrefix}_${++commandSequence}`;
      if (onResponse !== undefined) pendingCommands.set(commandId, onResponse);
      socket.send(
        JSON.stringify({
          commandId,
          payload,
          type,
          version: 1,
        }),
      );
    };

    const sendTurn = () => {
      if (threadId === undefined) {
        fail(new Error(input.missingThreadMessage));
        return;
      }

      sendCommand(
        "turn.send",
        {
          message: input.message,
          ...(input.model === null || input.model === undefined ? {} : { model: input.model }),
          providerId: input.providerId ?? "codex",
          runtimeMode: input.runtimeMode,
          thinkingLevel: input.thinkingLevel ?? "medium",
          threadId,
        },
        (message) => {
          if (message.type === "command.error") {
            fail(chatCommandError(message));
            return;
          }
          finish();
        },
      );
    };

    const createThread = () => {
      sendCommand(
        "thread.create",
        {
          origin: input.origin,
          ...(input.model === null || input.model === undefined ? {} : { model: input.model }),
          providerId: input.providerId ?? "codex",
          runtimeMode: input.runtimeMode,
          thinkingLevel: input.thinkingLevel ?? "medium",
          title: input.title,
        },
        (message) => {
          if (message.type === "command.error") {
            fail(chatCommandError(message));
            return;
          }

          const thread = chatRecord(chatCommandResult(message).thread);
          threadId = chatString(thread?.id);
          if (threadId === undefined) {
            fail(new Error("Agent chat response did not include a thread id."));
            return;
          }
          sendTurn();
        },
      );
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          payload: {
            token: connection.token ?? "",
          },
          type: "connection.authenticate",
          version: 1,
        }),
      );
    };

    socket.onmessage = (event) => {
      let message: ChatSocketMessage;
      try {
        message = JSON.parse(String(event.data)) as ChatSocketMessage;
      } catch {
        fail(new Error("Agent chat returned an invalid response."));
        return;
      }

      const commandId = chatString(message.commandId);
      if (commandId !== undefined) {
        const pending = pendingCommands.get(commandId);
        if (pending !== undefined) {
          pendingCommands.delete(commandId);
          pending(message);
          return;
        }
      }

      if (message.type === "connection.ready") {
        createThread();
        return;
      }

      if (message.type === "command.error") {
        fail(chatCommandError(message));
      }
    };

    socket.onerror = () => {
      fail(new Error("Unable to connect to the agent chat runtime."));
    };

    socket.onclose = () => {
      if (!settled) {
        fail(new Error(input.closedMessage));
      }
    };
  });
};

const startTicketDraftChat = async (
  input: StartTicketDraftChatInput,
): Promise<StartTicketDraftChatResult> =>
  startAgentChatThread({
    closedMessage: "Agent chat connection closed before the ticket draft started.",
    commandPrefix: "ticket_draft",
    message: ticketDraftPrompt(input),
    missingThreadMessage: "Ticket draft chat was not created.",
    origin: {
      kind: "ticket-draft",
      label: "Ticket draft",
      repositoryId: input.repository.id,
      trigger: "create-ticket-dialog",
    },
    providerId: input.providerId,
    runtimeMode: "workspace-write",
    timeoutMessage: "Timed out while starting the ticket draft chat.",
    title: "Draft ticket",
  });

const startIssueAgentChat = async (
  input: StartIssueAgentChatInput,
): Promise<StartIssueAgentChatResult> =>
  startAgentChatThread({
    closedMessage: "Agent chat connection closed before the ticket work chat started.",
    commandPrefix: "ticket_work",
    message: issueAgentChatPrompt(input),
    missingThreadMessage: "Ticket work chat was not created.",
    model: input.model,
    origin: {
      issueId: input.issue.id,
      kind: "ticket-agent-work",
      label: `Work on ${input.issue.id}`,
      repositoryId: input.repository.id,
      ticketId: input.issue.id,
      trigger: "ticket-view",
    },
    providerId: input.providerId,
    runtimeMode: "full-access",
    timeoutMessage: "Timed out while starting the ticket work chat.",
    title: `Work on ${input.issue.id}`,
  });

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const readJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.length === 0) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CycleApiRequestError({
      code: "INVALID_API_RESPONSE",
      message: "Cycle API returned invalid JSON.",
      status: response.status,
    });
  }
};

const decodeApiResponse = <S extends Schema.Top>(
  schema: S,
  value: unknown,
  status: number,
  path: string,
): S["Type"] => {
  try {
    return (
      Schema.decodeUnknownSync(schema as never, StrictDecodeOptions) as (
        input: unknown,
      ) => S["Type"]
    )(value);
  } catch (error) {
    throw new CycleApiRequestError({
      code: "INVALID_API_RESPONSE",
      details: {
        parseError: String(error),
        path,
      },
      message: "Cycle API response did not match the expected schema.",
      status,
    });
  }
};

const decodeApiErrorResponse = (
  value: unknown,
  status: number,
  path: string,
): typeof ApiErrorEnvelopeSchema.Type => {
  try {
    return Schema.decodeUnknownSync(ApiErrorEnvelopeSchema, StrictDecodeOptions)(value);
  } catch (error) {
    throw new CycleApiRequestError({
      code: "INVALID_API_RESPONSE",
      details: {
        parseError: String(error),
        path,
      },
      message: "Cycle API error response did not match the expected schema.",
      status,
    });
  }
};

const cleanHeaderValue = (value: string): string | undefined => {
  const cleaned = value.replace(/[\r\n]+/gu, " ").trim();
  return cleaned.length === 0 ? undefined : cleaned;
};

const addActorHeaders = (
  headers: Headers,
  profile: Pick<ProfileConfig, "displayName" | "email"> | undefined,
): void => {
  if (profile === undefined) return;

  headers.set("x-cycle-actor-type", "human");
  headers.set("x-cycle-source", "desktop");
  headers.set("x-cycle-actor-name", cleanHeaderValue(profile.displayName) ?? "Cycle User");

  const email = cleanHeaderValue(profile.email);
  if (email !== undefined) headers.set("x-cycle-actor-email", email);
};

const request = async <S extends Schema.Top>(
  method: string,
  path: string,
  schema: S,
  body?: unknown,
): Promise<S["Type"]> => {
  const discovery = await discoverApi();
  requireDirectToken(discovery);

  const headers = new Headers({
    accept: "application/json",
  });
  addActorHeaders(headers, discovery.profile);
  if (discovery.token !== undefined) headers.set("authorization", `Bearer ${discovery.token}`);
  if (body !== undefined) headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${discovery.baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
  } catch {
    throw new CycleApiRequestError({
      code: "API_UNAVAILABLE",
      message: "Cycle API is not reachable.",
      status: 0,
    });
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const apiError = decodeApiErrorResponse(payload, response.status, path);
    throw new CycleApiRequestError({
      code: apiError.error?.code ?? `HTTP_${response.status}`,
      details: apiError.error?.details,
      message: apiError.error?.message ?? "Cycle API request failed.",
      requestId: apiError.error?.requestId,
      retryable: apiError.error?.retryable,
      status: response.status,
    });
  }

  return decodeApiResponse(schema, payload, response.status, path);
};

const resource = async <S extends Schema.Top>(
  method: string,
  path: string,
  dataSchema: S,
  body?: unknown,
): Promise<S["Type"]> => {
  const response = (await request(
    method,
    path,
    ResourceEnvelopeOf(dataSchema),
    body,
  )) as ResourceEnvelope<S["Type"]>;
  return response.data;
};

const resourceOrNull = async <S extends Schema.Top>(
  method: string,
  path: string,
  dataSchema: S,
  body?: unknown,
): Promise<S["Type"] | null> => {
  try {
    return await resource(method, path, dataSchema, body);
  } catch (error) {
    if (error instanceof CycleApiRequestError && error.status === 404) return null;
    throw error;
  }
};

const unknownResource = async (method: string, path: string, body?: unknown): Promise<unknown> => {
  const response = (await request(
    method,
    path,
    ResourceEnvelopeOf(Schema.Unknown),
    body,
  )) as UnknownResourceEnvelope;
  return response.data;
};

const unknownResourceOrNull = async (
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown | null> => {
  try {
    return await unknownResource(method, path, body);
  } catch (error) {
    if (error instanceof CycleApiRequestError && error.status === 404) return null;
    throw error;
  }
};

const unknownCollection = async (
  method: string,
  path: string,
  body?: unknown,
): Promise<ReadonlyArray<unknown>> => {
  const response = (await request(
    method,
    path,
    CollectionEnvelopeOf(Schema.Unknown),
    body,
  )) as UnknownCollectionEnvelope;
  return Array.isArray(response.data) ? response.data : [];
};

const collection = async <S extends Schema.Top>(
  method: string,
  path: string,
  entrySchema: S,
  body?: unknown,
): Promise<ReadonlyArray<S["Type"]>> => {
  const response = (await request(
    method,
    path,
    CollectionEnvelopeOf(entrySchema),
    body,
  )) as CollectionEnvelope<S["Type"]>;
  return response.data;
};

const page = async <S extends Schema.Top>(
  method: string,
  path: string,
  entrySchema: S,
  body?: unknown,
): Promise<{ readonly entries: ReadonlyArray<S["Type"]>; readonly nextCursor?: string }> => {
  const response = (await request(
    method,
    path,
    CollectionEnvelopeOf(entrySchema),
    body,
  )) as CollectionEnvelope<S["Type"]>;
  const nextCursor = response.page?.nextCursor;

  return {
    entries: response.data,
    ...(typeof nextCursor === "string" ? { nextCursor } : {}),
  };
};

const inboxPage = async (path: string): Promise<InboxPage> => {
  const response = (await request(
    "GET",
    path,
    InboxPageResourceEnvelope,
  )) as InboxCollectionEnvelope;
  const nextCursor = response.page.nextCursor;

  return {
    activeSnapshotIds: response.meta.activeSnapshotIds,
    entries: response.data,
    ...(typeof nextCursor === "string" ? { nextCursor } : {}),
  };
};

const encodeSegment = (value: string): string => encodeURIComponent(value);

const repositoryPath = (repositoryId: string): string =>
  `/v1/repositories/${encodeSegment(repositoryId)}`;

const inboxPath = "/v1/inbox";

const withQuery = (path: string, query: QueryInput = {}): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    appendQueryParam(params, key, value);
  }

  const encoded = params.toString();
  return encoded.length === 0 ? path : `${path}?${encoded}`;
};

const appendQueryParam = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    if (value.length === 0) return;
    params.set(queryParamName(key), value.map(String).join(","));
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    params.set(queryParamName(key), String(value));
  }
};

const queryParamName = (key: string): string => {
  switch (key) {
    case "cursor":
      return "page[cursor]";
    case "limit":
      return "page[limit]";
    case "text":
      return "q";
    case "labelIn":
      return "filter[label][in]";
    case "priorityIn":
      return "filter[priority][in]";
    case "statusIn":
      return "filter[status][in]";
    case "assigneeIn":
      return "filter[assignee][in]";
    case "repositoryIds":
      return "filter[repository][in]";
    case "originKind":
      return "filter[originKind]";
    case "repositoryId":
      return "filter[repositoryId]";
    case "types":
      return "filter[type][in]";
    case "userId":
      return "filter[userId]";
    case "orderBy":
      return "sort[field]";
    case "orderDirection":
      return "sort[direction]";
    case "active":
    case "archived":
    case "assignee":
    case "blocked":
    case "createdAfter":
    case "createdBefore":
    case "deleted":
    case "disabled":
    case "dueAfter":
    case "dueBefore":
    case "estimate":
    case "hasAssignee":
    case "hasDueDate":
    case "hasEstimate":
    case "hasLabels":
    case "includeSourceInactive":
    case "kind":
    case "label":
    case "parent":
    case "pinned":
    case "priority":
    case "recordType":
    case "reason":
    case "staleBefore":
    case "status":
    case "ticketId":
    case "type":
    case "updatedAfter":
    case "updatedBefore":
      return `filter[${key}]`;
    default:
      return key;
  }
};

const repositoryIdFromPayload = (payload: unknown): string => {
  const repository = isRecord(payload) ? payload.repository : undefined;
  const repositoryId = isRecord(repository) ? repository.id : undefined;

  if (typeof repositoryId === "string" && repositoryId.length > 0) return repositoryId;
  throw new Error("Cycle API request payload must include repository.id.");
};

const inputFromPayload = <T>(payload: unknown, fallback: T): T => {
  const input = isRecord(payload) ? payload.input : undefined;
  return input === undefined ? fallback : (input as T);
};

const issueIdFromInput = (input: unknown): string => {
  const issueId = isRecord(input) ? input.id : undefined;
  if (typeof issueId === "string" && issueId.length > 0) return issueId;
  throw new Error("Cycle API issue request must include input.id.");
};

const viewIdFromInput = (input: unknown): string => {
  const viewId = isRecord(input) ? input.id : undefined;
  if (typeof viewId === "string" && viewId.length > 0) return viewId;
  throw new Error("Cycle API view request must include input.id.");
};

const initiativeIdFromInput = (input: unknown): string => {
  const initiativeId = isRecord(input) ? input.id : undefined;
  if (typeof initiativeId === "string" && initiativeId.length > 0) return initiativeId;
  throw new Error("Cycle API initiative request must include input.id.");
};

const listIssuesForRepository = (repositoryId: string, query: QueryInput): Promise<TicketPage> =>
  page(
    "GET",
    withQuery(`${repositoryPath(repositoryId)}/issues`, query),
    ContractSchemas.TicketDocument,
  );

const listIssuesForRepositories = async (
  repositoryIds: ReadonlyArray<string>,
  query: QueryInput,
): Promise<TicketPage> => {
  const repositoryCursor = decodeRepositoryIssueCursor(query.cursor);
  const fallbackCursor = repositoryCursor === undefined ? query.cursor : undefined;
  const { cursor: _cursor, ...baseQuery } = query;
  const pages = await Promise.all(
    repositoryIds.map(async (repositoryId) => {
      const cursor =
        repositoryCursor === undefined ? fallbackCursor : repositoryCursor[repositoryId];

      if (repositoryCursor !== undefined && cursor === undefined) return undefined;

      const page = await listIssuesForRepository(repositoryId, {
        ...baseQuery,
        ...(typeof cursor === "string" ? { cursor } : {}),
      });

      return {
        page,
        repositoryId,
      };
    }),
  );
  const nextCursors = Object.fromEntries(
    pages.flatMap((entry) =>
      entry?.page.nextCursor === undefined ? [] : [[entry.repositoryId, entry.page.nextCursor]],
    ),
  );
  const nextCursor = encodeRepositoryIssueCursor(nextCursors);

  return {
    entries: sortIssueEntries(
      pages.flatMap((entry) => entry?.page.entries ?? []),
      query,
    ),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
};

const sortIssueEntries = (
  entries: ReadonlyArray<TicketDocument>,
  query: QueryInput,
): ReadonlyArray<TicketDocument> => {
  const orderBy =
    query.orderBy === "createdAt" ||
    query.orderBy === "dueDate" ||
    query.orderBy === "priority" ||
    query.orderBy === "title" ||
    query.orderBy === "updatedAt"
      ? query.orderBy
      : "updatedAt";
  const direction = query.orderDirection === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    const compared = compareIssueSortValue(
      issueSortValue(left, orderBy),
      issueSortValue(right, orderBy),
    );
    return compared * direction;
  });
};

const issueSortValue = (
  issue: TicketDocument,
  orderBy: "createdAt" | "dueDate" | "priority" | "title" | "updatedAt",
): string | number => {
  switch (orderBy) {
    case "createdAt":
      return issue.frontmatter.createdAt ?? "";
    case "dueDate":
      return issue.frontmatter.dueDate ?? "";
    case "priority":
      return priorityRank(issue.frontmatter.priority ?? issue.priority);
    case "title":
      return issue.title.toLocaleLowerCase();
    case "updatedAt":
      return issue.frontmatter.updatedAt ?? issue.updatedDate ?? "";
  }
};

const priorityRank = (priority: string | undefined): number => {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "medium":
    case "normal":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
};

const compareIssueSortValue = (left: string | number, right: string | number): number => {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
};

const repositoryIdsFromIssueQuery = (query: QueryInput): ReadonlyArray<string> | undefined => {
  const repositoryIds = query.repositoryIds;
  if (!Array.isArray(repositoryIds)) return undefined;

  const normalized = repositoryIds.filter(
    (repositoryId): repositoryId is string =>
      typeof repositoryId === "string" && repositoryId.length > 0,
  );

  return normalized.length === 0 ? undefined : [...new Set(normalized)].sort();
};

const withoutRepositoryIds = (query: QueryInput): QueryInput => {
  const { repositoryIds: _repositoryIds, ...rest } = query;
  return rest;
};

export const decodeRepositoryIssueCursor = (
  cursor: unknown,
): Readonly<Record<string, string>> | undefined => {
  if (typeof cursor !== "string") return undefined;

  try {
    const parsed = Schema.decodeUnknownSync(
      RepositoryIssueCursorEnvelope,
      StrictDecodeOptions,
    )(JSON.parse(cursor) as unknown);
    const cursors = parsed[REPOSITORY_ISSUE_CURSOR_KEY];

    return Object.fromEntries(
      Object.entries(cursors).filter((entry): entry is [string, string] => entry[1].length > 0),
    );
  } catch {
    return undefined;
  }
};

const encodeRepositoryIssueCursor = (
  cursors: Readonly<Record<string, string>>,
): string | undefined => {
  const entries = Object.entries(cursors).filter(([, cursor]) => cursor.length > 0);
  if (entries.length === 0) return undefined;

  return JSON.stringify({
    [REPOSITORY_ISSUE_CURSOR_KEY]: Object.fromEntries(entries),
  });
};

const addIssueRecord = async (repositoryId: string, input: QueryInput): Promise<unknown> => {
  const issueId = typeof input.issueId === "string" ? input.issueId : undefined;
  if (issueId === undefined || issueId.length === 0) {
    throw new Error("Cycle API record request must include input.issueId.");
  }

  return resource(
    "POST",
    `${repositoryPath(repositoryId)}/issues/${encodeSegment(issueId)}/records`,
    ContractSchemas.LinkedRecord,
    {
      payload: input.payload,
      recordType: input.recordType,
      userVisible: input.userVisible,
    },
  );
};

const detectedAgentProviderFromProfile = (
  profile: ApiAgentProviderProfile,
): DetectedAgentProvider => ({
  activeRunCount: profile.activeRunCount,
  capabilities: profile.capabilities,
  configuration: profile.configuration,
  configurationSchema: profile.configurationSchema,
  configuredExecutablePath: profile.configuredExecutablePath,
  detectedAt: profile.checkedAt,
  defaultModel: profile.defaultModel,
  defaultReasoningEffortId: profile.defaultReasoningEffortId,
  executable: profile.executableName,
  ...(profile.executablePath === undefined ? {} : { executablePath: profile.executablePath }),
  id: profile.provider,
  maxConcurrentRuns: profile.maxConcurrentRuns,
  message: profile.message,
  models: profile.models,
  name: profile.displayName,
  packageName: profile.packageName,
  reasoningEfforts: profile.reasoningEfforts,
  status: profile.status,
});

export const cycleApiClient = {
  autocomplete: async (input: {
    readonly limit?: number;
    readonly query?: string;
    readonly types?: readonly AutocompleteEntityType[];
  }): Promise<readonly AutocompleteResult[]> => {
    const response = await resource(
      "GET",
      withQuery("/v1/autocomplete", {
        limit: input.limit,
        q: input.query,
        "filter[type][in]": input.types,
      }),
      AutocompleteOutputSchema,
    );
    return response.results;
  },

  completeOnboarding: (input: CompleteOnboardingInput): Promise<AppConfigState> =>
    resource("POST", "/v1/profile/onboarding", AppConfigStateSchema, input),

  getAppConfig: (): Promise<AppConfigState> =>
    resource("GET", "/v1/app-config", AppConfigStateSchema),

  updateAgentProviderPreference: (
    providerId: AgentProviderId,
    preference: Partial<Omit<AgentProviderPreference, "id">>,
  ): Promise<AppConfigState> =>
    resource(
      "PATCH",
      `/v1/agents/providers/${encodeSegment(providerId)}/preferences`,
      AppConfigStateSchema,
      { preference },
    ),

  listAgentProviders: async (): Promise<ReadonlyArray<DetectedAgentProvider>> => {
    const response = await resource("GET", "/v1/agents/providers", AgentProvidersOutputSchema);
    return response.providers.map(detectedAgentProviderFromProfile);
  },

  startTicketDraftChat,
  startIssueAgentChat,

  createAgentTask: async (input: CreateAgentTaskInput): Promise<AgentTask | null> =>
    parseAgentTask(await unknownResource("POST", "/v1/agent-tasks", input)),

  startIssueAgentTask: async (
    repositoryId: string,
    issueId: string,
    input: StartIssueAgentTaskInput,
  ): Promise<AgentTask | null> =>
    parseAgentTask(
      await unknownResource(
        "POST",
        `${repositoryPath(repositoryId)}/issues/${encodeSegment(issueId)}/agent-tasks`,
        {
          ...input,
          instructions: input.instructions ?? undefined,
          model: input.model ?? undefined,
        },
      ),
    ),

  listAgentTasks: async (query: QueryInput = {}): Promise<ReadonlyArray<AgentTask>> =>
    (await unknownCollection("GET", withQuery("/v1/agent-tasks", query))).flatMap((entry) => {
      const task = parseAgentTask(entry);
      return task ? [task] : [];
    }),

  getAgentTask: async (taskId: string): Promise<AgentTask | null> =>
    parseAgentTask(await unknownResourceOrNull("GET", `/v1/agent-tasks/${encodeSegment(taskId)}`)),

  listAgentTaskEvents: async (
    taskId: string,
    query: QueryInput = {},
  ): Promise<ReadonlyArray<AgentTaskEvent>> =>
    (
      await unknownCollection(
        "GET",
        withQuery(`/v1/agent-tasks/${encodeSegment(taskId)}/events`, query),
      )
    ).flatMap((entry) => {
      const event = parseAgentTaskEvent(entry);
      return event ? [event] : [];
    }),

  cancelAgentTask: async (taskId: string): Promise<AgentTask | null> =>
    parseAgentTask(
      await unknownResource("POST", `/v1/agent-tasks/${encodeSegment(taskId)}/cancel`, {}),
    ),

  retryAgentTask: async (taskId: string): Promise<AgentTask | null> =>
    parseAgentTask(
      await unknownResource("POST", `/v1/agent-tasks/${encodeSegment(taskId)}/retry`, {}),
    ),

  openRepositoryPath: (input: OpenRepositoryPathInput): Promise<RepositoryStatus> =>
    resource("POST", "/v1/repositories", ContractSchemas.RepositoryStatus, input),

  pushRepository: (repositoryId: string): Promise<RepositoryStatus> =>
    resource("POST", `${repositoryPath(repositoryId)}/push`, ContractSchemas.RepositoryStatus),

  removeRepository: (repositoryId: string): Promise<AppConfigState> =>
    resource("DELETE", repositoryPath(repositoryId), AppConfigStateSchema),

  setThemePreference: (preference: ThemePreference): Promise<AppConfigState> =>
    resource("PATCH", "/v1/theme", AppConfigStateSchema, { preference }),

  setInterfaceDensity: (density: InterfaceDensity): Promise<AppConfigState> =>
    resource("PATCH", "/v1/appearance/density", AppConfigStateSchema, { density }),

  syncRepository: (repositoryId: string): Promise<RepositoryStatus> =>
    resource("POST", `${repositoryPath(repositoryId)}/sync`, ContractSchemas.RepositoryStatus),

  updateProfile: (input: ProfileUpdateInput): Promise<ProfileConfig> =>
    resource("PATCH", "/v1/profile", ProfileConfigSchema, input),

  updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ): Promise<AppRepositoryRecord | null> =>
    resource(
      "PATCH",
      `${repositoryPath(input.id)}/preferences`,
      Schema.NullOr(AppRepositoryRecordSchema),
      {
        preferences: input.preferences,
      },
    ),

  call: async <Alias extends SupportedCycleApiAlias>(
    alias: Alias,
    payload: UseCasePayloadsByAlias[Alias],
  ): Promise<UseCaseSuccessesByAlias[Alias]> => {
    const input = inputFromPayload<QueryInput>(payload, {});

    switch (alias) {
      case "inbox.list":
        return inboxPage(withQuery(inboxPath, payload as QueryInput)) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "inbox.summary":
        return resource(
          "GET",
          withQuery(`${inboxPath}/summary`, payload as QueryInput),
          ContractSchemas.InboxSummary,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "inbox.markRead":
        return resource(
          "POST",
          `${inboxPath}/read`,
          ContractSchemas.InboxMutationResult,
          payload,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "inbox.markUnread":
        return resource(
          "POST",
          `${inboxPath}/unread`,
          ContractSchemas.InboxMutationResult,
          payload,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "inbox.archive":
        return resource(
          "POST",
          `${inboxPath}/archive`,
          ContractSchemas.InboxMutationResult,
          payload,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
    }

    const repositoryId = repositoryIdFromPayload(payload);
    const base = repositoryPath(repositoryId);

    switch (alias) {
      case "repository.status.get":
        return resource("GET", base, ContractSchemas.RepositoryStatus) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "repository.materializationWarnings":
        return collection(
          "GET",
          `${base}/warnings`,
          ContractSchemas.MaterializationWarning,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "repository.history.list":
        return page(
          "GET",
          withQuery(`${base}/history`, input),
          ContractSchemas.HistoryCommit,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.issue.list": {
        const repositoryIds = repositoryIdsFromIssueQuery(input);
        const query = withoutRepositoryIds(input);

        return (
          repositoryIds === undefined
            ? listIssuesForRepository(repositoryId, query)
            : listIssuesForRepositories(repositoryIds, query)
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.issue.create":
        return resource("POST", `${base}/issues`, ContractSchemas.TicketDocument, input) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "ticket.issue.get": {
        const issueId = issueIdFromInput(input);
        return resourceOrNull(
          "GET",
          `${base}/issues/${encodeSegment(issueId)}`,
          ContractSchemas.TicketDocument,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.issue.update": {
        const issueId = issueIdFromInput(input);
        const patch = isRecord(input) ? input.patch : {};
        return resource(
          "PATCH",
          `${base}/issues/${encodeSegment(issueId)}`,
          ContractSchemas.TicketDocument,
          patch,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.issue.archive": {
        const issueId = issueIdFromInput(input);
        const reason =
          isRecord(input) && typeof input.reason === "string" ? input.reason : undefined;
        return resource(
          "POST",
          `${base}/issues/${encodeSegment(issueId)}/archive`,
          ContractSchemas.TicketDocument,
          reason === undefined ? {} : { reason },
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.issue.history": {
        const issueId = issueIdFromInput(input);
        const options = isRecord(input.options) ? input.options : {};
        return page(
          "GET",
          withQuery(`${base}/issues/${encodeSegment(issueId)}/history`, options),
          ContractSchemas.HistoryCommit,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.record.listForIssue": {
        const issueId = typeof input.issueId === "string" ? input.issueId : undefined;
        if (issueId === undefined || issueId.length === 0) {
          throw new Error("Cycle API record list request must include input.issueId.");
        }
        const query = isRecord(input.query) ? input.query : {};
        return page(
          "GET",
          withQuery(`${base}/issues/${encodeSegment(issueId)}/records`, query),
          ContractSchemas.LinkedRecord,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.record.add":
        return addIssueRecord(repositoryId, input) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.user.list":
        return page(
          "GET",
          withQuery(`${base}/users`, input),
          ContractSchemas.UserProfileDocument,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.label.list":
        return page(
          "GET",
          withQuery(`${base}/labels`, input),
          ContractSchemas.LabelDefinitionDocument,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.view.list":
        return page(
          "GET",
          withQuery(`${base}/views`, input),
          ContractSchemas.SavedViewDocument,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.view.create":
        return resource(
          "POST",
          `${base}/views`,
          ContractSchemas.SavedViewDocument,
          input,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.view.get": {
        const viewId = viewIdFromInput(input);
        return resourceOrNull(
          "GET",
          `${base}/views/${encodeSegment(viewId)}`,
          ContractSchemas.SavedViewDocument,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.template.list":
        return page(
          "GET",
          withQuery(`${base}/templates`, input),
          ContractSchemas.IssueTemplateDocument,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.initiative.progress": {
        const initiativeId = initiativeIdFromInput(input);
        return resource(
          "GET",
          `${base}/initiatives/${encodeSegment(initiativeId)}/progress`,
          ContractSchemas.InitiativeProgress,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      default:
        throw new Error(`Unsupported Cycle API renderer alias: ${alias}`);
    }
  },

  listRepositories: (): Promise<ReadonlyArray<RepositoryStatus>> =>
    collection("GET", "/v1/repositories", ContractSchemas.RepositoryStatus),
};
