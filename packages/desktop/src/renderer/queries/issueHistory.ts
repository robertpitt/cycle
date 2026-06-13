import { useQuery } from "@tanstack/react-query";
import type { HistoryPage, RepositoryHistoryQuery } from "@cycle/contracts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const issueHistoryQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  query?: RepositoryHistoryQuery,
) => ["desktop", "api", "issueHistory", repositoryId, issueId, query ?? {}] as const;

const listIssueHistory = async ({
  issueId,
  query = {},
  repositoryId,
}: {
  readonly issueId: string;
  readonly query?: RepositoryHistoryQuery;
  readonly repositoryId: string;
}): Promise<HistoryPage> =>
  cycleApiClient.call("ticket.issue.history", {
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
    enabled: repositoryId !== undefined && issueId !== undefined,
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
