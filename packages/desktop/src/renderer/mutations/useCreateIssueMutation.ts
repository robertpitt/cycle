import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTicketInput } from "@cycle/backend/client";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { issueListRootQueryKey } from "../queries/issues.ts";

type UseCreateIssueMutationOptions = {
  readonly repositoryId?: string;
};

export const useCreateIssueMutation = ({ repositoryId }: UseCreateIssueMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<CreateTicketInput, "repository">) => {
      if (!repositoryId) {
        throw new Error("Choose a repository before creating an issue.");
      }

      return cycleApiClient.call("ticket.issue.create", {
        input: {
          ...input,
          repository: repositoryId,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: issueListRootQueryKey,
      });
    },
  });
};
