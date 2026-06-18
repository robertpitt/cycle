import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultAppConfig, type AppConfigState } from "../../shared/AppConfig.ts";
import type { AgentProviderId } from "../../shared/AgentProviders.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
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

      const bridge = getDesktopBridge();
      try {
        return await cycleApiClient.completeOnboarding(input);
      } catch (error) {
        if (bridge) return bridge.completeOnboarding(input);
        throw error;
      }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(appConfigQueryKey, next);
      onCompleted();
    },
  });
};
