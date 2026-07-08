import {
  InitialSetupScreen,
  type InitialSetupHarness,
  type InitialSetupStep,
} from "@cycle/ui/organisms";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import * as React from "react";
import type { AppConfigState } from "@cycle/contracts/schemas/app";
import {
  isAgentProviderId,
  type AgentProviderId,
  type DetectedAgentProvider,
} from "@cycle/contracts/schemas/agents";

type SetupScreenProps = {
  readonly agentProvidersQuery: UseQueryResult<ReadonlyArray<DetectedAgentProvider>, Error>;
  readonly completeOnboarding: UseMutationResult<AppConfigState, Error, void>;
  readonly email: string;
  readonly enabledHarnessIds: ReadonlySet<AgentProviderId>;
  readonly fullName: string;
  readonly harnessNotice?: React.ReactNode;
  readonly harnesses: readonly InitialSetupHarness[];
  readonly setEmail: (value: string) => void;
  readonly setEnabledHarnessIds: React.Dispatch<React.SetStateAction<ReadonlySet<AgentProviderId>>>;
  readonly setFullName: (value: string) => void;
  readonly setSetupStep: (step: InitialSetupStep) => void;
  readonly setupStep: InitialSetupStep;
};

export const SetupScreen = ({
  agentProvidersQuery,
  completeOnboarding,
  email,
  enabledHarnessIds,
  fullName,
  harnessNotice,
  harnesses,
  setEmail,
  setEnabledHarnessIds,
  setFullName,
  setSetupStep,
  setupStep,
}: SetupScreenProps) => (
  <InitialSetupScreen
    detectingHarnesses={agentProvidersQuery.isLoading}
    email={email}
    enabledHarnessIds={enabledHarnessIds}
    error={completeOnboarding.error instanceof Error ? completeOnboarding.error.message : undefined}
    fullName={fullName}
    harnessNotice={harnessNotice}
    harnesses={harnesses}
    onBack={() => setSetupStep("profile")}
    onEmailChange={setEmail}
    onFinish={() => completeOnboarding.mutate()}
    onFullNameChange={setFullName}
    onHarnessEnabledChange={(id, enabled) => {
      if (!isAgentProviderId(id)) return;
      setEnabledHarnessIds((current) => {
        const next = new Set(current);
        if (enabled) next.add(id);
        else next.delete(id);
        return next;
      });
    }}
    onNext={() => setSetupStep("harnesses")}
    saving={completeOnboarding.isPending}
    step={setupStep}
  />
);
