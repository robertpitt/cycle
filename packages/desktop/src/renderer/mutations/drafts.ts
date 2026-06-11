import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTicketDraftInput, UpdateTicketDraftInput } from "@cycle/database";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { issueListRootQueryKey } from "../queries/issues.ts";

type DraftMutationOptions = {
  readonly repositoryId?: string;
};

export const useCreateDraftMutation = ({ repositoryId }: DraftMutationOptions) =>
  useMutation({
    mutationFn: async (input: CreateTicketDraftInput) => {
      if (!repositoryId) {
        throw new Error("Choose a repository before creating a draft.");
      }

      return ticketRpcClient.call("ticket.draft.create", {
        input,
        repository: {
          id: repositoryId,
        },
      });
    },
  });

export const useUpdateDraftMutation = ({ repositoryId }: DraftMutationOptions) =>
  useMutation({
    mutationFn: async ({
      draftId,
      input,
    }: {
      readonly draftId: string;
      readonly input: UpdateTicketDraftInput;
    }) => {
      if (!repositoryId) {
        throw new Error("Choose a repository before updating a draft.");
      }

      return ticketRpcClient.call("ticket.draft.update", {
        input: {
          draftId,
          ...input,
        },
        repository: {
          id: repositoryId,
        },
      });
    },
  });

export const useCommitDraftMutation = ({ repositoryId }: DraftMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      if (!repositoryId) {
        throw new Error("Choose a repository before committing a draft.");
      }

      return ticketRpcClient.call("ticket.draft.commit", {
        input: draftId,
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
