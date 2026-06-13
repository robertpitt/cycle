import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateSavedViewInput } from "@cycle/contracts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { viewsQueryKey } from "../queries/metadata.ts";

type RepositoryMutationOptions = {
  readonly repositoryId?: string;
};

const requireRepositoryId = (repositoryId: string | undefined, message: string): string => {
  if (!repositoryId) {
    throw new Error(message);
  }

  return repositoryId;
};

export const useCreateSavedViewMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSavedViewInput) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before creating saved views.",
      );

      return ticketRpcClient.call("ticket.view.create", {
        input,
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: viewsQueryKey(repositoryId),
      });
    },
  });
};
