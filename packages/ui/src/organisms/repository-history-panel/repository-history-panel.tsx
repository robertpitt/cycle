import { ArrowUpRight, Copy, History, Ticket } from "lucide-react";
import * as React from "react";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { DateTime, type DateTimeValue } from "../../atoms/date-time/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { cn } from "../../lib/cn.ts";
import {
  CommitHistory,
  type CommitHistoryItem,
  type CommitHistoryState,
} from "../commit-history/index.ts";

export type RepositoryHistoryEntry = {
  readonly authorEmail?: string;
  readonly authorName?: string;
  readonly changedIssueIds: readonly string[];
  readonly committedAt?: DateTimeValue;
  readonly id: string;
  readonly message?: React.ReactNode;
  readonly parentCount?: number;
  readonly sequence: number;
  readonly snapshotId: string;
  readonly warningCount: number;
};

export type RepositoryHistoryPanelProps = {
  readonly canNextPage?: boolean;
  readonly canPreviousPage?: boolean;
  readonly className?: string;
  readonly emptyState?: React.ReactNode;
  readonly entries: readonly RepositoryHistoryEntry[];
  readonly error?: React.ReactNode;
  readonly loading?: boolean;
  readonly loadingNextPage?: boolean;
  readonly onCopyText?: (value: string) => void;
  readonly onIssueSelect?: (issueId: string) => void;
  readonly onNextPage?: () => void;
  readonly onPreviousPage?: () => void;
  readonly pageLabel?: React.ReactNode;
  readonly repositoryRequiredDescription?: React.ReactNode;
  readonly repositoryRequiredTitle?: React.ReactNode;
  readonly repositorySelected?: boolean;
  readonly title?: React.ReactNode;
};

const defaultEmptyState = "This repository does not have committed Cycle GitDB changes yet.";
const defaultRepositoryRequiredDescription =
  "Repository history is available after a repository is selected.";
const defaultRepositoryRequiredTitle = "Choose a repository";

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const shortSnapshotId = (snapshotId: string): string => snapshotId.slice(0, 10);

const shortIssueId = (issueId: string): string =>
  issueId.length > 12 ? issueId.slice(0, 12) : issueId;

const authorLabel = (entry: RepositoryHistoryEntry): string =>
  entry.authorName ?? entry.authorEmail ?? "Unknown author";

const initialsForName = (name: string): string =>
  name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const defaultCopyText = (value: string): void => {
  void globalThis.navigator?.clipboard?.writeText(value);
};

const InlineIconButton = ({
  children,
  label,
  onClick,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) => (
  <button
    aria-label={label}
    className={cn(
      "grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors",
      "hover:bg-subtle hover:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    )}
    onClick={onClick}
    title={label}
    type="button"
  >
    {children}
  </button>
);

const CopySnapshotAction = ({
  onCopy,
  snapshotId,
}: {
  readonly onCopy: (value: string) => void;
  readonly snapshotId: string;
}) => (
  <span className="inline-flex max-w-full items-center rounded-md border border-border bg-popover px-1 py-0.5">
    <span className="min-w-0 truncate px-1.5 font-mono text-xs font-semibold text-foreground">
      {shortSnapshotId(snapshotId)}
    </span>
    <InlineIconButton label={`Copy commit id ${snapshotId}`} onClick={() => onCopy(snapshotId)}>
      <Copy aria-hidden className="size-3.5" />
    </InlineIconButton>
  </span>
);

const ChangedIssueActions = ({
  issueId,
  onCopy,
  onIssueSelect,
}: {
  readonly issueId: string;
  readonly onCopy: (value: string) => void;
  readonly onIssueSelect?: (issueId: string) => void;
}) => (
  <span className="inline-flex max-w-full items-center rounded-md border border-border bg-popover px-1 py-0.5">
    <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-xs font-medium text-muted-foreground">
      <Ticket aria-hidden className="size-3 shrink-0" />
      <span className="truncate" title={issueId}>
        {shortIssueId(issueId)}
      </span>
    </span>
    {onIssueSelect ? (
      <InlineIconButton label={`Open issue ${issueId}`} onClick={() => onIssueSelect(issueId)}>
        <ArrowUpRight aria-hidden className="size-3.5" />
      </InlineIconButton>
    ) : null}
    <InlineIconButton label={`Copy issue id ${issueId}`} onClick={() => onCopy(issueId)}>
      <Copy aria-hidden className="size-3.5" />
    </InlineIconButton>
  </span>
);

const issueImpactState = (entry: RepositoryHistoryEntry): CommitHistoryState => {
  const issueCount = entry.changedIssueIds.length;

  return {
    id: issueCount > 0 ? "issue-changes" : "no-issue-changes",
    label: issueCount > 0 ? pluralize(issueCount, "issue change") : "No issue changes",
    tone: issueCount > 0 ? "info" : "neutral",
  };
};

const warningState = (entry: RepositoryHistoryEntry): CommitHistoryState => ({
  id: "warnings",
  label: pluralize(entry.warningCount, "warning"),
  tone: "warning",
});

const commitHistoryItem = ({
  entry,
  onCopy,
  onIssueSelect,
}: {
  readonly entry: RepositoryHistoryEntry;
  readonly onCopy: (value: string) => void;
  readonly onIssueSelect?: (issueId: string) => void;
}): CommitHistoryItem => {
  const authorName = authorLabel(entry);
  const issueCount = entry.changedIssueIds.length;
  const meta: React.ReactNode[] = [
    <span key="sequence">#{entry.sequence}</span>,
    <CopySnapshotAction key="snapshot" onCopy={onCopy} snapshotId={entry.snapshotId} />,
  ];

  if ((entry.parentCount ?? 0) > 1) {
    meta.splice(1, 0, <span key="parents">{pluralize(entry.parentCount ?? 0, "parent")}</span>);
  }

  meta.push(
    ...entry.changedIssueIds
      .slice(0, 8)
      .map((issueId) => (
        <ChangedIssueActions
          issueId={issueId}
          key={issueId}
          onCopy={onCopy}
          onIssueSelect={onIssueSelect}
        />
      )),
  );

  if (issueCount > 8) {
    meta.push(
      <Badge appearance="outline" key="issue-overflow">
        +{issueCount - 8}
      </Badge>,
    );
  }

  return {
    author: {
      initials: initialsForName(authorName),
      name: authorName,
    },
    commitRef: shortSnapshotId(entry.snapshotId),
    commitTitle: entry.message ?? "Untitled GitDB commit",
    id: entry.id,
    meta,
    occurredAt: entry.committedAt ?? undefined,
    timestamp: (
      <DateTime
        dateStyle="medium"
        fallback="Unknown time"
        format="datetime"
        timeStyle="short"
        value={entry.committedAt}
      />
    ),
    transition:
      entry.warningCount > 0
        ? {
            from: issueImpactState(entry),
            label: "Projection",
            to: warningState(entry),
          }
        : {
            label: "Impact",
            to: issueImpactState(entry),
          },
  };
};

const RepositoryRequiredState = ({
  description,
  title,
}: {
  readonly description: React.ReactNode;
  readonly title: React.ReactNode;
}) => (
  <div className="grid min-h-full place-items-center p-8">
    <div className="grid max-w-md justify-items-center gap-3 text-center">
      <div className="grid size-10 place-items-center rounded-lg border border-border bg-subtle text-muted-foreground">
        <History aria-hidden className="size-4" />
      </div>
      <div className="grid gap-1">
        <Text as="p" className="font-semibold" variant="bodyCompact">
          {title}
        </Text>
        <Text as="p" className="leading-6" tone="muted" variant="bodyCompact">
          {description}
        </Text>
      </div>
    </div>
  </div>
);

export const RepositoryHistoryPanel = ({
  canNextPage = false,
  canPreviousPage = false,
  className,
  emptyState = defaultEmptyState,
  entries,
  error,
  loading = false,
  loadingNextPage = false,
  onCopyText = defaultCopyText,
  onIssueSelect,
  onNextPage,
  onPreviousPage,
  pageLabel = "Page 1",
  repositoryRequiredDescription = defaultRepositoryRequiredDescription,
  repositoryRequiredTitle = defaultRepositoryRequiredTitle,
  repositorySelected = true,
  title = "Repository history",
}: RepositoryHistoryPanelProps) => {
  if (!repositorySelected) {
    return (
      <RepositoryRequiredState
        description={repositoryRequiredDescription}
        title={repositoryRequiredTitle}
      />
    );
  }

  const items = entries.map((entry) =>
    commitHistoryItem({ entry, onCopy: onCopyText, onIssueSelect }),
  );

  return (
    <section
      className={cn("grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-background", className)}
    >
      <div className="min-h-0 overflow-y-auto">
        <CommitHistory
          count={
            loading
              ? undefined
              : entries.length === 0
                ? "No commits"
                : pluralize(entries.length, "commit")
          }
          emptyState={emptyState}
          error={error}
          headerAction={<Badge appearance="outline">{pageLabel}</Badge>}
          items={items}
          density="compact"
          loading={loading}
          title={title}
        />
      </div>

      <footer className="flex min-h-12 items-center justify-between gap-3 border-t border-border bg-surface px-5">
        <Text as="p" className="truncate font-medium" tone="muted" variant="meta">
          {loading ? "Loading history" : `Showing ${pluralize(entries.length, "commit")}`}
        </Text>
        <div className="flex items-center gap-2">
          <Button
            disabled={!canPreviousPage || loadingNextPage}
            onClick={onPreviousPage}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={!canNextPage || loadingNextPage}
            loading={loadingNextPage}
            loadingLabel="Loading next history page"
            onClick={onNextPage}
            size="sm"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </footer>
    </section>
  );
};
