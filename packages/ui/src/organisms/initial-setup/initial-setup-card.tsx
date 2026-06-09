import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import * as React from "react";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { Input } from "../../atoms/input/index.ts";
import { StatusIndicator } from "../../atoms/status-indicator/index.ts";
import { Switch } from "../../atoms/switch/index.ts";
import { cn } from "../../lib/cn.ts";

export type InitialSetupHarness = {
  readonly description?: string;
  readonly executablePath?: string;
  readonly id: string;
  readonly name: string;
  readonly status: "available" | "missing";
};

export type InitialSetupStep = "profile" | "harnesses";

export type InitialSetupCardProps = React.HTMLAttributes<HTMLElement> & {
  readonly detectingHarnesses?: boolean;
  readonly email: string;
  readonly enabledHarnessIds: ReadonlySet<string>;
  readonly error?: React.ReactNode;
  readonly fullName: string;
  readonly harnessNotice?: React.ReactNode;
  readonly harnesses: readonly InitialSetupHarness[];
  readonly saving?: boolean;
  readonly step: InitialSetupStep;
  readonly onBack?: () => void;
  readonly onEmailChange: (value: string) => void;
  readonly onFinish: () => void;
  readonly onFullNameChange: (value: string) => void;
  readonly onHarnessEnabledChange: (id: string, enabled: boolean) => void;
  readonly onNext: () => void;
};

const stepIndex = {
  harnesses: 2,
  profile: 1,
} satisfies Record<InitialSetupStep, number>;

export const InitialSetupCard = React.forwardRef<HTMLElement, InitialSetupCardProps>(
  function InitialSetupCard(
    {
      className,
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
      ...props
    },
    ref,
  ) {
    const canContinueProfile = fullName.trim().length > 1 && email.trim().includes("@");
    const availableHarnesses = harnesses.filter((harness) => harness.status === "available");

    return (
      <section
        {...props}
        ref={ref}
        className={cn(
          "mx-auto grid w-full max-w-[520px] gap-5 rounded-lg border border-border bg-surface p-6 shadow-card",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <Badge appearance="outline">Step {stepIndex[step]} of 2</Badge>
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-8 rounded-full bg-primary")} />
            <span
              className={cn(
                "h-1.5 w-8 rounded-full",
                step === "harnesses" ? "bg-primary" : "bg-muted",
              )}
            />
          </div>
        </div>

        {step === "profile" ? (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <h2 className="text-xl font-semibold tracking-normal">Set up your profile</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Your name and email are used when Cycle creates and annotates local tickets.
              </p>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                Full name
                <Input
                  autoComplete="name"
                  onChange={(event) => onFullNameChange(event.target.value)}
                  placeholder="Robert Pitt"
                  value={fullName}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Email address
                <Input
                  autoComplete="email"
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="robert@example.com"
                  type="email"
                  value={email}
                />
              </label>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              disabled={!canContinueProfile}
              onClick={onNext}
              rightIcon={<ArrowRight aria-hidden className="size-4" />}
            >
              Continue
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <h2 className="text-xl font-semibold tracking-normal">Harness support</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Cycle found the local agent harnesses below. Choose which ones should be available
                inside the desktop workspace.
              </p>
            </div>
            {harnessNotice ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-5 text-warning">
                {harnessNotice}
              </div>
            ) : null}

            <div className="grid gap-2">
              {detectingHarnesses ? (
                <div className="flex h-20 items-center justify-center gap-2 rounded-md border border-border bg-background text-sm text-muted-foreground">
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  Detecting harnesses
                </div>
              ) : null}
              {!detectingHarnesses && harnesses.length === 0 ? (
                <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                  No supported harnesses were detected yet.
                </div>
              ) : null}
              {harnesses.map((harness) => {
                const available = harness.status === "available";
                const enabled = available && enabledHarnessIds.has(harness.id);

                return (
                  <div
                    className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3 py-3"
                    key={harness.id}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusIndicator
                          label={available ? "Available" : "Missing"}
                          tone={available ? "success" : "neutral"}
                        />
                        <p className="truncate text-sm font-medium">{harness.name}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {harness.executablePath ??
                          harness.description ??
                          (available ? "Available on this machine" : "Executable was not found")}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      disabled={!available}
                      onCheckedChange={(checked) => onHarnessEnabledChange(harness.id, checked)}
                    />
                  </div>
                );
              })}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center justify-between gap-3">
              <Button
                leftIcon={<ArrowLeft aria-hidden className="size-4" />}
                onClick={onBack}
                variant="outline"
              >
                Back
              </Button>
              <Button
                disabled={saving || detectingHarnesses}
                leftIcon={
                  saving ? (
                    <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Check aria-hidden className="size-4" />
                  )
                }
                onClick={onFinish}
              >
                {availableHarnesses.length === 0 ? "Finish setup" : "Enable and finish"}
              </Button>
            </div>
          </div>
        )}
      </section>
    );
  },
);
