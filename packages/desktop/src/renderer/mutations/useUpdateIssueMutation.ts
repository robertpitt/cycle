import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateTicketPatch } from "@cycle/contracts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";
import { useNotifications } from "../notifications/NotificationProvider.tsx";

type UseUpdateIssueMutationOptions = {
  readonly issueId?: string;
  readonly repositoryId?: string;
};

export const useUpdateIssueMutation = ({
  issueId,
  repositoryId,
}: UseUpdateIssueMutationOptions) => {
  const queryClient = useQueryClient();
  const notifications = useNotifications();

  return useMutation({
    mutationFn: async (patch: UpdateTicketPatch) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before updating it.");
      }

      return cycleApiClient.call("ticket.issue.update", {
        input: {
          id: issueId,
          patch,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onError: (error) => {
      notifications.notify({
        description:
          error instanceof Error ? error.message : "Cycle could not save the issue update.",
        durationMs: 9000,
        title: "Issue update failed",
        tone: "danger",
      });
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: issueDetailQueryKey(repositoryId, issueId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueListRootQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: issueRecordsQueryKey(repositoryId, issueId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueHistoryQueryKey(repositoryId, issueId),
        }),
      ]);
    },
  });
};
