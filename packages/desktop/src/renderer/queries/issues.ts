import { useQuery } from "@tanstack/react-query";
import type { LinkedRecord, TicketDocument, TicketPage, TicketQuery } from "@cycle/database";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";

export const issueListQueryKey = (
  repositoryId: string | undefined,
  query?: Omit<TicketQuery, "repositoryIds">,
) => ["desktop", "ticketRpc", "issues", repositoryId, query ?? {}] as const;

export const issueDetailQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) => ["desktop", "ticketRpc", "issue", repositoryId, issueId] as const;

export const issueRecordsQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
) => ["desktop", "ticketRpc", "issueRecords", repositoryId, issueId] as const;

export const listIssuesForRepository = async (
  repositoryId: string,
  query: Omit<TicketQuery, "repositoryIds"> = {},
): Promise<TicketPage> =>
  ticketRpcClient.call("ticket.issue.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

export const getIssueForRepository = async ({
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

export const listIssueRecordsForRepository = async ({
  issueId,
  repositoryId,
}: {
  readonly issueId: string;
  readonly repositoryId: string;
}): Promise<ReadonlyArray<LinkedRecord>> =>
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
) =>
  useQuery({
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading issues.");
      }

      return listIssuesForRepository(repositoryId, query);
    },
    queryKey: issueListQueryKey(repositoryId, query),
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
