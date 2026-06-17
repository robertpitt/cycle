import type {
  InboxMutationResult,
  InboxPage,
  InboxSummary,
  MaterializationWarning,
  RepositoryStatus,
  SavedViewDocument,
  TicketDocument,
  TicketPage,
} from "@cycle/contracts";
import type {
  UseCaseAlias,
  UseCasePayloadsByAlias,
  UseCaseSuccessesByAlias,
} from "@cycle/contracts/contracts";
import { DEFAULT_API_PORT } from "../../shared/AppConfig.ts";
import { getDesktopBridge } from "./desktopBridge.ts";

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
  readonly token?: string;
};

export type CycleApiConnection = ApiDiscovery;

type ApiEnvelope<T> = {
  readonly data: T;
  readonly meta?: {
    readonly requestId?: string;
  };
  readonly page?: {
    readonly nextCursor?: string | null;
  };
};

type ApiErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly details?: unknown;
    readonly message?: string;
    readonly requestId?: string;
    readonly retryable?: boolean;
  };
};

type QueryInput = Readonly<Record<string, unknown>>;

export type AutocompleteEntityType = "repository" | "tag" | "ticket" | "user" | (string & {});

export type AutocompleteResult = {
  readonly id: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly repositoryId?: string;
  readonly subtitle?: string;
  readonly type: AutocompleteEntityType;
  readonly uri: string;
};

const API_URL_STORAGE_KEY = "cycle.api.baseUrl";
const API_TOKEN_STORAGE_KEY = "cycle.api.token";
const DEV_PROXY_BASE_URL = "/cycle-api";
const REPOSITORY_ISSUE_CURSOR_KEY = "__cycleRepositoryIssueCursors";

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

const apiBaseUrlFromConfig = (config: {
  readonly host: "127.0.0.1" | "localhost";
  readonly port: number | "auto";
}): string => `http://${config.host}:${config.port === "auto" ? DEFAULT_API_PORT : config.port}`;

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
        token: connection.token,
      };
    } catch (error) {
      console.warn("Unable to read desktop API runtime connection.", error);
    }

    const config = await bridge.getAppConfig();
    if (config.api.enabled) {
      return {
        baseUrl: apiBaseUrlFromConfig(config.api),
        token: config.api.staticToken,
      };
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

const request = async <T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiEnvelope<T>> => {
  const discovery = await discoverApi();
  requireDirectToken(discovery);

  const headers = new Headers({
    accept: "application/json",
  });
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
    const apiError = payload as ApiErrorEnvelope;
    throw new CycleApiRequestError({
      code: apiError.error?.code ?? `HTTP_${response.status}`,
      details: apiError.error?.details,
      message: apiError.error?.message ?? "Cycle API request failed.",
      requestId: apiError.error?.requestId,
      retryable: apiError.error?.retryable,
      status: response.status,
    });
  }

  return payload as ApiEnvelope<T>;
};

const resource = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await request<T>(method, path, body);
  return response.data;
};

const resourceOrNull = async <T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> => {
  try {
    return await resource<T>(method, path, body);
  } catch (error) {
    if (error instanceof CycleApiRequestError && error.status === 404) return null;
    throw error;
  }
};

const collection = async <T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ReadonlyArray<T>> => {
  const response = await request<ReadonlyArray<T>>(method, path, body);
  return response.data;
};

const page = async <Entry>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ readonly entries: ReadonlyArray<Entry>; readonly nextCursor?: string }> => {
  const response = await request<ReadonlyArray<Entry>>(method, path, body);
  const nextCursor = response.page?.nextCursor;

  return {
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
  page<TicketDocument>("GET", withQuery(`${repositoryPath(repositoryId)}/issues`, query));

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

const decodeRepositoryIssueCursor = (
  cursor: unknown,
): Readonly<Record<string, string>> | undefined => {
  if (typeof cursor !== "string") return undefined;

  try {
    const parsed = JSON.parse(cursor) as unknown;
    if (!isRecord(parsed)) return undefined;

    const cursors = parsed[REPOSITORY_ISSUE_CURSOR_KEY];
    if (!isRecord(cursors)) return undefined;

    return Object.fromEntries(
      Object.entries(cursors).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
      ),
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
    {
      payload: input.payload,
      recordType: input.recordType,
      userVisible: input.userVisible,
    },
  );
};

export const cycleApiClient = {
  autocomplete: async (input: {
    readonly limit?: number;
    readonly query?: string;
    readonly types?: readonly AutocompleteEntityType[];
  }): Promise<readonly AutocompleteResult[]> => {
    const response = await resource<{ readonly results: readonly AutocompleteResult[] }>(
      "GET",
      withQuery("/v1/autocomplete", {
        limit: input.limit,
        q: input.query,
        types: input.types,
      }),
    );
    return response.results;
  },

  call: async <Alias extends SupportedCycleApiAlias>(
    alias: Alias,
    payload: UseCasePayloadsByAlias[Alias],
  ): Promise<UseCaseSuccessesByAlias[Alias]> => {
    const input = inputFromPayload<QueryInput>(payload, {});

    switch (alias) {
      case "inbox.list":
        return resource<InboxPage>("GET", withQuery(inboxPath, payload as QueryInput)) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "inbox.summary":
        return resource<InboxSummary>(
          "GET",
          withQuery(`${inboxPath}/summary`, payload as QueryInput),
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "inbox.markRead":
        return resource<InboxMutationResult>("POST", `${inboxPath}/read`, payload) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "inbox.markUnread":
        return resource<InboxMutationResult>("POST", `${inboxPath}/unread`, payload) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "inbox.archive":
        return resource<InboxMutationResult>("POST", `${inboxPath}/archive`, payload) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;
    }

    const repositoryId = repositoryIdFromPayload(payload);
    const base = repositoryPath(repositoryId);

    switch (alias) {
      case "repository.status.get":
        return resource<RepositoryStatus>("GET", base) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "repository.materializationWarnings":
        return collection<MaterializationWarning>("GET", `${base}/warnings`) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "repository.history.list":
        return page("GET", withQuery(`${base}/history`, input)) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

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
        return resource("POST", `${base}/issues`, input) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.issue.get": {
        const issueId = issueIdFromInput(input);
        return resourceOrNull<TicketDocument>(
          "GET",
          `${base}/issues/${encodeSegment(issueId)}`,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.issue.update": {
        const issueId = issueIdFromInput(input);
        const patch = isRecord(input) ? input.patch : {};
        return resource("PATCH", `${base}/issues/${encodeSegment(issueId)}`, patch) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;
      }

      case "ticket.issue.history": {
        const issueId = issueIdFromInput(input);
        const options = isRecord(input.options) ? input.options : {};
        return page(
          "GET",
          withQuery(`${base}/issues/${encodeSegment(issueId)}/history`, options),
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
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.record.add":
        return addIssueRecord(repositoryId, input) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.user.list":
        return page("GET", withQuery(`${base}/users`, input)) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "ticket.label.list":
        return page("GET", withQuery(`${base}/labels`, input)) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "ticket.view.list":
        return page("GET", withQuery(`${base}/views`, input)) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "ticket.view.create":
        return resource("POST", `${base}/views`, input) as Promise<UseCaseSuccessesByAlias[Alias]>;

      case "ticket.view.get": {
        const viewId = viewIdFromInput(input);
        return resourceOrNull<SavedViewDocument>(
          "GET",
          `${base}/views/${encodeSegment(viewId)}`,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      case "ticket.template.list":
        return page("GET", withQuery(`${base}/templates`, input)) as Promise<
          UseCaseSuccessesByAlias[Alias]
        >;

      case "ticket.initiative.progress": {
        const initiativeId = initiativeIdFromInput(input);
        return resource(
          "GET",
          `${base}/initiatives/${encodeSegment(initiativeId)}/progress`,
        ) as Promise<UseCaseSuccessesByAlias[Alias]>;
      }

      default:
        throw new Error(`Unsupported Cycle API renderer alias: ${alias}`);
    }
  },

  listRepositories: (): Promise<ReadonlyArray<RepositoryStatus>> =>
    collection<RepositoryStatus>("GET", "/v1/repositories"),
};
