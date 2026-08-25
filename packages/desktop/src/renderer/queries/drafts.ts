import { useQuery } from "@tanstack/react-query";
import { cycleApiClient } from "../lib/cycleApiClient.ts";

export const draftsQueryKey = (repositoryId?: string) => ["drafts", repositoryId] as const;

export const useDraftListQuery = (repositoryId?: string) =>
  useQuery({
    enabled: Boolean(repositoryId),
    queryFn: () => {
      if (!repositoryId) throw new Error("Choose a repository before loading drafts.");
      return cycleApiClient.listDrafts(repositoryId);
    },
    queryKey: draftsQueryKey(repositoryId),
  });
