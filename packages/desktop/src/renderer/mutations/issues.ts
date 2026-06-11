import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ArchiveTicketInput, DeleteTicketInput, RestoreTicketInput } from "@cycle/contracts";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";
import { issueSearchQueryKey } from "../queries/search.ts";

type IssueMutationOptions = {
  readonly issueId?: string;
  readonly repositoryId?: string;
};

const invalidateIssueMutationQueries = async ({
  issueId,
  queryClient,
  repositoryId,
}: IssueMutationOptions & {
  readonly queryClient: ReturnType<typeof useQueryClient>;
}) => {
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
      queryKey: issueSearchQueryKey(repositoryId, {
        text: "",
      }),
    }),
  ]);
};

export const useArchiveIssueMutation = ({ issueId, repositoryId }: IssueMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ArchiveTicketInput = {}) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before archiving it.");
      }

      return ticketRpcClient.call("ticket.issue.archive", {
        input: {
          id: issueId,
          reason: input.reason,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: () =>
      invalidateIssueMutationQueries({
        issueId,
        queryClient,
        repositoryId,
      }),
  });
};

export const useDeleteIssueMutation = ({ issueId, repositoryId }: IssueMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeleteTicketInput = {}) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before deleting it.");
      }

      return ticketRpcClient.call("ticket.issue.delete", {
        input: {
          id: issueId,
          reason: input.reason,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: () =>
      invalidateIssueMutationQueries({
        issueId,
        queryClient,
        repositoryId,
      }),
  });
};

export const useRestoreIssueMutation = ({ issueId, repositoryId }: IssueMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RestoreTicketInput = {}) => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before restoring it.");
      }

      return ticketRpcClient.call("ticket.issue.restore", {
        input: {
          id: issueId,
          reason: input.reason,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
    onSuccess: () =>
      invalidateIssueMutationQueries({
        issueId,
        queryClient,
        repositoryId,
      }),
  });
};
