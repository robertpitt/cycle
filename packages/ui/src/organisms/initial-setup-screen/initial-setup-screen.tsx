import * as React from "react";
import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { AppShellRoot } from "../app-shell/index.ts";
import {
  InitialSetupCard,
  type InitialSetupHarness,
  type InitialSetupStep,
} from "../initial-setup/index.ts";

export type InitialSetupScreenProps = {
  readonly detectingHarnesses?: boolean;
  readonly email: string;
  readonly enabledHarnessIds: ReadonlySet<string>;
  readonly error?: React.ReactNode;
  readonly fullName: string;
  readonly harnessNotice?: React.ReactNode;
  readonly harnesses: readonly InitialSetupHarness[];
  readonly onBack: () => void;
  readonly onEmailChange: (value: string) => void;
  readonly onFinish: () => void;
  readonly onFullNameChange: (value: string) => void;
  readonly onHarnessEnabledChange: (id: string, enabled: boolean) => void;
  readonly onNext: () => void;
  readonly saving?: boolean;
  readonly step: InitialSetupStep;
};

export const InitialSetupScreen = ({
  detectingHarnesses = false,
  email,
  enabledHarnessIds,
  error,
  fullName,
  harnessNotice,
  harnesses,
  onBack,
  onEmailChange,
  onFinish,
  onFullNameChange,
  onHarnessEnabledChange,
  onNext,
  saving = false,
  step,
}: InitialSetupScreenProps) => (
  <AppShellRoot className="grid min-h-screen place-items-center p-6">
    <div className="grid w-full justify-items-center gap-6">
      <BrandMark />
      <InitialSetupCard
        detectingHarnesses={detectingHarnesses}
        email={email}
        enabledHarnessIds={enabledHarnessIds}
        error={error}
        fullName={fullName}
        harnessNotice={harnessNotice}
        harnesses={harnesses}
        onBack={onBack}
        onEmailChange={onEmailChange}
        onFinish={onFinish}
        onFullNameChange={onFullNameChange}
        onHarnessEnabledChange={onHarnessEnabledChange}
        onNext={onNext}
        saving={saving}
        step={step}
      />
    </div>
  </AppShellRoot>
);
