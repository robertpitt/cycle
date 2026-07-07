import type { HistoryCommit, RepositoryHistoryQuery } from "@cycle/backend/client";
import {
  RepositoryHistoryPanel as UiRepositoryHistoryPanel,
  type RepositoryHistoryEntry,
} from "@cycle/ui/organisms";
import * as React from "react";
import { useRepositoryHistoryQuery } from "../queries/index.ts";

type RepositoryHistoryPanelProps = {
  readonly onIssueSelect?: (issueId: string) => void;
  readonly repositoryId?: string;
};

const historyPageLimit = 50;

const copyText = (value: string): void => {
  void navigator.clipboard?.writeText(value);
};

const historyEntry = (entry: HistoryCommit): RepositoryHistoryEntry => ({
  authorEmail: entry.authorEmail,
  authorName: entry.authorName,
  changedIssueIds: entry.changedTicketIds,
  committedAt: entry.committedAt,
  id: entry.snapshotId,
  message: entry.message,
  parentCount: entry.parentIds.length,
  sequence: entry.sequence,
  snapshotId: entry.snapshotId,
  warningCount: entry.warningCount,
});

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

  const history = historyQuery.data;
  const entries = history?.entries ?? [];

  return (
    <UiRepositoryHistoryPanel
      canNextPage={Boolean(history?.nextCursor) && !historyQuery.isFetching}
      canPreviousPage={cursorStack.length > 0 && !historyQuery.isFetching}
      entries={entries.map(historyEntry)}
      error={historyQuery.error instanceof Error ? historyQuery.error.message : undefined}
      loading={historyQuery.isLoading}
      loadingNextPage={historyQuery.isFetching && !historyQuery.isLoading}
      onCopyText={copyText}
      onIssueSelect={onIssueSelect}
      onNextPage={() => {
        if (history?.nextCursor) {
          setCursorStack((current) => [...current, history.nextCursor as string]);
        }
      }}
      onPreviousPage={() => setCursorStack((current) => current.slice(0, -1))}
      pageLabel={`Page ${cursorStack.length + 1}`}
      repositorySelected={Boolean(repositoryId)}
    />
  );
};
