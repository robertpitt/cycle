import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TicketPage } from "@cycle/database";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { issueListQueryKey, issueListRootQueryKey } from "../queries/issues.ts";

type UseCreateMockIssueMutationOptions = {
  readonly repositoryId?: string;
};

export const useCreateMockIssueMutation = ({ repositoryId }: UseCreateMockIssueMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!repositoryId) {
        throw new Error("Choose a repository before creating an issue.");
      }

      const current = queryClient.getQueryData<TicketPage>(issueListQueryKey(repositoryId, {}));
      const nextNumber = (current?.entries.length ?? 0) + 1;

      return ticketRpcClient.call("ticket.issue.create", {
        input: {
          body: "This mock issue was created from the desktop renderer.",
          labels: ["mock"],
          priority: "medium",
          repository: repositoryId,
          status: "backlog",
          title: `Mock ticket ${nextNumber}`,
          type: "issue",
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: issueListRootQueryKey,
      });
    },
  });
};
