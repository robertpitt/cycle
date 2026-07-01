import { useQuery } from "@tanstack/react-query";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const agentSettingsQueryKey = ["desktop", "agentSettings"] as const;
export const agentActivityQueryKey = ["desktop", "agentActivity"] as const;
export const agentJobLogQueryKey = (jobId?: string | null) =>
  ["desktop", "agentJobLog", jobId ?? null] as const;
export const agentJobsQueryKey = (input?: {
  readonly repositoryId?: string;
  readonly ticketId?: string;
}) => ["desktop", "agentJobs", input?.repositoryId ?? null, input?.ticketId ?? null] as const;
export const issueAgentDelegateQueryKey = (
  repositoryId?: string | null,
  issueId?: string | null,
) => ["desktop", "issueAgentDelegate", repositoryId ?? null, issueId ?? null] as const;
export const repositoryAgentSettingsQueryKey = (repositoryId?: string) =>
  ["desktop", "repositoryAgentSettings", repositoryId ?? null] as const;

export const useAgentSettingsQuery = (providers?: readonly DetectedAgentProvider[]) =>
  useQuery({
    queryFn: () => cycleApiClient.getAgentSettings(providers),
    queryKey: agentSettingsQueryKey,
    retry: false,
  });

export const useRepositoryAgentSettingsQuery = (repositoryId?: string) =>
  useQuery({
    enabled: Boolean(repositoryId),
    queryFn: () => {
      if (!repositoryId) throw new Error("Choose a repository before loading agent settings.");
      return cycleApiClient.getRepositoryAgentSettings(repositoryId);
    },
    queryKey: repositoryAgentSettingsQueryKey(repositoryId),
    retry: false,
  });

export const useAgentJobsQuery = (input: {
  readonly repositoryId?: string;
  readonly ticketId?: string;
}) =>
  useQuery({
    queryFn: () =>
      cycleApiClient.listAgentJobs({
        repositoryId: input.repositoryId,
        ticketId: input.ticketId,
      }),
    queryKey: agentJobsQueryKey(input),
    refetchInterval: 10_000,
    retry: false,
  });

export const useIssueAgentDelegateQuery = (repositoryId?: string | null, issueId?: string | null) =>
  useQuery({
    enabled: Boolean(repositoryId && issueId),
    queryFn: () => {
      if (!repositoryId || !issueId) {
        throw new Error("Choose an issue before loading its agent delegate.");
      }
      return cycleApiClient.getIssueAgentDelegate(repositoryId, issueId);
    },
    queryKey: issueAgentDelegateQueryKey(repositoryId, issueId),
    retry: false,
  });

export const useAgentJobLogQuery = (jobId?: string | null) =>
  useQuery({
    enabled: Boolean(jobId),
    queryFn: () => {
      if (!jobId) throw new Error("Choose a job before loading its log.");
      return cycleApiClient.getAgentJobLog(jobId);
    },
    queryKey: agentJobLogQueryKey(jobId),
    refetchInterval: 3_000,
    retry: false,
  });

export const useAgentActivityQuery = () =>
  useQuery({
    queryFn: () => cycleApiClient.getAgentActivity(),
    queryKey: agentActivityQueryKey,
    refetchInterval: 5_000,
    retry: false,
  });
