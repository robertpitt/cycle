import { useQuery } from "@tanstack/react-query";
import type {
  HistoryPage,
  MaterializationWarning,
  RepositoryStatus,
} from "@cycle/contracts/schemas";
import type { RepositoryHistoryQuery } from "@cycle/contracts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const repositoryStatusQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "api", "repositoryStatus", repositoryId] as const;

export const materializationWarningsQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "api", "materializationWarnings", repositoryId] as const;

export const repositoryHistoryRepositoryQueryKey = (repositoryId: string | undefined) =>
  ["desktop", "api", "repositoryHistory", repositoryId] as const;

const repositoryHistoryQueryKey = (
  repositoryId: string | undefined,
  query?: RepositoryHistoryQuery,
) => [...repositoryHistoryRepositoryQueryKey(repositoryId), query ?? {}] as const;

const getRepositoryStatus = async (repositoryId: string): Promise<RepositoryStatus> =>
  cycleApiClient.call("repository.status.get", {
    input: {},
    repository: {
      id: repositoryId,
    },
  });

const listMaterializationWarnings = async (
  repositoryId: string,
): Promise<ReadonlyArray<MaterializationWarning>> =>
  cycleApiClient.call("repository.materializationWarnings", {
    input: {},
    repository: {
      id: repositoryId,
    },
  });

const listRepositoryHistory = async (
  repositoryId: string,
  query: RepositoryHistoryQuery = {},
): Promise<HistoryPage> =>
  cycleApiClient.call("repository.history.list", {
    input: query,
    repository: {
      id: repositoryId,
    },
  });

export const useRepositoryStatusQuery = (repositoryId: string | undefined) =>
  useQuery({
    enabled: repositoryId !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading repository status.");
      }

      return getRepositoryStatus(repositoryId);
    },
    queryKey: repositoryStatusQueryKey(repositoryId),
    refetchInterval: 1000,
  });

export const useMaterializationWarningsQuery = (repositoryId: string | undefined) =>
  useQuery({
    enabled: repositoryId !== undefined,
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
    enabled: repositoryId !== undefined,
    queryFn: () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before loading repository history.");
      }

      return listRepositoryHistory(repositoryId, query);
    },
    queryKey: repositoryHistoryQueryKey(repositoryId, query),
  });
