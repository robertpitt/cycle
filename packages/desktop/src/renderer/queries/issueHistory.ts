import { useQuery } from "@tanstack/react-query";
import type {
  HistoryPage,
  RepositoryHistoryQuery,
  TicketDocument,
  TicketRevisionDiff,
} from "@cycle/contracts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";

export const issueHistoryQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  query?: RepositoryHistoryQuery,
) => ["desktop", "ticketRpc", "issueHistory", repositoryId, issueId, query ?? {}] as const;

export const issueRevisionQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  snapshotId: string | undefined,
) => ["desktop", "ticketRpc", "issueRevision", repositoryId, issueId, snapshotId] as const;

export const issueDiffQueryKey = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  fromSnapshotId: string | undefined,
  toSnapshotId: string | undefined,
) =>
  [
    "desktop",
    "ticketRpc",
    "issueDiff",
    repositoryId,
    issueId,
    fromSnapshotId,
    toSnapshotId,
  ] as const;

export const listIssueHistory = async ({
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

export const getIssueRevision = async ({
  issueId,
  repositoryId,
  snapshotId,
}: {
  readonly issueId: string;
  readonly repositoryId: string;
  readonly snapshotId: string;
}): Promise<TicketDocument | null> =>
  ticketRpcClient.call("ticket.issue.revision.get", {
    input: {
      id: issueId,
      snapshotId,
    },
    repository: {
      id: repositoryId,
    },
  });

export const getIssueDiff = async ({
  fromSnapshotId,
  issueId,
  repositoryId,
  toSnapshotId,
}: {
  readonly fromSnapshotId: string;
  readonly issueId: string;
  readonly repositoryId: string;
  readonly toSnapshotId: string;
}): Promise<TicketRevisionDiff> =>
  ticketRpcClient.call("ticket.issue.diff", {
    input: {
      fromSnapshotId,
      id: issueId,
      toSnapshotId,
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

export const useIssueRevisionQuery = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  snapshotId: string | undefined,
) =>
  useQuery({
    enabled:
      repositoryId !== undefined &&
      issueId !== undefined &&
      snapshotId !== undefined &&
      getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId || !issueId || !snapshotId) {
        throw new Error("Choose an issue revision before loading it.");
      }

      return getIssueRevision({
        issueId,
        repositoryId,
        snapshotId,
      });
    },
    queryKey: issueRevisionQueryKey(repositoryId, issueId, snapshotId),
  });

export const useIssueDiffQuery = (
  repositoryId: string | undefined,
  issueId: string | undefined,
  fromSnapshotId: string | undefined,
  toSnapshotId: string | undefined,
) =>
  useQuery({
    enabled:
      repositoryId !== undefined &&
      issueId !== undefined &&
      fromSnapshotId !== undefined &&
      toSnapshotId !== undefined &&
      getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId || !issueId || !fromSnapshotId || !toSnapshotId) {
        throw new Error("Choose an issue diff before loading it.");
      }

      return getIssueDiff({
        fromSnapshotId,
        issueId,
        repositoryId,
        toSnapshotId,
      });
    },
    queryKey: issueDiffQueryKey(repositoryId, issueId, fromSnapshotId, toSnapshotId),
  });
