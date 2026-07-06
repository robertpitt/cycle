import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultAppConfig, type AppConfigState } from "@cycle/config/app-config";
import type { UpdateRepositoryPreferencesInput } from "../../shared/LocalWorkspace.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";

type UseUpdateRepositoryPreferencesMutationOptions = {
  readonly appConfig?: AppConfigState;
};

export const useUpdateRepositoryPreferencesMutation = ({
  appConfig,
}: UseUpdateRepositoryPreferencesMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateRepositoryPreferencesInput) => {
      return cycleApiClient.updateRepositoryPreferences(input);
    },
    onSuccess: (repository, input) => {
      if (!repository) return;

      queryClient.setQueryData<AppConfigState>(appConfigQueryKey, (current) => {
        const state = current ?? appConfig ?? defaultAppConfig();
        return {
          ...state,
          localWorkspace: {
            repositories: state.localWorkspace.repositories.map((candidate) =>
              candidate.id === input.id ? repository : candidate,
            ),
          },
        };
      });
    },
  });
};
