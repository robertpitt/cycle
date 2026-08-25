import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateSavedViewInput, UpdateSavedViewInput } from "@cycle/contracts/schemas";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { viewsQueryKey } from "../queries/metadata.ts";

type RepositoryMutationOptions = {
  readonly repositoryId?: string;
};

const requireRepositoryId = (repositoryId: string | undefined, message: string): string => {
  if (!repositoryId) {
    throw new Error(message);
  }

  return repositoryId;
};

export const useCreateSavedViewMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSavedViewInput) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before creating saved views.",
      );

      return cycleApiClient.call("ticket.view.create", {
        input,
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: viewsQueryKey(repositoryId),
      });
    },
  });
};

export const useUpdateSavedViewMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id: viewId,
      patch,
    }: {
      readonly id: string;
      readonly patch: UpdateSavedViewInput;
    }) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before updating saved views.",
      );
      return cycleApiClient.call("ticket.view.update", {
        input: { id: viewId, patch },
        repository: { id },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: viewsQueryKey(repositoryId) });
    },
  });
};

export const useArchiveSavedViewMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (viewId: string) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before archiving saved views.",
      );
      return cycleApiClient.call("ticket.view.delete", {
        input: { id: viewId },
        repository: { id },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: viewsQueryKey(repositoryId) });
    },
  });
};
