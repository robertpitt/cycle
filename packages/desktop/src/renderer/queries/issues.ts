import { useQuery } from "@tanstack/react-query";
import type { RecordPage, TicketDocument, TicketPage, TicketQuery } from "@cycle/contracts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";

export const issueListRootQueryKey = ["desktop", "ticketRpc", "issues"] as const;

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

export const issueDetailQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) => ["desktop", "ticketRpc", "issue", repositoryId, issueId] as const;

export const issueRecordsQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) => ["desktop", "ticketRpc", "issueRecords", repositoryId, issueId] as const;

const listIssuesForRepository = async (
  repositoryId: string,
  query: Omit<TicketQuery, "repositoryIds"> = {},
): Promise<TicketPage> =>
  ticketRpcClient.call("ticket.issue.list", {
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

  return ticketRpcClient.call("ticket.issue.list", {
    input: {
      ...query,
      repositoryIds: normalizedRepositoryIds,
    },
    repository: {
      id: requestRepositoryId,
    },
  });
};

const getIssueForRepository = async ({
  issueId,
  repositoryId,
}: {
  readonly issueId: string;
  readonly repositoryId: string;
}): Promise<TicketDocument | null> =>
  ticketRpcClient.call("ticket.issue.get", {
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
  ticketRpcClient.call("ticket.record.listForIssue", {
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
      ((repositoryIds !== undefined && repositoryIds.length > 0) || repositoryId !== undefined) &&
      getDesktopBridge() !== undefined,
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

export const useIssueDetailQuery = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) =>
  useQuery({
    enabled:
      repositoryId !== undefined && issueId !== undefined && getDesktopBridge() !== undefined,
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
    enabled:
      repositoryId !== undefined && issueId !== undefined && getDesktopBridge() !== undefined,
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
