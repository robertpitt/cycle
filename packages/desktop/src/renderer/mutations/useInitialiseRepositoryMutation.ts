import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  defaultAppConfig,
  type AppConfigState,
  type RepositoryRecord,
} from "@cycle/contracts/schemas/app";
import type { InitializeRepositoryPathInput } from "@cycle/contracts/schemas/app";
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
    mutationFn: async (_input: InitializeRepositoryPathInput): Promise<RepositoryRecord> => {
      throw new Error("Repository initialisation is not available through the Cycle API yet.");
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
