import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import type { RecordPage, TicketDocument, TicketPage, TicketQuery } from "@cycle/backend/client";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const issueListRootQueryKey = ["desktop", "api", "issues"] as const;
const issueListPageLimit = 100;

const normalizeRepositoryIds = (repositoryIds: readonly string[] | undefined) =>
  repositoryIds === undefined ? [] : [...new Set(repositoryIds)].sort();

const issueListRepositoryQueryKey = (repositoryId: string | undefined) =>
  [...issueListRootQueryKey, "repository", repositoryId ?? null] as const;

const issueListGlobalQueryKey = (repositoryIds: readonly string[] | undefined) =>
  [...issueListRootQueryKey, "global", normalizeRepositoryIds(repositoryIds)] as const;

export const issueListQueryKey = (
  repositoryId: string | undefined,
  query?: Omit<TicketQuery, "repositoryIds">,
  repositoryIds?: readonly string[],
) => {
  const scope =
    repositoryIds !== undefined && repositoryIds.length > 0
      ? issueListGlobalQueryKey(repositoryIds)
      : issueListRepositoryQueryKey(repositoryId);

  return query === undefined ? scope : ([...scope, query] as const);
};

const issueListInfiniteQueryKey = (
  repositoryId: string | undefined,
  query?: Omit<TicketQuery, "repositoryIds">,
  repositoryIds?: readonly string[],
) => {
  const scope =
    repositoryIds !== undefined && repositoryIds.length > 0
      ? issueListGlobalQueryKey(repositoryIds)
      : issueListRepositoryQueryKey(repositoryId);

  return query === undefined ? [...scope, "infinite"] : ([...scope, "infinite", query] as const);
};

export const issueDetailQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) => ["desktop", "api", "issue", repositoryId, issueId] as const;

export const issueRecordsQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) => ["desktop", "api", "issueRecords", repositoryId, issueId] as const;

const listIssuesForRepository = async (
  repositoryId: string,
  query: Omit<TicketQuery, "repositoryIds"> = {},
): Promise<TicketPage> =>
  cycleApiClient.call("ticket.issue.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

const listIssuesForRepositories = async (
  repositoryIds: readonly string[],
  query: Omit<TicketQuery, "repositoryIds"> = {},
): Promise<TicketPage> => {
  const normalizedRepositoryIds = normalizeRepositoryIds(repositoryIds);
  const requestRepositoryId = normalizedRepositoryIds[0];

  if (!requestRepositoryId) {
    return {
      entries: [],
    };
  }

  return cycleApiClient.call("ticket.issue.list", {
    input: {
      ...query,
      repositoryIds: normalizedRepositoryIds,
    },
    repository: {
      id: requestRepositoryId,
    },
  });
};

const issuePageQuery = (
  query: Omit<TicketQuery, "repositoryIds">,
  cursor: string | undefined,
): Omit<TicketQuery, "repositoryIds"> => ({
  ...query,
  limit: query.limit ?? issueListPageLimit,
  ...(cursor === undefined ? {} : { cursor }),
});

const getIssueForRepository = async ({
  issueId,
  repositoryId,
}: {
  readonly issueId: string;
  readonly repositoryId: string;
}): Promise<TicketDocument | null> =>
  cycleApiClient.call("ticket.issue.get", {
    input: {
      id: issueId,
    },
    repository: {
      id: repositoryId,
    },
  });

const listIssueRecordsForRepository = async ({
  issueId,
  repositoryId,
}: {
  readonly issueId: string;
  readonly repositoryId: string;
}): Promise<RecordPage> =>
  cycleApiClient.call("ticket.record.listForIssue", {
    input: {
      issueId,
      query: {
        recordType: "comment",
      },
    },
    repository: {
      id: repositoryId,
    },
  });

export const useIssueListQuery = (
  repositoryId: string | undefined,
  query: Omit<TicketQuery, "repositoryIds"> = {},
  repositoryIds?: readonly string[],
) =>
  useQuery({
    enabled:
      (repositoryIds !== undefined && repositoryIds.length > 0) || repositoryId !== undefined,
    queryFn: () => {
      if (repositoryIds !== undefined && repositoryIds.length > 0) {
        return listIssuesForRepositories(repositoryIds, query);
      }

      if (!repositoryId) {
        throw new Error("Choose a repository before loading issues.");
      }

      return listIssuesForRepository(repositoryId, query);
    },
    queryKey: issueListQueryKey(repositoryId, query, repositoryIds),
  });

export const useIssueListInfiniteQuery = (
  repositoryId: string | undefined,
  query: Omit<TicketQuery, "repositoryIds"> = {},
  repositoryIds?: readonly string[],
) =>
  useInfiniteQuery<TicketPage, Error, InfiniteData<TicketPage>, QueryKey, string | undefined>({
    enabled:
      (repositoryIds !== undefined && repositoryIds.length > 0) || repositoryId !== undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const nextQuery = issuePageQuery(query, pageParam);

      if (repositoryIds !== undefined && repositoryIds.length > 0) {
        return listIssuesForRepositories(repositoryIds, nextQuery);
      }

      if (!repositoryId) {
        throw new Error("Choose a repository before loading issues.");
      }

      return listIssuesForRepository(repositoryId, nextQuery);
    },
    queryKey: issueListInfiniteQueryKey(repositoryId, query, repositoryIds),
  });

export const useIssueDetailQuery = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) =>
  useQuery({
    enabled: repositoryId !== undefined && issueId !== undefined,
    queryFn: () => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before loading issue details.");
      }

      return getIssueForRepository({
        issueId,
        repositoryId,
      });
    },
    queryKey: issueDetailQueryKey(repositoryId, issueId),
  });

export const useIssueRecordsQuery = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) =>
  useQuery({
    enabled: repositoryId !== undefined && issueId !== undefined,
    queryFn: () => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before loading issue activity.");
      }

      return listIssueRecordsForRepository({
        issueId,
        repositoryId,
      });
    },
    queryKey: issueRecordsQueryKey(repositoryId, issueId),
  });
