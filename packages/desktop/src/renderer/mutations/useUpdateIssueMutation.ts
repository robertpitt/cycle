import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateTicketPatch } from "@cycle/database";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";

type UseUpdateIssueMutationOptions = {
  readonly issueId?: string;
  readonly repositoryId?: string;
};

export const useUpdateIssueMutation = ({
  issueId,
  repositoryId,
}: UseUpdateIssueMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: UpdateTicketPatch) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before updating it.");
      }

      return ticketRpcClient.call("ticket.issue.update", {
        input: {
          id: issueId,
          patch,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: issueDetailQueryKey(repositoryId, issueId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueListRootQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: issueRecordsQueryKey(repositoryId, issueId),
        }),
      ]);
    },
  });
};
