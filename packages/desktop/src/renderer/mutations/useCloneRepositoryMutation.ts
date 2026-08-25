import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RepositoryRecord } from "@cycle/config";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";

export const useCloneRepositoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (remoteUrl: string): Promise<RepositoryRecord | null> => {
      const bridge = getDesktopBridge();
      if (bridge === undefined) {
        throw new Error("Repository cloning requires the Cycle desktop app.");
      }

      const selection = await bridge.selectCloneDestinationFolder();
      if (selection.status === "cancelled") return null;

      await cycleApiClient.cloneRepositoryPath({
        path: selection.path,
        remoteUrl,
      });
      await cycleApiClient.openRepositoryPath({ path: selection.path, syncOnOpen: true });
      const nextConfig = await cycleApiClient.getAppConfig();
      queryClient.setQueryData(appConfigQueryKey, nextConfig);
      return (
        nextConfig.localWorkspace.repositories.find(
          (repository) => repository.path === selection.path,
        ) ?? null
      );
    },
  });
};
