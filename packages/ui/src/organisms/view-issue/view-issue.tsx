import {
  Archive as ArchiveIcon,
  BarChart3,
  Box,
  CalendarX2,
  ChevronDown,
  Circle,
  Copy,
  GitBranch,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Reply,
  SendHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../atoms/avatar/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import type { MarkdownReferenceHandlers } from "../../molecules/markdown-renderer/index.ts";
import { cn } from "../../lib/cn.ts";
import { typography } from "../../lib/styles.ts";
import { EditableText } from "../../molecules/editable-text/index.ts";
import {
  IssueActivityEvent,
  IssueCommentCard,
  IssueCommentComposer,
  type IssueAuthor,
} from "../../molecules/issue-comment/index.ts";
import {
  IssueEditor,
  type IssueEditorCommand,
  type IssueEditorFormatAction,
  type IssueEditorTagSuggestion,
} from "../../molecules/issue-editor/index.ts";
import { IssueResourceLink } from "../../molecules/issue-resource-link/index.ts";
import { IssueSidebarSection } from "../../molecules/issue-sidebar-section/index.ts";
import { IssuePropertyOptionMenu } from "../../molecules/issue-property-control/index.ts";
import {
  IssueSubIssueComposer,
  type IssueSubIssueDraft,
} from "../../molecules/issue-sub-issue-composer/index.ts";

export type ViewIssueProperty = {
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly label: React.ReactNode;
  readonly muted?: boolean;
  readonly value: React.ReactNode;
};

export type ViewIssueLabel = {
  readonly colorClassName?: string;
  readonly id: string;
  readonly label: React.ReactNode;
};

export type ViewIssueResource = {
  readonly description?: React.ReactNode;
  readonly favicon?: React.ReactNode;
  readonly href?: string;
  readonly id: string;
  readonly meta?: React.ReactNode;
  readonly title: React.ReactNode;
};

export type ViewIssueAction = {
  readonly disabled?: boolean;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
};

export type ViewIssueActivityEvent = {
  readonly author: IssueAuthor;
  readonly body: React.ReactNode;
  readonly id: string;
  readonly occurredAt?: Date | number | string;
  readonly timestamp?: React.ReactNode;
};

export type ViewIssueComment = {
  readonly author: IssueAuthor;
  readonly archived?: boolean;
  readonly body: string;
  readonly id: string;
  readonly occurredAt?: Date | number | string;
  readonly parentCommentId?: string;
  readonly reactions?: readonly {
    readonly active: boolean;
    readonly count: number;
    readonly emoji: string;
  }[];
  readonly timestamp?: React.ReactNode;
};

export type ViewIssueDependencyTicket = {
  readonly id: string;
  readonly status: string;
  readonly title: string;
};

export type ViewIssueDependencyState = {
  readonly blocked: boolean;
  readonly blockingTickets: readonly ViewIssueDependencyTicket[];
  readonly dependencyTickets: readonly ViewIssueDependencyTicket[];
  readonly downstreamBlockedTickets: readonly ViewIssueDependencyTicket[];
  readonly downstreamTickets: readonly ViewIssueDependencyTicket[];
  readonly relatedTickets: readonly ViewIssueDependencyTicket[];
  readonly warnings: readonly string[];
};

export type ViewIssueProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> &
  MarkdownReferenceHandlers & {
    readonly activityEvents?: readonly ViewIssueActivityEvent[];
    readonly agentWork?: React.ReactNode;
    readonly archiveDisabled?: boolean;
    readonly archiveLabel?: string;
    readonly archivePending?: boolean;
    readonly assignee?: IssueAuthor;
    readonly comments?: readonly ViewIssueComment[];
    readonly defaultDescription?: string;
    readonly descriptionDefaultPreviewOpen?: boolean;
    readonly defaultSubIssueComposerOpen?: boolean;
    readonly defaultTitle?: string;
    readonly description?: string;
    readonly descriptionSlashMenuOpen?: boolean;
    readonly descriptionToolbarOpen?: boolean;
    readonly dependencyState?: ViewIssueDependencyState;
    readonly dueDate?: React.ReactNode;
    readonly labels?: readonly ViewIssueLabel[];
    readonly moreActions?: readonly ViewIssueAction[];
    readonly onCommentCreate?: (comment: string) => void;
    readonly onCommentArchive?: (commentId: string) => void;
    readonly onCommentEdit?: (commentId: string, body: string) => void;
    readonly onCommentReactionToggle?: (commentId: string, emoji: string, active: boolean) => void;
    readonly onCommentReply?: (commentId: string, body: string) => void;
    readonly onArchive?: () => void;
    readonly onDescriptionSave?: (description: string) => void;
    readonly onEditorCommandSelect?: (command: IssueEditorCommand) => void;
    readonly onEditorFormatSelect?: (action: IssueEditorFormatAction) => void;
    readonly onFilesSelect?: (files: FileList) => void;
    readonly onLabelsEdit?: () => void;
    readonly onAgentDelegate?: () => void;
    readonly onSubIssueCreate?: (draft: IssueSubIssueDraft) => void;
    readonly onRelationshipsEdit?: () => void;
    readonly onResourceAdd?: () => void;
    readonly onResourceEdit?: (resourceId: string) => void;
    readonly onResourceRemove?: (resourceId: string) => void;
    readonly onTagQueryChange?: (query: string) => void;
    readonly onTagSelect?: (suggestion: IssueEditorTagSuggestion) => void;
    readonly onTitleSave?: (title: string) => void;
    readonly labelsDefaultOpen?: boolean;
    readonly priority?: React.ReactNode;
    readonly project?: React.ReactNode;
    readonly projectDefaultOpen?: boolean;
    readonly properties?: readonly ViewIssueProperty[];
    readonly propertiesDefaultOpen?: boolean;
    readonly resources?: readonly ViewIssueResource[];
    readonly status?: React.ReactNode;
    readonly subIssues?: readonly ViewIssueDependencyTicket[];
    readonly tagSuggestions?: readonly IssueEditorTagSuggestion[];
    readonly title?: string;
    readonly viewer?: IssueAuthor;
  };

const RelationshipTicketRow = ({
  blocking = false,
  onSelect,
  ticket,
}: {
  readonly blocking?: boolean;
  readonly onSelect?: (issueId: string) => void;
  readonly ticket: ViewIssueDependencyTicket;
}) => (
  <button
    className={cn(
      "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
      blocking
        ? "border-warning/30 bg-warning/8 hover:bg-warning/12"
        : "border-border bg-subtle hover:bg-muted",
      onSelect === undefined && "cursor-default",
    )}
    disabled={onSelect === undefined}
    onClick={() => onSelect?.(ticket.id)}
    type="button"
  >
    <span className="font-mono text-xs font-medium text-muted-foreground">{ticket.id}</span>
    <span className="truncate text-sm font-medium text-foreground">{ticket.title}</span>
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        blocking ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      {ticket.status}
    </span>
  </button>
);

const RelationshipTicketGroup = ({
  blockingIds = new Set<string>(),
  label,
  onSelect,
  tickets,
}: {
  readonly blockingIds?: ReadonlySet<string>;
  readonly label: string;
  readonly onSelect?: (issueId: string) => void;
  readonly tickets: readonly ViewIssueDependencyTicket[];
}) =>
  tickets.length === 0 ? null : (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">{label}</h3>
      {tickets.map((ticket) => (
        <RelationshipTicketRow
          blocking={blockingIds.has(ticket.id)}
          key={ticket.id}
          onSelect={onSelect}
          ticket={ticket}
        />
      ))}
    </div>
  );

const commentReactionOptions = ["👍", "❤️", "🎉", "👀"] as const;

const CommentTimelineCard = ({
  comment,
  onArchive,
  onEdit,
  onReactionToggle,
  onReply,
  referenceHandlers,
}: {
  readonly comment: ViewIssueComment;
  readonly onArchive?: (commentId: string) => void;
  readonly onEdit?: (commentId: string, body: string) => void;
  readonly onReactionToggle?: (commentId: string, emoji: string, active: boolean) => void;
  readonly onReply?: (commentId: string, body: string) => void;
  readonly referenceHandlers: MarkdownReferenceHandlers;
}) => {
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const reactions = new Map(
    (comment.reactions ?? []).map((reaction) => [reaction.emoji, reaction]),
  );

  return (
    <div
      className={cn(
        "grid gap-3",
        comment.parentCommentId && "ml-10 border-l border-border pl-4 max-sm:ml-4",
      )}
    >
      <IssueCommentCard
        {...referenceHandlers}
        actions={
          comment.archived ? undefined : (
            <span className="flex items-center gap-1">
              {onReply ? (
                <IconButton
                  icon={<Reply aria-hidden className="size-3.5" />}
                  label="Reply to comment"
                  onClick={() => setReplying((current) => !current)}
                  size="sm"
                  title="Reply"
                />
              ) : null}
              {onEdit ? (
                <IconButton
                  icon={<Pencil aria-hidden className="size-3.5" />}
                  label="Edit comment"
                  onClick={() => setEditing((current) => !current)}
                  size="sm"
                  title="Edit comment"
                />
              ) : null}
              {onArchive ? (
                <IconButton
                  icon={<Trash2 aria-hidden className="size-3.5" />}
                  label="Archive comment"
                  onClick={() => onArchive(comment.id)}
                  size="sm"
                  title="Archive comment"
                />
              ) : null}
            </span>
          )
        }
        author={comment.author}
        body={comment.archived ? "_This comment was archived._" : comment.body}
        timestamp={comment.timestamp}
      />
      {!comment.archived && onReactionToggle ? (
        <div className="ml-10 flex flex-wrap items-center gap-1.5">
          {commentReactionOptions.map((emoji) => {
            const reaction = reactions.get(emoji);
            return (
              <button
                aria-label={`${reaction?.active ? "Remove" : "Add"} ${emoji} reaction`}
                className={cn(
                  "rounded-full border border-border px-2 py-1 text-xs transition hover:bg-subtle",
                  reaction?.active && "border-primary/40 bg-primary/10 text-primary",
                )}
                key={emoji}
                onClick={() => onReactionToggle(comment.id, emoji, reaction?.active ?? false)}
                type="button"
              >
                {emoji} {reaction?.count ?? 0}
              </button>
            );
          })}
        </div>
      ) : null}
      {editing ? (
        <div className="ml-10 grid gap-2">
          <IssueCommentComposer
            defaultValue={comment.body}
            onSubmit={(body) => {
              onEdit?.(comment.id, body);
              setEditing(false);
            }}
            placeholder="Edit comment..."
            submitLabel="Save comment"
          />
          <Button className="justify-self-start" onClick={() => setEditing(false)} variant="ghost">
            Cancel
          </Button>
        </div>
      ) : null}
      {replying ? (
        <div className="ml-10 grid gap-2">
          <IssueCommentComposer
            onSubmit={(body) => {
              onReply?.(comment.id, body);
              setReplying(false);
            }}
            placeholder="Reply to this comment..."
            submitLabel="Send reply"
          />
          <Button className="justify-self-start" onClick={() => setReplying(false)} variant="ghost">
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const defaultAuthor: IssueAuthor = {
  initials: "RP",
  name: "Robert Pitt",
};

const GoogleMark = () => (
  <span aria-hidden className="text-base font-bold text-primary">
    G
  </span>
);

const defaultResources: readonly ViewIssueResource[] = [
  {
    description: "Search the world's information, including webpages, images, videos and more.",
    favicon: <GoogleMark />,
    id: "google",
    meta: "6d",
    title: "Test Link",
  },
];

const defaultActivityEvents: readonly ViewIssueActivityEvent[] = [
  {
    author: defaultAuthor,
    body: "created the issue",
    id: "created",
    timestamp: "6d ago",
  },
];

const propertyIconClassName = "size-4 text-muted-foreground";

const defaultProperties = ({
  assignee,
  dueDate,
  priority,
  status,
}: {
  readonly assignee?: IssueAuthor;
  readonly dueDate?: React.ReactNode;
  readonly priority?: React.ReactNode;
  readonly status?: React.ReactNode;
}): readonly ViewIssueProperty[] => [
  {
    icon: <Circle aria-hidden className={propertyIconClassName} />,
    id: "status",
    label: "Status",
    value: status ?? "Todo",
  },
  {
    icon: <BarChart3 aria-hidden className={propertyIconClassName} />,
    id: "priority",
    label: "Priority",
    value: priority ?? "High",
  },
  {
    icon: <UserRound aria-hidden className={propertyIconClassName} />,
    id: "assignee",
    label: "Assignee",
    muted: !assignee,
    value: assignee?.name ?? "Assign",
  },
  {
    icon: <CalendarX2 aria-hidden className="size-4 text-destructive" />,
    id: "due-date",
    label: "Due date",
    value: dueDate ?? "05/06/2026",
  },
];

const ViewIssueActions = ({
  archiveDisabled,
  archiveLabel = "Archive issue",
  archivePending,
  onAgentDelegate,
  onArchive,
}: {
  readonly archiveDisabled?: boolean;
  readonly archiveLabel?: string;
  readonly archivePending?: boolean;
  readonly onAgentDelegate?: () => void;
  readonly onArchive?: () => void;
}) => (
  <div className="flex items-center justify-end gap-2">
    <IconButton
      icon={<LinkIcon aria-hidden className="size-4" />}
      label="Copy issue link"
      size="sm"
      title="Copy issue link"
      variant="outline"
    />
    <IconButton
      icon={<Copy aria-hidden className="size-4" />}
      label="Copy issue ID"
      size="sm"
      title="Copy issue ID"
      variant="outline"
    />
    <IconButton
      icon={<GitBranch aria-hidden className="size-4" />}
      label="Create branch"
      size="sm"
      title="Create branch"
      variant="outline"
    />
    <IconButton
      icon={<SendHorizontal aria-hidden className="size-4" />}
      disabled={!onAgentDelegate}
      label="Delegate to agent"
      onClick={onAgentDelegate}
      size="sm"
      title="Delegate to agent"
      variant="outline"
    />
    {onArchive ? (
      <IconButton
        disabled={archiveDisabled || archivePending}
        icon={<ArchiveIcon aria-hidden className="size-4" />}
        label={archivePending ? "Archiving issue" : archiveLabel}
        onClick={onArchive}
        size="sm"
        title={archivePending ? "Archiving issue" : archiveLabel}
        variant="outline"
      />
    ) : null}
    <Button
      className="h-8 rounded-full px-2"
      rightIcon={<ChevronDown aria-hidden className="size-4" />}
      size="sm"
      variant="outline"
    >
      <span className="sr-only">Issue actions</span>
    </Button>
  </div>
);

const PropertyRow = ({ property }: { readonly property: ViewIssueProperty }) => (
  <div
    className={cn(
      "grid min-h-8 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2",
      typography.control,
    )}
  >
    <span className="grid size-6 place-items-center">{property.icon}</span>
    <span className={cn("min-w-0 truncate font-medium", property.muted && "text-muted-foreground")}>
      {property.value}
    </span>
  </div>
);

const IssueLabelPill = ({ label }: { readonly label: ViewIssueLabel }) => (
  <span
    className={cn(
      "inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-subtle px-3 py-1 text-foreground",
      typography.control,
    )}
  >
    <span className={cn("size-2.5 rounded-full bg-destructive", label.colorClassName)} />
    <span className="min-w-0 truncate">{label.label}</span>
  </span>
);

const ViewerAvatar = ({ author }: { readonly author: IssueAuthor }) => (
  <Avatar className="size-7">
    {author.avatarSrc ? <AvatarImage alt="" src={author.avatarSrc} /> : null}
    <AvatarFallback className="text-[10px]">{author.initials}</AvatarFallback>
  </Avatar>
);

const activityTime = (value: Date | number | string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : new Date(value).getTime();

  return Number.isFinite(time) ? time : undefined;
};

type ActivityTimelineItem =
  | {
      readonly event: ViewIssueActivityEvent;
      readonly kind: "event";
      readonly order: number;
      readonly time?: number;
    }
  | {
      readonly comment: ViewIssueComment;
      readonly kind: "comment";
      readonly order: number;
      readonly time?: number;
    };

type ActivityTimelineGroup =
  | {
      readonly authorKey: string;
      readonly events: ViewIssueActivityEvent[];
      readonly id: string;
      readonly kind: "events";
    }
  | {
      readonly comment: ViewIssueComment;
      readonly id: string;
      readonly kind: "comment";
    };

const activityAuthorKey = (author: IssueAuthor): string => {
  const authorName =
    typeof author.name === "string" || typeof author.name === "number" ? String(author.name) : "";

  return [author.avatarSrc ?? "", author.initials, authorName].join(":");
};

export const ViewIssue = React.forwardRef<HTMLDivElement, ViewIssueProps>(function ViewIssue(
  {
    activityEvents = defaultActivityEvents,
    agentWork,
    archiveDisabled = false,
    archiveLabel,
    archivePending = false,
    assignee,
    className,
    comments = [],
    defaultDescription = "Test Issue Description",
    descriptionDefaultPreviewOpen = false,
    defaultSubIssueComposerOpen = false,
    defaultTitle = "Test Issue Title",
    description,
    descriptionSlashMenuOpen,
    descriptionToolbarOpen,
    dependencyState,
    dueDate,
    labels = [
      {
        id: "bug",
        label: "Bug",
      },
    ],
    labelsDefaultOpen = true,
    moreActions = [],
    onAgentReferenceClick,
    onArchive,
    onCommentArchive,
    onCommentCreate,
    onCommentEdit,
    onCommentReactionToggle,
    onCommentReply,
    onCommitReferenceClick,
    onCycleReferenceClick,
    onExternalLinkClick,
    onDescriptionSave,
    onEditorCommandSelect,
    onEditorFormatSelect,
    onFilesSelect,
    onLabelsEdit,
    onAgentDelegate,
    onIssueReferenceClick,
    onRepositoryReferenceClick,
    onSubIssueCreate,
    onRelationshipsEdit,
    onResourceAdd,
    onResourceEdit,
    onResourceRemove,
    onTagQueryChange,
    onTagSelect,
    onTitleSave,
    onUserReferenceClick,
    priority,
    project,
    projectDefaultOpen = true,
    properties: customProperties,
    propertiesDefaultOpen = true,
    resources = defaultResources,
    status,
    subIssues = [],
    tagSuggestions,
    title,
    viewer = defaultAuthor,
    ...props
  },
  ref,
) {
  const [subIssueComposerOpen, setSubIssueComposerOpen] = React.useState(
    defaultSubIssueComposerOpen,
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const properties =
    customProperties ??
    defaultProperties({
      assignee,
      dueDate,
      priority,
      status,
    });

  const openFilePicker = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCommentCreate = React.useCallback(
    (body: string) => {
      onCommentCreate?.(body);
    },
    [onCommentCreate],
  );

  const activityTimeline = React.useMemo<readonly ActivityTimelineItem[]>(() => {
    const items: ActivityTimelineItem[] = [
      ...activityEvents.map((event, index) => ({
        event,
        kind: "event" as const,
        order: index,
        time: activityTime(event.occurredAt),
      })),
      ...comments.map((comment, index) => ({
        comment,
        kind: "comment" as const,
        order: activityEvents.length + index,
        time: activityTime(comment.occurredAt),
      })),
    ];

    return items.sort((first, second) => {
      if (first.time !== undefined && second.time !== undefined && first.time !== second.time) {
        return first.time - second.time;
      }

      return first.order - second.order;
    });
  }, [activityEvents, comments]);

  const activityTimelineGroups = React.useMemo<readonly ActivityTimelineGroup[]>(() => {
    const groups: ActivityTimelineGroup[] = [];

    for (const item of activityTimeline) {
      if (item.kind === "comment") {
        groups.push({
          comment: item.comment,
          id: `comment-${item.comment.id}`,
          kind: "comment",
        });
        continue;
      }

      const authorKey = activityAuthorKey(item.event.author);
      const previousGroup = groups[groups.length - 1];

      if (previousGroup?.kind === "events" && previousGroup.authorKey === authorKey) {
        previousGroup.events.push(item.event);
        continue;
      }

      groups.push({
        authorKey,
        events: [item.event],
        id: `events-${item.event.id}`,
        kind: "events",
      });
    }

    return groups;
  }, [activityTimeline]);

  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "h-full min-h-0 overflow-hidden bg-background text-foreground",
        "grid grid-cols-[minmax(0,1fr)_360px] gap-10 px-8 py-7",
        "max-xl:grid-cols-1 max-xl:px-6",
        className,
      )}
    >
      <input
        className="hidden"
        onChange={(event) => {
          if (event.currentTarget.files) {
            onFilesSelect?.(event.currentTarget.files);
          }
        }}
        ref={fileInputRef}
        type="file"
      />
      <main className="mx-auto grid h-full min-h-0 w-full max-w-[1120px] content-start gap-8 overflow-y-auto overscroll-contain pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid gap-7">
          <EditableText
            defaultValue={defaultTitle}
            onSave={onTitleSave}
            placeholder="Issue title"
            value={title}
            variant="title"
          />
          <IssueEditor
            defaultValue={defaultDescription}
            defaultPreviewOpen={descriptionDefaultPreviewOpen}
            onAttach={openFilePicker}
            onAgentReferenceClick={onAgentReferenceClick}
            onCommandSelect={onEditorCommandSelect}
            onCommitReferenceClick={onCommitReferenceClick}
            onCycleReferenceClick={onCycleReferenceClick}
            onExternalLinkClick={onExternalLinkClick}
            onFormatSelect={onEditorFormatSelect}
            onIssueReferenceClick={onIssueReferenceClick}
            onRepositoryReferenceClick={onRepositoryReferenceClick}
            onSave={onDescriptionSave}
            onTagQueryChange={onTagQueryChange}
            onTagSelect={onTagSelect}
            onUserReferenceClick={onUserReferenceClick}
            placeholder="Add description..."
            slashMenuOpen={descriptionSlashMenuOpen}
            tagSuggestions={tagSuggestions}
            toolbarOpen={descriptionToolbarOpen}
            value={description}
          />
        </div>

        <section className="grid gap-4" aria-label="Sub-issues">
          <div className="flex items-center justify-between gap-3">
            <h2 className={typography.sectionTitle}>Sub-issues</h2>
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-1 text-muted-foreground transition hover:text-foreground",
                typography.control,
              )}
              onClick={() => setSubIssueComposerOpen(true)}
              type="button"
            >
              <Plus aria-hidden className="size-4" />
              Add sub-issue
            </button>
          </div>
          {subIssues.length > 0 ? (
            <div className="grid gap-2">
              {subIssues.map((ticket) => (
                <RelationshipTicketRow
                  key={ticket.id}
                  onSelect={onIssueReferenceClick}
                  ticket={ticket}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              No sub-issues yet.
            </div>
          )}
          {subIssueComposerOpen ? (
            <IssueSubIssueComposer
              onCancel={() => setSubIssueComposerOpen(false)}
              onSubmit={(draft) => {
                onSubIssueCreate?.(draft);
                setSubIssueComposerOpen(false);
              }}
              teamLabel="ROB"
            />
          ) : null}
        </section>

        {dependencyState !== undefined ? (
          <section aria-label="Relationships" className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className={typography.sectionTitle}>Relationships</h2>
              <div className="flex items-center gap-2">
                {dependencyState.blocked ? (
                  <span className="rounded-full bg-warning/15 px-2 py-1 text-xs font-medium text-warning">
                    Blocked
                  </span>
                ) : null}
                {onRelationshipsEdit ? (
                  <Button onClick={onRelationshipsEdit} size="sm" variant="outline">
                    Manage
                  </Button>
                ) : null}
              </div>
            </div>
            <RelationshipTicketGroup
              blockingIds={new Set(dependencyState.blockingTickets.map((ticket) => ticket.id))}
              label="Depends on"
              onSelect={onIssueReferenceClick}
              tickets={dependencyState.dependencyTickets}
            />
            {dependencyState.dependencyTickets.length === 0 &&
            dependencyState.downstreamTickets.length === 0 &&
            dependencyState.relatedTickets.length === 0 &&
            dependencyState.warnings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No relationships yet.
              </div>
            ) : null}
            <RelationshipTicketGroup
              blockingIds={
                new Set(dependencyState.downstreamBlockedTickets.map((ticket) => ticket.id))
              }
              label="Blocks"
              onSelect={onIssueReferenceClick}
              tickets={dependencyState.downstreamTickets}
            />
            <RelationshipTicketGroup
              label="Related"
              onSelect={onIssueReferenceClick}
              tickets={dependencyState.relatedTickets}
            />
            {dependencyState.warnings.map((warning) => (
              <div
                className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
                key={warning}
              >
                {warning}
              </div>
            ))}
          </section>
        ) : null}

        <section className="grid gap-4" aria-label="Resources">
          <div className="flex items-center justify-between gap-3">
            <button
              aria-expanded="true"
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-1 text-muted-foreground",
                typography.sectionTitle,
              )}
              type="button"
            >
              <ChevronDown aria-hidden className="size-4" />
              Resources
            </button>
            {onResourceAdd ? (
              <IconButton
                icon={<Plus aria-hidden className="size-4" />}
                label="Add resource"
                onClick={onResourceAdd}
                size="sm"
                title="Add resource"
                variant="outline"
              />
            ) : null}
          </div>
          <div className="grid gap-2">
            {resources.map((resource) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                key={resource.id}
              >
                <IssueResourceLink
                  description={resource.description}
                  favicon={resource.favicon}
                  href={resource.href}
                  meta={resource.meta}
                  title={resource.title}
                />
                {onResourceEdit || onResourceRemove ? (
                  <span className="flex items-center gap-1">
                    {onResourceEdit ? (
                      <IconButton
                        icon={<Pencil aria-hidden className="size-3.5" />}
                        label="Edit resource"
                        onClick={() => onResourceEdit(resource.id)}
                        size="sm"
                        title="Edit resource"
                      />
                    ) : null}
                    {onResourceRemove ? (
                      <IconButton
                        icon={<Trash2 aria-hidden className="size-3.5" />}
                        label="Remove resource"
                        onClick={() => onResourceRemove(resource.id)}
                        size="sm"
                        title="Remove resource"
                      />
                    ) : null}
                  </span>
                ) : null}
              </div>
            ))}
            {resources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No resources yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-5 border-t border-border pt-6" aria-label="Activity">
          <div className="flex items-center justify-between gap-3">
            <h2 className={typography.sectionTitle}>Activity</h2>
            <div
              className={cn("flex items-center gap-5 text-muted-foreground", typography.control)}
            >
              <button className="transition hover:text-foreground" type="button">
                Unsubscribe
              </button>
              <ViewerAvatar author={viewer} />
            </div>
          </div>
          <div className="grid gap-5">
            {activityTimelineGroups.map((group) =>
              group.kind === "events" ? (
                <div className="grid gap-1.5" key={group.id}>
                  {group.events.map((event, eventIndex) => (
                    <IssueActivityEvent
                      author={event.author}
                      key={event.id}
                      showAuthor={eventIndex === 0}
                      timestamp={event.timestamp}
                    >
                      {event.body}
                    </IssueActivityEvent>
                  ))}
                </div>
              ) : (
                <CommentTimelineCard
                  comment={group.comment}
                  key={group.id}
                  onArchive={onCommentArchive}
                  onEdit={onCommentEdit}
                  onReactionToggle={onCommentReactionToggle}
                  onReply={onCommentReply}
                  referenceHandlers={{
                    onAgentReferenceClick,
                    onCommitReferenceClick,
                    onCycleReferenceClick,
                    onExternalLinkClick,
                    onIssueReferenceClick,
                    onRepositoryReferenceClick,
                    onUserReferenceClick,
                  }}
                />
              ),
            )}
            <IssueCommentComposer
              author={viewer}
              onAttach={openFilePicker}
              onSubmit={handleCommentCreate}
              onTagQueryChange={onTagQueryChange}
              onTagSelect={onTagSelect}
              tagSuggestions={tagSuggestions}
            />
          </div>
        </section>
      </main>

      <aside className="sticky top-0 grid max-h-full min-h-0 content-start gap-3 self-start overflow-y-auto overscroll-contain pr-1 max-xl:hidden">
        <ViewIssueActions
          archiveDisabled={archiveDisabled}
          archiveLabel={archiveLabel}
          archivePending={archivePending}
          onAgentDelegate={onAgentDelegate}
          onArchive={onArchive}
        />
        <IssueSidebarSection
          className="overflow-visible"
          defaultOpen={propertiesDefaultOpen}
          title="Properties"
        >
          <div className="grid gap-2">
            {properties.map((property) => (
              <PropertyRow key={property.id} property={property} />
            ))}
          </div>
        </IssueSidebarSection>
        {agentWork ? (
          <IssueSidebarSection defaultOpen title="Agent">
            {agentWork}
          </IssueSidebarSection>
        ) : null}
        <IssueSidebarSection
          actions={
            onLabelsEdit ? (
              <IconButton
                icon={<Plus aria-hidden className="size-4" />}
                label="Add label"
                onClick={onLabelsEdit}
                size="sm"
                title="Add label"
              />
            ) : undefined
          }
          defaultOpen={labelsDefaultOpen}
          title="Labels"
        >
          <div className="flex flex-wrap items-center gap-2">
            {labels.map((label) => (
              <IssueLabelPill key={label.id} label={label} />
            ))}
          </div>
        </IssueSidebarSection>
        <IssueSidebarSection defaultOpen={projectDefaultOpen} title="Project">
          <button
            className={cn(
              "grid min-h-8 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 text-left text-muted-foreground transition hover:text-foreground",
              typography.control,
            )}
            type="button"
          >
            <Box aria-hidden className={propertyIconClassName} />
            <span className="min-w-0 truncate">{project ?? "Add to project"}</span>
          </button>
        </IssueSidebarSection>
        {moreActions.length > 0 ? (
          <IssueSidebarSection defaultOpen={false} title="More">
            <div className={cn("grid gap-2 text-muted-foreground", typography.control)}>
              <div className="flex items-center gap-2">
                <IssuePropertyOptionMenu
                  align="start"
                  label="More issue actions"
                  onChange={(actionId) =>
                    moreActions.find((action) => action.id === actionId)?.onSelect()
                  }
                  options={moreActions.map((action) => ({
                    disabled: action.disabled,
                    icon: action.icon ?? (
                      <MoreHorizontal aria-hidden className={propertyIconClassName} />
                    ),
                    label: action.label,
                    value: action.id,
                  }))}
                  trigger={<MoreHorizontal aria-hidden className={propertyIconClassName} />}
                  value=""
                  widthClassName="w-[280px]"
                />
                <span>More actions</span>
              </div>
            </div>
          </IssueSidebarSection>
        ) : null}
      </aside>
    </div>
  );
});
