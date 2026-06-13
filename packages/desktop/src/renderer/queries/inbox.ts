import type { InboxPage, InboxQuery, InboxSummary } from "@cycle/contracts";
import { useQuery } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const inboxRootQueryKey = ["desktop", "api", "inbox"] as const;

const normalizeRepositoryIds = (repositoryIds: readonly string[] | undefined) =>
  repositoryIds === undefined ? [] : [...new Set(repositoryIds)].sort();

export const inboxListQueryKey = (query: InboxQuery | undefined) =>
  [...inboxRootQueryKey, "list", normalizeInboxQuery(query)] as const;

export const inboxSummaryQueryKey = (query: InboxQuery | undefined) =>
  [...inboxRootQueryKey, "summary", normalizeInboxQuery(query)] as const;

const normalizeInboxQuery = (query: InboxQuery | undefined) => {
  if (query === undefined) return {};

  return {
    ...query,
    repositoryIds: normalizeRepositoryIds(query.repositoryIds),
  };
};

export const useInboxListQuery = (query: InboxQuery | undefined) =>
  useQuery({
    enabled: query?.userId !== undefined && query.userId.trim().length > 0,
    queryFn: (): Promise<InboxPage> => {
      if (query?.userId === undefined || query.userId.trim().length === 0) {
        throw new Error("Configure a profile email before loading inbox.");
      }

      return cycleApiClient.call("inbox.list", query);
    },
    queryKey: inboxListQueryKey(query),
  });

export const useInboxSummaryQuery = (query: InboxQuery | undefined) =>
  useQuery({
    enabled: query?.userId !== undefined && query.userId.trim().length > 0,
    queryFn: (): Promise<InboxSummary> => {
      if (query?.userId === undefined || query.userId.trim().length === 0) {
        throw new Error("Configure a profile email before loading inbox summary.");
      }

      return cycleApiClient.call("inbox.summary", query);
    },
    queryKey: inboxSummaryQueryKey(query),
  });
