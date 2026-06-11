import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultAppConfig, type AppConfigState } from "../../shared/AppConfig.ts";
import type { InitializeRepositoryPathInput } from "../../shared/LocalWorkspace.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { makeFallbackRepository } from "../lib/repositories.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";

type UseInitialiseRepositoryMutationOptions = {
  readonly appConfig?: AppConfigState;
  readonly onErrorMessage: (error?: React.ReactNode) => void;
  readonly onInitialised: () => void;
};

export const useInitialiseRepositoryMutation = ({
  appConfig,
  onErrorMessage,
  onInitialised,
}: UseInitialiseRepositoryMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InitializeRepositoryPathInput) => {
      const bridge = getDesktopBridge();
      if (bridge) return bridge.initializeRepositoryPath(input);
      return makeFallbackRepository(input.path);
    },
    onMutate: () => {
      onErrorMessage(undefined);
    },
    onSuccess: async (repository) => {
      onInitialised();

      const bridge = getDesktopBridge();
      if (bridge) {
        queryClient.setQueryData(appConfigQueryKey, await bridge.getAppConfig());
        return;
      }

      const current = appConfig ?? defaultAppConfig();
      queryClient.setQueryData(appConfigQueryKey, {
        ...current,
        localWorkspace: {
          repositories: [
            ...current.localWorkspace.repositories.filter(
              (candidate) => candidate.id !== repository.id,
            ),
            repository,
          ],
        },
      } satisfies AppConfigState);
    },
    onError: (error) => {
      onErrorMessage(error instanceof Error ? error.message : "Unable to initialise repository.");
    },
  });
};
