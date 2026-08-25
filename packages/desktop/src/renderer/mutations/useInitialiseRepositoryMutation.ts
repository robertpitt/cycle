import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  defaultAppConfig,
  type AppConfigEncoded as AppConfigState,
  type RepositoryRecord,
} from "@cycle/config";
import type { InitializeRepositoryPathInput } from "@cycle/config";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
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
    mutationFn: async (input: InitializeRepositoryPathInput): Promise<RepositoryRecord> => {
      await cycleApiClient.initializeRepositoryPath(input);
      await cycleApiClient.openRepositoryPath({ path: input.path, syncOnOpen: true });
      const nextConfig = await cycleApiClient.getAppConfig();
      const repository = nextConfig.localWorkspace.repositories.find(
        (candidate) => candidate.path === input.path,
      );
      if (repository === undefined) {
        throw new Error("Repository was initialised but was not found in app config.");
      }
      return repository;
    },
    onMutate: () => {
      onErrorMessage(undefined);
    },
    onSuccess: (repository) => {
      onInitialised();

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
