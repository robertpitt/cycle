import { ViewIssue, type ViewIssueActivityEvent, type ViewIssueComment } from "@cycle/ui/organisms";
import { Button, DateTime, Input, Select, StatusIndicator, Textarea } from "@cycle/ui/atoms";
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseButton,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
  IssueAssigneeMark,
  IssuePriorityMark,
  IssuePropertyOptionMenu,
  IssuePropertyPopover,
  IssueStatusMark,
  PanelState,
  type IssuePropertyMenuOption,
} from "@cycle/ui/molecules";
import {
  BarChart3,
  CalendarDays,
  Copy,
  Download,
  Gauge,
  GitBranch,
  ListChecks,
  MessageSquarePlus,
  Sparkles,
} from "lucide-react";
import * as React from "react";
import type {
  ExternalLink,
  HistoryCommit,
  IssueRelation,
  IssueRelationType,
  LinkedRecord,
  TicketDocument,
} from "@cycle/contracts/schemas";
import type { CreateTicketInput } from "@cycle/contracts";
import {
  useAddIssueCommentMutation,
  useAppendAgentTaskInputMutation,
  useArchiveIssueMutation,
  useCancelAgentTaskMutation,
  useCreateIssueMutation,
  useRetryAgentTaskMutation,
  useIssueCommentActionsMutation,
  useIssueRelationMutation,
  useStartIssueAgentTaskMutation,
  useUpdateIssueMutation,
} from "../mutations/index.ts";
import {
  useAgentTaskEventsQuery,
  useAgentTasksQuery,
  useInitiativeProgressQuery,
  useIssueDetailQuery,
  useIssueHistoryQuery,
  useIssueListQuery,
  useIssueRelationshipTicketQueries,
  useIssueRecordsQuery,
  useLabelListQuery,
  useUserListQuery,
} from "../queries/index.ts";
import { createMarkdownTagSuggestions } from "../lib/markdownTagSuggestions.ts";
import { labelColorClassName } from "../screens/workspace/createIssueOptions.tsx";
import type { AgentWorkConfig, RepositoryRecord } from "@cycle/config";
import type { DetectedAgentProvider } from "@cycle/contracts/schemas/agents";
import {
  latestAgentTask,
  taskStatusTone,
  statusLabel,
  terminalAgentTaskStatuses,
  resumableAgentTaskStatuses,
  type AgentTask,
  type AgentTaskEvent,
} from "../lib/agentTasks.ts";
import { mapTicketDependencies, mapTicketSubIssues } from "../lib/ticketDependencies.ts";
import { MergeHandoffCard } from "./MergeHandoffCard.tsx";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import {
  issueRecordActivityBody,
  materializeIssueCommentRecords,
} from "../lib/issueCommentRecords.ts";
import type { TicketPromptWorkflowIntent } from "../lib/ticketPromptWorkflows.ts";
import { useNotifications } from "../notifications/NotificationProvider.tsx";

type ViewIssuePanelProps = {
  readonly agentWork?: AgentWorkConfig;
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly issueId?: string;
  readonly onArchived?: () => void;
  readonly onChatOpen?: (threadId?: string) => void;
  readonly onIssueSelect?: (issueId: string) => void;
  readonly repositories?: readonly RepositoryRecord[];
  readonly repositoryId?: string;
};

const initialsForName = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const formatDate = (value: string | undefined): React.ReactNode => {
  if (!value) return undefined;

  return <DateTime dateStyle="short" fallback={value} format="date" value={value} />;
};

const formatActivityTimestamp = (value: string | undefined): React.ReactNode => {
  if (!value) return undefined;

  return (
    <DateTime
      dateStyle="medium"
      fallback={value}
      format="datetime"
      timeStyle="short"
      value={value}
    />
  );
};

const authorFromName = (name: string) => ({
  initials: initialsForName(name),
  name,
});

const externalLinkTitle = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const issueResources = (issue: TicketDocument) =>
  (issue.frontmatter.externalLinks ?? []).map((link, index) => ({
    description: link.url,
    href: link.url,
    id: String(index),
    meta: "Link",
    title: link.title ?? link.source ?? externalLinkTitle(link.url),
  }));

const sentenceFragment = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;

  return `${trimmed[0]?.toLowerCase() ?? ""}${trimmed.slice(1)}`;
};

const historyMessageFragment = (entry: HistoryCommit): string => {
  const message = entry.message?.trim();
  if (!message) return "updated the issue";

  if (entry.authorName) {
    const prefix = `${entry.authorName} `;
    if (message.startsWith(prefix)) {
      return message.slice(prefix.length);
    }
  }

  return sentenceFragment(message);
};

const isCommentHistoryEntry = (entry: HistoryCommit): boolean => {
  const fragment = historyMessageFragment(entry).toLowerCase();
  return fragment.startsWith("commented on ") || fragment.includes(" commented on ");
};

const isCreatedHistoryEntry = (entry: HistoryCommit): boolean =>
  historyMessageFragment(entry).toLowerCase().startsWith("created ");

const issueCreatedActivity = (issue: TicketDocument): ViewIssueActivityEvent => ({
  author: authorFromName(issue.frontmatter.createdBy.name),
  body: "created the issue",
  id: `${issue.id}:created`,
  occurredAt: issue.frontmatter.createdAt,
  timestamp: formatActivityTimestamp(issue.frontmatter.createdAt),
});

const issueActivity = (
  issue: TicketDocument,
  historyEntries: readonly HistoryCommit[],
  records: readonly LinkedRecord[],
): readonly ViewIssueActivityEvent[] => {
  const historyEvents = historyEntries
    .filter((entry) => !isCommentHistoryEntry(entry))
    .map((entry) => {
      const authorName = entry.authorName ?? entry.authorEmail ?? issue.frontmatter.createdBy.name;

      return {
        author: authorFromName(authorName),
        body: historyMessageFragment(entry),
        id: entry.snapshotId,
        occurredAt: entry.committedAt,
        timestamp: formatActivityTimestamp(entry.committedAt),
      } satisfies ViewIssueActivityEvent;
    });

  const recordEvents = records.flatMap((record) => {
    const body = issueRecordActivityBody(record);
    return body === undefined
      ? []
      : [
          {
            author: authorFromName(record.createdBy.name),
            body,
            id: `record:${record.id}`,
            occurredAt: record.createdAt,
            timestamp: formatActivityTimestamp(record.createdAt),
          } satisfies ViewIssueActivityEvent,
        ];
  });
  const activity = [...historyEvents, ...recordEvents];

  return historyEntries.some(isCreatedHistoryEntry)
    ? activity
    : [issueCreatedActivity(issue), ...activity];
};

const issueHistoryPageLimit = 100;

const issueMarkdownExport = (issue: TicketDocument): string =>
  [
    "---",
    `id: ${JSON.stringify(issue.id)}`,
    `title: ${JSON.stringify(issue.frontmatter.title)}`,
    `type: ${JSON.stringify(issue.type)}`,
    `status: ${JSON.stringify(issue.frontmatter.status)}`,
    `priority: ${JSON.stringify(issue.frontmatter.priority)}`,
    ...(issue.frontmatter.assignee
      ? [`assignee: ${JSON.stringify(issue.frontmatter.assignee)}`]
      : []),
    `labels: ${JSON.stringify(issue.frontmatter.labels ?? [])}`,
    `externalLinks: ${JSON.stringify(issue.frontmatter.externalLinks ?? [])}`,
    "---",
    "",
    issue.body,
    "",
  ].join("\n");

const exportIssueMarkdown = (issue: TicketDocument): void => {
  const blob = new Blob([issueMarkdownExport(issue)], { type: "text/markdown;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = `${issue.id.replace(/[^a-z0-9_-]+/giu, "-")}.md`;
  anchor.href = href;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
};

const renderPanelState = (message: string, kind: "error" | "loading") => (
  <PanelState kind={kind} message={message} />
);

const propertyIconClassName = "size-4 text-muted-foreground";
const propertyMenuIconClassName = "size-4";

const priorityOptions = ["none", "urgent", "high", "medium", "low"] as const;
const statusOptions = [
  "backlog",
  "todo",
  "in-progress",
  "needs-review",
  "in-review",
  "done",
  "canceled",
] as const;

const titleForValue = (value: string): string =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const priorityLabel = (priority: string): string =>
  priority === "none" ? "No priority" : titleForValue(priority);

const IssueDueDateControl = ({
  disabled = false,
  onChange,
  value,
}: {
  readonly disabled?: boolean;
  readonly onChange: (value: string | null) => void;
  readonly value: string;
}) => {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <IssuePropertyPopover
      disabled={disabled}
      label="Change issue due date"
      onOpenChange={(open) => {
        if (open) setDraft(value);
      }}
      trigger={<CalendarDays aria-hidden className={propertyMenuIconClassName} />}
    >
      {(close) => (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const nextDueDate = draft.trim();
            if (nextDueDate !== value) {
              onChange(nextDueDate.length > 0 ? nextDueDate : null);
            }
            close();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            <span>Due date</span>
            <Input
              aria-label="Issue due date"
              onChange={(event) => setDraft(event.currentTarget.value)}
              type="date"
              value={draft}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => {
                if (value.length > 0) onChange(null);
                close();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
            <Button size="sm" type="submit">
              Apply
            </Button>
          </div>
        </form>
      )}
    </IssuePropertyPopover>
  );
};

const IssueEstimateControl = ({
  disabled = false,
  onChange,
  value,
}: {
  readonly disabled?: boolean;
  readonly onChange: (value: string | null) => void;
  readonly value: string;
}) => {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <IssuePropertyPopover
      disabled={disabled}
      label="Change issue estimate"
      onOpenChange={(open) => {
        if (open) setDraft(value);
      }}
      trigger={<Gauge aria-hidden className={propertyMenuIconClassName} />}
    >
      {(close) => (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const nextEstimate = draft.trim();
            if (nextEstimate !== value) {
              onChange(nextEstimate.length > 0 ? nextEstimate : null);
            }
            close();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            <span>Estimate</span>
            <Input
              aria-label="Issue estimate"
              inputMode="decimal"
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder="None"
              value={draft}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => {
                if (value.length > 0) onChange(null);
                close();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
            <Button size="sm" type="submit">
              Apply
            </Button>
          </div>
        </form>
      )}
    </IssuePropertyPopover>
  );
};

const metadataString = (task: AgentTask | undefined, key: string): string | undefined => {
  const value = task?.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const providerName = (
  providers: readonly DetectedAgentProvider[],
  providerId: string | undefined,
): string =>
  providers.find((provider) => provider.id === providerId)?.name ?? providerId ?? "Agent";

const agentTaskEventDetail = (event: AgentTaskEvent): string | undefined => {
  for (const key of ["message", "reason", "status", "error"]) {
    const value = event.payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const compact = Object.entries(event.payload)
    .filter(([, value]) => ["boolean", "number", "string"].includes(typeof value))
    .slice(0, 3)
    .map(([key, value]) => `${titleForValue(key)}: ${String(value)}`)
    .join(" · ");
  return compact || undefined;
};

const AgentTaskSidebar = ({
  appendPending,
  cancelPending,
  events,
  eventsLoading,
  onAppend,
  tasks,
  onCancel,
  onOpenChat,
  onRetry,
  providers,
  retryPending,
}: {
  readonly appendPending: boolean;
  readonly cancelPending: boolean;
  readonly events: readonly AgentTaskEvent[];
  readonly eventsLoading: boolean;
  readonly onAppend: (taskId: string, input: string) => void;
  readonly tasks: readonly AgentTask[];
  readonly onCancel: (taskId: string) => void;
  readonly onOpenChat: (threadId: string) => void;
  readonly onRetry: (taskId: string) => void;
  readonly providers: readonly DetectedAgentProvider[];
  readonly retryPending: boolean;
}) => {
  const [taskInput, setTaskInput] = React.useState("");
  const currentTask = latestAgentTask(tasks);
  const branchName = metadataString(currentTask, "branchName");
  const commitSha = metadataString(currentTask, "commitSha");
  const worktreePath = currentTask?.workspace?.path ?? metadataString(currentTask, "worktreePath");
  const canCancel = currentTask !== undefined && !terminalAgentTaskStatuses.has(currentTask.status);
  const canRetry = currentTask !== undefined && resumableAgentTaskStatuses.has(currentTask.status);
  const canAppend = currentTask !== undefined && !terminalAgentTaskStatuses.has(currentTask.status);
  const threadId = metadataString(currentTask, "threadId");

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Agent task
        </div>
        <div className="truncate font-medium text-foreground">
          {currentTask ? providerName(providers, currentTask.providerId) : "No task started"}
        </div>
        {currentTask?.model ? (
          <div className="truncate text-xs text-muted-foreground">{currentTask.model}</div>
        ) : null}
      </div>

      {currentTask ? (
        <div className="grid gap-2 rounded-md border border-border bg-subtle/45 p-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <StatusIndicator
                label={statusLabel(currentTask.status)}
                tone={taskStatusTone(currentTask.status)}
              />
              <span className="truncate font-medium">{statusLabel(currentTask.status)}</span>
            </div>
            <span className="shrink-0 rounded-sm bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Task
            </span>
          </div>
          {currentTask.lastError ? (
            <div className="text-xs text-destructive">{currentTask.lastError.message}</div>
          ) : null}
          {branchName ? (
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Branch</span>
              <span className="break-all text-xs text-foreground">{branchName}</span>
            </div>
          ) : null}
          {commitSha ? (
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Commit</span>
              <span className="break-all text-xs text-foreground">{commitSha.slice(0, 12)}</span>
            </div>
          ) : null}
          {worktreePath ? (
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Worktree</span>
              <span className="break-all text-xs text-foreground">{worktreePath}</span>
            </div>
          ) : null}
          {currentTask.handoff ? <MergeHandoffCard handoff={currentTask.handoff} /> : null}
          {canAppend ? (
            <form
              className="grid gap-2 border-t border-border pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                const input = taskInput.trim();
                if (!input) return;
                onAppend(currentTask.taskId, input);
                setTaskInput("");
              }}
            >
              <Textarea
                aria-label="Additional task input"
                disabled={appendPending}
                onChange={(event) => setTaskInput(event.currentTarget.value)}
                placeholder="Add context or direction..."
                value={taskInput}
              />
              <Button
                className="justify-self-start"
                disabled={!taskInput.trim()}
                loading={appendPending}
                size="sm"
                type="submit"
                variant="outline"
              >
                Send input
              </Button>
            </form>
          ) : null}
          {threadId !== undefined || canCancel || canRetry ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {threadId !== undefined ? (
                <Button onClick={() => onOpenChat(threadId)} size="sm" variant="outline">
                  Open chat
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  loading={cancelPending}
                  onClick={() => onCancel(currentTask.taskId)}
                  size="sm"
                  tone="danger"
                  variant="outline"
                >
                  Cancel
                </Button>
              ) : null}
              {canRetry ? (
                <Button
                  loading={retryPending}
                  onClick={() => onRetry(currentTask.taskId)}
                  size="sm"
                  variant="outline"
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No agent tasks yet.</div>
      )}
      {currentTask ? (
        <div className="grid gap-2 border-t border-border pt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Event timeline
          </div>
          {eventsLoading ? (
            <div className="text-xs text-muted-foreground">Loading task events…</div>
          ) : events.length === 0 ? (
            <div className="text-xs text-muted-foreground">No task events recorded yet.</div>
          ) : (
            <ol className="grid max-h-72 gap-2 overflow-y-auto pr-1">
              {events.map((event) => (
                <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-2" key={event.eventId}>
                  <span className="mt-1.5 size-1.5 rounded-full bg-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {statusLabel(event.type)}
                      </span>
                      <DateTime
                        className="shrink-0 text-[11px] text-muted-foreground"
                        fallback={event.occurredAt}
                        format="compactDateTime"
                        value={event.occurredAt}
                      />
                    </div>
                    {agentTaskEventDetail(event) ? (
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {agentTaskEventDetail(event)}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
};

const StartAgentTaskDialog = ({
  agentId,
  error,
  instructions,
  model,
  onAgentIdChange,
  onInstructionsChange,
  onModelChange,
  onOpenChange,
  onProviderIdChange,
  onSubmit,
  open,
  pending,
  providerId,
  providers,
}: {
  readonly agentId: string;
  readonly error?: string;
  readonly instructions: string;
  readonly model: string;
  readonly onAgentIdChange: (value: string) => void;
  readonly onInstructionsChange: (value: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onProviderIdChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly providerId: string;
  readonly providers: readonly DetectedAgentProvider[];
}) => {
  const providerItems = providers.map((provider) => ({
    disabled: provider.status !== "available",
    label: provider.name,
    value: provider.id,
  }));
  const hasAvailableProvider = providers.some((provider) => provider.status === "available");

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPanel width="md">
            <DialogHeader>
              <div>
                <DialogTitle>Start agent chat</DialogTitle>
                <DialogDescription>
                  Open an implementation chat from this issue's current context.
                </DialogDescription>
              </div>
              <DialogCloseButton />
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              <DialogBody className="grid gap-4">
                <div className="grid gap-1.5">
                  <div className="text-sm font-medium text-foreground">Mode</div>
                  <div className="rounded-md border border-border bg-subtle px-3 py-2 text-sm">
                    Implementation
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    disabled={pending || providerItems.length === 0}
                    items={providerItems}
                    label="Provider"
                    onValueChange={(value) => {
                      if (value !== null) onProviderIdChange(value);
                    }}
                    placeholder="Select provider"
                    value={providerId}
                  />
                  <Select
                    disabled={pending || providerItems.length === 0}
                    items={providerItems}
                    label="Agent"
                    onValueChange={(value) => {
                      if (value !== null) onAgentIdChange(value);
                    }}
                    placeholder="Select agent"
                    value={agentId}
                  />
                </div>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Model
                  <Input
                    disabled={pending}
                    onChange={(event) => onModelChange(event.currentTarget.value)}
                    placeholder="Provider default"
                    value={model}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Instructions
                  <Textarea
                    disabled={pending}
                    onChange={(event) => onInstructionsChange(event.currentTarget.value)}
                    placeholder="Optional implementation instructions"
                    value={instructions}
                  />
                </label>
                {!hasAvailableProvider ? (
                  <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                    No available agent provider was detected.
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
                  Cancel
                </Button>
                <Button
                  disabled={!hasAvailableProvider || !providerId || !agentId}
                  loading={pending}
                  type="submit"
                >
                  Start chat
                </Button>
              </DialogFooter>
            </form>
          </DialogPanel>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
};

const ArchiveIssueDialog = ({
  issueId,
  issueTitle,
  onConfirm,
  onOpenChange,
  open,
  pending,
}: {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
}) => (
  <DialogRoot
    onOpenChange={(nextOpen) => {
      if (!pending) onOpenChange(nextOpen);
    }}
    open={open}
  >
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport>
        <DialogPanel width="sm">
          <DialogHeader>
            <div>
              <DialogTitle>Archive issue?</DialogTitle>
              <DialogDescription>
                This removes the issue from active lists and normal app views.
              </DialogDescription>
            </div>
            <DialogCloseButton disabled={pending} />
          </DialogHeader>
          <DialogBody className="grid gap-3">
            <div className="rounded-md border border-border bg-subtle px-3 py-2">
              <div className="text-sm font-medium text-foreground">{issueTitle}</div>
              <div className="mt-1 text-xs font-medium text-muted-foreground">{issueId}</div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
              Cancel
            </Button>
            <Button loading={pending} onClick={onConfirm} tone="danger">
              Archive issue
            </Button>
          </DialogFooter>
        </DialogPanel>
      </DialogViewport>
    </DialogPortal>
  </DialogRoot>
);

const ManageLabelsDialog = ({
  availableLabels,
  onOpenChange,
  onSave,
  open,
  pending,
  value,
}: {
  readonly availableLabels: readonly { readonly id: string; readonly name: string }[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (labels: readonly string[]) => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly value: readonly string[];
}) => {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set(value));

  React.useEffect(() => {
    if (open) setSelected(new Set(value));
  }, [open, value]);

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPanel width="sm">
            <DialogHeader>
              <div>
                <DialogTitle>Edit issue labels</DialogTitle>
                <DialogDescription>Add or remove labels assigned to this issue.</DialogDescription>
              </div>
              <DialogCloseButton disabled={pending} />
            </DialogHeader>
            <DialogBody className="grid max-h-80 gap-1 overflow-y-auto">
              {availableLabels.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No repository labels are available.
                </div>
              ) : (
                availableLabels.map((label) => {
                  const checked = selected.has(label.id);
                  return (
                    <label
                      className="flex min-h-10 items-center gap-3 rounded-md px-2 text-sm hover:bg-subtle"
                      key={label.id}
                    >
                      <input
                        checked={checked}
                        disabled={pending}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(label.id)) next.delete(label.id);
                            else next.add(label.id);
                            return next;
                          })
                        }
                        type="checkbox"
                      />
                      <span className="font-medium text-foreground">{label.name}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {label.id}
                      </span>
                    </label>
                  );
                })
              )}
            </DialogBody>
            <DialogFooter>
              <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
                Cancel
              </Button>
              <Button loading={pending} onClick={() => onSave([...selected].sort())}>
                Save labels
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
};

const ExternalLinkDialog = ({
  initialValue,
  onOpenChange,
  onSave,
  open,
  pending,
}: {
  readonly initialValue?: ExternalLink;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (link: ExternalLink) => void;
  readonly open: boolean;
  readonly pending: boolean;
}) => {
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setTitle(initialValue?.title ?? "");
    setUrl(initialValue?.url ?? "");
  }, [initialValue, open]);

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPanel width="sm">
            <DialogHeader>
              <div>
                <DialogTitle>
                  {initialValue ? "Edit external link" : "Add external link"}
                </DialogTitle>
                <DialogDescription>
                  Attach a durable external resource to this issue.
                </DialogDescription>
              </div>
              <DialogCloseButton disabled={pending} />
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const normalizedUrl = url.trim();
                if (!normalizedUrl) return;
                onSave({
                  ...(initialValue?.source ? { source: initialValue.source } : {}),
                  ...(title.trim() ? { title: title.trim() } : {}),
                  url: normalizedUrl,
                });
              }}
            >
              <DialogBody className="grid gap-4">
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Title
                  <Input
                    disabled={pending}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    placeholder="Design brief"
                    value={title}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  URL
                  <Input
                    autoFocus
                    disabled={pending}
                    onChange={(event) => setUrl(event.currentTarget.value)}
                    placeholder="https://example.com/resource"
                    type="url"
                    value={url}
                  />
                </label>
              </DialogBody>
              <DialogFooter>
                <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
                  Cancel
                </Button>
                <Button disabled={!url.trim()} loading={pending} type="submit">
                  {initialValue ? "Save link" : "Add link"}
                </Button>
              </DialogFooter>
            </form>
          </DialogPanel>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
};

const relationshipTypes = ["depends_on", "blocks", "related"] as const;
const relationshipTypeItems = [
  { label: "Depends on", value: "depends_on" },
  { label: "Blocks", value: "blocks" },
  { label: "Related", value: "related" },
];

const ManageRelationshipsDialog = ({
  candidates,
  onAdd,
  onChange,
  onOpenChange,
  onRemove,
  open,
  pending,
  relations,
}: {
  readonly candidates: readonly { readonly id: string; readonly title: string }[];
  readonly onAdd: (relation: IssueRelation) => void;
  readonly onChange: (previous: IssueRelation, next: IssueRelation) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRemove: (relation: IssueRelation) => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly relations: readonly IssueRelation[];
}) => {
  const [targetId, setTargetId] = React.useState("");
  const [type, setType] = React.useState<IssueRelationType>("related");
  const existingIds = new Set(relations.map((relation) => relation.issueId));
  const candidateItems = candidates
    .filter((candidate) => !existingIds.has(candidate.id))
    .map((candidate) => ({ label: `${candidate.id} · ${candidate.title}`, value: candidate.id }));
  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate] as const));

  React.useEffect(() => {
    if (open) {
      setTargetId("");
      setType("related");
    }
  }, [open]);

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPanel width="lg">
            <DialogHeader>
              <div>
                <DialogTitle>Manage relationships</DialogTitle>
                <DialogDescription>
                  Add, remove, or change dependency and related-ticket links.
                </DialogDescription>
              </div>
              <DialogCloseButton disabled={pending} />
            </DialogHeader>
            <DialogBody className="grid gap-5">
              <div className="grid gap-2">
                {relations.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    No relationships yet.
                  </div>
                ) : (
                  relations.map((relation) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_180px_auto] items-end gap-2 rounded-md border border-border p-3"
                      key={`${relation.type}:${relation.issueId}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {candidateMap.get(relation.issueId)?.title ?? relation.issueId}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {relation.issueId}
                        </div>
                      </div>
                      <Select
                        disabled={pending}
                        items={relationshipTypeItems}
                        label="Relationship type"
                        onValueChange={(nextType) => {
                          if (nextType === null || nextType === relation.type) return;
                          onChange(relation, {
                            issueId: relation.issueId,
                            type: nextType as IssueRelationType,
                          });
                        }}
                        value={relation.type}
                      />
                      <Button
                        disabled={pending}
                        onClick={() => onRemove(relation)}
                        tone="danger"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
                <Select
                  disabled={pending || candidateItems.length === 0}
                  items={candidateItems}
                  label="Issue"
                  onValueChange={(value) => setTargetId(value ?? "")}
                  placeholder="Choose an issue"
                  value={targetId}
                />
                <Select
                  disabled={pending}
                  items={relationshipTypeItems}
                  label="Relationship type"
                  onValueChange={(value) => {
                    if (
                      value &&
                      relationshipTypes.includes(value as (typeof relationshipTypes)[number])
                    ) {
                      setType(value as IssueRelationType);
                    }
                  }}
                  value={type}
                />
                <Button
                  disabled={pending || !targetId}
                  onClick={() => {
                    onAdd({ issueId: targetId, type });
                    setTargetId("");
                  }}
                >
                  Add
                </Button>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
                Done
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
};

export const ViewIssuePanel = ({
  agentWork,
  agentProviders = [],
  issueId,
  onArchived,
  onChatOpen,
  onIssueSelect,
  repositories = [],
  repositoryId,
}: ViewIssuePanelProps) => {
  const issueQuery = useIssueDetailQuery(repositoryId, issueId);
  const issueHistoryQuery = useIssueHistoryQuery(repositoryId, issueId, {
    limit: issueHistoryPageLimit,
  });
  const issueListQuery = useIssueListQuery(repositoryId, { limit: 250 });
  const relationshipTicketQueries = useIssueRelationshipTicketQueries(
    repositoryId,
    issueQuery.data,
  );
  const recordsQuery = useIssueRecordsQuery(repositoryId, issueId);
  const usersQuery = useUserListQuery(repositoryId, {
    disabled: false,
  });
  const labelsQuery = useLabelListQuery(repositoryId, {
    archived: false,
  });
  const agentTasksQuery = useAgentTasksQuery({
    repositoryId,
    ticketId: issueId,
  });
  const currentAgentTaskId = latestAgentTask(agentTasksQuery.data ?? [])?.taskId;
  const agentTaskEventsQuery = useAgentTaskEventsQuery(currentAgentTaskId);
  const updateIssue = useUpdateIssueMutation({
    issueId,
    repositoryId,
  });
  const archiveIssue = useArchiveIssueMutation({
    issueId,
    onArchived,
    repositoryId,
  });
  const createSubIssue = useCreateIssueMutation({
    repositoryId,
  });
  const addComment = useAddIssueCommentMutation({
    issueId,
    repositoryId,
  });
  const commentActions = useIssueCommentActionsMutation({ issueId, repositoryId });
  const relationMutation = useIssueRelationMutation({ issueId, repositoryId });
  const startAgentTask = useStartIssueAgentTaskMutation({
    issueId,
    repositoryId,
  });
  const cancelAgentTask = useCancelAgentTaskMutation();
  const retryAgentTask = useRetryAgentTaskMutation();
  const appendAgentTaskInput = useAppendAgentTaskInputMutation();
  const notifications = useNotifications();
  const initiativeProgressQuery = useInitiativeProgressQuery(
    repositoryId,
    issueQuery.data?.type === "initiative" || issueQuery.data?.type === "epic"
      ? issueQuery.data.id
      : undefined,
  );
  const availableAgentProviders = React.useMemo(
    () => agentProviders.filter((provider) => provider.status === "available"),
    [agentProviders],
  );
  const repositoryAgentWork = repositories.find((repository) => repository.id === repositoryId)
    ?.preferences.agentWork;
  const defaultAgentProviderId =
    repositoryAgentWork?.providerId ??
    agentWork?.defaultProviderId ??
    availableAgentProviders[0]?.id ??
    "";
  const defaultAgentModel = repositoryAgentWork?.model ?? agentWork?.defaultModel ?? "";
  const agentWorkUnavailable =
    agentWork?.paused === true ||
    agentWork?.allowFullAccessJobs === false ||
    repositoryAgentWork?.paused === true ||
    repositoryAgentWork?.agentWorkDisabled === true;
  const [agentTaskDialogOpen, setAgentTaskDialogOpen] = React.useState(false);
  const [agentTaskAgentId, setAgentTaskAgentId] = React.useState<string>(defaultAgentProviderId);
  const [agentTaskProviderId, setAgentTaskProviderId] =
    React.useState<string>(defaultAgentProviderId);
  const [agentTaskModel, setAgentTaskModel] = React.useState("");
  const [agentTaskInstructions, setAgentTaskInstructions] = React.useState("");
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);
  const [labelsDialogOpen, setLabelsDialogOpen] = React.useState(false);
  const [relationshipsDialogOpen, setRelationshipsDialogOpen] = React.useState(false);
  const [linkEditor, setLinkEditor] = React.useState<"new" | number | null>(null);
  const [workflowPending, setWorkflowPending] = React.useState<TicketPromptWorkflowIntent>();

  React.useEffect(() => {
    if (!agentTaskDialogOpen || !defaultAgentProviderId) return;
    if (!agentTaskAgentId) setAgentTaskAgentId(defaultAgentProviderId);
    if (!agentTaskProviderId) setAgentTaskProviderId(defaultAgentProviderId);
  }, [agentTaskAgentId, agentTaskDialogOpen, agentTaskProviderId, defaultAgentProviderId]);

  const openAgentTaskDialog = () => {
    setAgentTaskProviderId(defaultAgentProviderId);
    setAgentTaskAgentId(defaultAgentProviderId);
    setAgentTaskModel(defaultAgentModel);
    setAgentTaskInstructions("");
    setAgentTaskDialogOpen(true);
  };

  const submitAgentTask = () => {
    const agentId = agentTaskAgentId.trim();
    const providerId = agentTaskProviderId.trim();
    if (!agentId || !providerId) return;

    startAgentTask.mutate(
      {
        authority: { mode: "full-access" },
        agentId,
        commandId: crypto.randomUUID(),
        instructions: agentTaskInstructions.trim() || undefined,
        model: agentTaskModel.trim() || undefined,
        providerId,
        requestedBy: "user",
      },
      {
        onSuccess: (task) => {
          setAgentTaskDialogOpen(false);
          onChatOpen?.(metadataString(task, "threadId"));
        },
      },
    );
  };

  if (!issueId || !repositoryId) {
    return renderPanelState("Choose an issue to view details.", "error");
  }

  if (issueQuery.isLoading) {
    return renderPanelState("Loading issue details.", "loading");
  }

  if (issueQuery.error instanceof Error) {
    return renderPanelState(issueQuery.error.message, "error");
  }

  const issue = issueQuery.data;

  if (!issue) {
    return renderPanelState("Issue was not found.", "error");
  }

  const relationshipTickets = relationshipTicketQueries.flatMap((query) =>
    query.data === null || query.data === undefined ? [] : [query.data],
  );
  const relationshipTicketsPending = relationshipTicketQueries.some((query) => query.isPending);

  const users = usersQuery.data?.entries ?? [];
  const labels = labelsQuery.data?.entries ?? [];
  const agentTasks = agentTasksQuery.data ?? [];
  const tagSuggestions = createMarkdownTagSuggestions({
    agentProviders,
    issues: issueListQuery.data?.entries,
    repositories,
    users,
  });
  const userMap = new Map(users.map((user) => [user.id, user] as const));
  const labelMap = new Map(labels.map((label) => [label.id, label] as const));
  const records = recordsQuery.data?.entries ?? [];
  const viewerActor = issue.frontmatter.createdBy;
  const comments = materializeIssueCommentRecords(records, viewerActor).map(
    (comment) =>
      ({
        archived: comment.archived,
        author: authorFromName(comment.createdBy.name),
        body: comment.body,
        id: comment.id,
        occurredAt: comment.createdAt,
        ...(comment.parentCommentId === undefined
          ? {}
          : { parentCommentId: comment.parentCommentId }),
        reactions: comment.reactions,
        timestamp: formatActivityTimestamp(comment.createdAt),
      }) satisfies ViewIssueComment,
  );
  const rawAssignee = issue.frontmatter.assignee?.trim() || "";
  const assigneeName = rawAssignee
    ? (userMap.get(rawAssignee)?.displayName ?? rawAssignee)
    : undefined;

  const updateTitle = (title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle === issue.frontmatter.title) return;

    updateIssue.mutate({
      frontmatter: {
        title: trimmedTitle,
      },
    });
  };

  const updateDescription = (description: string) => {
    if (description === issue.body) return;

    updateIssue.mutate({
      body: description,
    });
  };
  const updateFrontmatter = (frontmatter: Record<string, unknown>, message: string) => {
    updateIssue.mutate({
      frontmatter,
      message,
    });
  };
  const externalLinks = issue.frontmatter.externalLinks ?? [];
  const relationshipCandidates = (issueListQuery.data?.entries ?? [])
    .filter((candidate) => candidate.id !== issue.id)
    .map((candidate) => ({ id: candidate.id, title: candidate.title }));
  const copyIssueValue = (label: string, value: string) => {
    void navigator.clipboard.writeText(value).then(
      () =>
        notifications.notify({
          description: value,
          title: `${label} copied`,
          tone: "success",
        }),
      () =>
        notifications.notify({
          description: "Clipboard access was unavailable.",
          title: `Could not copy ${label.toLowerCase()}`,
          tone: "danger",
        }),
    );
  };
  const startTicketWorkflow = (intent: TicketPromptWorkflowIntent) => {
    if (workflowPending !== undefined) return;
    const repositoryName =
      repositories.find((repository) => repository.id === repositoryId)?.displayName ??
      repositoryId;
    setWorkflowPending(intent);
    void cycleApiClient
      .startTicketWorkflowChat({
        intent,
        issue,
        repositoryName,
      })
      .then(({ threadId }) => onChatOpen?.(threadId))
      .catch((error: unknown) => {
        notifications.notify({
          description:
            error instanceof Error ? error.message : "Cycle could not start the ticket workflow.",
          durationMs: 9000,
          title: "Ticket workflow failed",
          tone: "danger",
        });
      })
      .finally(() => setWorkflowPending(undefined));
  };
  const currentDueDate =
    typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : "";
  const currentEstimate =
    issue.frontmatter.estimate === null || issue.frontmatter.estimate === undefined
      ? ""
      : String(issue.frontmatter.estimate);
  const statusMenuOptions = statusOptions.map((status) => ({
    icon: <IssueStatusMark status={status} />,
    label: titleForValue(status),
    value: status,
  })) satisfies readonly IssuePropertyMenuOption[];
  const priorityMenuOptions = priorityOptions.map((priority) => ({
    icon: <IssuePriorityMark priority={priority} size="md" />,
    label: priorityLabel(priority),
    value: priority,
  })) satisfies readonly IssuePropertyMenuOption[];
  const assigneeMenuOptions = [
    {
      icon: <IssueAssigneeMark />,
      label: "No assignee",
      value: "none",
    },
    ...users.map((user) => ({
      icon: <IssueAssigneeMark name={user.displayName} />,
      label: user.displayName,
      rightMeta: user.email,
      value: user.id,
    })),
    ...(rawAssignee && !userMap.has(rawAssignee)
      ? [
          {
            icon: <IssueAssigneeMark name={rawAssignee} />,
            label: rawAssignee,
            value: rawAssignee,
          },
        ]
      : []),
  ] satisfies readonly IssuePropertyMenuOption[];
  const issueProperties = [
    {
      icon: (
        <IssuePropertyOptionMenu
          disabled={updateIssue.isPending}
          label="Change issue status"
          onChange={(status) => {
            if (status === issue.frontmatter.status) return;
            updateFrontmatter({ status }, `Updated ${issue.id} status to ${status}`);
          }}
          options={statusMenuOptions}
          trigger={<IssueStatusMark status={issue.frontmatter.status} />}
          value={issue.frontmatter.status}
        />
      ),
      id: "status",
      label: "Status",
      value: titleForValue(issue.frontmatter.status),
    },
    {
      icon: (
        <IssuePropertyOptionMenu
          disabled={updateIssue.isPending}
          label="Change issue priority"
          onChange={(priority) => {
            if (priority === issue.frontmatter.priority) return;
            updateFrontmatter({ priority }, `Updated ${issue.id} priority to ${priority}`);
          }}
          options={priorityMenuOptions}
          trigger={<IssuePriorityMark priority={issue.frontmatter.priority} size="md" />}
          value={issue.frontmatter.priority}
        />
      ),
      id: "priority",
      label: "Priority",
      value: priorityLabel(issue.frontmatter.priority),
    },
    {
      icon: (
        <IssuePropertyOptionMenu
          disabled={updateIssue.isPending}
          label="Change issue assignee"
          onChange={(assignee) => {
            const nextAssignee = assignee === "none" ? null : assignee;
            if ((issue.frontmatter.assignee ?? null) === nextAssignee) return;
            updateFrontmatter({ assignee: nextAssignee }, `Updated ${issue.id} assignee`);
          }}
          options={assigneeMenuOptions}
          trigger={<IssueAssigneeMark name={assigneeName} />}
          value={rawAssignee || "none"}
          widthClassName="w-[300px]"
        />
      ),
      id: "assignee",
      label: "Assignee",
      muted: !assigneeName,
      value: assigneeName ?? "No assignee",
    },
    {
      icon: (
        <IssueDueDateControl
          disabled={updateIssue.isPending}
          onChange={(dueDate) => {
            updateFrontmatter({ dueDate }, `Updated ${issue.id} due date`);
          }}
          value={currentDueDate}
        />
      ),
      id: "due-date",
      label: "Due date",
      muted: currentDueDate.length === 0,
      value:
        formatDate(currentDueDate) ?? (currentDueDate.length > 0 ? currentDueDate : "No due date"),
    },
    {
      icon: (
        <IssueEstimateControl
          disabled={updateIssue.isPending}
          onChange={(estimate) => {
            updateFrontmatter({ estimate }, `Updated ${issue.id} estimate`);
          }}
          value={currentEstimate}
        />
      ),
      id: "estimate",
      label: "Estimate",
      muted: currentEstimate.length === 0,
      value: currentEstimate.length > 0 ? currentEstimate : "None",
    },
    ...(issue.type === "initiative" || issue.type === "epic"
      ? [
          {
            icon: <BarChart3 aria-hidden className={propertyIconClassName} />,
            id: "progress",
            label: "Progress",
            value: initiativeProgressQuery.data
              ? `${initiativeProgressQuery.data.completedIssues}/${initiativeProgressQuery.data.issueTotal} issues`
              : "No child issues",
          },
        ]
      : []),
  ];

  return (
    <>
      <ViewIssue
        activityEvents={issueActivity(issue, issueHistoryQuery.data?.entries ?? [], records)}
        agentWork={
          <AgentTaskSidebar
            appendPending={appendAgentTaskInput.isPending}
            cancelPending={cancelAgentTask.isPending}
            events={agentTaskEventsQuery.data ?? []}
            eventsLoading={agentTaskEventsQuery.isLoading}
            onAppend={(taskId, input) => appendAgentTaskInput.mutate({ input, taskId })}
            tasks={agentTasks}
            onCancel={(taskId) => cancelAgentTask.mutate(taskId)}
            onOpenChat={(threadId) => onChatOpen?.(threadId)}
            onRetry={(taskId) => retryAgentTask.mutate(taskId)}
            providers={agentProviders}
            retryPending={retryAgentTask.isPending}
          />
        }
        assignee={
          assigneeName
            ? {
                initials: initialsForName(assigneeName),
                name: assigneeName,
              }
            : undefined
        }
        comments={comments}
        defaultDescription={issue.body}
        defaultTitle={issue.frontmatter.title}
        dependencyState={mapTicketDependencies(
          issue,
          [...(issueListQuery.data?.entries ?? []), ...relationshipTickets],
          { reportMissing: !relationshipTicketsPending },
        )}
        descriptionDefaultPreviewOpen
        dueDate={formatDate(
          typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : undefined,
        )}
        labels={(issue.frontmatter.labels ?? []).map((labelId) => ({
          colorClassName: labelColorClassName(labelMap.get(labelId)?.color),
          id: labelId,
          label: labelMap.get(labelId)?.name ?? labelId,
        }))}
        moreActions={[
          {
            disabled: workflowPending !== undefined,
            icon: <Sparkles aria-hidden className="size-4" />,
            id: "ticket.improve",
            label: "Improve with agent",
            onSelect: () => startTicketWorkflow("improve"),
          },
          {
            disabled: workflowPending !== undefined,
            icon: <GitBranch aria-hidden className="size-4" />,
            id: "ticket.split",
            label: "Split into tickets",
            onSelect: () => startTicketWorkflow("split"),
          },
          {
            disabled: workflowPending !== undefined,
            icon: <MessageSquarePlus aria-hidden className="size-4" />,
            id: "ticket.follow_up",
            label: "Create follow-up",
            onSelect: () => startTicketWorkflow("follow_up"),
          },
          {
            disabled: workflowPending !== undefined,
            icon: <ListChecks aria-hidden className="size-4" />,
            id: "ticket.plan",
            label: "Plan implementation",
            onSelect: () => startTicketWorkflow("plan"),
          },
          {
            icon: <Download aria-hidden className="size-4" />,
            id: "export-markdown",
            label: "Export as Markdown",
            onSelect: () => exportIssueMarkdown(issue),
          },
          {
            icon: <Copy aria-hidden className="size-4" />,
            id: "copy-id",
            label: "Copy issue ID",
            onSelect: () => copyIssueValue("Issue ID", issue.id),
          },
          {
            icon: <Copy aria-hidden className="size-4" />,
            id: "copy-link",
            label: "Copy Cycle link",
            onSelect: () =>
              copyIssueValue("Cycle link", `cycle://repository/${repositoryId}/issue/${issue.id}`),
          },
        ]}
        onAgentDelegate={agentWorkUnavailable ? undefined : openAgentTaskDialog}
        archiveDisabled={archiveIssue.isPending || Boolean(issue.archivedAt)}
        archivePending={archiveIssue.isPending}
        onCommentArchive={(commentId) => commentActions.mutate({ commentId, kind: "archive" })}
        onCommentCreate={(comment) => addComment.mutate(comment)}
        onCommentEdit={(commentId, body) =>
          commentActions.mutate({ body, commentId, kind: "edit" })
        }
        onCommentReactionToggle={(commentId, emoji, active) =>
          commentActions.mutate({ active, commentId, emoji, kind: "reaction" })
        }
        onCommentReply={(parentCommentId, body) => addComment.mutate({ body, parentCommentId })}
        onCopyIssueId={() => copyIssueValue("Issue ID", issue.id)}
        onCopyIssueLink={() =>
          copyIssueValue("Cycle link", `cycle://repository/${repositoryId}/issue/${issue.id}`)
        }
        onDescriptionSave={updateDescription}
        onArchive={() => setArchiveDialogOpen(true)}
        onFilesSelect={(files) => {
          console.info(
            "Selected issue attachment files",
            [...files].map((file) => file.name),
          );
        }}
        onLabelsEdit={() => setLabelsDialogOpen(true)}
        onIssueReferenceClick={onIssueSelect}
        onRelationshipsEdit={() => setRelationshipsDialogOpen(true)}
        onResourceAdd={() => setLinkEditor("new")}
        onResourceEdit={(resourceId) => setLinkEditor(Number(resourceId))}
        onResourceRemove={(resourceId) => {
          const index = Number(resourceId);
          const nextLinks = externalLinks.filter((_, linkIndex) => linkIndex !== index);
          updateFrontmatter(
            { externalLinks: nextLinks },
            `Removed an external link from ${issue.id}`,
          );
        }}
        onSubIssueCreate={(draft) => {
          const input = {
            body: draft.description,
            parent: issue.id,
            priority: draft.priority ?? undefined,
            status: draft.status ?? undefined,
            title: draft.title,
            type: "task",
          } satisfies Omit<CreateTicketInput, "repository">;

          createSubIssue.mutate(input);
        }}
        onTitleSave={updateTitle}
        priority={issue.frontmatter.priority}
        properties={issueProperties}
        resources={issueResources(issue)}
        status={issue.frontmatter.status}
        subIssues={mapTicketSubIssues(issue, issueListQuery.data?.entries ?? [])}
        tagSuggestions={tagSuggestions}
        title={issue.frontmatter.title}
        viewer={{
          initials: initialsForName(issue.frontmatter.createdBy.name),
          name: issue.frontmatter.createdBy.name,
        }}
      />
      <StartAgentTaskDialog
        agentId={agentTaskAgentId}
        error={startAgentTask.error instanceof Error ? startAgentTask.error.message : undefined}
        instructions={agentTaskInstructions}
        model={agentTaskModel}
        onAgentIdChange={setAgentTaskAgentId}
        onInstructionsChange={setAgentTaskInstructions}
        onModelChange={setAgentTaskModel}
        onOpenChange={setAgentTaskDialogOpen}
        onProviderIdChange={setAgentTaskProviderId}
        onSubmit={submitAgentTask}
        open={agentTaskDialogOpen}
        pending={startAgentTask.isPending}
        providerId={agentTaskProviderId}
        providers={agentProviders}
      />
      <ArchiveIssueDialog
        issueId={issue.id}
        issueTitle={issue.frontmatter.title}
        onConfirm={() => archiveIssue.mutate()}
        onOpenChange={setArchiveDialogOpen}
        open={archiveDialogOpen}
        pending={archiveIssue.isPending}
      />
      <ManageLabelsDialog
        availableLabels={labels.map((label) => ({ id: label.id, name: label.name }))}
        onOpenChange={setLabelsDialogOpen}
        onSave={(nextLabels) => {
          updateIssue.mutate(
            {
              frontmatter: { labels: nextLabels },
              message: `Updated ${issue.id} labels`,
            },
            { onSuccess: () => setLabelsDialogOpen(false) },
          );
        }}
        open={labelsDialogOpen}
        pending={updateIssue.isPending}
        value={issue.frontmatter.labels ?? []}
      />
      <ExternalLinkDialog
        initialValue={typeof linkEditor === "number" ? externalLinks[linkEditor] : undefined}
        onOpenChange={(open) => {
          if (!open) setLinkEditor(null);
        }}
        onSave={(link) => {
          const nextLinks =
            typeof linkEditor === "number"
              ? externalLinks.map((current, index) => (index === linkEditor ? link : current))
              : [...externalLinks, link];
          updateIssue.mutate(
            {
              frontmatter: { externalLinks: nextLinks },
              message: `${typeof linkEditor === "number" ? "Updated" : "Added"} an external link on ${issue.id}`,
            },
            { onSuccess: () => setLinkEditor(null) },
          );
        }}
        open={linkEditor !== null}
        pending={updateIssue.isPending}
      />
      <ManageRelationshipsDialog
        candidates={relationshipCandidates}
        onAdd={(relation) => relationMutation.mutate({ kind: "add", relation })}
        onChange={(previous, next) => relationMutation.mutate({ kind: "replace", next, previous })}
        onOpenChange={setRelationshipsDialogOpen}
        onRemove={(relation) => relationMutation.mutate({ kind: "remove", relation })}
        open={relationshipsDialogOpen}
        pending={relationMutation.isPending}
        relations={issue.frontmatter.relations ?? []}
      />
    </>
  );
};
