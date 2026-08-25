import type { IssueRelation } from "@cycle/contracts/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import { issueDetailQueryKey, issueListRootQueryKey } from "../queries/issues.ts";
import { useNotifications } from "../notifications/NotificationProvider.tsx";

export type IssueRelationAction =
  | { readonly kind: "add"; readonly relation: IssueRelation }
  | { readonly kind: "remove"; readonly relation: IssueRelation }
  | {
      readonly kind: "replace";
      readonly next: IssueRelation;
      readonly previous: IssueRelation;
    };

export const useIssueRelationMutation = ({
  issueId,
  repositoryId,
}: {
  readonly issueId?: string;
  readonly repositoryId?: string;
}) => {
  const notifications = useNotifications();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: IssueRelationAction) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before changing relationships.");
      }

      const call = (kind: "add" | "remove", relation: IssueRelation) =>
        cycleApiClient.call(`ticket.issue.relation.${kind}`, {
          input: { id: issueId, relation },
          repository: { id: repositoryId },
        });

      if (action.kind === "replace") {
        await call("remove", action.previous);
        return call("add", action.next);
      }

      return call(action.kind, action.relation);
    },
    onError: (error) => {
      notifications.notify({
        description:
          error instanceof Error ? error.message : "Cycle could not change the relationship.",
        durationMs: 9000,
        title: "Relationship update failed",
        tone: "danger",
      });
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: issueDetailQueryKey(repositoryId, issueId) }),
        queryClient.invalidateQueries({ queryKey: issueListRootQueryKey }),
        queryClient.invalidateQueries({ queryKey: issueHistoryQueryKey(repositoryId, issueId) }),
      ]);
    },
  });
};
