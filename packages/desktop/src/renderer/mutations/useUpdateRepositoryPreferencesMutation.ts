import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultAppConfig, type AppConfigState } from "../../shared/AppConfig.ts";
import type { UpdateRepositoryPreferencesInput } from "../../shared/LocalWorkspace.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
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
      const bridge = getDesktopBridge();

      try {
        return await cycleApiClient.updateRepositoryPreferences(input);
      } catch (error) {
        if (bridge) return bridge.updateRepositoryPreferences(input);
        throw error;
      }
    },
    onSuccess: async (repository, input) => {
      const bridge = getDesktopBridge();
      if (bridge) {
        queryClient.setQueryData(appConfigQueryKey, await bridge.getAppConfig());
        return;
      }

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
