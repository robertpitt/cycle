import { type RepositoryStatus, type TicketDocument } from "@cycle/contracts";
import { IssueList, IssueSearch, RepositoryList } from "@cycle/usecases";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  AutocompleteOutput,
  AutocompleteQuery,
  type AutocompleteEntityType,
  type AutocompleteQuery as AutocompleteQueryInput,
  type HttpAutocompleteResultOutput as AutocompleteResult,
} from "../../schemas.ts";
import {
  asPage,
  decodeHttpValue,
  errorResponse,
  meta,
  requestIdFromHeaders,
  resourceResponse,
  runUseCase,
  scoped,
  urlFromRequest,
} from "../shared.ts";

const supportedTypes = new Set<AutocompleteEntityType>(["repository", "ticket"]);

export const withAutocompleteHandlers = (handlers: any) =>
  handlers.handle("autocomplete", ({ request }: any) =>
    Effect.gen(function* () {
      const requestId = yield* requestIdFromHeaders(request.headers);
      const url = urlFromRequest(request);
      const input = yield* decodeHttpValue(
        AutocompleteQuery,
        autocompleteQueryFrom(url.searchParams),
        requestId,
        {
          code: "INVALID_AUTOCOMPLETE_QUERY",
          message: "Invalid autocomplete query.",
        },
      );
      if (HttpServerResponse.isHttpServerResponse(input)) return input;
      const query = (input.q ?? "").trim();
      const limit = autocompleteLimitFrom(input);
      const requestedTypes = requestedAutocompleteTypes(input, requestId);
      if (HttpServerResponse.isHttpServerResponse(requestedTypes)) return requestedTypes;
      const repositories = (yield* runUseCase(
        RepositoryList,
        {},
        meta(requestId),
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

      const output = yield* decodeHttpValue(
        AutocompleteOutput,
        {
          results: results.slice(0, limit),
        },
        requestId,
        {
          code: "INVALID_AUTOCOMPLETE_OUTPUT",
          message: "Autocomplete results did not match the API contract.",
          status: 500,
        },
      );
      if (HttpServerResponse.isHttpServerResponse(output)) return output;

      return resourceResponse(requestId, 200, output);
    }),
  );

const requestedAutocompleteTypes = (
  input: AutocompleteQueryInput,
  requestId: string,
): ReadonlySet<AutocompleteEntityType> | HttpServerResponse.HttpServerResponse => {
  const raw = input.types ?? input.type;
  if (raw === undefined || raw.trim().length === 0) return supportedTypes;

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const unsupported = entries.find((entry) => !supportedTypes.has(entry as AutocompleteEntityType));
  if (unsupported !== undefined) {
    return errorResponse(
      requestId,
      400,
      "INVALID_AUTOCOMPLETE_QUERY",
      `Unsupported autocomplete type: ${unsupported}.`,
      false,
      { type: unsupported },
    );
  }

  const requested = entries as ReadonlyArray<AutocompleteEntityType>;

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
            IssueSearch,
            scoped(scopeRepositoryId, {
              limit: input.limit,
              repositoryIds,
              text: input.query,
            }),
            meta(input.requestId),
          )
        : yield* runUseCase(
            IssueList,
            scoped(scopeRepositoryId, {
              limit: input.limit,
              orderBy: "updatedAt",
              orderDirection: "desc",
              repositoryIds,
            }),
            meta(input.requestId),
          );
    if (HttpServerResponse.isHttpServerResponse(pageValue)) return pageValue;

    return asPage(pageValue)
      .entries.map(ticketFromAutocompleteEntry)
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

const autocompleteQueryFrom = (params: URLSearchParams): Record<string, string> => {
  const input: Record<string, string> = {};
  for (const key of ["limit", "page[limit]", "q", "type", "types"]) {
    const value = params.get(key);
    if (value !== null) input[key] = value;
  }
  return input;
};

const autocompleteLimitFrom = (input: AutocompleteQueryInput): number =>
  input.limit ?? input["page[limit]"] ?? 50;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
