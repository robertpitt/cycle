import { ViewIssue, type ViewIssueActivityEvent, type ViewIssueComment } from "@cycle/ui/organisms";
import { cn } from "@cycle/ui/utils";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleOff,
  Gauge,
  LoaderCircle,
  UserRound,
} from "lucide-react";
import * as React from "react";
import type {
  CreateTicketInput,
  HistoryCommit,
  LinkedRecord,
  TicketDocument,
} from "@cycle/contracts";
import {
  useAddIssueCommentMutation,
  useCreateIssueMutation,
  useUpdateIssueMutation,
} from "../mutations/index.ts";
import {
  useInitiativeProgressQuery,
  useIssueDetailQuery,
  useIssueHistoryQuery,
  useIssueListQuery,
  useIssueRecordsQuery,
  useLabelListQuery,
  useUserListQuery,
} from "../queries/index.ts";
import { createMarkdownTagSuggestions } from "../lib/markdownTagSuggestions.ts";
import { labelColorClassName } from "../screens/workspace/createIssueOptions.tsx";
import type { RepositoryRecord } from "../../shared/AppConfig.ts";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";

type ViewIssuePanelProps = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly issueId?: string;
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

const formatDate = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const formatActivityTimestamp = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getCommentBody = (record: LinkedRecord): string => {
  if (
    record.payload !== null &&
    typeof record.payload === "object" &&
    "body" in record.payload &&
    typeof record.payload.body === "string"
  ) {
    return record.payload.body;
  }

  return "";
};

const authorFromName = (name: string) => ({
  initials: initialsForName(name),
  name,
});

const commentFromRecord = (record: LinkedRecord): ViewIssueComment => ({
  author: authorFromName(record.createdBy.name),
  body: getCommentBody(record),
  id: record.id,
  occurredAt: record.createdAt,
  timestamp: formatActivityTimestamp(record.createdAt),
});

const externalLinkTitle = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const issueResources = (issue: TicketDocument) =>
  (issue.frontmatter.externalLinks ?? []).map((link) => ({
    description: link.url,
    id: link.url,
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

  return historyEntries.some(isCreatedHistoryEntry)
    ? historyEvents
    : [issueCreatedActivity(issue), ...historyEvents];
};

const issueHistoryPageLimit = 100;

const renderPanelState = (message: string, icon: "error" | "loading") => (
  <div className="grid min-h-full place-items-center p-8">
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground shadow-card">
      {icon === "loading" ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
      ) : (
        <AlertTriangle aria-hidden className="size-4 text-warning" />
      )}
      {message}
    </div>
  </div>
);

const propertyIconClassName = "size-4 text-muted-foreground";
const propertyMenuIconClassName = "size-4";
const propertyTriggerClassName =
  "grid size-6 place-items-center rounded-md text-muted-foreground transition hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45";
const propertyPanelClassName =
  "absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated";
const propertyInputClassName =
  "h-9 min-w-0 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover";

const priorityOptions = ["none", "urgent", "high", "medium", "low"] as const;
const statusOptions = ["backlog", "todo", "in-progress", "done", "canceled"] as const;

type PropertyMenuOption = {
  readonly icon?: React.ReactNode;
  readonly label: React.ReactNode;
  readonly rightMeta?: React.ReactNode;
  readonly value: string;
};

const titleForValue = (value: string): string =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const priorityLabel = (priority: string): string =>
  priority === "none" ? "No priority" : titleForValue(priority);

const useOutsideClose = ({
  onClose,
  open,
  ref,
}: {
  readonly onClose: () => void;
  readonly open: boolean;
  readonly ref: React.RefObject<HTMLElement | null>;
}) => {
  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, ref]);
};

const StatusIcon = ({ status }: { readonly status: string }) => {
  if (status === "done" || status === "closed") {
    return <CircleCheck aria-hidden className={propertyMenuIconClassName} />;
  }

  if (status === "backlog") {
    return <CircleDashed aria-hidden className={propertyMenuIconClassName} />;
  }

  if (status === "canceled") {
    return <CircleOff aria-hidden className={propertyMenuIconClassName} />;
  }

  return <Circle aria-hidden className={propertyMenuIconClassName} />;
};

const PriorityBars = ({ priority }: { readonly priority: string }) => {
  const level = priority === "high" ? 3 : priority === "medium" ? 2 : 1;

  if (priority === "none") {
    return <span className="text-xs font-semibold leading-none text-muted-foreground">--</span>;
  }

  if (priority === "urgent") {
    return (
      <span className="grid size-5 place-items-center rounded-sm bg-muted-foreground text-xs font-bold leading-none text-background">
        !
      </span>
    );
  }

  return (
    <span aria-hidden className="flex h-5 items-end gap-0.5 text-muted-foreground">
      {[1, 2, 3].map((bar) => (
        <span
          className="w-1.5 rounded-sm bg-current data-[muted=true]:opacity-35"
          data-muted={bar > level}
          key={bar}
          style={{
            height: `${bar * 5 + 4}px`,
          }}
        />
      ))}
    </span>
  );
};

const AssigneeMark = ({ name }: { readonly name?: string }) => {
  if (!name) return <UserRound aria-hidden className={propertyMenuIconClassName} />;

  return (
    <span className="grid size-5 place-items-center rounded-full bg-subtle text-[10px] font-semibold text-muted-foreground">
      {initialsForName(name)}
    </span>
  );
};

const IssuePropertyOptionMenu = ({
  children,
  disabled = false,
  label,
  onChange,
  options,
  value,
  widthClassName = "w-[260px]",
}: {
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly PropertyMenuOption[];
  readonly value: string;
  readonly widthClassName?: string;
}) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);

  useOutsideClose({
    onClose: close,
    open,
    ref,
  });

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={cn(propertyTriggerClassName, open && "bg-subtle text-foreground shadow-sm")}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={label}
        type="button"
      >
        {children}
      </button>
      {open ? (
        <div
          className={cn(propertyPanelClassName, "max-h-72 overflow-y-auto p-2", widthClassName)}
          role="menu"
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                aria-checked={selected}
                className={cn(
                  "grid min-h-10 w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 text-left text-sm text-foreground transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                  selected && "bg-subtle",
                )}
                key={option.value}
                onClick={() => {
                  if (!selected) onChange(option.value);
                  close();
                }}
                role="menuitemradio"
                type="button"
              >
                <span className="grid size-6 place-items-center text-muted-foreground">
                  {option.icon}
                </span>
                <span className="min-w-0 truncate font-medium">{option.label}</span>
                <span className="grid size-4 place-items-center text-muted-foreground">
                  {selected ? <Check aria-hidden className="size-4" /> : null}
                </span>
                {option.rightMeta ? (
                  <span className="min-w-5 text-right text-xs font-medium text-muted-foreground">
                    {option.rightMeta}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const IssuePropertyPopover = ({
  children,
  disabled = false,
  label,
  onOpenChange,
  trigger,
  widthClassName = "w-[260px]",
}: {
  readonly children: (close: () => void) => React.ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly trigger: React.ReactNode;
  readonly widthClassName?: string;
}) => {
  const [open, setOpenState] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setOpenState(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );
  const close = React.useCallback(() => setOpen(false), [setOpen]);

  useOutsideClose({
    onClose: close,
    open,
    ref,
  });

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={cn(propertyTriggerClassName, open && "bg-subtle text-foreground shadow-sm")}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        title={label}
        type="button"
      >
        {trigger}
      </button>
      {open ? (
        <div className={cn(propertyPanelClassName, "p-3", widthClassName)} role="dialog">
          {children(close)}
        </div>
      ) : null}
    </div>
  );
};

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
            <input
              aria-label="Issue due date"
              className={propertyInputClassName}
              onChange={(event) => setDraft(event.currentTarget.value)}
              type="date"
              value={draft}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <button
              className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
              onClick={() => {
                if (value.length > 0) onChange(null);
                close();
              }}
              type="button"
            >
              Clear
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
              type="submit"
            >
              Apply
            </button>
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
            <input
              aria-label="Issue estimate"
              className={propertyInputClassName}
              inputMode="decimal"
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder="None"
              value={draft}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <button
              className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
              onClick={() => {
                if (value.length > 0) onChange(null);
                close();
              }}
              type="button"
            >
              Clear
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
              type="submit"
            >
              Apply
            </button>
          </div>
        </form>
      )}
    </IssuePropertyPopover>
  );
};

export const ViewIssuePanel = ({
  agentProviders = [],
  issueId,
  repositories = [],
  repositoryId,
}: ViewIssuePanelProps) => {
  const issueQuery = useIssueDetailQuery(repositoryId, issueId);
  const issueHistoryQuery = useIssueHistoryQuery(repositoryId, issueId, {
    limit: issueHistoryPageLimit,
  });
  const issueListQuery = useIssueListQuery(repositoryId);
  const recordsQuery = useIssueRecordsQuery(repositoryId, issueId);
  const usersQuery = useUserListQuery(repositoryId, {
    disabled: false,
  });
  const labelsQuery = useLabelListQuery(repositoryId, {
    archived: false,
  });
  const updateIssue = useUpdateIssueMutation({
    issueId,
    repositoryId,
  });
  const createSubIssue = useCreateIssueMutation({
    repositoryId,
  });
  const addComment = useAddIssueCommentMutation({
    issueId,
    repositoryId,
  });
  const initiativeProgressQuery = useInitiativeProgressQuery(
    repositoryId,
    issueQuery.data?.type === "initiative" ? issueQuery.data.id : undefined,
  );

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

  const users = usersQuery.data?.entries ?? [];
  const labels = labelsQuery.data?.entries ?? [];
  const tagSuggestions = createMarkdownTagSuggestions({
    agentProviders,
    issues: issueListQuery.data?.entries,
    repositories,
    users,
  });
  const userMap = new Map(users.map((user) => [user.id, user] as const));
  const labelMap = new Map(labels.map((label) => [label.id, label] as const));
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
  const currentDueDate =
    typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : "";
  const currentEstimate =
    issue.frontmatter.estimate === null || issue.frontmatter.estimate === undefined
      ? ""
      : String(issue.frontmatter.estimate);
  const statusMenuOptions = statusOptions.map((status) => ({
    icon: <StatusIcon status={status} />,
    label: titleForValue(status),
    value: status,
  }));
  const priorityMenuOptions = priorityOptions.map((priority) => ({
    icon: <PriorityBars priority={priority} />,
    label: priorityLabel(priority),
    value: priority,
  }));
  const assigneeMenuOptions = [
    {
      icon: <AssigneeMark />,
      label: "No assignee",
      value: "none",
    },
    ...users.map((user) => ({
      icon: <AssigneeMark name={user.displayName} />,
      label: user.displayName,
      rightMeta: user.email,
      value: user.id,
    })),
    ...(rawAssignee && !userMap.has(rawAssignee)
      ? [
          {
            icon: <AssigneeMark name={rawAssignee} />,
            label: rawAssignee,
            value: rawAssignee,
          },
        ]
      : []),
  ];
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
          value={issue.frontmatter.status}
        >
          <StatusIcon status={issue.frontmatter.status} />
        </IssuePropertyOptionMenu>
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
          value={issue.frontmatter.priority}
        >
          <PriorityBars priority={issue.frontmatter.priority} />
        </IssuePropertyOptionMenu>
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
          value={rawAssignee || "none"}
          widthClassName="w-[300px]"
        >
          <AssigneeMark name={assigneeName} />
        </IssuePropertyOptionMenu>
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
    ...(issue.type === "initiative"
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
    <ViewIssue
      activityEvents={issueActivity(issue, issueHistoryQuery.data?.entries ?? [])}
      assignee={
        assigneeName
          ? {
              initials: initialsForName(assigneeName),
              name: assigneeName,
            }
          : undefined
      }
      comments={(recordsQuery.data?.entries ?? []).map(commentFromRecord)}
      defaultDescription={issue.body}
      defaultTitle={issue.frontmatter.title}
      descriptionDefaultPreviewOpen
      dueDate={formatDate(
        typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : undefined,
      )}
      labels={(issue.frontmatter.labels ?? []).map((labelId) => ({
        colorClassName: labelColorClassName(labelMap.get(labelId)?.color),
        id: labelId,
        label: labelMap.get(labelId)?.name ?? labelId,
      }))}
      onCommentCreate={(comment) => addComment.mutate(comment)}
      onDescriptionSave={updateDescription}
      onFilesSelect={(files) => {
        console.info(
          "Selected issue attachment files",
          [...files].map((file) => file.name),
        );
      }}
      onSubIssueCreate={(draft) => {
        const input = {
          body: draft.description,
          parent: issue.id,
          priority: draft.priority ?? undefined,
          status: draft.status ?? undefined,
          title: draft.title,
          type: "issue",
        } satisfies Omit<CreateTicketInput, "repository">;

        createSubIssue.mutate(input);
      }}
      onTitleSave={updateTitle}
      priority={issue.frontmatter.priority}
      properties={issueProperties}
      resources={issueResources(issue)}
      status={issue.frontmatter.status}
      tagSuggestions={tagSuggestions}
      title={issue.frontmatter.title}
      viewer={{
        initials: initialsForName(issue.frontmatter.createdBy.name),
        name: issue.frontmatter.createdBy.name,
      }}
    />
  );
};
