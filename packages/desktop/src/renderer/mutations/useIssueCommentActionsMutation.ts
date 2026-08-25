import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";
import { useNotifications } from "../notifications/NotificationProvider.tsx";

export type IssueCommentAction =
  | {
      readonly body: string;
      readonly commentId: string;
      readonly kind: "edit";
    }
  | {
      readonly commentId: string;
      readonly kind: "archive";
    }
  | {
      readonly active: boolean;
      readonly commentId: string;
      readonly emoji: string;
      readonly kind: "reaction";
    };

type UseIssueCommentActionsMutationOptions = {
  readonly issueId?: string;
  readonly repositoryId?: string;
};

export const useIssueCommentActionsMutation = ({
  issueId,
  repositoryId,
}: UseIssueCommentActionsMutationOptions) => {
  const notifications = useNotifications();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: IssueCommentAction) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before changing a comment.");
      }

      if (action.kind === "edit" && action.body.trim().length === 0) {
        throw new Error("A comment cannot be empty.");
      }

      const record =
        action.kind === "edit"
          ? {
              payload: { body: action.body.trim(), commentId: action.commentId },
              recordType: "comment.edit",
            }
          : action.kind === "archive"
            ? {
                payload: { commentId: action.commentId },
                recordType: "comment.archive",
              }
            : {
                payload: {
                  commentId: action.commentId,
                  emoji: action.emoji,
                  operation: action.active ? "remove" : "add",
                },
                recordType: "comment.reaction",
              };

      return cycleApiClient.call("ticket.record.add", {
        input: {
          issueId,
          ...record,
        },
        repository: { id: repositoryId },
      });
    },
    onError: (error) => {
      notifications.notify({
        description: error instanceof Error ? error.message : "Cycle could not change the comment.",
        durationMs: 9000,
        title: "Comment update failed",
        tone: "danger",
      });
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: issueRecordsQueryKey(repositoryId, issueId) }),
        queryClient.invalidateQueries({ queryKey: issueDetailQueryKey(repositoryId, issueId) }),
        queryClient.invalidateQueries({ queryKey: issueListRootQueryKey }),
        queryClient.invalidateQueries({ queryKey: issueHistoryQueryKey(repositoryId, issueId) }),
      ]);
    },
  });
};
