import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StartIssueAgentTaskInput } from "../lib/agentTasks.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { agentTaskEventsQueryKey, agentTasksQueryKey } from "../queries/agentTasks.ts";
import { issueHistoryQueryKey } from "../queries/issueHistory.ts";
import { issueRecordsQueryKey } from "../queries/issues.ts";

export const useCancelAgentTaskMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => cycleApiClient.cancelAgentTask(taskId),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: agentTaskEventsQueryKey(task?.taskId) });
      void queryClient.invalidateQueries({
        queryKey: agentTasksQueryKey({
          repositoryId: originField(task, "repositoryId"),
          ticketId: originField(task, "ticketId"),
        }),
      });
    },
  });
};

export const useRetryAgentTaskMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => cycleApiClient.retryAgentTask(taskId),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: agentTaskEventsQueryKey(task?.taskId) });
      void queryClient.invalidateQueries({
        queryKey: agentTasksQueryKey({
          repositoryId: originField(task, "repositoryId"),
          ticketId: originField(task, "ticketId"),
        }),
      });
    },
  });
};

export const useStartIssueAgentTaskMutation = (input: {
  readonly issueId?: string;
  readonly repositoryId?: string;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: StartIssueAgentTaskInput) => {
      if (!input.repositoryId || !input.issueId) {
        throw new Error("Choose an issue before starting an agent task.");
      }
      return cycleApiClient.startIssueAgentTask(input.repositoryId, input.issueId, payload);
    },
    onSuccess: (task) => {
      const repositoryId = originField(task, "repositoryId") ?? input.repositoryId;
      const issueId = originField(task, "ticketId") ?? input.issueId;

      if (repositoryId && issueId) {
        void queryClient.invalidateQueries({
          queryKey: agentTasksQueryKey({ repositoryId, ticketId: issueId }),
        });
        void queryClient.invalidateQueries({
          queryKey: issueHistoryQueryKey(repositoryId, issueId),
        });
        void queryClient.invalidateQueries({
          queryKey: issueRecordsQueryKey(repositoryId, issueId),
        });
      }
    },
  });
};

const originField = (
  task: { readonly origin?: Readonly<Record<string, unknown>> } | null | undefined,
  field: string,
): string | undefined => {
  const value = task?.origin?.[field];
  return typeof value === "string" ? value : undefined;
};
