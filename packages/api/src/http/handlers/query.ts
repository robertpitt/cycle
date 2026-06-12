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
    cursor: params.get("page[cursor]") ?? undefined,
    label: params.get("filter[label]") ?? undefined,
    limit: pageLimitFrom(params),
    priority: params.get("filter[priority]") ?? undefined,
    status: params.get("filter[status]") ?? undefined,
    text: params.get("q") ?? undefined,
    type: params.get("filter[type]") ?? undefined,
  };
  const labelIn = params.get("filter[label][in]");
  const statusIn = params.get("filter[status][in]");
  const priorityIn = params.get("filter[priority][in]");

  return stripUndefined({
    ...query,
    labelIn: labelIn === null ? undefined : commaList(labelIn),
    priorityIn: priorityIn === null ? undefined : commaList(priorityIn),
    statusIn: statusIn === null ? undefined : commaList(statusIn),
  });
};

export const historyQueryFrom = (params: URLSearchParams): Record<string, unknown> =>
  stripUndefined({
    cursor: params.get("page[cursor]") ?? undefined,
    limit: pageLimitFrom(params),
    ticketId: params.get("filter[ticketId]") ?? undefined,
  });

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

export const stripUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
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

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
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
