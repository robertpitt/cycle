import type { HistoryCommit, RepositoryHistoryQuery } from "@cycle/contracts";
import { Badge, Button, Spinner } from "@cycle/ui/atoms";
import { cn } from "@cycle/ui/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  Copy,
  GitCommitHorizontal,
  History,
  Ticket,
} from "lucide-react";
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

const copyText = (value: string): void => {
  void navigator.clipboard?.writeText(value);
};

const renderPanelState = (
  title: string,
  description: string,
  icon: "error" | "loading" | "empty",
) => (
  <div className="grid min-h-full place-items-center p-8">
    <div className="grid max-w-md justify-items-center gap-3 text-center">
      <div className="grid size-10 place-items-center rounded-lg border border-border bg-subtle text-muted-foreground">
        {icon === "loading" ? (
          <Spinner className="size-4" label={title} />
        ) : icon === "error" ? (
          <AlertTriangle aria-hidden className="size-4 text-warning" />
        ) : (
          <History aria-hidden className="size-4" />
        )}
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  </div>
);

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

const HistoryRow = ({
  entry,
  onIssueSelect,
}: {
  readonly entry: HistoryCommit;
  readonly onIssueSelect?: (issueId: string) => void;
}) => (
  <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
    <div className="grid justify-items-center">
      <span className="mt-1 grid size-6 place-items-center rounded-full border border-border bg-surface text-muted-foreground">
        <GitCommitHorizontal aria-hidden className="size-3.5" />
      </span>
      <span className="mt-2 min-h-8 w-px bg-border" aria-hidden />
    </div>
    <article className="grid min-w-0 gap-3 border-b border-border/70 pb-5">
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {entry.message ?? "Untitled GitDB commit"}
          </h2>
          {entry.warningCount > 0 ? (
            <Badge tone="warning">
              {entry.warningCount} warning{entry.warningCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
          <span>{formatDateTime(entry.committedAt)}</span>
          <span>{authorLabel(entry)}</span>
          <span>#{entry.sequence}</span>
          {entry.parentIds.length > 1 ? <span>{entry.parentIds.length} parents</span> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-md border border-border bg-subtle px-1 py-0.5">
          <span
            className="px-1.5 font-mono text-xs font-semibold text-foreground"
            title={entry.snapshotId}
          >
            {shortSnapshotId(entry.snapshotId)}
          </span>
          <InlineIconButton
            label={`Copy commit id ${entry.snapshotId}`}
            onClick={() => copyText(entry.snapshotId)}
          >
            <Copy aria-hidden className="size-3.5" />
          </InlineIconButton>
        </span>
        {entry.changedTicketIds.length > 0 ? (
          <>
            {entry.changedTicketIds.slice(0, 8).map((issueId) => (
              <ChangedTicketActions issueId={issueId} key={issueId} onIssueSelect={onIssueSelect} />
            ))}
            {entry.changedTicketIds.length > 8 ? (
              <Badge appearance="outline">+{entry.changedTicketIds.length - 8}</Badge>
            ) : null}
          </>
        ) : (
          <p className="text-xs font-medium text-muted-foreground">No ticket changes detected.</p>
        )}
      </div>
    </article>
  </li>
);

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
    return renderPanelState(
      "Choose a repository",
      "Repository history is available after a repository is selected.",
      "empty",
    );
  }

  if (historyQuery.isLoading) {
    return renderPanelState("Loading history", "Reading GitDB commit history.", "loading");
  }

  if (historyQuery.error instanceof Error) {
    return renderPanelState("History unavailable", historyQuery.error.message, "error");
  }

  const history = historyQuery.data;
  const entries = history?.entries ?? [];

  if (entries.length === 0) {
    return renderPanelState(
      "No committed history",
      "This repository does not have committed Cycle GitDB changes yet.",
      "empty",
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">GitDB history</p>
          <h1 className="truncate text-sm font-semibold text-foreground">
            Repository commits related to Cycle data
          </h1>
        </div>
        <Badge appearance="outline">Page {cursorStack.length + 1}</Badge>
      </header>

      <div className="min-h-0 overflow-y-auto px-5 py-5">
        <ol className="grid gap-0">
          {entries.map((entry) => (
            <HistoryRow entry={entry} key={entry.snapshotId} onIssueSelect={onIssueSelect} />
          ))}
        </ol>
      </div>

      <footer className="flex min-h-12 items-center justify-between gap-3 border-t border-border bg-surface px-5">
        <p className="truncate text-xs font-medium text-muted-foreground">
          Showing {entries.length} commit{entries.length === 1 ? "" : "s"}
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
