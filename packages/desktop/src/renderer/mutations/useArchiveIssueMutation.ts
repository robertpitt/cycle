import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { useNotifications } from "../notifications/NotificationProvider.tsx";
import { inboxRootQueryKey } from "../queries/inbox.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";

type UseArchiveIssueMutationOptions = {
  readonly issueId?: string;
  readonly onArchived?: () => void;
  readonly repositoryId?: string;
};

export const useArchiveIssueMutation = ({
  issueId,
  onArchived,
  repositoryId,
}: UseArchiveIssueMutationOptions) => {
  const queryClient = useQueryClient();
  const notifications = useNotifications();

  return useMutation({
    mutationFn: async () => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before archiving it.");
      }

      return cycleApiClient.call("ticket.issue.archive", {
        input: {
          id: issueId,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onError: (error) => {
      notifications.notify({
        description: error instanceof Error ? error.message : "Cycle could not archive the issue.",
        durationMs: 9000,
        title: "Issue archive failed",
        tone: "danger",
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
        queryClient.invalidateQueries({
          queryKey: issueHistoryQueryKey(repositoryId, issueId),
        }),
        queryClient.invalidateQueries({
          queryKey: inboxRootQueryKey,
        }),
      ]);
      onArchived?.();
    },
  });
};
