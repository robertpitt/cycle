import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultAppConfig, type AppConfigState } from "@cycle/backend/client";
import type { AgentProviderId } from "@cycle/backend/client";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { appConfigQueryKey } from "../queries/appConfig.ts";

type UseCompleteOnboardingMutationOptions = {
  readonly appConfig?: AppConfigState;
  readonly email: string;
  readonly enabledHarnessIds: ReadonlySet<AgentProviderId>;
  readonly fullName: string;
  readonly onCompleted: () => void;
};

export const useCompleteOnboardingMutation = ({
  appConfig,
  email,
  enabledHarnessIds,
  fullName,
  onCompleted,
}: UseCompleteOnboardingMutationOptions) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const current = appConfig ?? defaultAppConfig();
      const input = {
        displayName: fullName,
        email,
        enabledAgentProviderIds: [...enabledHarnessIds],
        themePreference: current.theme.preference,
      } as const;

      return cycleApiClient.completeOnboarding(input);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(appConfigQueryKey, next);
      onCompleted();
    },
  });
};
