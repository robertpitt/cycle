import { Select, type SelectItem } from "../../atoms/select/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { SettingRow } from "../../molecules/setting-row/index.ts";

export type RepositorySettingsInfoRow = {
  readonly label: string;
  readonly value: string;
};

export type RepositorySettingsRepository = {
  readonly commitStyle: string;
  readonly displayName: string;
  readonly path: string;
};

export type RepositorySettingsPanelProps = {
  readonly commitStyleItems: readonly SelectItem[];
  readonly informationRows: readonly RepositorySettingsInfoRow[];
  readonly onCommitStyleChange: (value: string) => void;
  readonly repository: RepositorySettingsRepository;
};

const InfoRow = ({ label, value }: RepositorySettingsInfoRow) => (
  <div className="grid gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[160px_minmax(0,1fr)] md:gap-6">
    <Text as="dt" tone="muted" variant="control">
      {label}
    </Text>
    <Text as="dd" className="min-w-0 break-words" variant="bodyCompact">
      {value}
    </Text>
  </div>
);

export const RepositorySettingsPanel = ({
  commitStyleItems,
  informationRows,
  onCommitStyleChange,
  repository,
}: RepositorySettingsPanelProps) => (
  <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
    <header className="grid gap-1">
      <Text as="h1" variant="pageTitle">
        {repository.displayName} settings
      </Text>
      <Text tone="muted" variant="bodyCompact">
        Repository information and Cycle behavior for this local project.
      </Text>
    </header>

    <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <Text as="h2" variant="sectionTitle">
        Repository information
      </Text>
      <dl className="mt-3">
        <InfoRow label="Path" value={repository.path} />
        {informationRows.map((row) => (
          <InfoRow key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
    </section>

    <section className="rounded-lg border border-border bg-surface px-5 shadow-card">
      <h2 className="sr-only">Repository preferences</h2>
      <SettingRow
        control={
          <Select
            aria-label="Commit style"
            className="w-40"
            items={commitStyleItems}
            onValueChange={(value) => {
              if (value !== null) onCommitStyleChange(value);
            }}
            value={repository.commitStyle}
          />
        }
        description="Saved preference for Cycle commit message formatting."
        title="Commit style"
      />
    </section>
  </div>
);
