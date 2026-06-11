import { ViewIssue, type ViewIssueComment } from "@cycle/ui/organisms";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { CreateTicketInput, LinkedRecord, TicketDocument } from "@cycle/database";
import {
  useAddIssueCommentMutation,
  useCreateIssueMutation,
  useUpdateIssueMutation,
} from "../mutations/index.ts";
import { useIssueDetailQuery, useIssueRecordsQuery } from "../queries/index.ts";

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

const commentFromRecord = (record: LinkedRecord): ViewIssueComment => ({
  author: {
    initials: initialsForName(record.createdBy.name),
    name: record.createdBy.name,
  },
  body: getCommentBody(record),
  id: record.id,
  timestamp: "just now",
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

const issueLabels = (issue: TicketDocument) =>
  (issue.frontmatter.labels ?? []).map((label) => ({
    id: label,
    label,
  }));

const issueActivity = (issue: TicketDocument) => [
  {
    author: {
      initials: initialsForName(issue.frontmatter.createdBy.name),
      name: issue.frontmatter.createdBy.name,
    },
    body: "created the issue",
    id: `${issue.id}:created`,
    timestamp: formatDate(issue.frontmatter.createdAt),
  },
];

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

export const ViewIssuePanel = ({ issueId, repositoryId }: ViewIssuePanelProps) => {
  const issueQuery = useIssueDetailQuery(repositoryId, issueId);
  const recordsQuery = useIssueRecordsQuery(repositoryId, issueId);
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

  return (
    <ViewIssue
      activityEvents={issueActivity(issue)}
      assignee={
        issue.frontmatter.assignee
          ? {
              initials: initialsForName(issue.frontmatter.assignee),
              name: issue.frontmatter.assignee,
            }
          : undefined
      }
      comments={(recordsQuery.data ?? []).map(commentFromRecord)}
      defaultDescription={issue.body}
      defaultTitle={issue.frontmatter.title}
      dueDate={formatDate(
        typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : undefined,
      )}
      labels={issueLabels(issue)}
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
