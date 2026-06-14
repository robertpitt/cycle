import type { RepositoryStatus } from "@cycle/contracts";
import { RepositorySettingsPanel as UiRepositorySettingsPanel } from "@cycle/ui/organisms";
import {
  isRepositoryCommitStyle,
  type AppConfigState,
  type RepositoryCommitStyle,
  type RepositoryRecord,
} from "../../shared/AppConfig.ts";
import { useUpdateRepositoryPreferencesMutation } from "../mutations/index.ts";

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

export const RepositorySettingsPanel = ({
  appConfig,
  repository,
  status,
}: RepositorySettingsPanelProps) => {
  const updatePreferences = useUpdateRepositoryPreferencesMutation({ appConfig });
  const defaultRemote = status?.metadata?.defaultRemote;
  const defaultRemoteUrl = status?.metadata?.defaultRemoteUrl;
  const remotes = status?.metadata?.remotes ?? [];
  const remoteSummary =
    remotes.length === 0
      ? "No remotes configured"
      : remotes.map((remote) => `${remote.name}${remote.url ? ` (${remote.url})` : ""}`).join(", ");

  const setCommitStyle = (value: string) => {
    if (!isRepositoryCommitStyle(value) || value === repository.preferences.commitStyle) return;

    updatePreferences.mutate({
      id: repository.id,
      preferences: {
        commitStyle: value,
      },
    });
  };

  return (
    <UiRepositorySettingsPanel
      commitStyleItems={commitStyleItems}
      informationRows={[
        {
          label: "Current branch",
          value: status?.metadata?.currentBranch ?? "Detached or unavailable",
        },
        {
          label: "Default remote",
          value: defaultRemote ?? "No default remote",
        },
        {
          label: "Default remote URL",
          value: defaultRemoteUrl ?? "No remote URL",
        },
        {
          label: "Remotes",
          value: remoteSummary,
        },
        {
          label: "Cycle snapshot",
          value: shortId(status?.activeSnapshotId),
        },
        {
          label: "Status",
          value: status?.status ?? "Unavailable",
        },
        {
          label: "Warnings",
          value: String(status?.warningCount ?? 0),
        },
      ]}
      onCommitStyleChange={setCommitStyle}
      repository={{
        commitStyle: repository.preferences.commitStyle,
        displayName: repository.displayName,
        path: repository.path,
      }}
    />
  );
};
