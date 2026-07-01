import { AlertCircle, Bot, CirclePause, Pause, Play, Square } from "lucide-react";
import * as React from "react";
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  Select,
  StatusIndicator,
  Switch,
} from "@cycle/ui/atoms";
import { SettingRow } from "@cycle/ui/molecules";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import {
  canonicalTicketTypes,
  defaultAgentSettings,
  type AgentSettings,
  type RepositoryAgentSettings,
} from "../lib/agentWork.ts";
import {
  useAgentActivityQuery,
  useAgentSettingsQuery,
  useRepositoryAgentSettingsQuery,
} from "../queries/index.ts";
import {
  useUpdateAgentSettingsMutation,
  useUpdateRepositoryAgentSettingsMutation,
} from "../mutations/index.ts";

const providerItems = (providers: readonly DetectedAgentProvider[]) =>
  providers.map((provider) => ({
    disabled: provider.status !== "available",
    label: `${provider.name}${provider.status === "available" ? "" : " unavailable"}`,
    value: provider.id,
  }));

const formatError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const numberFromInput = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
};

const FieldPair = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <label className="grid gap-1.5 text-sm font-medium text-foreground">
    <span>{label}</span>
    {children}
  </label>
);

const SectionShell = ({
  children,
  description,
  title,
}: {
  readonly children: React.ReactNode;
  readonly description: string;
  readonly title: string;
}) => (
  <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
    <div className="mb-5">
      <h2 className="text-base font-semibold tracking-normal text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
    {children}
  </section>
);

const InlineError = ({ children }: { readonly children: React.ReactNode }) => (
  <p className="flex items-center gap-2 text-sm text-destructive">
    <AlertCircle aria-hidden className="size-4" />
    <span>{children}</span>
  </p>
);

const SaveableConcurrency = ({
  disabled,
  label,
  onSave,
  value,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onSave: (value: number | null) => void;
  readonly value: number | null;
}) => {
  const [draft, setDraft] = React.useState(String(value ?? 1));

  React.useEffect(() => {
    setDraft(String(value ?? 1));
  }, [value]);

  const parsed = numberFromInput(draft, value ?? 1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={`${label} mode`}
        className="w-32"
        disabled={disabled}
        items={[
          { label: "Limited", value: "limited" },
          { label: "Unlimited", value: "unlimited" },
        ]}
        onValueChange={(mode) => {
          if (mode === "unlimited") onSave(null);
          if (mode === "limited" && value === null) onSave(parsed);
        }}
        value={value === null ? "unlimited" : "limited"}
      />
      {value !== null ? (
        <>
          <Input
            aria-label={label}
            className="w-20"
            disabled={disabled}
            min={1}
            onChange={(event) => setDraft(event.currentTarget.value)}
            type="number"
            value={draft}
          />
          <Button
            disabled={disabled || parsed === value}
            onClick={() => onSave(parsed)}
            size="sm"
            variant="outline"
          >
            Save
          </Button>
        </>
      ) : null}
    </div>
  );
};

const SaveableText = ({
  disabled,
  label,
  onSave,
  placeholder,
  value,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onSave: (value: string | null) => void;
  readonly placeholder?: string;
  readonly value?: string | null;
}) => {
  const [draft, setDraft] = React.useState(value ?? "");

  React.useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const trimmed = draft.trim();
  const current = value ?? "";

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={label}
        className="w-48"
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        placeholder={placeholder}
        value={draft}
      />
      <Button
        disabled={disabled || trimmed === current}
        onClick={() => onSave(trimmed.length > 0 ? trimmed : null)}
        size="sm"
        variant="outline"
      >
        Save
      </Button>
    </div>
  );
};

const capabilitySummary = (provider: DetectedAgentProvider): string => {
  const supports = provider.capabilities?.supports;
  if (!supports) return "No capabilities reported";

  const enabled = Object.entries(supports)
    .filter((entry) => entry[1] === true)
    .map(([key]) => key);

  return enabled.length === 0 ? "No capabilities reported" : enabled.join(", ");
};

export const ApplicationAgentSettingsPanel = ({
  providers,
}: {
  readonly providers: readonly DetectedAgentProvider[];
}) => {
  const settingsQuery = useAgentSettingsQuery(providers);
  const updateSettings = useUpdateAgentSettingsMutation(providers);
  const settings = settingsQuery.data ?? defaultAgentSettings(providers);
  const disabled = settingsQuery.isError || updateSettings.isPending;

  const patch = (next: Partial<AgentSettings>) => updateSettings.mutate(next);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Local background agent defaults and safety controls for this desktop profile.
        </p>
      </header>

      <SectionShell
        description="Applies to all repositories on this machine."
        title="Global agent work"
      >
        <div className="rounded-lg border border-border px-5">
          <SettingRow
            control={
              <Switch
                checked={!settings.paused}
                disabled={disabled}
                onCheckedChange={(checked) => patch({ paused: checked !== true })}
              />
            }
            description="Prevents new starts; running jobs suspend at a safe checkpoint."
            title={settings.paused ? "Agent work disabled" : "Agent work enabled"}
          />
          <SettingRow
            control={
              <SaveableConcurrency
                disabled={disabled}
                label="Global max concurrent jobs"
                onSave={(maxConcurrentJobs) => patch({ maxConcurrentJobs })}
                value={settings.maxConcurrentJobs}
              />
            }
            description="Default global concurrency is 1."
            title="Max concurrent jobs"
          />
        </div>
      </SectionShell>

      <SectionShell
        description="Detected local harnesses and runtime enablement."
        title="Harnesses"
      >
        <div className="grid gap-4">
          {providers.map((provider) => {
            const checked = settings.enabledProviders.includes(provider.id);
            const nextProviders = checked
              ? settings.enabledProviders.filter((id) => id !== provider.id)
              : [...settings.enabledProviders, provider.id];
            const disablesLastProvider =
              checked && settings.enabledProviders.length <= 1 && !settings.paused;

            return (
              <label
                className="grid gap-3 rounded-md border border-border p-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                key={provider.id}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {provider.name}
                    <StatusIndicator
                      label={provider.status}
                      tone={provider.status === "available" ? "success" : "warning"}
                    />
                  </span>
                  <span className="mt-1 block break-all text-muted-foreground">
                    {provider.executable}
                    {provider.executablePath ? ` at ${provider.executablePath}` : ""}
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    Checked {provider.detectedAt}
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    {capabilitySummary(provider)}
                  </span>
                </span>
                <Checkbox
                  checked={checked}
                  disabled={disabled || provider.status !== "available" || disablesLastProvider}
                  onCheckedChange={() => patch({ enabledProviders: nextProviders })}
                />
              </label>
            );
          })}
        </div>
      </SectionShell>

      <SectionShell
        description="Provider and model defaults are inherited by repositories unless overridden."
        title="Provider defaults"
      >
        <div className="grid gap-4">
          <FieldPair label="Preferred provider">
            <Select
              disabled={disabled}
              items={providerItems(providers)}
              onValueChange={(value) => {
                if (value) patch({ defaultProviderId: value });
              }}
              value={settings.defaultProviderId}
            />
          </FieldPair>
          <FieldPair label="Default model">
            <SaveableText
              disabled={disabled}
              label="Default model"
              onSave={(defaultModel) => patch({ defaultModel })}
              placeholder="Provider default"
              value={settings.defaultModel}
            />
          </FieldPair>
        </div>
      </SectionShell>

      <SectionShell
        description="Provider-specific controls appear here only when a harness reports editable configuration."
        title="Harness-specific settings"
      >
        <dl className="grid gap-3">
          {providers.map((provider) => (
            <div className="rounded-md border border-border p-3 text-sm" key={provider.id}>
              <dt className="font-medium text-foreground">{provider.name}</dt>
              <dd className="mt-1 text-muted-foreground">
                Workspace: {provider.capabilities?.workspace ?? "unknown"} - Session:{" "}
                {provider.capabilities?.sessionPersistence ?? "unknown"}
              </dd>
            </div>
          ))}
        </dl>
      </SectionShell>

      {settingsQuery.error ? (
        <InlineError>
          {formatError(settingsQuery.error, "Agent settings endpoint is unavailable.")}
        </InlineError>
      ) : null}
      {updateSettings.error ? (
        <InlineError>
          {formatError(updateSettings.error, "Unable to save agent settings.")}
        </InlineError>
      ) : null}
    </div>
  );
};

export const RepositoryAgentWorkSettingsPanel = ({
  providers,
  repositoryId,
}: {
  readonly providers: readonly DetectedAgentProvider[];
  readonly repositoryId: string;
}) => {
  const settingsQuery = useRepositoryAgentSettingsQuery(repositoryId);
  const updateSettings = useUpdateRepositoryAgentSettingsMutation(repositoryId);
  const settings =
    settingsQuery.data ??
    ({
      agentWorkDisabled: false,
      maxConcurrentJobs: 1,
      paused: false,
      repositoryId,
    } satisfies RepositoryAgentSettings);
  const disabled = settingsQuery.isError || updateSettings.isPending;

  const patch = (next: Partial<RepositoryAgentSettings>) => updateSettings.mutate(next);

  return (
    <section className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-surface p-5 shadow-card">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-normal text-foreground">Agent Work</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Local-only repository queue policy, health, and provider overrides.
          </p>
        </div>
        <StatusIndicator
          label={settings.health ?? (settings.agentWorkDisabled ? "Disabled" : "Available")}
          tone={settings.agentWorkDisabled || settings.errorCount ? "warning" : "success"}
        />
      </div>

      <div className="rounded-lg border border-border px-5">
        <SettingRow
          control={
            <Switch
              checked={settings.paused}
              disabled={disabled || settings.agentWorkDisabled}
              onCheckedChange={(checked) => patch({ paused: checked === true })}
            />
          }
          description="Pauses new starts for this repository only."
          title={settings.paused ? "Repository paused" : "Repository running"}
        />
        <SettingRow
          control={
            <Switch
              checked={settings.agentWorkDisabled}
              disabled={disabled}
              onCheckedChange={(checked) => patch({ agentWorkDisabled: checked === true })}
            />
          }
          description="Disables local background agent pickup for this repository."
          title="Disable agent work"
        />
        <SettingRow
          control={
            <SaveableConcurrency
              disabled={disabled}
              label="Repository max concurrent jobs"
              onSave={(maxConcurrentJobs) => patch({ maxConcurrentJobs })}
              value={settings.maxConcurrentJobs}
            />
          }
          description="Default per-repository concurrency is 1."
          title="Max concurrent jobs"
        />
        <SettingRow
          control={
            <Select
              className="w-48"
              disabled={disabled}
              items={[{ label: "Inherit global", value: "inherit" }, ...providerItems(providers)]}
              onValueChange={(value) => patch({ providerId: value === "inherit" ? null : value })}
              value={settings.providerId ?? "inherit"}
            />
          }
          description="Overrides the global provider for this repository."
          title="Provider override"
        />
        <SettingRow
          control={
            <SaveableText
              disabled={disabled}
              label="Repository model override"
              onSave={(model) => patch({ model })}
              placeholder="Inherit"
              value={settings.model}
            />
          }
          description="Overrides the global model when set."
          title="Model override"
        />
      </div>

      <dl className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
        <div>
          <dt>Running</dt>
          <dd className="font-medium text-foreground">{settings.runningJobCount ?? 0}</dd>
        </div>
        <div>
          <dt>Queued</dt>
          <dd className="font-medium text-foreground">{settings.queuedJobCount ?? 0}</dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd className="font-medium text-foreground">{settings.waitingJobCount ?? 0}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd className="font-medium text-foreground">{settings.failedJobCount ?? 0}</dd>
        </div>
      </dl>

      {settingsQuery.error ? (
        <InlineError>
          {formatError(settingsQuery.error, "Repository agent settings endpoint is unavailable.")}
        </InlineError>
      ) : null}
      {updateSettings.error ? (
        <InlineError>
          {formatError(updateSettings.error, "Unable to save repository agent settings.")}
        </InlineError>
      ) : null}
    </section>
  );
};

export const AgentActivityIndicator = ({
  onOpenChat,
  providers,
}: {
  readonly onOpenChat?: () => void;
  readonly providers: readonly DetectedAgentProvider[];
}) => {
  const [open, setOpen] = React.useState(false);
  const activityQuery = useAgentActivityQuery();
  const settingsQuery = useAgentSettingsQuery(providers);
  const updateSettings = useUpdateAgentSettingsMutation(providers);
  const activity = activityQuery.data;
  const failed = activity?.failedCount ?? 0;
  const active = (activity?.runningCount ?? 0) + (activity?.queuedCount ?? 0);
  const paused = settingsQuery.data?.paused ?? activity?.globalPaused ?? false;
  const tone = failed > 0 ? "danger" : paused ? "warning" : active > 0 ? "info" : "neutral";

  return (
    <div className="relative">
      <IconButton
        icon={
          paused ? (
            <CirclePause aria-hidden className="size-4" />
          ) : failed > 0 ? (
            <AlertCircle aria-hidden className="size-4" />
          ) : (
            <Bot aria-hidden className="size-4" />
          )
        }
        label="Agent activity"
        onClick={() => setOpen((current) => !current)}
        size="sm"
        title="Agent activity"
        variant="outline"
      />
      <StatusIndicator
        className="absolute -right-0.5 -top-0.5"
        label="Agent activity state"
        tone={tone}
      />
      {open ? (
        <div className="absolute right-0 top-10 z-50 grid w-[320px] max-w-[calc(100vw-2rem)] gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-elevated">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-normal">Agent Activity</h2>
              <p className="text-xs text-muted-foreground">
                {paused ? "Paused" : "Running"} - {activity?.runningCount ?? 0} running -{" "}
                {activity?.queuedCount ?? 0} queued - {failed} failed
              </p>
            </div>
            <Button
              disabled={settingsQuery.isError || updateSettings.isPending}
              leftIcon={
                paused ? (
                  <Play aria-hidden className="size-4" />
                ) : (
                  <Pause aria-hidden className="size-4" />
                )
              }
              onClick={() => updateSettings.mutate({ paused: !paused })}
              size="sm"
              variant="outline"
            >
              {paused ? "Resume" : "Pause"}
            </Button>
          </div>

          {activityQuery.error ? (
            <InlineError>
              {formatError(activityQuery.error, "Agent activity endpoint is unavailable.")}
            </InlineError>
          ) : null}

          <div className="grid gap-2 rounded-md border border-border bg-background/70 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Active in Chat</span>
              <span className="font-medium text-foreground">{active}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Needs attention</span>
              <span className="font-medium text-foreground">{failed}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Agent runs started from issue mentions are attached to Chat threads with their tool
              activity and final issue reply.
            </p>
          </div>
          <Button disabled={!onOpenChat} onClick={onOpenChat} size="sm">
            Open Chat
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export const ticketTypeSections = [
  {
    id: "type",
    options: canonicalTicketTypes.map((type) => ({
      icon: <Square aria-hidden className="size-4" strokeWidth={2} />,
      id: type.id,
      label: type.label,
      rightMeta: type.description,
    })),
  },
];
