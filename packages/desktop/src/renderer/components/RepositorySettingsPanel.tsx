import type { RepositoryStatus } from "@cycle/contracts";
import { Button, Select, Switch } from "@cycle/ui/atoms";
import { SettingRow } from "@cycle/ui/molecules";
import { RefreshCw, Upload } from "lucide-react";
import {
  isRepositoryCommitStyle,
  type AppConfigState,
  type RepositoryCommitStyle,
  type RepositoryRecord,
} from "../../shared/AppConfig.ts";
import {
  usePushRepositoryMutation,
  useSyncRepositoryMutation,
  useUpdateRepositoryPreferencesMutation,
} from "../mutations/index.ts";

type RepositorySettingsPanelProps = {
  readonly appConfig?: AppConfigState;
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

const InfoRow = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <div className="grid gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[160px_minmax(0,1fr)] md:gap-6">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words text-sm text-foreground">{value}</dd>
  </div>
);

export const RepositorySettingsPanel = ({
  appConfig,
  repository,
  status,
}: RepositorySettingsPanelProps) => {
  const updatePreferences = useUpdateRepositoryPreferencesMutation({ appConfig });
  const syncRepository = useSyncRepositoryMutation({ repositoryId: repository.id });
  const pushRepository = usePushRepositoryMutation({ repositoryId: repository.id });
  const remoteBusy = syncRepository.isPending || pushRepository.isPending;
  const defaultRemote = status?.metadata?.defaultRemote;
  const defaultRemoteUrl = status?.metadata?.defaultRemoteUrl;
  const remotes = status?.metadata?.remotes ?? [];
  const remoteSummary =
    remotes.length === 0
      ? "No remotes configured"
      : remotes.map((remote) => `${remote.name}${remote.url ? ` (${remote.url})` : ""}`).join(", ");

  const setAutoSync = (checked: boolean) => {
    updatePreferences.mutate({
      id: repository.id,
      preferences: {
        autoSync: checked,
      },
    });
  };

  const setCommitStyle = (value: string | null) => {
    if (!isRepositoryCommitStyle(value) || value === repository.preferences.commitStyle) return;

    updatePreferences.mutate({
      id: repository.id,
      preferences: {
        commitStyle: value,
      },
    });
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">{repository.displayName} settings</h1>
        <p className="text-sm text-muted-foreground">
          Repository information and Cycle behavior for this local project.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
        <h2 className="text-base font-semibold">Repository information</h2>
        <dl className="mt-3">
          <InfoRow label="Path" value={repository.path} />
          <InfoRow
            label="Current branch"
            value={status?.metadata?.currentBranch ?? "Detached or unavailable"}
          />
          <InfoRow label="Default remote" value={defaultRemote ?? "No default remote"} />
          <InfoRow label="Default remote URL" value={defaultRemoteUrl ?? "No remote URL"} />
          <InfoRow label="Remotes" value={remoteSummary} />
          <InfoRow label="Cycle snapshot" value={shortId(status?.activeSnapshotId)} />
          <InfoRow label="Status" value={status?.status ?? "Unavailable"} />
          <InfoRow label="Warnings" value={String(status?.warningCount ?? 0)} />
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
        <h2 className="sr-only">Repository preferences</h2>
        <SettingRow
          control={
            <Switch
              checked={repository.preferences.autoSync}
              disabled={updatePreferences.isPending}
              onCheckedChange={setAutoSync}
            />
          }
          description="Pull Cycle data from the default remote after the repository opens."
          title="Auto sync"
        />
        <SettingRow
          control={
            <Select
              aria-label="Commit style"
              className="w-40"
              items={commitStyleItems}
              value={repository.preferences.commitStyle}
              onValueChange={setCommitStyle}
            />
          }
          description="Saved preference for Cycle commit message formatting."
          title="Commit style"
        />
      </section>

      <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
        <h2 className="sr-only">Repository actions</h2>
        <SettingRow
          control={
            <Button
              disabled={remoteBusy}
              leftIcon={
                <RefreshCw
                  aria-hidden
                  className={syncRepository.isPending ? "size-4 animate-spin" : "size-4"}
                />
              }
              loading={syncRepository.isPending}
              loadingLabel="Syncing repository"
              onClick={() => syncRepository.mutate()}
              size="sm"
              variant="outline"
            >
              Sync
            </Button>
          }
          description="Pull Cycle GitDB refs and refresh the local projection."
          title="Sync now"
        />
        <SettingRow
          control={
            <Button
              disabled={remoteBusy || !defaultRemote}
              leftIcon={<Upload aria-hidden className="size-4" />}
              loading={pushRepository.isPending}
              loadingLabel="Pushing repository"
              onClick={() => pushRepository.mutate()}
              size="sm"
              variant="outline"
            >
              Push
            </Button>
          }
          description={
            defaultRemote
              ? `Push Cycle GitDB refs to ${defaultRemote}.`
              : "Configure a default remote before pushing."
          }
          title="Push changes"
        />
      </section>
    </div>
  );
};
