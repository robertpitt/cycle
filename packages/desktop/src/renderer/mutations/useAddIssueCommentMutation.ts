import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";

type UseAddIssueCommentMutationOptions = {
  readonly issueId?: string;
  readonly repositoryId?: string;
};

export const useAddIssueCommentMutation = ({
  issueId,
  repositoryId,
}: UseAddIssueCommentMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before commenting.");
      }
      if (body.trim().length === 0) {
        throw new Error("Enter a comment before sending.");
      }

      return ticketRpcClient.call("ticket.record.add", {
        input: {
          issueId,
          payload: {
            body,
          },
          recordType: "comment",
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: issueRecordsQueryKey(repositoryId, issueId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueDetailQueryKey(repositoryId, issueId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueListRootQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: issueHistoryQueryKey(repositoryId, issueId),
        }),
      ]);
    },
  });
};
