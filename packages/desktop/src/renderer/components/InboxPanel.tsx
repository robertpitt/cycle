import type { InboxReason, InboxStatus } from "@cycle/backend/client";
import { PanelState } from "@cycle/ui/molecules";
import { InboxList, type InboxListEntry } from "@cycle/ui/organisms";
import * as React from "react";
import type { ProfileConfig, RepositoryRecord } from "@cycle/backend/client";
import { useInboxMutation } from "../mutations/index.ts";
import {
  inboxListEntriesFromPages,
  useInboxListInfiniteQuery,
  useInboxSummaryQuery,
} from "../queries/index.ts";
import { markReadInputForOpenedInboxEntry } from "./inboxOpen.ts";

type InboxPanelProps = {
  readonly onIssueSelect?: (selection: {
    readonly issueId: string;
    readonly repositoryId: string;
  }) => void;
  readonly profile?: ProfileConfig;
  readonly repositories: readonly RepositoryRecord[];
};

export const InboxPanel = ({ onIssueSelect, profile, repositories }: InboxPanelProps) => {
  const [repositoryFilter, setRepositoryFilter] = React.useState<string | "all">("all");
  const [reasonFilter, setReasonFilter] = React.useState<InboxReason | "all">("all");
  const [statusFilter, setStatusFilter] = React.useState<InboxStatus | "all">("unread");
  const [selectedItemIds, setSelectedItemIds] = React.useState<readonly string[]>([]);
  const repositoryIds = React.useMemo(
    () => repositories.map((repository) => repository.id),
    [repositories],
  );
  const filteredRepositoryIds = React.useMemo(
    () =>
      repositoryFilter === "all"
        ? repositoryIds
        : repositoryIds.filter((id) => id === repositoryFilter),
    [repositoryFilter, repositoryIds],
  );
  const query = React.useMemo(
    () =>
      profile?.email
        ? {
            reason: reasonFilter === "all" ? undefined : reasonFilter,
            repositoryIds: filteredRepositoryIds,
            status: statusFilter,
            userId: profile.email,
          }
        : undefined,
    [filteredRepositoryIds, profile?.email, reasonFilter, statusFilter],
  );
  const summaryQuery = React.useMemo(
    () =>
      profile?.email
        ? {
            limit: 1,
            repositoryIds,
            status: "all" as const,
            userId: profile.email,
          }
        : undefined,
    [profile?.email, repositoryIds],
  );
  const inboxQuery = useInboxListInfiniteQuery(query);
  const inboxSummaryQuery = useInboxSummaryQuery(summaryQuery);
  const markRead = useInboxMutation({ kind: "markRead" });
  const archive = useInboxMutation({ kind: "archive" });
  const inboxEntries = inboxListEntriesFromPages(inboxQuery.data);
  const entries: readonly InboxListEntry[] = inboxEntries.map((entry) => ({
    actor: entry.actor,
    bodyExcerpt: entry.bodyExcerpt,
    createdAt: entry.createdAt,
    itemId: entry.itemId,
    reason: entry.reason,
    recordId: entry.recordId,
    repositoryId: entry.repositoryId,
    sourceState: entry.sourceState,
    status: entry.status,
    ticketId: entry.ticketId,
    title: entry.title,
  }));
  const repositorySummaries = inboxSummaryQuery.data?.repositories ?? [];

  React.useEffect(() => {
    setSelectedItemIds([]);
  }, [reasonFilter, repositoryFilter, statusFilter]);

  if (!profile?.email) {
    return (
      <PanelState message="Configure your profile email in settings before opening the inbox." />
    );
  }

  return (
    <InboxList
      className="h-full overflow-auto rounded-lg border border-border shadow-card"
      count={countLabel(inboxSummaryQuery.data?.unreadCount, inboxEntries.length)}
      entries={entries}
      hasMore={inboxQuery.hasNextPage}
      loading={inboxQuery.isLoading || inboxSummaryQuery.isLoading}
      loadingMore={inboxQuery.isFetchingNextPage}
      onArchiveSelected={(itemIds) => {
        archive.mutate({
          itemIds,
          userId: profile.email,
        });
        setSelectedItemIds([]);
      }}
      onEntrySelect={(entry) => {
        const markReadInput = markReadInputForOpenedInboxEntry(entry, profile.email);
        if (markReadInput !== undefined) {
          markRead.mutate(markReadInput);
        }

        onIssueSelect?.({
          issueId: entry.ticketId,
          repositoryId: entry.repositoryId,
        });
      }}
      onLoadMore={() => {
        void inboxQuery.fetchNextPage();
      }}
      onMarkSelectedRead={(itemIds) => {
        markRead.mutate({
          itemIds,
          userId: profile.email,
        });
        setSelectedItemIds([]);
      }}
      onReasonFilterChange={setReasonFilter}
      onRepositoryFilterChange={setRepositoryFilter}
      onSelectionChange={setSelectedItemIds}
      onStatusFilterChange={setStatusFilter}
      reasonFilter={reasonFilter}
      repositories={repositories.map((repository) => {
        const summary = repositorySummaries.find(
          (candidate) => candidate.repositoryId === repository.id,
        );

        return {
          label: repository.displayName,
          repositoryId: repository.id,
          status: summary?.status,
          warningCount: summary?.warningCount,
        };
      })}
      repositoryFilter={repositoryFilter}
      selectedItemIds={selectedItemIds}
      statusFilter={statusFilter}
      title="Inbox"
    />
  );
};

const countLabel = (unreadCount: number | undefined, visibleCount: number | undefined): string => {
  if (unreadCount === undefined) return "Loading";
  const visible = visibleCount ?? 0;
  return `${unreadCount} unread · ${visible} shown`;
};
