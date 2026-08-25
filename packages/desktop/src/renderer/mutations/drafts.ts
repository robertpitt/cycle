import type { CreateDraftInput, UpdateDraftInput } from "@cycle/contracts/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { draftsQueryKey } from "../queries/drafts.ts";
import { issueListRootQueryKey } from "../queries/issues.ts";

type DraftMutationOptions = {
  readonly repositoryId?: string;
};

const requireRepositoryId = (repositoryId?: string): string => {
  if (!repositoryId) throw new Error("Choose a repository before managing drafts.");
  return repositoryId;
};

export const useCreateDraftMutation = ({ repositoryId }: DraftMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDraftInput) =>
      cycleApiClient.createDraft(requireRepositoryId(repositoryId), input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: draftsQueryKey(repositoryId) });
    },
  });
};

export const useUpdateDraftMutation = ({ repositoryId }: DraftMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDraftInput) =>
      cycleApiClient.updateDraft(requireRepositoryId(repositoryId), input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: draftsQueryKey(repositoryId) });
    },
  });
};

export const useCommitDraftMutation = ({ repositoryId }: DraftMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draftId: string) =>
      cycleApiClient.commitDraft(requireRepositoryId(repositoryId), draftId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: draftsQueryKey(repositoryId) }),
        queryClient.invalidateQueries({ queryKey: issueListRootQueryKey }),
      ]);
    },
  });
};
