import { useQuery } from "@tanstack/react-query";
import type {
  HistoryPage,
  MaterializationWarning,
  RepositoryHistoryQuery,
  RepositoryStatus,
} from "@cycle/contracts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";

export const repositoryStatusQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "ticketRpc", "repositoryStatus", repositoryId] as const;

export const repositoryListStatusQueryKey = [
  "desktop",
  "ticketRpc",
  "repositoryStatusList",
] as const;

export const materializationWarningsQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "ticketRpc", "materializationWarnings", repositoryId] as const;

export const repositoryHistoryRepositoryQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "ticketRpc", "repositoryHistory", repositoryId] as const;

export const repositoryHistoryQueryKey = (
  repositoryId: string | undefined,
  query?: RepositoryHistoryQuery,
) => [...repositoryHistoryRepositoryQueryKey(repositoryId), query ?? {}] as const;

export const getRepositoryStatus = async (repositoryId: string): Promise<RepositoryStatus> =>
  ticketRpcClient.call("repository.status.get", {
    input: {},
    repository: {
      id: repositoryId,
    },
  });

export const listRepositoryStatuses = async (): Promise<ReadonlyArray<RepositoryStatus>> =>
  ticketRpcClient.call("repository.status.list", {});

export const listMaterializationWarnings = async (
  repositoryId: string,
): Promise<ReadonlyArray<MaterializationWarning>> =>
  ticketRpcClient.call("repository.materializationWarnings", {
    input: {},
    repository: {
      id: repositoryId,
    },
  });

export const listRepositoryHistory = async (
  repositoryId: string,
  query: RepositoryHistoryQuery = {},
): Promise<HistoryPage> =>
  ticketRpcClient.call("repository.history.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

export const useRepositoryStatusQuery = (repositoryId: string | undefined) =>
  useQuery({
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading repository status.");
      }

      return getRepositoryStatus(repositoryId);
    },
    queryKey: repositoryStatusQueryKey(repositoryId),
    refetchInterval: 1000,
  });

export const useRepositoryStatusListQuery = () =>
  useQuery({
    enabled: getDesktopBridge() !== undefined,
    queryFn: listRepositoryStatuses,
    queryKey: repositoryListStatusQueryKey,
  });

export const useMaterializationWarningsQuery = (repositoryId: string | undefined) =>
  useQuery({
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading materialization warnings.");
      }

      return listMaterializationWarnings(repositoryId);
    },
    queryKey: materializationWarningsQueryKey(repositoryId),
  });

export const useRepositoryHistoryQuery = (
  repositoryId: string | undefined,
  query: RepositoryHistoryQuery = {},
) =>
  useQuery({
    enabled: repositoryId !== undefined && getDesktopBridge() !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading repository history.");
      }

      return listRepositoryHistory(repositoryId, query);
    },
    queryKey: repositoryHistoryQueryKey(repositoryId, query),
  });
