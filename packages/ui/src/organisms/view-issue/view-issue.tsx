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
  readonly timestamp?: React.ReactNode;
};

export type ViewIssueComment = {
  readonly author: IssueAuthor;
  readonly body: React.ReactNode;
  readonly id: string;
  readonly timestamp?: React.ReactNode;
};

export type ViewIssueProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly activityEvents?: readonly ViewIssueActivityEvent[];
  readonly assignee?: IssueAuthor;
  readonly comments?: readonly ViewIssueComment[];
  readonly defaultDescription?: string;
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
  readonly onTitleSave?: (title: string) => void;
  readonly labelsDefaultOpen?: boolean;
  readonly priority?: React.ReactNode;
  readonly project?: React.ReactNode;
  readonly projectDefaultOpen?: boolean;
  readonly propertiesDefaultOpen?: boolean;
  readonly resources?: readonly ViewIssueResource[];
  readonly status?: React.ReactNode;
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

export const ViewIssue = React.forwardRef<HTMLDivElement, ViewIssueProps>(function ViewIssue(
  {
    activityEvents = defaultActivityEvents,
    assignee,
    className,
    comments = [],
    defaultDescription = "Test Issue Description",
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
    onCommentCreate,
    onDescriptionSave,
    onEditorCommandSelect,
    onEditorFormatSelect,
    onFilesSelect,
    onSubIssueCreate,
    onTitleSave,
    priority,
    project,
    projectDefaultOpen = true,
    propertiesDefaultOpen = true,
    resources = defaultResources,
    status,
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
  const properties = defaultProperties({
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
      onCommentCreate?.(body);
      setLocalComments((current) => [
        ...current,
        {
          author: viewer,
          body,
          id: `comment-${current.length + 1}`,
          timestamp: "just now",
        },
      ]);
    },
    [onCommentCreate, viewer],
  );

  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "min-h-[820px] bg-background text-foreground",
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
      <main className="mx-auto grid w-full max-w-[1120px] content-start gap-8">
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
            onAttach={openFilePicker}
            onCommandSelect={onEditorCommandSelect}
            onFormatSelect={onEditorFormatSelect}
            onSave={onDescriptionSave}
            placeholder="Add description..."
            slashMenuOpen={descriptionSlashMenuOpen}
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
            {activityEvents.map((event) => (
              <IssueActivityEvent author={event.author} key={event.id} timestamp={event.timestamp}>
                {event.body}
              </IssueActivityEvent>
            ))}
            {localComments.map((comment) => (
              <IssueCommentCard
                author={comment.author}
                body={comment.body}
                key={comment.id}
                timestamp={comment.timestamp}
              />
            ))}
            <IssueCommentComposer
              author={viewer}
              onAttach={openFilePicker}
              onSubmit={handleCommentCreate}
            />
          </div>
        </section>
      </main>

      <aside className="grid h-fit content-start gap-3 max-xl:hidden">
        <ViewIssueActions />
        <IssueSidebarSection defaultOpen={propertiesDefaultOpen} title="Properties">
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
