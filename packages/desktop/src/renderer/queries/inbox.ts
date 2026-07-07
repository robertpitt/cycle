import type { InboxPage, InboxQuery, InboxSummary } from "@cycle/backend/client";
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const inboxRootQueryKey = ["desktop", "api", "inbox"] as const;
export const inboxListPageLimit = 100;

const normalizeRepositoryIds = (repositoryIds: readonly string[] | undefined) =>
  repositoryIds === undefined ? [] : [...new Set(repositoryIds)].sort();

export const inboxListQueryKey = (query: InboxQuery | undefined) =>
  [...inboxRootQueryKey, "list", normalizeInboxQuery(query)] as const;

export const inboxListInfiniteQueryKey = (query: InboxQuery | undefined) =>
  [...inboxRootQueryKey, "list", "infinite", normalizeInboxInfiniteQuery(query)] as const;

export const inboxSummaryQueryKey = (query: InboxQuery | undefined) =>
  [...inboxRootQueryKey, "summary", normalizeInboxQuery(query)] as const;

const normalizeInboxQuery = (query: InboxQuery | undefined) => {
  if (query === undefined) return {};

  return {
    ...query,
    repositoryIds: normalizeRepositoryIds(query.repositoryIds),
  };
};

const normalizeInboxInfiniteQuery = (query: InboxQuery | undefined) => {
  if (query === undefined) return {};

  const { cursor: _cursor, ...filterQuery } = query;
  return normalizeInboxQuery(filterQuery);
};

const hasInboxUser = (query: InboxQuery | undefined): query is InboxQuery =>
  query?.userId !== undefined && query.userId.trim().length > 0;

const requireInboxQuery = (query: InboxQuery | undefined): InboxQuery => {
  if (!hasInboxUser(query)) {
    throw new Error("Configure a profile email before loading inbox.");
  }

  return query;
};

export const inboxListPageQuery = (query: InboxQuery, cursor: string | undefined): InboxQuery => {
  const { cursor: _cursor, ...baseQuery } = query;

  return {
    ...baseQuery,
    limit: baseQuery.limit ?? inboxListPageLimit,
    ...(cursor === undefined ? {} : { cursor }),
  };
};

export const inboxListEntriesFromPages = (
  data: Pick<InfiniteData<InboxPage>, "pages"> | undefined,
): readonly InboxPage["entries"][number][] => data?.pages.flatMap((page) => page.entries) ?? [];

export const useInboxListQuery = (query: InboxQuery | undefined) =>
  useQuery({
    enabled: hasInboxUser(query),
    queryFn: (): Promise<InboxPage> => {
      return cycleApiClient.call("inbox.list", requireInboxQuery(query));
    },
    queryKey: inboxListQueryKey(query),
  });

export const useInboxListInfiniteQuery = (query: InboxQuery | undefined) =>
  useInfiniteQuery<InboxPage, Error, InfiniteData<InboxPage>, QueryKey, string | undefined>({
    enabled: hasInboxUser(query),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<InboxPage> => {
      return cycleApiClient.call(
        "inbox.list",
        inboxListPageQuery(requireInboxQuery(query), pageParam),
      );
    },
    queryKey: inboxListInfiniteQueryKey(query),
  });

export const useInboxSummaryQuery = (query: InboxQuery | undefined) =>
  useQuery({
    enabled: hasInboxUser(query),
    queryFn: (): Promise<InboxSummary> => {
      if (!hasInboxUser(query)) {
        throw new Error("Configure a profile email before loading inbox summary.");
      }

      return cycleApiClient.call("inbox.summary", query);
    },
    queryKey: inboxSummaryQueryKey(query),
  });
