import type { HistoryCommit, RepositoryHistoryQuery } from "@cycle/contracts";
import { Badge, Button } from "@cycle/ui/atoms";
import {
  CommitHistory,
  type CommitHistoryItem,
  type CommitHistoryState,
} from "@cycle/ui/organisms";
import { cn } from "@cycle/ui/utils";
import { ArrowUpRight, Copy, History, Ticket } from "lucide-react";
import * as React from "react";
import { useRepositoryHistoryQuery } from "../queries/index.ts";

type RepositoryHistoryPanelProps = {
  readonly onIssueSelect?: (issueId: string) => void;
  readonly repositoryId?: string;
};

const historyPageLimit = 50;

const formatDateTime = (value: string | undefined): string => {
  if (!value) return "Unknown time";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const shortSnapshotId = (snapshotId: string): string => snapshotId.slice(0, 10);

const shortIssueId = (issueId: string): string =>
  issueId.length > 12 ? issueId.slice(0, 12) : issueId;

const authorLabel = (entry: HistoryCommit): string =>
  entry.authorName ?? entry.authorEmail ?? "Unknown author";

const initialsForName = (name: string): string =>
  name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const copyText = (value: string): void => {
  void navigator.clipboard?.writeText(value);
};

const renderRepositoryRequiredState = (title: string, description: string) => (
  <div className="grid min-h-full place-items-center p-8">
    <div className="grid max-w-md justify-items-center gap-3 text-center">
      <div className="grid size-10 place-items-center rounded-lg border border-border bg-subtle text-muted-foreground">
        <History aria-hidden className="size-4" />
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  </div>
);

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

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

const CopySnapshotAction = ({ snapshotId }: { readonly snapshotId: string }) => (
  <span className="inline-flex max-w-full items-center rounded-md border border-border bg-popover px-1 py-0.5">
    <span className="min-w-0 truncate px-1.5 font-mono text-xs font-semibold text-foreground">
      {shortSnapshotId(snapshotId)}
    </span>
    <InlineIconButton label={`Copy commit id ${snapshotId}`} onClick={() => copyText(snapshotId)}>
      <Copy aria-hidden className="size-3.5" />
    </InlineIconButton>
  </span>
);

const ChangedTicketActions = ({
  issueId,
  onIssueSelect,
}: {
  readonly issueId: string;
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
    <InlineIconButton label={`Copy issue id ${issueId}`} onClick={() => copyText(issueId)}>
      <Copy aria-hidden className="size-3.5" />
    </InlineIconButton>
  </span>
);

const ticketImpactState = (entry: HistoryCommit): CommitHistoryState => {
  const ticketCount = entry.changedTicketIds.length;

  return {
    id: ticketCount > 0 ? "ticket-changes" : "no-ticket-changes",
    label: ticketCount > 0 ? pluralize(ticketCount, "ticket change") : "No ticket changes",
    tone: ticketCount > 0 ? "info" : "neutral",
  };
};

const warningState = (entry: HistoryCommit): CommitHistoryState => ({
  id: "warnings",
  label: pluralize(entry.warningCount, "warning"),
  tone: "warning",
});

const commitTransition = (entry: HistoryCommit): CommitHistoryItem["transition"] => {
  if (entry.warningCount > 0) {
    return {
      from: ticketImpactState(entry),
      label: "Projection",
      to: warningState(entry),
    };
  }

  return {
    label: "Impact",
    to: ticketImpactState(entry),
  };
};

const commitMeta = (
  entry: HistoryCommit,
  onIssueSelect?: (issueId: string) => void,
): readonly React.ReactNode[] => {
  const meta: React.ReactNode[] = [
    <span key="sequence">#{entry.sequence}</span>,
    <CopySnapshotAction key="snapshot" snapshotId={entry.snapshotId} />,
  ];

  if (entry.parentIds.length > 1) {
    meta.splice(1, 0, <span key="parents">{pluralize(entry.parentIds.length, "parent")}</span>);
  }

  meta.push(
    ...entry.changedTicketIds
      .slice(0, 8)
      .map((issueId) => (
        <ChangedTicketActions issueId={issueId} key={issueId} onIssueSelect={onIssueSelect} />
      )),
  );

  if (entry.changedTicketIds.length > 8) {
    meta.push(
      <Badge appearance="outline" key="ticket-overflow">
        +{entry.changedTicketIds.length - 8}
      </Badge>,
    );
  }

  return meta;
};

const commitHistoryItem = (
  entry: HistoryCommit,
  onIssueSelect?: (issueId: string) => void,
): CommitHistoryItem => {
  const authorName = authorLabel(entry);

  return {
    author: {
      initials: initialsForName(authorName),
      name: authorName,
    },
    commitRef: shortSnapshotId(entry.snapshotId),
    commitTitle: entry.message ?? "Untitled GitDB commit",
    id: entry.snapshotId,
    meta: commitMeta(entry, onIssueSelect),
    occurredAt: entry.committedAt,
    timestamp: formatDateTime(entry.committedAt),
    transition: commitTransition(entry),
  };
};

export const RepositoryHistoryPanel = ({
  onIssueSelect,
  repositoryId,
}: RepositoryHistoryPanelProps) => {
  const [cursorStack, setCursorStack] = React.useState<readonly string[]>([]);
  const cursor = cursorStack.at(-1);
  const query = React.useMemo(
    () =>
      ({
        cursor,
        limit: historyPageLimit,
      }) satisfies RepositoryHistoryQuery,
    [cursor],
  );
  const historyQuery = useRepositoryHistoryQuery(repositoryId, query);

  React.useEffect(() => {
    setCursorStack([]);
  }, [repositoryId]);

  if (!repositoryId) {
    return renderRepositoryRequiredState(
      "Choose a repository",
      "Repository history is available after a repository is selected.",
    );
  }

  const history = historyQuery.data;
  const entries = history?.entries ?? [];
  const items = entries.map((entry) => commitHistoryItem(entry, onIssueSelect));

  return (
    <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-background">
      <div className="min-h-0 overflow-y-auto">
        <CommitHistory
          count={
            historyQuery.isLoading
              ? undefined
              : entries.length === 0
                ? "No commits"
                : pluralize(entries.length, "commit")
          }
          emptyState="This repository does not have committed Cycle GitDB changes yet."
          error={historyQuery.error instanceof Error ? historyQuery.error.message : undefined}
          headerAction={<Badge appearance="outline">Page {cursorStack.length + 1}</Badge>}
          items={items}
          loading={historyQuery.isLoading}
          title="Repository history"
        />
      </div>

      <footer className="flex min-h-12 items-center justify-between gap-3 border-t border-border bg-surface px-5">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {historyQuery.isLoading
            ? "Loading history"
            : `Showing ${pluralize(entries.length, "commit")}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            disabled={cursorStack.length === 0 || historyQuery.isFetching}
            onClick={() => setCursorStack((current) => current.slice(0, -1))}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={!history?.nextCursor || historyQuery.isFetching}
            loading={historyQuery.isFetching && !historyQuery.isLoading}
            loadingLabel="Loading next history page"
            onClick={() => {
              if (history?.nextCursor) {
                setCursorStack((current) => [...current, history.nextCursor as string]);
              }
            }}
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
