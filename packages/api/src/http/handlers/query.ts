import { type RepositoryStatus } from "@cycle/contracts";

export const urlFromRequest = (request: { readonly url: string }): URL =>
  new URL(request.url, "http://127.0.0.1");

export const filterRepositories = (
  repositories: ReadonlyArray<RepositoryStatus>,
  params: URLSearchParams,
): ReadonlyArray<RepositoryStatus> => {
  const id = params.get("filter[id]");
  const path = params.get("filter[path]");

  return repositories.filter((repository) => {
    if (id !== null && repository.repositoryId !== id) return false;
    if (
      path !== null &&
      (repository.metadata?.worktreePath ?? repository.metadata?.gitDir) !== path
    ) {
      return false;
    }
    return true;
  });
};

export const issueQueryFrom = (params: URLSearchParams): Record<string, unknown> => {
  const query: Record<string, unknown> = {
    archived: booleanParam(filterParam(params, "archived")),
    assignee: nullableStringParam(filterParam(params, "assignee")),
    blocked: booleanParam(filterParam(params, "blocked")),
    cursor: params.get("page[cursor]") ?? undefined,
    deleted: booleanParam(filterParam(params, "deleted")),
    dueAfter: filterParam(params, "dueAfter") ?? undefined,
    dueBefore: filterParam(params, "dueBefore") ?? undefined,
    estimate: filterParam(params, "estimate") ?? undefined,
    hasAssignee: booleanParam(filterParam(params, "hasAssignee")),
    hasDueDate: booleanParam(filterParam(params, "hasDueDate")),
    hasEstimate: booleanParam(filterParam(params, "hasEstimate")),
    hasLabels: booleanParam(filterParam(params, "hasLabels")),
    label: filterParam(params, "label") ?? undefined,
    limit: pageLimitFrom(params),
    orderBy: orderByParam(params),
    orderDirection: orderDirectionParam(params),
    parent: nullableStringParam(filterParam(params, "parent")),
    priority: filterParam(params, "priority") ?? undefined,
    staleBefore: filterParam(params, "staleBefore") ?? undefined,
    status: filterParam(params, "status") ?? undefined,
    text: params.get("q") ?? undefined,
    type: filterParam(params, "type") ?? undefined,
    updatedAfter: filterParam(params, "updatedAfter") ?? undefined,
    updatedBefore: filterParam(params, "updatedBefore") ?? undefined,
  };
  const assigneeIn = params.get("filter[assignee][in]") ?? params.get("assigneeIn");
  const labelIn = params.get("filter[label][in]") ?? params.get("labelIn");
  const repositoryIds = params.get("filter[repository][in]") ?? params.get("repositoryIds");
  const statusIn = params.get("filter[status][in]") ?? params.get("statusIn");
  const priorityIn = params.get("filter[priority][in]") ?? params.get("priorityIn");

  return stripUndefined({
    ...query,
    assigneeIn: assigneeIn === null ? undefined : commaList(assigneeIn),
    labelIn: labelIn === null ? undefined : commaList(labelIn),
    priorityIn: priorityIn === null ? undefined : commaList(priorityIn),
    repositoryIds: repositoryIds === null ? undefined : commaList(repositoryIds),
    statusIn: statusIn === null ? undefined : commaList(statusIn),
  });
};

export const historyQueryFrom = (params: URLSearchParams): Record<string, unknown> =>
  stripUndefined({
    cursor: params.get("page[cursor]") ?? undefined,
    limit: pageLimitFrom(params),
    ticketId: params.get("filter[ticketId]") ?? undefined,
  });

export const inboxQueryFrom = (params: URLSearchParams): Record<string, unknown> => {
  const repositoryIds = params.get("filter[repository][in]") ?? params.get("repositoryIds");

  return stripUndefined({
    createdAfter: filterParam(params, "createdAfter") ?? undefined,
    createdBefore: filterParam(params, "createdBefore") ?? undefined,
    cursor: params.get("page[cursor]") ?? undefined,
    includeSourceInactive: booleanParam(filterParam(params, "includeSourceInactive")),
    limit: pageLimitFrom(params),
    reason: filterParam(params, "reason") ?? undefined,
    repositoryIds: repositoryIds === null ? undefined : commaList(repositoryIds),
    status: filterParam(params, "status") ?? undefined,
    ticketId: filterParam(params, "ticketId") ?? undefined,
    userId: filterParam(params, "userId") ?? params.get("userId") ?? undefined,
  });
};

export const recordQueryFrom = (params: URLSearchParams): Record<string, unknown> =>
  stripUndefined({
    cursor: params.get("page[cursor]") ?? undefined,
    limit: pageLimitFrom(params),
    recordType: params.get("filter[recordType]") ?? undefined,
  });

export const labelQueryFrom = (params: URLSearchParams): Record<string, unknown> =>
  stripUndefined({
    archived: booleanParam(params.get("filter[archived]")),
    cursor: params.get("page[cursor]") ?? undefined,
    limit: pageLimitFrom(params),
    text: params.get("q") ?? undefined,
  });

export const userQueryFrom = (params: URLSearchParams): Record<string, unknown> =>
  stripUndefined({
    cursor: params.get("page[cursor]") ?? undefined,
    disabled: booleanParam(params.get("filter[disabled]")),
    limit: pageLimitFrom(params),
    text: params.get("q") ?? undefined,
  });

export const viewQueryFrom = (params: URLSearchParams): Record<string, unknown> =>
  stripUndefined({
    cursor: params.get("page[cursor]") ?? undefined,
    kind: params.get("filter[kind]") ?? undefined,
    limit: pageLimitFrom(params),
    pinned: booleanParam(params.get("filter[pinned]")),
    text: params.get("q") ?? undefined,
  });

export const templateQueryFrom = (params: URLSearchParams): Record<string, unknown> =>
  stripUndefined({
    active: booleanParam(params.get("filter[active]")),
    cursor: params.get("page[cursor]") ?? undefined,
    kind: params.get("filter[kind]") ?? undefined,
    limit: pageLimitFrom(params),
    text: params.get("q") ?? undefined,
  });

export const pageLimitFrom = (params: URLSearchParams): number => {
  const raw = params.get("page[limit]");
  if (raw === null) return 50;

  const limit = Number(raw);
  return Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 50;
};

export const asPage = (
  value: unknown,
): { readonly entries: ReadonlyArray<unknown>; readonly nextCursor?: string } => {
  if (!isRecord(value)) return { entries: [] };
  const entries = Array.isArray(value.entries) ? value.entries : [];

  return {
    entries,
    nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : undefined,
  };
};

export const severityThreshold = (value: unknown): "error" | "fatal" | "warning" | undefined =>
  value === "error" || value === "fatal" || value === "warning" ? value : undefined;

const stripUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

export const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const stringField = (
  record: Readonly<Record<string, unknown>>,
  field: string,
  fallback: string,
): string => {
  const value = record[field];
  return typeof value === "string" ? value : fallback;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const commaList = (value: string): ReadonlyArray<string> =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const booleanParam = (value: string | null): boolean | undefined => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const filterParam = (params: URLSearchParams, key: string): string | null =>
  params.get(`filter[${key}]`) ?? params.get(key);

const nullableStringParam = (value: string | null): string | null | undefined => {
  if (value === null) return undefined;
  return value === "null" ? null : value;
};

const orderByParam = (
  params: URLSearchParams,
): "createdAt" | "dueDate" | "priority" | "title" | "updatedAt" | undefined => {
  const value = params.get("sort[field]") ?? params.get("orderBy");
  if (
    value === "createdAt" ||
    value === "dueDate" ||
    value === "priority" ||
    value === "title" ||
    value === "updatedAt"
  ) {
    return value;
  }
  return undefined;
};

const orderDirectionParam = (params: URLSearchParams): "asc" | "desc" | undefined => {
  const value = params.get("sort[direction]") ?? params.get("orderDirection");
  if (value === "asc" || value === "desc") return value;
  return undefined;
};
