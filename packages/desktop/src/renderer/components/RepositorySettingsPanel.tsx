import type { RepositoryStatus } from "@cycle/contracts";
import { Button, Select, StatusIndicator, Switch } from "@cycle/ui/atoms";
import { SettingRow } from "@cycle/ui/molecules";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import * as React from "react";
import { type BootstrapStatus } from "../../shared/Bootstrap.ts";
import {
  isRepositoryCommitStyle,
  type AppConfigState,
  type RepositoryCommitStyle,
  type RepositoryRecord,
} from "@cycle/config/app-config";
import {
  usePushRepositoryMutation,
  useRemoveRepositoryMutation,
  useSyncRepositoryMutation,
  useUpdateRepositoryPreferencesMutation,
} from "../mutations/index.ts";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";

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
  appConfig,
  bootstrapStatus,
  onRemoved,
  repository,
  status,
}: RepositorySettingsPanelProps) => {
  const updatePreferences = useUpdateRepositoryPreferencesMutation({ appConfig });
  const syncRepository = useSyncRepositoryMutation();
  const pushRepository = usePushRepositoryMutation();
  const removeRepository = useRemoveRepositoryMutation();
  const [pendingRemoteAction, setPendingRemoteAction] = React.useState<"push" | "sync" | null>(
    null,
  );
  const defaultRemote = status?.metadata?.defaultRemote;
  const defaultRemoteUrl = status?.metadata?.defaultRemoteUrl;
  const remotes = status?.metadata?.remotes ?? [];
  const hasRemote = defaultRemote !== undefined;
  const remotePending = syncRepository.isPending || pushRepository.isPending;
  const remoteError = syncRepository.error ?? pushRepository.error;
  const bootstrapRepository = bootstrapStatus?.repositories.find(
    (candidate) => candidate.repositoryId === repository.id,
  );

  const patchPreferences = (preferences: Partial<RepositoryRecord["preferences"]>) => {
    updatePreferences.mutate({
      id: repository.id,
      preferences,
    });
  };

  const setCommitStyle = (value: string) => {
    if (!isRepositoryCommitStyle(value) || value === repository.preferences.commitStyle) return;
    patchPreferences({ commitStyle: value });
  };

  const runRemoteAction = (action: "push" | "sync") => {
    setPendingRemoteAction(action);
    const mutation = action === "push" ? pushRepository : syncRepository;
    mutation.mutate(repository.id, {
      onSettled: () => setPendingRemoteAction(null),
    });
  };

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
        {remoteError ? (
          <p className="mt-3 text-sm text-destructive">
            {remoteError instanceof Error ? remoteError.message : "Remote operation failed."}
          </p>
        ) : null}
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
