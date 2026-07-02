import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";
import { bootstrapStatusQueryKey } from "../queries/bootstrap.ts";
import {
  materializationWarningsQueryKey,
  repositoryHistoryRepositoryQueryKey,
  repositoryStatusQueryKey,
} from "../queries/repositories.ts";

const invalidateRepositoryQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  repositoryId: string,
) => {
  void queryClient.invalidateQueries({ queryKey: repositoryStatusQueryKey(repositoryId) });
  void queryClient.invalidateQueries({ queryKey: materializationWarningsQueryKey(repositoryId) });
  void queryClient.invalidateQueries({
    queryKey: repositoryHistoryRepositoryQueryKey(repositoryId),
  });
  void queryClient.invalidateQueries({ queryKey: bootstrapStatusQueryKey });
};

export const useSyncRepositoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repositoryId: string) => cycleApiClient.syncRepository(repositoryId),
    onSuccess: (_status, repositoryId) => {
      invalidateRepositoryQueries(queryClient, repositoryId);
    },
  });
};

export const usePushRepositoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repositoryId: string) => cycleApiClient.pushRepository(repositoryId),
    onSuccess: (_status, repositoryId) => {
      invalidateRepositoryQueries(queryClient, repositoryId);
    },
  });
};

export const useRemoveRepositoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repositoryId: string) => cycleApiClient.removeRepository(repositoryId),
    onSuccess: (appConfig, repositoryId) => {
      queryClient.setQueryData(appConfigQueryKey, appConfig);
      invalidateRepositoryQueries(queryClient, repositoryId);
    },
  });
};
