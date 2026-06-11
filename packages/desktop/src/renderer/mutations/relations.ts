import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { IssueRelation } from "@cycle/contracts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";

type UseIssueRelationMutationOptions = {
  readonly issueId?: string;
  readonly repositoryId?: string;
};

const invalidateRelationQueries = async ({
  issueId,
  queryClient,
  relatedIssueId,
  repositoryId,
}: UseIssueRelationMutationOptions & {
  readonly queryClient: ReturnType<typeof useQueryClient>;
  readonly relatedIssueId: string;
}) => {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: issueDetailQueryKey(repositoryId, issueId),
    }),
    queryClient.invalidateQueries({
      queryKey: issueDetailQueryKey(repositoryId, relatedIssueId),
    }),
    queryClient.invalidateQueries({
      queryKey: issueRecordsQueryKey(repositoryId, issueId),
    }),
    queryClient.invalidateQueries({
      queryKey: issueRecordsQueryKey(repositoryId, relatedIssueId),
    }),
    queryClient.invalidateQueries({
      queryKey: issueHistoryQueryKey(repositoryId, issueId),
    }),
    queryClient.invalidateQueries({
      queryKey: issueHistoryQueryKey(repositoryId, relatedIssueId),
    }),
    queryClient.invalidateQueries({
      queryKey: issueListRootQueryKey,
    }),
  ]);
};

export const useAddIssueRelationMutation = ({
  issueId,
  repositoryId,
}: UseIssueRelationMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (relation: IssueRelation) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before adding a relation.");
      }

      return ticketRpcClient.call("ticket.issue.relation.add", {
        input: {
          id: issueId,
          relation,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: (_ticket, relation) =>
      invalidateRelationQueries({
        issueId,
        queryClient,
        relatedIssueId: relation.issueId,
        repositoryId,
      }),
  });
};

export const useRemoveIssueRelationMutation = ({
  issueId,
  repositoryId,
}: UseIssueRelationMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (relation: IssueRelation) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before removing a relation.");
      }

      return ticketRpcClient.call("ticket.issue.relation.remove", {
        input: {
          id: issueId,
          relation,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: (_ticket, relation) =>
      invalidateRelationQueries({
        issueId,
        queryClient,
        relatedIssueId: relation.issueId,
        repositoryId,
      }),
  });
};
