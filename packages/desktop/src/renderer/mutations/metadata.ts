import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateIssueTemplateInput,
  CreateOrUpdateUserProfileInput,
  CreateSavedViewInput,
  CreateTicketInput,
  InitiativeUpdatePayload,
  UpdateIssueTemplatePatch,
  UpdateSavedViewPatch,
  UpsertLabelDefinitionInput,
} from "@cycle/database";
import { ticketRpcClient } from "../lib/ticketRpcClient.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import {
  issueDetailQueryKey,
  issueListRootQueryKey,
  issueRecordsQueryKey,
} from "../queries/issues.ts";
import {
  initiativeProgressQueryKey,
  labelsQueryKey,
  templatesQueryKey,
  usersQueryKey,
  viewsQueryKey,
} from "../queries/metadata.ts";

type RepositoryMutationOptions = {
  readonly repositoryId?: string;
};

type IssueScopedMutationOptions = RepositoryMutationOptions & {
  readonly issueId?: string;
};

const requireRepositoryId = (repositoryId: string | undefined, message: string): string => {
  if (!repositoryId) {
    throw new Error(message);
  }

  return repositoryId;
};

const invalidateIssueMutationQueries = async ({
  issueId,
  queryClient,
  repositoryId,
}: IssueScopedMutationOptions & {
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
  ]);
};

export const useUpsertUserMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrUpdateUserProfileInput) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before updating user profiles.",
      );

      return ticketRpcClient.call("ticket.user.upsert", {
        input,
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryKey(repositoryId),
      });
    },
  });
};

export const useUpsertLabelMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertLabelDefinitionInput) => {
      const id = requireRepositoryId(repositoryId, "Choose a repository before updating labels.");

      return ticketRpcClient.call("ticket.label.upsert", {
        input,
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: labelsQueryKey(repositoryId),
      });
    },
  });
};

export const useArchiveLabelMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (labelId: string) => {
      const id = requireRepositoryId(repositoryId, "Choose a repository before archiving labels.");

      return ticketRpcClient.call("ticket.label.archive", {
        input: {
          id: labelId,
        },
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: labelsQueryKey(repositoryId),
      });
    },
  });
};

export const useCreateSavedViewMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSavedViewInput) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before creating saved views.",
      );

      return ticketRpcClient.call("ticket.view.create", {
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
      patch,
      viewId,
    }: {
      readonly patch: UpdateSavedViewPatch;
      readonly viewId: string;
    }) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before updating saved views.",
      );

      return ticketRpcClient.call("ticket.view.update", {
        input: {
          id: viewId,
          patch,
        },
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

export const useDeleteSavedViewMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (viewId: string) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before deleting saved views.",
      );

      return ticketRpcClient.call("ticket.view.delete", {
        input: {
          id: viewId,
        },
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

export const useCreateIssueTemplateMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateIssueTemplateInput) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before creating issue templates.",
      );

      return ticketRpcClient.call("ticket.template.create", {
        input,
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: templatesQueryKey(repositoryId),
      });
    },
  });
};

export const useUpdateIssueTemplateMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      patch,
      templateId,
    }: {
      readonly patch: UpdateIssueTemplatePatch;
      readonly templateId: string;
    }) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before updating issue templates.",
      );

      return ticketRpcClient.call("ticket.template.update", {
        input: {
          id: templateId,
          patch,
        },
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: templatesQueryKey(repositoryId),
      });
    },
  });
};

export const useArchiveIssueTemplateMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before archiving issue templates.",
      );

      return ticketRpcClient.call("ticket.template.archive", {
        input: {
          id: templateId,
        },
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: templatesQueryKey(repositoryId),
      });
    },
  });
};

export const useCreateInitiativeMutation = ({ repositoryId }: RepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<CreateTicketInput, "repository">) => {
      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before creating initiatives.",
      );

      return ticketRpcClient.call("ticket.initiative.create", {
        input: {
          ...input,
          repository: id,
        },
        repository: {
          id,
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

export const useAddInitiativeUpdateMutation = ({
  issueId,
  repositoryId,
}: IssueScopedMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InitiativeUpdatePayload) => {
      if (!issueId) {
        throw new Error("Choose an initiative before adding an update.");
      }

      const id = requireRepositoryId(
        repositoryId,
        "Choose a repository before adding initiative updates.",
      );

      return ticketRpcClient.call("ticket.initiative.update.add", {
        input: {
          id: issueId,
          update: input,
        },
        repository: {
          id,
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateIssueMutationQueries({
          issueId,
          queryClient,
          repositoryId,
        }),
        queryClient.invalidateQueries({
          queryKey: initiativeProgressQueryKey(repositoryId, issueId),
        }),
      ]);
    },
  });
};
