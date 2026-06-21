import {
  BarChart3,
  Box,
  CalendarX2,
  ChevronDown,
  Circle,
  Copy,
  GitBranch,
  Link as LinkIcon,
  MoreHorizontal,
  Plus,
  SendHorizontal,
  SmilePlus,
  Tag,
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

export type ViewIssueActivityEvent = {
  readonly author: IssueAuthor;
  readonly body: React.ReactNode;
  readonly id: string;
  readonly occurredAt?: Date | number | string;
  readonly timestamp?: React.ReactNode;
};

export type ViewIssueComment = {
  readonly author: IssueAuthor;
  readonly body: React.ReactNode;
  readonly id: string;
  readonly occurredAt?: Date | number | string;
  readonly timestamp?: React.ReactNode;
};

export type ViewIssueProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> &
  MarkdownReferenceHandlers & {
    readonly activityEvents?: readonly ViewIssueActivityEvent[];
    readonly assignee?: IssueAuthor;
    readonly comments?: readonly ViewIssueComment[];
    readonly defaultDescription?: string;
    readonly descriptionDefaultPreviewOpen?: boolean;
    readonly defaultSubIssueComposerOpen?: boolean;
    readonly defaultTitle?: string;
    readonly description?: string;
    readonly descriptionSlashMenuOpen?: boolean;
    readonly descriptionToolbarOpen?: boolean;
    readonly dueDate?: React.ReactNode;
    readonly labels?: readonly ViewIssueLabel[];
    readonly onCommentCreate?: (comment: string) => void;
    readonly onDescriptionSave?: (description: string) => void;
    readonly onEditorCommandSelect?: (command: IssueEditorCommand) => void;
    readonly onEditorFormatSelect?: (action: IssueEditorFormatAction) => void;
    readonly onFilesSelect?: (files: FileList) => void;
    readonly onSubIssueCreate?: (draft: IssueSubIssueDraft) => void;
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
    readonly tagSuggestions?: readonly IssueEditorTagSuggestion[];
    readonly title?: string;
    readonly viewer?: IssueAuthor;
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

const ViewIssueActions = () => (
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
      label="Send to agent"
      size="sm"
      title="Send to agent"
      variant="outline"
    />
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
    dueDate,
    labels = [
      {
        id: "bug",
        label: "Bug",
      },
    ],
    labelsDefaultOpen = true,
    onAgentReferenceClick,
    onCommentCreate,
    onCommitReferenceClick,
    onCycleReferenceClick,
    onDescriptionSave,
    onEditorCommandSelect,
    onEditorFormatSelect,
    onFilesSelect,
    onIssueReferenceClick,
    onRepositoryReferenceClick,
    onSubIssueCreate,
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
  const [localComments, setLocalComments] = React.useState<readonly ViewIssueComment[]>(comments);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const properties =
    customProperties ??
    defaultProperties({
      assignee,
      dueDate,
      priority,
      status,
    });

  React.useEffect(() => {
    setLocalComments(comments);
  }, [comments]);

  const openFilePicker = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCommentCreate = React.useCallback(
    (body: string) => {
      const now = new Date().toISOString();
      onCommentCreate?.(body);
      setLocalComments((current) => [
        ...current,
        {
          author: viewer,
          body,
          id: `comment-${current.length + 1}`,
          occurredAt: now,
          timestamp: "just now",
        },
      ]);
    },
    [onCommentCreate, viewer],
  );

  const activityTimeline = React.useMemo<readonly ActivityTimelineItem[]>(() => {
    const items: ActivityTimelineItem[] = [
      ...activityEvents.map((event, index) => ({
        event,
        kind: "event" as const,
        order: index,
        time: activityTime(event.occurredAt),
      })),
      ...localComments.map((comment, index) => ({
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
  }, [activityEvents, localComments]);

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
          <button
            className={cn(
              "inline-flex w-fit items-center gap-2 rounded-md px-1 text-muted-foreground transition hover:text-foreground",
              typography.control,
            )}
            onClick={() => setSubIssueComposerOpen(true)}
            type="button"
          >
            <Plus aria-hidden className="size-4" />
            Add sub-issues
          </button>
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
            <IconButton
              icon={<Plus aria-hidden className="size-4" />}
              label="Add resource"
              size="sm"
              title="Add resource"
              variant="outline"
            />
          </div>
          <div className="grid gap-2">
            {resources.map((resource) => (
              <IssueResourceLink
                description={resource.description}
                favicon={resource.favicon}
                href={resource.href}
                key={resource.id}
                meta={resource.meta}
                title={resource.title}
              />
            ))}
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
                <IssueCommentCard
                  author={group.comment.author}
                  body={group.comment.body}
                  key={group.id}
                  onAgentReferenceClick={onAgentReferenceClick}
                  onCommitReferenceClick={onCommitReferenceClick}
                  onCycleReferenceClick={onCycleReferenceClick}
                  onIssueReferenceClick={onIssueReferenceClick}
                  onRepositoryReferenceClick={onRepositoryReferenceClick}
                  onUserReferenceClick={onUserReferenceClick}
                  timestamp={group.comment.timestamp}
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
        <ViewIssueActions />
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
        <IssueSidebarSection
          actions={
            <IconButton
              icon={<Plus aria-hidden className="size-4" />}
              label="Add label"
              size="sm"
              title="Add label"
            />
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
        <IssueSidebarSection defaultOpen={false} title="More">
          <div className={cn("grid gap-2 text-muted-foreground", typography.control)}>
            <button className="flex items-center gap-2 text-left" type="button">
              <Tag aria-hidden className={propertyIconClassName} />
              Convert to label
            </button>
            <button className="flex items-center gap-2 text-left" type="button">
              <SmilePlus aria-hidden className={propertyIconClassName} />
              Add reaction
            </button>
            <button className="flex items-center gap-2 text-left" type="button">
              <MoreHorizontal aria-hidden className={propertyIconClassName} />
              More actions
            </button>
          </div>
        </IssueSidebarSection>
      </aside>
    </div>
  );
});
