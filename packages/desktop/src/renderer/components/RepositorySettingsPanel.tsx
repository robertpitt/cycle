import type { RepositoryStatus } from "@cycle/contracts/schemas";
import {
  Button,
  DateTime,
  Input,
  Select,
  StatusIndicator,
  Switch,
  Textarea,
} from "@cycle/ui/atoms";
import { SettingRow } from "@cycle/ui/molecules";
import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
import * as React from "react";
import type { BootstrapStatus } from "@cycle/contracts/schemas/backend";
import {
  isRepositoryCommitStyle,
  type AppConfigEncoded as AppConfigState,
  type JsonObject,
  type RepositoryCommitStyle,
  type RepositoryRecord,
  type UpdateRepositoryPreferencesInput,
} from "@cycle/config";
import {
  usePushRepositoryMutation,
  useFetchRepositoryMutation,
  useRemoveRepositoryMutation,
  useSyncRepositoryMutation,
  useUpdateRepositoryPreferencesMutation,
} from "../mutations/index.ts";
import { useRepositorySyncEventsQuery } from "../queries/index.ts";
import type { DetectedAgentProvider } from "@cycle/contracts/schemas/agents";

type RepositorySettingsPanelProps = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly appConfig?: AppConfigState;
  readonly bootstrapStatus?: BootstrapStatus;
  readonly onRemoved?: () => void;
  readonly repository: RepositoryRecord;
  readonly status?: RepositoryStatus;
};

const commitStyleItems = [
  {
    label: "Descriptive",
    value: "descriptive",
  },
  {
    label: "Compact",
    value: "compact",
  },
] satisfies ReadonlyArray<{ readonly label: string; readonly value: RepositoryCommitStyle }>;

const shortId = (value: string | null | undefined): string =>
  value === null || value === undefined ? "Not committed" : value.slice(0, 12);

const stageTone = (
  stage: string | undefined,
): React.ComponentProps<typeof StatusIndicator>["tone"] => {
  if (stage === "ready") return "success";
  if (stage === "syncing") return "info";
  if (stage === "failed" || stage === "degraded") return "warning";
  return "neutral";
};

const InfoTile = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) => (
  <div className="min-w-0 rounded-md border border-border bg-background/70 p-3">
    <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
    <dd className="mt-1 min-w-0 break-words text-sm font-medium text-foreground">{value}</dd>
  </div>
);

const SectionShell = ({
  children,
  description,
  title,
}: {
  readonly children: React.ReactNode;
  readonly description?: string;
  readonly title: string;
}) => (
  <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
    <div className="mb-4">
      <h2 className="text-base font-semibold tracking-normal text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </section>
);

export const RepositorySettingsPanel = ({
  agentProviders = [],
  appConfig,
  bootstrapStatus,
  onRemoved,
  repository,
  status,
}: RepositorySettingsPanelProps) => {
  const updatePreferences = useUpdateRepositoryPreferencesMutation({ appConfig });
  const fetchRepository = useFetchRepositoryMutation();
  const syncRepository = useSyncRepositoryMutation();
  const pushRepository = usePushRepositoryMutation();
  const removeRepository = useRemoveRepositoryMutation();
  const [pendingRemoteAction, setPendingRemoteAction] = React.useState<
    "fetch" | "push" | "sync" | null
  >(null);
  const syncEventsQuery = useRepositorySyncEventsQuery(repository.id);
  const [repositoryGroup, setRepositoryGroup] = React.useState(repository.preferences.group ?? "");
  const [agentProviderId, setAgentProviderId] = React.useState(
    repository.preferences.agentWork.providerId ?? "",
  );
  const [agentModel, setAgentModel] = React.useState(repository.preferences.agentWork.model ?? "");
  const [agentConcurrency, setAgentConcurrency] = React.useState(
    repository.preferences.agentWork.maxConcurrentJobs === null
      ? ""
      : String(repository.preferences.agentWork.maxConcurrentJobs),
  );
  const [agentOverrides, setAgentOverrides] = React.useState(() =>
    JSON.stringify(repository.preferences.agentWork.perAgentOverrides, null, 2),
  );
  const defaultRemote = status?.metadata?.defaultRemote;
  const defaultRemoteUrl = status?.metadata?.defaultRemoteUrl;
  const remotes = status?.metadata?.remotes ?? [];
  const hasRemote = defaultRemote !== undefined;
  const remotePending =
    fetchRepository.isPending || syncRepository.isPending || pushRepository.isPending;
  const remoteError = fetchRepository.error ?? syncRepository.error ?? pushRepository.error;
  const bootstrapRepository = bootstrapStatus?.repositories.find(
    (candidate) => candidate.repositoryId === repository.id,
  );

  const patchPreferences = (preferences: UpdateRepositoryPreferencesInput["preferences"]) => {
    updatePreferences.mutate({
      id: repository.id,
      preferences,
    });
  };

  const setCommitStyle = (value: string) => {
    if (!isRepositoryCommitStyle(value) || value === repository.preferences.commitStyle) return;
    patchPreferences({ commitStyle: value });
  };

  const runRemoteAction = (action: "fetch" | "push" | "sync") => {
    setPendingRemoteAction(action);
    const mutation =
      action === "fetch" ? fetchRepository : action === "push" ? pushRepository : syncRepository;
    mutation.mutate(repository.id, {
      onSettled: () => setPendingRemoteAction(null),
    });
  };

  React.useEffect(() => {
    setRepositoryGroup(repository.preferences.group ?? "");
    setAgentProviderId(repository.preferences.agentWork.providerId ?? "");
    setAgentModel(repository.preferences.agentWork.model ?? "");
    setAgentConcurrency(
      repository.preferences.agentWork.maxConcurrentJobs === null
        ? ""
        : String(repository.preferences.agentWork.maxConcurrentJobs),
    );
    setAgentOverrides(JSON.stringify(repository.preferences.agentWork.perAgentOverrides, null, 2));
  }, [repository.preferences]);

  const remove = () => {
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(
        `Remove ${repository.displayName} from Cycle?\n\n${repository.path}\n\nThe source checkout stays on disk.`,
      );
    if (!confirmed) return;

    removeRepository.mutate(repository.id, {
      onSuccess: () => onRemoved?.(),
    });
  };
  const parsedAgentConcurrency =
    agentConcurrency.trim().length === 0 ? null : Number.parseInt(agentConcurrency, 10);
  const agentConcurrencyValid =
    parsedAgentConcurrency === null ||
    (Number.isInteger(parsedAgentConcurrency) && parsedAgentConcurrency >= 1);
  let parsedAgentOverrides: JsonObject | null = null;
  try {
    const value = JSON.parse(agentOverrides) as unknown;
    parsedAgentOverrides =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as JsonObject)
        : null;
  } catch {
    parsedAgentOverrides = null;
  }
  const inheritedProvider = appConfig?.agentWork.defaultProviderId ?? "Automatic";
  const inheritedModel = appConfig?.agentWork.defaultModel ?? "Provider default";

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          {repository.displayName}
        </h1>
        <p className="break-all text-sm text-muted-foreground">{repository.path}</p>
      </header>

      <SectionShell title="Repository status">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <StatusIndicator
            label={status?.status ?? "Unavailable"}
            tone={stageTone(status?.status)}
          />
          {status?.lastSyncError ? (
            <p className="text-sm text-destructive">{status.lastSyncError}</p>
          ) : null}
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <InfoTile
            label="Current branch"
            value={status?.metadata?.currentBranch ?? "Unavailable"}
          />
          <InfoTile label="Default remote" value={defaultRemote ?? "No default remote"} />
          <InfoTile label="Default remote URL" value={defaultRemoteUrl ?? "No remote URL"} />
          <InfoTile label="Cycle snapshot" value={shortId(status?.activeSnapshotId)} />
          <InfoTile label="Warnings" value={String(status?.warningCount ?? 0)} />
          <InfoTile
            label="Remotes"
            value={
              remotes.length === 0
                ? "No remotes configured"
                : remotes
                    .map((remote) => `${remote.name}${remote.url ? ` (${remote.url})` : ""}`)
                    .join(", ")
            }
          />
        </dl>
      </SectionShell>

      <SectionShell
        description="Preferences are stored on this repository registration."
        title="Preferences"
      >
        <div className="rounded-lg border border-border px-5">
          <SettingRow
            control={
              <Select
                aria-label="Commit style"
                className="w-40"
                disabled={updatePreferences.isPending}
                items={commitStyleItems}
                onValueChange={(value) => {
                  if (value !== null) setCommitStyle(value);
                }}
                value={repository.preferences.commitStyle}
              />
            }
            description="Saved preference for Cycle commit message formatting."
            title="Commit style"
          />
          <SettingRow
            control={
              <Switch
                checked={repository.preferences.autoSync}
                disabled={updatePreferences.isPending}
                onCheckedChange={(checked) => patchPreferences({ autoSync: checked === true })}
              />
            }
            description="Allows Cycle to pull from the default remote during background sync."
            title="Auto sync"
          />
          <SettingRow
            control={
              <Switch
                checked={repository.preferences.sidebarExpanded}
                disabled={updatePreferences.isPending}
                onCheckedChange={(checked) =>
                  patchPreferences({ sidebarExpanded: checked === true })
                }
              />
            }
            description="Controls whether this repository is expanded in the main sidebar."
            title="Sidebar expanded"
          />
          <SettingRow
            control={
              <Input
                className="w-48"
                disabled={updatePreferences.isPending}
                onBlur={() => patchPreferences({ group: repositoryGroup.trim() || null })}
                onChange={(event) => setRepositoryGroup(event.currentTarget.value)}
                placeholder="Ungrouped"
                value={repositoryGroup}
              />
            }
            description="Groups this repository under a named section in the main sidebar."
            title="Sidebar group"
          />
          <SettingRow
            control={
              <Switch
                checked={repository.preferences.archived}
                disabled={updatePreferences.isPending}
                onCheckedChange={(checked) => patchPreferences({ archived: checked === true })}
              />
            }
            description="Moves the repository to the Archived repositories section without deleting data."
            title="Archived"
          />
        </div>
        {updatePreferences.error ? (
          <p className="mt-3 text-sm text-destructive">
            {updatePreferences.error instanceof Error
              ? updatePreferences.error.message
              : "Unable to save repository preferences."}
          </p>
        ) : null}
      </SectionShell>

      <SectionShell
        description="These values override the global Agent Work defaults for this repository. Empty provider, model, and concurrency fields inherit global values."
        title="Agent Work overrides"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            disabled={updatePreferences.isPending}
            items={[
              { label: `Inherit (${inheritedProvider})`, value: "__inherit_provider__" },
              ...agentProviders.map((provider) => ({ label: provider.name, value: provider.id })),
            ]}
            label="Provider"
            onValueChange={(value) =>
              setAgentProviderId(value === "__inherit_provider__" || value === null ? "" : value)
            }
            value={agentProviderId || "__inherit_provider__"}
          />
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Model
            <Input
              disabled={updatePreferences.isPending}
              onChange={(event) => setAgentModel(event.currentTarget.value)}
              placeholder={`Inherit (${inheritedModel})`}
              value={agentModel}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Concurrent jobs
            <Input
              disabled={updatePreferences.isPending}
              min={1}
              onChange={(event) => setAgentConcurrency(event.currentTarget.value)}
              placeholder="Inherit global limit"
              type="number"
              value={agentConcurrency}
            />
          </label>
        </div>
        <div className="mt-4 rounded-md border border-border px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Pause repository jobs</div>
              <div className="text-xs text-muted-foreground">
                Holds new jobs for this repository.
              </div>
            </div>
            <Switch
              checked={repository.preferences.agentWork.paused}
              disabled={updatePreferences.isPending}
              onCheckedChange={(checked) =>
                patchPreferences({
                  agentWork: { paused: checked === true },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Disable Agent Work</div>
              <div className="text-xs text-muted-foreground">
                Prevents new delegated implementation jobs in this repository.
              </div>
            </div>
            <Switch
              checked={repository.preferences.agentWork.agentWorkDisabled}
              disabled={updatePreferences.isPending}
              onCheckedChange={(checked) =>
                patchPreferences({
                  agentWork: { agentWorkDisabled: checked === true },
                })
              }
            />
          </div>
        </div>
        <label className="mt-4 grid gap-1.5 text-sm font-medium text-foreground">
          Per-agent overrides (JSON)
          <Textarea
            className="min-h-28 font-mono text-xs"
            disabled={updatePreferences.isPending}
            onChange={(event) => setAgentOverrides(event.currentTarget.value)}
            value={agentOverrides}
          />
        </label>
        {!agentConcurrencyValid || parsedAgentOverrides === null ? (
          <p className="mt-3 text-sm text-destructive">
            {!agentConcurrencyValid
              ? "Concurrent jobs must be empty or at least 1."
              : "Per-agent overrides must be a JSON object."}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button
            disabled={
              updatePreferences.isPending || !agentConcurrencyValid || parsedAgentOverrides === null
            }
            loading={updatePreferences.isPending}
            onClick={() =>
              patchPreferences({
                agentWork: {
                  maxConcurrentJobs: parsedAgentConcurrency,
                  model: agentModel.trim() || null,
                  perAgentOverrides: parsedAgentOverrides ?? {},
                  providerId: agentProviderId.trim() || null,
                },
              })
            }
            size="sm"
          >
            Save overrides
          </Button>
        </div>
      </SectionShell>

      <SectionShell
        description={
          hasRemote
            ? `Remote operations target ${defaultRemote}.`
            : "Remote operations are unavailable because no default remote is configured."
        }
        title="Remote operations"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={remotePending || !hasRemote}
            leftIcon={<Download aria-hidden className="size-4" />}
            loading={pendingRemoteAction === "fetch" && fetchRepository.isPending}
            loadingLabel="Fetching"
            onClick={() => runRemoteAction("fetch")}
            size="sm"
            variant="outline"
          >
            Fetch
          </Button>
          <Button
            disabled={remotePending || !hasRemote}
            leftIcon={<RefreshCw aria-hidden className="size-4" />}
            loading={pendingRemoteAction === "sync" && syncRepository.isPending}
            loadingLabel="Syncing"
            onClick={() => runRemoteAction("sync")}
            size="sm"
            variant="outline"
          >
            Sync
          </Button>
          <Button
            disabled={remotePending || !hasRemote}
            leftIcon={<Upload aria-hidden className="size-4" />}
            loading={pendingRemoteAction === "push" && pushRepository.isPending}
            loadingLabel="Pushing"
            onClick={() => runRemoteAction("push")}
            size="sm"
            variant="outline"
          >
            Push
          </Button>
        </div>
        <div className="mt-4 grid gap-2 rounded-md border border-border bg-background/70 p-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div>
            <strong className="text-foreground">Fetch</strong> downloads remote Cycle refs without
            changing the local view.
          </div>
          <div>
            <strong className="text-foreground">Sync</strong> fetches, reconciles, and rebuilds the
            local projection.
          </div>
          <div>
            <strong className="text-foreground">Push</strong> publishes local Cycle changes without
            pulling remote changes.
          </div>
        </div>
        {remoteError ? (
          <p className="mt-3 text-sm text-destructive">
            {remoteError instanceof Error ? remoteError.message : "Remote operation failed."}
          </p>
        ) : null}
      </SectionShell>

      <SectionShell
        description="Fetch, sync, push, and database rebuild operations recorded during this app session."
        title="Sync history"
      >
        {syncEventsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading sync history.</p>
        ) : syncEventsQuery.error ? (
          <p className="text-sm text-destructive">
            {syncEventsQuery.error instanceof Error
              ? syncEventsQuery.error.message
              : "Unable to load sync history."}
          </p>
        ) : (syncEventsQuery.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No sync operations recorded this session.</p>
        ) : (
          <div className="grid gap-2">
            {syncEventsQuery.data?.map((event) => (
              <div
                className="grid gap-2 rounded-md border border-border bg-background/70 p-3 sm:grid-cols-[100px_100px_minmax(0,1fr)_auto] sm:items-center"
                key={event.id}
              >
                <span className="text-sm font-semibold capitalize text-foreground">
                  {event.operation}
                </span>
                <StatusIndicator label={event.status} tone={stageTone(event.status)} />
                <div className="min-w-0 text-xs text-muted-foreground">
                  <div>{event.strategy ?? "Default strategy"}</div>
                  {event.message ? (
                    <div className="truncate text-destructive">{event.message}</div>
                  ) : null}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <DateTime
                    fallback={event.startedAt}
                    format="compactDateTime"
                    value={event.startedAt}
                  />
                  {event.durationMs === undefined ? null : (
                    <div>{Math.round(event.durationMs)} ms</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Diagnostics">
        <dl className="grid gap-3 sm:grid-cols-2">
          <InfoTile label="Bootstrap stage" value={bootstrapRepository?.stage ?? "Unavailable"} />
          <InfoTile label="Last bootstrap error" value={bootstrapRepository?.error ?? "None"} />
          <InfoTile label="Active snapshot" value={shortId(status?.activeSnapshotId)} />
          <InfoTile label="Warning count" value={String(status?.warningCount ?? 0)} />
        </dl>
      </SectionShell>

      <SectionShell
        description="Unregisters this repository from Cycle desktop. Source files remain on disk."
        title="Danger zone"
      >
        <Button
          disabled={removeRepository.isPending}
          leftIcon={<Trash2 aria-hidden className="size-4" />}
          loading={removeRepository.isPending}
          loadingLabel="Removing"
          onClick={remove}
          size="sm"
          variant="destructive"
        >
          Remove repository
        </Button>
        {removeRepository.error ? (
          <p className="mt-3 text-sm text-destructive">
            {removeRepository.error instanceof Error
              ? removeRepository.error.message
              : "Unable to remove repository."}
          </p>
        ) : null}
      </SectionShell>
    </div>
  );
};
