import { useQuery } from "@tanstack/react-query";
import type { HistoryPage, RepositoryHistoryQuery } from "@cycle/contracts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";

export const issueHistoryQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  query?: RepositoryHistoryQuery,
) => ["desktop", "ticketRpc", "issueHistory", repositoryId, issueId, query ?? {}] as const;

const listIssueHistory = async ({
  issueId,
  query = {},
  repositoryId,
}: {
  readonly issueId: string;
  readonly query?: RepositoryHistoryQuery;
  readonly repositoryId: string;
}): Promise<HistoryPage> =>
  ticketRpcClient.call("ticket.issue.history", {
    input: {
      id: issueId,
      options: query,
    },
    repository: {
      id: repositoryId,
    },
  });

export const useIssueHistoryQuery = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  query: RepositoryHistoryQuery = {},
) =>
  useQuery({
    enabled:
      repositoryId !== undefined && issueId !== undefined && getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before loading issue history.");
      }

      return listIssueHistory({
        issueId,
        query,
        repositoryId,
      });
    },
    queryKey: issueHistoryQueryKey(repositoryId, issueId, query),
  });
