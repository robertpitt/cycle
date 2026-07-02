import { useQuery } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const agentTasksQueryKey = (input?: {
  readonly repositoryId?: string;
  readonly ticketId?: string;
}) => ["desktop", "agentTasks", input?.repositoryId ?? null, input?.ticketId ?? null] as const;

export const agentTaskEventsQueryKey = (taskId?: string | null) =>
  ["desktop", "agentTaskEvents", taskId ?? null] as const;

export const useAgentTasksQuery = (input: {
  readonly repositoryId?: string;
  readonly ticketId?: string;
}) =>
  useQuery({
    queryFn: () =>
      cycleApiClient.listAgentTasks({
        originKind: "ticket",
        repositoryId: input.repositoryId,
        ticketId: input.ticketId,
      }),
    queryKey: agentTasksQueryKey(input),
    refetchInterval: 10_000,
    retry: false,
  });

export const useAgentTaskEventsQuery = (taskId?: string | null) =>
  useQuery({
    enabled: Boolean(taskId),
    queryFn: () => {
      if (!taskId) throw new Error("Choose a task before loading events.");
      return cycleApiClient.listAgentTaskEvents(taskId);
    },
    queryKey: agentTaskEventsQueryKey(taskId),
    refetchInterval: 3_000,
    retry: false,
  });
