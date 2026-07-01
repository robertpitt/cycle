import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import type {
  AgentSettingsPatch,
  RepositoryAgentSettingsPatch,
  StartAgentDelegateJobInput,
} from "../lib/agentWork.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import {
  agentActivityQueryKey,
  agentJobsQueryKey,
  agentSettingsQueryKey,
  issueAgentDelegateQueryKey,
  repositoryAgentSettingsQueryKey,
} from "../queries/agentWork.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import { issueRecordsQueryKey } from "../queries/issues.ts";

export const useUpdateAgentSettingsMutation = (providers?: readonly DetectedAgentProvider[]) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: AgentSettingsPatch) => cycleApiClient.updateAgentSettings(patch, providers),
    onSuccess: (settings) => {
      queryClient.setQueryData(agentSettingsQueryKey, settings);
      void queryClient.invalidateQueries({ queryKey: agentActivityQueryKey });
    },
  });
};

export const useUpdateRepositoryAgentSettingsMutation = (repositoryId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: RepositoryAgentSettingsPatch) => {
      if (!repositoryId) throw new Error("Choose a repository before saving agent settings.");
      return cycleApiClient.updateRepositoryAgentSettings(repositoryId, patch);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(repositoryAgentSettingsQueryKey(repositoryId), settings);
      void queryClient.invalidateQueries({ queryKey: agentActivityQueryKey });
      void queryClient.invalidateQueries({ queryKey: agentJobsQueryKey({ repositoryId }) });
    },
  });
};

export const useResumeAgentJobMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => cycleApiClient.resumeAgentJob(jobId),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: agentActivityQueryKey });
      void queryClient.invalidateQueries({
        queryKey: agentJobsQueryKey({
          repositoryId: job?.repositoryId,
          ticketId: job?.ticketId ?? undefined,
        }),
      });
    },
  });
};

export const useCancelAgentJobMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => cycleApiClient.cancelAgentJob(jobId),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: agentActivityQueryKey });
      void queryClient.invalidateQueries({
        queryKey: agentJobsQueryKey({
          repositoryId: job?.repositoryId,
          ticketId: job?.ticketId ?? undefined,
        }),
      });
    },
  });
};

export const useStartIssueAgentDelegateJobMutation = (input: {
  readonly issueId?: string;
  readonly repositoryId?: string;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: StartAgentDelegateJobInput) => {
      if (!input.repositoryId || !input.issueId) {
        throw new Error("Choose an issue before delegating it to an agent.");
      }
      return cycleApiClient.startIssueAgentDelegateJob(input.repositoryId, input.issueId, payload);
    },
    onSuccess: (result) => {
      const repositoryId = result?.job.repositoryId ?? input.repositoryId;
      const issueId = result?.job.ticketId ?? input.issueId;

      if (repositoryId && issueId) {
        if (result?.delegate) {
          queryClient.setQueryData(issueAgentDelegateQueryKey(repositoryId, issueId), result.delegate);
        }
        void queryClient.invalidateQueries({
          queryKey: agentJobsQueryKey({ repositoryId, ticketId: issueId }),
        });
        void queryClient.invalidateQueries({ queryKey: issueHistoryQueryKey(repositoryId, issueId) });
        void queryClient.invalidateQueries({ queryKey: issueRecordsQueryKey(repositoryId, issueId) });
      }

      void queryClient.invalidateQueries({ queryKey: agentActivityQueryKey });
    },
  });
};
