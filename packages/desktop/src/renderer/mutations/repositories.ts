import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { issueListQueryKey } from "../queries/issues.ts";
import {
  materializationWarningsQueryKey,
  repositoryListStatusQueryKey,
  repositoryStatusQueryKey,
} from "../queries/repositories.ts";

type UseRepositoryMutationOptions = {
  readonly repositoryId?: string;
};

const invalidateRepositoryQueries = async (
  queryClient: QueryClient,
  repositoryId: string | undefined,
) => {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: repositoryStatusQueryKey(repositoryId),
    }),
    queryClient.invalidateQueries({
      queryKey: repositoryListStatusQueryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: materializationWarningsQueryKey(repositoryId),
    }),
    queryClient.invalidateQueries({
      queryKey: issueListQueryKey(repositoryId),
    }),
  ]);
};

export const useSyncRepositoryMutation = ({ repositoryId }: UseRepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before syncing.");
      }

      return ticketRpcClient.call("repository.sync", {
        input: {},
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: async () => invalidateRepositoryQueries(queryClient, repositoryId),
  });
};

export const usePushRepositoryMutation = ({ repositoryId }: UseRepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before pushing.");
      }

      return ticketRpcClient.call("repository.push", {
        input: {},
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: async () => invalidateRepositoryQueries(queryClient, repositoryId),
  });
};
