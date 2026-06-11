import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultAppConfig, type AppConfigState } from "../../shared/AppConfig.ts";
import { supportedAgentProviders, type AgentProviderId } from "../../shared/AgentProviders.ts";
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
      if (bridge) return bridge.completeOnboarding(input);

      return {
        ...current,
        onboarding: {
          completed: true,
          completedAt: new Date().toISOString(),
        },
        agentProviders: {
          preferences: supportedAgentProviders.map((provider) => ({
            enabled: enabledHarnessIds.has(provider.id),
            id: provider.id,
          })),
        },
        profile: {
          displayName: fullName.trim(),
          email: email.trim(),
        },
      } satisfies AppConfigState;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(appConfigQueryKey, next);
      onCompleted();
    },
  });
};
