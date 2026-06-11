import { useQuery } from "@tanstack/react-query";
import type { SearchTicketsQuery, TicketSearchPage } from "@cycle/database";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";

export const issueSearchQueryKey = (
  repositoryId: string | undefined,
  query: Omit<SearchTicketsQuery, "repositoryIds">,
) => ["desktop", "ticketRpc", "issueSearch", repositoryId, query] as const;

export const searchIssuesForRepository = async (
  repositoryId: string,
  query: Omit<SearchTicketsQuery, "repositoryIds">,
): Promise<TicketSearchPage> =>
  ticketRpcClient.call("ticket.issue.search", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

export const useIssueSearchQuery = (
  repositoryId: string | undefined,
  query: Omit<SearchTicketsQuery, "repositoryIds">,
) =>
  useQuery({
    enabled:
      repositoryId !== undefined &&
      query.text.trim().length > 0 &&
      getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before searching issues.");
      }

      return searchIssuesForRepository(repositoryId, query);
    },
    queryKey: issueSearchQueryKey(repositoryId, query),
  });
