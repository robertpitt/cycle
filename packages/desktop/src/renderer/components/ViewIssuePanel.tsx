import {
  ViewIssue,
  type ViewIssueActivityEvent,
  type ViewIssueComment,
} from "@cycle/ui/organisms";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Circle,
  Gauge,
  LoaderCircle,
  UserRound,
} from "lucide-react";
import type {
  CreateTicketInput,
  HistoryCommit,
  LinkedRecord,
  TicketDocument,
} from "@cycle/database";
import {
  useAddIssueCommentMutation,
  useCreateIssueMutation,
  useUpdateIssueMutation,
} from "../mutations/index.ts";
import {
  useInitiativeProgressQuery,
  useIssueDetailQuery,
  useIssueHistoryQuery,
  useIssueRecordsQuery,
  useLabelListQuery,
  useUserListQuery,
} from "../queries/index.ts";
import { labelColorClassName } from "../screens/workspace/createIssueOptions.tsx";

type ViewIssuePanelProps = {
  readonly issueId?: string;
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
      const authorName =
        entry.authorName ?? entry.authorEmail ?? issue.frontmatter.createdBy.name;

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

const metadataControlClassName =
  "h-7 min-w-0 rounded-md border border-border bg-popover px-2 text-sm font-medium text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const priorityOptions = ["none", "urgent", "high", "medium", "low"] as const;
const statusOptions = ["backlog", "todo", "in-progress", "done", "canceled"] as const;

export const ViewIssuePanel = ({ issueId, repositoryId }: ViewIssuePanelProps) => {
  const issueQuery = useIssueDetailQuery(repositoryId, issueId);
  const issueHistoryQuery = useIssueHistoryQuery(repositoryId, issueId, {
    limit: issueHistoryPageLimit,
  });
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
  const propertySelect = ({
    label,
    onChange,
    options,
    value,
  }: {
    readonly label: string;
    readonly onChange: (value: string) => void;
    readonly options: readonly { readonly label: string; readonly value: string }[];
    readonly value: string;
  }) => (
    <select
      aria-label={label}
      className={metadataControlClassName}
      disabled={updateIssue.isPending}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  const currentDueDate =
    typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : "";
  const currentEstimate =
    issue.frontmatter.estimate === null || issue.frontmatter.estimate === undefined
      ? ""
      : String(issue.frontmatter.estimate);
  const issueProperties = [
    {
      icon: <Circle aria-hidden className={propertyIconClassName} />,
      id: "status",
      label: "Status",
      value: propertySelect({
        label: "Issue status",
        onChange: (status) => {
          if (status === issue.frontmatter.status) return;
          updateFrontmatter({ status }, `Updated ${issue.id} status to ${status}`);
        },
        options: statusOptions.map((status) => ({
          label: status
            .split("-")
            .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
            .join(" "),
          value: status,
        })),
        value: issue.frontmatter.status,
      }),
    },
    {
      icon: <BarChart3 aria-hidden className={propertyIconClassName} />,
      id: "priority",
      label: "Priority",
      value: propertySelect({
        label: "Issue priority",
        onChange: (priority) => {
          if (priority === issue.frontmatter.priority) return;
          updateFrontmatter({ priority }, `Updated ${issue.id} priority to ${priority}`);
        },
        options: priorityOptions.map((priority) => ({
          label:
            priority === "none"
              ? "No priority"
              : `${priority[0]?.toUpperCase() ?? ""}${priority.slice(1)}`,
          value: priority,
        })),
        value: issue.frontmatter.priority,
      }),
    },
    {
      icon: <UserRound aria-hidden className={propertyIconClassName} />,
      id: "assignee",
      label: "Assignee",
      value: propertySelect({
        label: "Issue assignee",
        onChange: (assignee) => {
          const nextAssignee = assignee === "none" ? null : assignee;
          if ((issue.frontmatter.assignee ?? null) === nextAssignee) return;
          updateFrontmatter({ assignee: nextAssignee }, `Updated ${issue.id} assignee`);
        },
        options: [
          {
            label: "No assignee",
            value: "none",
          },
          ...users.map((user) => ({
            label: user.displayName,
            value: user.id,
          })),
          ...(rawAssignee && !userMap.has(rawAssignee)
            ? [
                {
                  label: rawAssignee,
                  value: rawAssignee,
                },
              ]
            : []),
        ],
        value: rawAssignee || "none",
      }),
    },
    {
      icon: <CalendarDays aria-hidden className={propertyIconClassName} />,
      id: "due-date",
      label: "Due date",
      muted: currentDueDate.length === 0,
      value: (
        <input
          aria-label="Issue due date"
          className={metadataControlClassName}
          defaultValue={currentDueDate}
          disabled={updateIssue.isPending}
          onBlur={(event) => {
            const nextDueDate = event.currentTarget.value.trim();
            if (nextDueDate === currentDueDate) return;
            updateFrontmatter(
              { dueDate: nextDueDate.length > 0 ? nextDueDate : null },
              `Updated ${issue.id} due date`,
            );
          }}
          type="date"
        />
      ),
    },
    {
      icon: <Gauge aria-hidden className={propertyIconClassName} />,
      id: "estimate",
      label: "Estimate",
      muted: currentEstimate.length === 0,
      value: (
        <input
          aria-label="Issue estimate"
          className={metadataControlClassName}
          defaultValue={currentEstimate}
          disabled={updateIssue.isPending}
          inputMode="decimal"
          onBlur={(event) => {
            const nextEstimate = event.currentTarget.value.trim();
            if (nextEstimate === currentEstimate) return;
            updateFrontmatter(
              { estimate: nextEstimate.length > 0 ? nextEstimate : null },
              `Updated ${issue.id} estimate`,
            );
          }}
          placeholder="None"
        />
      ),
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
      comments={(recordsQuery.data ?? []).map(commentFromRecord)}
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
      title={issue.frontmatter.title}
      viewer={{
        initials: initialsForName(issue.frontmatter.createdBy.name),
        name: issue.frontmatter.createdBy.name,
      }}
    />
  );
};
