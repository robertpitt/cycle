import {
  IssueList,
  IssueSearch,
  RepositoryList,
  type RepositoryStatus,
  type TicketDocument,
} from "@cycle/contracts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  asPage,
  meta,
  pageLimitFrom,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  urlFromRequest,
} from "../shared.ts";

type AutocompleteEntityType = "repository" | "ticket";

type AutocompleteResult = {
  readonly id: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly repositoryId?: string;
  readonly subtitle?: string;
  readonly type: AutocompleteEntityType;
  readonly uri: string;
};

const supportedTypes = new Set<AutocompleteEntityType>(["repository", "ticket"]);

export const withAutocompleteHandlers = (handlers: any) =>
  handlers.handle("autocomplete", ({ request }: any) =>
    Effect.gen(function* () {
      const requestId = yield* requestIdFromHeaders(request.headers);
      const url = urlFromRequest(request);
      const query = (url.searchParams.get("q") ?? "").trim();
      const limit = autocompleteLimitFrom(url.searchParams);
      const requestedTypes = requestedAutocompleteTypes(url.searchParams);
      const repositories = (yield* runUseCase(
        RepositoryList({}, meta(requestId)),
      )) as ReadonlyArray<RepositoryStatus>;
      if (HttpServerResponse.isHttpServerResponse(repositories)) return repositories;

      const results: AutocompleteResult[] = [];

      if (requestedTypes.has("repository")) {
        results.push(
          ...repositories
            .map(repositoryAutocompleteResult)
            .filter((result) => autocompleteResultMatchesQuery(result, query))
            .slice(0, limit),
        );
      }

      if (requestedTypes.has("ticket") && repositories.length > 0) {
        const ticketResults = yield* ticketAutocompleteResults({
          limit,
          query,
          repositories,
          requestId,
        });
        if (HttpServerResponse.isHttpServerResponse(ticketResults)) return ticketResults;
        results.push(...ticketResults);
      }

      return resourceResponse(requestId, 200, {
        results: results.slice(0, limit),
      });
    }),
  );

const requestedAutocompleteTypes = (params: URLSearchParams): ReadonlySet<AutocompleteEntityType> => {
  const raw = params.get("types") ?? params.get("type");
  if (raw === null || raw.trim().length === 0) return supportedTypes;

  const requested = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is AutocompleteEntityType =>
      supportedTypes.has(entry as AutocompleteEntityType),
    );

  return requested.length === 0 ? new Set() : new Set(requested);
};

const ticketAutocompleteResults = (input: {
  readonly limit: number;
  readonly query: string;
  readonly repositories: ReadonlyArray<RepositoryStatus>;
  readonly requestId: string;
}): Effect.Effect<
  ReadonlyArray<AutocompleteResult> | HttpServerResponse.HttpServerResponse,
  never,
  any
> =>
  Effect.gen(function* () {
    const repositoryIds = input.repositories.map((repository) => repository.repositoryId);
    const repositoryNameById = new Map(
      input.repositories.map((repository) => [
        repository.repositoryId,
        repositoryDisplayName(repository),
      ]),
    );
    const scopeRepositoryId = repositoryIds[0];
    if (scopeRepositoryId === undefined) return [];
    const pageValue =
      input.query.length > 0
        ? yield* runUseCase(
            IssueSearch(
              scoped(scopeRepositoryId, {
                limit: input.limit,
                repositoryIds,
                text: input.query,
              }),
              meta(input.requestId),
            ),
          )
        : yield* runUseCase(
            IssueList(
              scoped(scopeRepositoryId, {
                limit: input.limit,
                orderBy: "updatedAt",
                orderDirection: "desc",
                repositoryIds,
              }),
              meta(input.requestId),
            ),
          );
    if (HttpServerResponse.isHttpServerResponse(pageValue)) return pageValue;

    return asPage(pageValue).entries
      .map(ticketFromAutocompleteEntry)
      .flatMap((ticket) => {
        const repositoryId = ticketRepositoryId(ticket);
        if (repositoryId === undefined) return [];

        return [
          {
            id: ticket.id,
            metadata: {
              priority: ticket.priority,
              status: ticket.status,
            },
            name: ticket.title,
            repositoryId,
            subtitle: [ticket.id, repositoryNameById.get(repositoryId), ticket.status]
              .filter((value): value is string => typeof value === "string" && value.length > 0)
              .join(" / "),
            type: "ticket" as const,
            uri: `cycle://repository/${encodeUriSegment(repositoryId)}/tickets/${encodeUriSegment(
              ticket.id,
            )}`,
          },
        ];
      })
      .slice(0, input.limit);
  });

const ticketFromAutocompleteEntry = (entry: unknown): TicketDocument => {
  if (isRecord(entry) && isRecord(entry.ticket)) return entry.ticket as unknown as TicketDocument;
  return entry as TicketDocument;
};

const ticketRepositoryId = (ticket: TicketDocument): string | undefined => {
  if (typeof ticket.repositoryId === "string" && ticket.repositoryId.length > 0) {
    return ticket.repositoryId;
  }
  if (typeof ticket.repository === "string" && ticket.repository.length > 0) {
    return ticket.repository;
  }
  return undefined;
};

const repositoryAutocompleteResult = (repository: RepositoryStatus): AutocompleteResult => {
  const name = repositoryDisplayName(repository);
  const subtitle = repository.metadata?.worktreePath ?? repository.metadata?.gitDir;

  return {
    id: repository.repositoryId,
    metadata: {
      status: repository.status,
      warningCount: repository.warningCount,
    },
    name,
    repositoryId: repository.repositoryId,
    ...(subtitle === undefined ? {} : { subtitle }),
    type: "repository",
    uri: `cycle://repository/${encodeUriSegment(repository.repositoryId)}`,
  };
};

const autocompleteResultMatchesQuery = (result: AutocompleteResult, query: string): boolean => {
  if (query.length === 0) return true;
  const normalized = query.toLocaleLowerCase();

  return [result.id, result.name, result.subtitle ?? "", result.uri]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
};

const repositoryDisplayName = (repository: RepositoryStatus): string => {
  const path = repository.metadata?.worktreePath ?? repository.metadata?.gitDir;
  if (path !== undefined && path.length > 0) {
    const segments = path.split(/[\\/]/u).filter(Boolean);
    const name = segments.at(-1);
    if (name !== undefined && name.length > 0) return name;
  }

  return repository.repositoryId;
};

const encodeUriSegment = (value: string): string => encodeURIComponent(value);

const autocompleteLimitFrom = (params: URLSearchParams): number => {
  const raw = params.get("limit");
  if (raw !== null) {
    const limit = Number(raw);
    if (Number.isInteger(limit) && limit > 0 && limit <= 100) return limit;
  }

  return pageLimitFrom(params);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
