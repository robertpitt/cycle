import type {
  LabelDefinitionDocument,
  SavedViewDocument,
  TicketDocument,
  TicketQuery,
  UserProfileDocument,
} from "@cycle/database";
import { Avatar, AvatarFallback, Button, IconButton, Input } from "@cycle/ui/atoms";
import { IssuesList, type IssuesListGroup, type IssuesListProps } from "@cycle/ui/organisms";
import { cn } from "@cycle/ui/utils";
import {
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleOff,
  CircleUserRound,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import * as React from "react";
import type { ProfileConfig } from "../../shared/AppConfig.ts";
import { useCreateSavedViewMutation } from "../mutations/index.ts";
import { useUpdateIssueMutation } from "../mutations/useUpdateIssueMutation.ts";
import { labelColorClassName } from "../screens/workspace/createIssueOptions.tsx";
import { useIssueListQuery } from "../queries/issues.ts";
import { useLabelListQuery, useSavedViewListQuery, useUserListQuery } from "../queries/metadata.ts";

type IssuesPanelProps = {
  readonly loadingRepository?: boolean;
  readonly onCreateIssue?: () => void;
  readonly onIssueSelect?: (selection: IssuePanelSelection) => void;
  readonly profile?: ProfileConfig;
  readonly query?: Omit<TicketQuery, "repositoryIds">;
  readonly repositoryId?: string;
  readonly repositoryIds?: readonly string[];
  readonly repositories?: readonly IssuePanelRepository[];
  readonly savedViewId?: string;
  readonly selectedIssueId?: string;
  readonly showSavedViewControls?: boolean;
  readonly title?: string;
};

export type IssuePanelSelection = {
  readonly issueId: string;
  readonly repositoryId?: string;
};

type IssuePanelRepository = {
  readonly displayName: string;
  readonly id: string;
};

type IssueGrouping = "none" | "status" | "assignee" | "priority" | "label";

type IssueMenuOption = {
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly label: React.ReactNode;
  readonly rightMeta?: React.ReactNode;
};

type IssueGroupDefinition = IssueMenuOption & {
  readonly title: React.ReactNode;
};

const groupingOptions: readonly IssueMenuOption[] = [
  {
    id: "none",
    label: "No grouping",
  },
  {
    id: "status",
    label: "Status",
  },
  {
    id: "assignee",
    label: "Assignee",
  },
  {
    id: "priority",
    label: "Priority",
  },
  {
    id: "label",
    label: "Label",
  },
];

const statusOrder = ["in-progress", "todo", "backlog", "done", "canceled"] as const;
const priorityOrder = ["none", "urgent", "high", "medium", "low"] as const;

const normalizeValue = (value: unknown, fallback = "none"): string => {
  if (value === null || value === undefined) return fallback;

  const normalized = String(value).trim().toLowerCase();
  return normalized.length === 0 ? fallback : normalized;
};

const titleForValue = (value: string): string =>
  value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const initialsForName = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const countBy = (
  issues: readonly TicketDocument[],
  getValue: (issue: TicketDocument) => string,
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();

  for (const issue of issues) {
    const value = getValue(issue);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
};

const priorityTone = (priority: string): IssuesListProps["rows"][number]["priorityTone"] => {
  switch (priority) {
    case "high":
    case "urgent":
      return "danger";
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      return "neutral";
  }
};

const statusTone = (status: string): IssuesListProps["rows"][number]["statusTone"] => {
  switch (status) {
    case "done":
    case "closed":
      return "success";
    case "in-progress":
      return "warning";
    case "blocked":
    case "canceled":
      return "danger";
    default:
      return "neutral";
  }
};

const formatIssueDate = (issue: TicketDocument) => {
  const date = new Date(issue.frontmatter.updatedAt);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
};

const PriorityBars = ({ priority }: { readonly priority: string }) => {
  const level = priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;

  if (priority === "none") {
    return <span className="text-sm font-semibold leading-none text-muted-foreground">--</span>;
  }

  if (priority === "urgent") {
    return (
      <span className="grid size-4 place-items-center rounded-sm bg-destructive text-[11px] font-bold text-destructive-foreground">
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

const StatusIcon = ({ status }: { readonly status: string }) => {
  const className =
    status === "in-progress"
      ? "text-warning"
      : status === "done" || status === "closed"
        ? "text-primary"
        : status === "canceled"
          ? "text-muted-foreground"
          : "text-muted-foreground";

  if (status === "done" || status === "closed") {
    return <CircleCheck aria-hidden className={cn("size-4", className)} strokeWidth={2.4} />;
  }

  if (status === "backlog") {
    return <CircleDashed aria-hidden className={cn("size-4", className)} strokeWidth={2.2} />;
  }

  if (status === "canceled") {
    return <CircleOff aria-hidden className={cn("size-4", className)} strokeWidth={2.4} />;
  }

  return <Circle aria-hidden className={cn("size-4", className)} strokeWidth={2.4} />;
};

const AssigneeAvatar = ({ assignee }: { readonly assignee?: string | null }) => {
  if (!assignee || assignee === "none") {
    return <CircleUserRound aria-hidden className="size-4 text-muted-foreground" />;
  }

  return (
    <Avatar className="size-6">
      <AvatarFallback className="text-[10px]">{initialsForName(assignee)}</AvatarFallback>
    </Avatar>
  );
};

const stopRowActivation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

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

const IssueFieldMenu = ({
  align = "start",
  children,
  disabled = false,
  label,
  onSelect,
  options,
  value,
  widthClassName = "w-[260px]",
}: {
  readonly align?: "end" | "start";
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onSelect: (option: IssueMenuOption) => void;
  readonly options: readonly IssueMenuOption[];
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

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") close();
  };

  return (
    <div
      className="relative inline-flex"
      onClick={stopRowActivation}
      onKeyDown={handleMenuKeyDown}
      onPointerDown={stopRowActivation}
      ref={ref}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={cn(
          "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open && "bg-subtle text-foreground",
        )}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {children}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-elevated",
            align === "end" ? "right-0" : "left-0",
            widthClassName,
          )}
          role="menu"
        >
          {options.map((option) => {
            const selected = option.id === value;
            return (
              <button
                aria-checked={selected}
                className={cn(
                  "grid min-h-10 w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 text-left text-sm text-foreground transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected && "bg-subtle",
                )}
                key={option.id}
                onClick={() => {
                  onSelect(option);
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

const IssuePriorityControl = ({
  issue,
  options,
  repositoryId,
}: {
  readonly issue: TicketDocument;
  readonly options: readonly IssueMenuOption[];
  readonly repositoryId?: string;
}) => {
  const priority = normalizeValue(issue.frontmatter.priority);
  const updateIssue = useUpdateIssueMutation({
    issueId: issue.id,
    repositoryId,
  });

  return (
    <IssueFieldMenu
      disabled={updateIssue.isPending}
      label={`Change priority for ${issue.id}`}
      onSelect={(option) => {
        if (option.id === priority) return;
        updateIssue.mutate({
          frontmatter: {
            priority: option.id,
          },
          message: `Updated ${issue.id} priority to ${option.id}`,
        });
      }}
      options={options}
      value={priority}
    >
      <PriorityBars priority={priority} />
    </IssueFieldMenu>
  );
};

const IssueStatusControl = ({
  issue,
  options,
  repositoryId,
}: {
  readonly issue: TicketDocument;
  readonly options: readonly IssueMenuOption[];
  readonly repositoryId?: string;
}) => {
  const status = normalizeValue(issue.frontmatter.status);
  const updateIssue = useUpdateIssueMutation({
    issueId: issue.id,
    repositoryId,
  });

  return (
    <IssueFieldMenu
      disabled={updateIssue.isPending}
      label={`Change status for ${issue.id}`}
      onSelect={(option) => {
        if (option.id === status) return;
        updateIssue.mutate({
          frontmatter: {
            status: option.id,
          },
          message: `Updated ${issue.id} status to ${option.id}`,
        });
      }}
      options={options}
      value={status}
    >
      <StatusIcon status={status} />
    </IssueFieldMenu>
  );
};

const IssueAssigneeControl = ({
  assigneeLabel,
  issue,
  options,
  repositoryId,
}: {
  readonly assigneeLabel?: string;
  readonly issue: TicketDocument;
  readonly options: readonly IssueMenuOption[];
  readonly repositoryId?: string;
}) => {
  const assignee = issue.frontmatter.assignee?.trim() || "none";
  const updateIssue = useUpdateIssueMutation({
    issueId: issue.id,
    repositoryId,
  });

  return (
    <IssueFieldMenu
      align="end"
      disabled={updateIssue.isPending}
      label={`Change assignee for ${issue.id}`}
      onSelect={(option) => {
        if (option.id === assignee) return;
        updateIssue.mutate({
          frontmatter: {
            assignee: option.id === "none" ? null : option.id,
          },
          message: `Updated ${issue.id} assignee`,
        });
      }}
      options={options}
      value={assignee}
      widthClassName="w-[280px]"
    >
      <AssigneeAvatar assignee={assigneeLabel ?? issue.frontmatter.assignee} />
    </IssueFieldMenu>
  );
};

const ViewOptionsMenu = ({
  grouping,
  onGroupingChange,
}: {
  readonly grouping: IssueGrouping;
  readonly onGroupingChange: (grouping: IssueGrouping) => void;
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
      <IconButton
        aria-expanded={open}
        aria-haspopup="menu"
        className={open ? "bg-subtle text-foreground shadow-card" : undefined}
        icon={<SlidersHorizontal aria-hidden className="size-4" />}
        label="View options"
        onClick={() => setOpen((current) => !current)}
        size="sm"
        title="View options"
        variant="ghost"
      />
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[240px] overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-elevated"
          role="menu"
        >
          <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">Grouping</div>
          {groupingOptions.map((option) => {
            const selected = option.id === grouping;
            return (
              <button
                aria-checked={selected}
                className={cn(
                  "grid min-h-10 w-full grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-3 rounded-lg px-2 text-left text-sm text-foreground transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected && "bg-subtle",
                )}
                key={option.id}
                onClick={() => {
                  onGroupingChange(option.id as IssueGrouping);
                  close();
                }}
                role="menuitemradio"
                type="button"
              >
                <span className="min-w-0 truncate font-medium">{option.label}</span>
                <span className="grid size-5 place-items-center text-muted-foreground">
                  {selected ? <Check aria-hidden className="size-5" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const statusDefinitions = (counts: ReadonlyMap<string, number>): readonly IssueGroupDefinition[] =>
  [
    {
      icon: <StatusIcon status="in-progress" />,
      id: "in-progress",
      label: "In Progress",
      rightMeta: counts.get("in-progress") ?? 0,
      title: "In Progress",
    },
    {
      icon: <StatusIcon status="todo" />,
      id: "todo",
      label: "Todo",
      rightMeta: counts.get("todo") ?? 0,
      title: "Todo",
    },
    {
      icon: <StatusIcon status="backlog" />,
      id: "backlog",
      label: "Backlog",
      rightMeta: counts.get("backlog") ?? 0,
      title: "Backlog",
    },
    {
      icon: <StatusIcon status="done" />,
      id: "done",
      label: "Done",
      rightMeta: counts.get("done") ?? 0,
      title: "Done",
    },
    {
      icon: <StatusIcon status="canceled" />,
      id: "canceled",
      label: "Canceled",
      rightMeta: counts.get("canceled") ?? 0,
      title: "Canceled",
    },
  ].concat(
    [...counts.keys()]
      .filter((status) => !statusOrder.includes(status as (typeof statusOrder)[number]))
      .sort()
      .map((status) => ({
        icon: <StatusIcon status={status} />,
        id: status,
        label: titleForValue(status),
        rightMeta: counts.get(status) ?? 0,
        title: titleForValue(status),
      })),
  );

const priorityDefinitions = (
  counts: ReadonlyMap<string, number>,
): readonly IssueGroupDefinition[] =>
  [
    {
      icon: <PriorityBars priority="none" />,
      id: "none",
      label: "No priority",
      rightMeta: counts.get("none") ?? 0,
      title: "No priority",
    },
    {
      icon: <PriorityBars priority="urgent" />,
      id: "urgent",
      label: "Urgent",
      rightMeta: counts.get("urgent") ?? 0,
      title: "Urgent",
    },
    {
      icon: <PriorityBars priority="high" />,
      id: "high",
      label: "High",
      rightMeta: counts.get("high") ?? 0,
      title: "High",
    },
    {
      icon: <PriorityBars priority="medium" />,
      id: "medium",
      label: "Medium",
      rightMeta: counts.get("medium") ?? 0,
      title: "Medium",
    },
    {
      icon: <PriorityBars priority="low" />,
      id: "low",
      label: "Low",
      rightMeta: counts.get("low") ?? 0,
      title: "Low",
    },
  ].concat(
    [...counts.keys()]
      .filter((priority) => !priorityOrder.includes(priority as (typeof priorityOrder)[number]))
      .sort()
      .map((priority) => ({
        icon: <PriorityBars priority={priority} />,
        id: priority,
        label: titleForValue(priority),
        rightMeta: counts.get(priority) ?? 0,
        title: titleForValue(priority),
      })),
  );

const assigneeDefinitions = ({
  counts,
  issues,
  profile,
  users,
}: {
  readonly counts: ReadonlyMap<string, number>;
  readonly issues: readonly TicketDocument[];
  readonly profile?: ProfileConfig;
  readonly users: readonly UserProfileDocument[];
}): readonly IssueGroupDefinition[] => {
  const assignees = new Map<string, string>();
  const profileName = profile?.displayName.trim();

  for (const user of users) {
    assignees.set(user.id, user.displayName);
  }

  for (const issue of issues) {
    const assignee = issue.frontmatter.assignee?.trim();
    if (assignee) {
      assignees.set(assignee, assignees.get(assignee) ?? assignee);
    }
  }

  if (assignees.size === 0 && profileName) {
    assignees.set(profileName, profileName);
  }

  return [
    {
      icon: <AssigneeAvatar />,
      id: "none",
      label: "No assignee",
      rightMeta: counts.get("none") ?? 0,
      title: "No assignee",
    },
    ...[...assignees.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({
        icon: <AssigneeAvatar assignee={name} />,
        id,
        label: name,
        rightMeta: counts.get(id) ?? 0,
        title: name,
      })),
  ];
};

const labelDefinitions = ({
  counts,
  labels,
}: {
  readonly counts: ReadonlyMap<string, number>;
  readonly labels: readonly LabelDefinitionDocument[];
}): readonly IssueGroupDefinition[] => {
  const knownLabels = new Map(labels.map((label) => [label.id, label] as const));

  return [
    {
      icon: <span aria-hidden className="size-3 rounded-full bg-muted-foreground" />,
      id: "none",
      label: "No label",
      rightMeta: counts.get("none") ?? 0,
      title: "No label",
    },
    ...[...new Set([...knownLabels.keys(), ...counts.keys()].filter((label) => label !== "none"))]
      .sort((a, b) => (knownLabels.get(a)?.name ?? a).localeCompare(knownLabels.get(b)?.name ?? b))
      .map((labelId) => {
        const label = knownLabels.get(labelId);

        return {
          icon: (
            <span
              aria-hidden
              className={cn("size-3 rounded-full", labelColorClassName(label?.color))}
            />
          ),
          id: labelId,
          label: label?.name ?? titleForValue(labelId),
          rightMeta: counts.get(labelId) ?? 0,
          title: label?.name ?? titleForValue(labelId),
        };
      }),
  ];
};

const issueRow = ({
  assigneeOptions,
  labelMap,
  issue,
  priorityOptions,
  repositoryDisplayName,
  repositoryId,
  showRepositoryMeta,
  statusOptions,
  userMap,
}: {
  readonly assigneeOptions: readonly IssueMenuOption[];
  readonly labelMap: ReadonlyMap<string, LabelDefinitionDocument>;
  readonly issue: TicketDocument;
  readonly priorityOptions: readonly IssueMenuOption[];
  readonly repositoryDisplayName?: string;
  readonly repositoryId?: string;
  readonly showRepositoryMeta: boolean;
  readonly statusOptions: readonly IssueMenuOption[];
  readonly userMap: ReadonlyMap<string, UserProfileDocument>;
}): IssuesListProps["rows"][number] => {
  const status = normalizeValue(issue.frontmatter.status);
  const priority = normalizeValue(issue.frontmatter.priority);
  const assignee = issue.frontmatter.assignee?.trim();
  const assigneeLabel = assignee ? (userMap.get(assignee)?.displayName ?? assignee) : undefined;

  return {
    assigneeControl: (
      <IssueAssigneeControl
        assigneeLabel={assigneeLabel}
        issue={issue}
        options={assigneeOptions}
        repositoryId={repositoryId}
      />
    ),
    date: formatIssueDate(issue),
    id: issue.id,
    meta: [
      ...(showRepositoryMeta && repositoryDisplayName
        ? [
            {
              label: repositoryDisplayName,
              tone: "neutral" as const,
            },
          ]
        : []),
      ...(issue.frontmatter.type && normalizeValue(issue.frontmatter.type) !== "issue"
        ? [
            {
              label: issue.frontmatter.type,
            },
          ]
        : []),
      ...(issue.frontmatter.labels ?? []).map((labelId) => ({
        label: labelMap.get(labelId)?.name ?? labelId,
        tone: "success" as const,
      })),
    ],
    priorityControl: (
      <IssuePriorityControl issue={issue} options={priorityOptions} repositoryId={repositoryId} />
    ),
    priorityTone: priorityTone(priority),
    statusControl: (
      <IssueStatusControl issue={issue} options={statusOptions} repositoryId={repositoryId} />
    ),
    statusTone: statusTone(status),
    title: issue.frontmatter.title,
  };
};

const groupKeyForIssue = (issue: TicketDocument, grouping: IssueGrouping): string => {
  if (grouping === "status") return normalizeValue(issue.frontmatter.status);
  if (grouping === "priority") return normalizeValue(issue.frontmatter.priority);
  if (grouping === "assignee") return issue.frontmatter.assignee?.trim() || "none";
  if (grouping === "label") return issue.frontmatter.labels?.[0] ?? "none";
  return "none";
};

const groupingFromSavedView = (view: SavedViewDocument | undefined): IssueGrouping | undefined => {
  if (!view) return undefined;

  return view.groupBy === "assignee" ||
    view.groupBy === "label" ||
    view.groupBy === "none" ||
    view.groupBy === "priority" ||
    view.groupBy === "status"
    ? view.groupBy
    : undefined;
};

const repositoryIdForIssue = (
  issue: TicketDocument,
  fallbackRepositoryId?: string,
): string | undefined => issue.repositoryId ?? issue.repository ?? fallbackRepositoryId;

export const IssuesPanel = ({
  loadingRepository = false,
  onCreateIssue,
  onIssueSelect,
  profile,
  query = {},
  repositoryId,
  repositoryIds,
  repositories = [],
  savedViewId,
  selectedIssueId,
  showSavedViewControls = true,
  title = "Issues",
}: IssuesPanelProps) => {
  const [grouping, setGrouping] = React.useState<IssueGrouping>("status");
  const [searchText, setSearchText] = React.useState("");
  const [localActiveViewId, setLocalActiveViewId] = React.useState<string>();
  const [collapsedGroupIds, setCollapsedGroupIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const savedViewsQuery = useSavedViewListQuery(repositoryId);
  const labelsQuery = useLabelListQuery(repositoryId, {
    archived: false,
  });
  const usersQuery = useUserListQuery(repositoryId, {
    disabled: false,
  });
  const createSavedView = useCreateSavedViewMutation({
    repositoryId,
  });
  const savedViews = savedViewsQuery.data?.entries ?? [];
  const activeViewId = savedViewId ?? localActiveViewId;
  const activeSavedView = savedViews.find((view) => view.id === activeViewId);
  const savedViewControlsVisible = showSavedViewControls && repositoryId !== undefined;
  const effectiveQuery = React.useMemo(() => {
    const sortPatch =
      activeSavedView?.sort === undefined
        ? {}
        : {
            orderBy: activeSavedView.sort.field,
            orderDirection: activeSavedView.sort.direction,
          };
    const text = searchText.trim();

    return {
      ...query,
      ...activeSavedView?.query,
      ...sortPatch,
      ...(text.length > 0 ? { text } : {}),
    } satisfies Omit<TicketQuery, "repositoryIds">;
  }, [activeSavedView, query, searchText]);
  const issuesQuery = useIssueListQuery(repositoryId, effectiveQuery, repositoryIds);
  const issues = issuesQuery.data?.entries ?? [];
  const labels = labelsQuery.data?.entries ?? [];
  const users = usersQuery.data?.entries ?? [];
  const labelMap = React.useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);
  const userMap = React.useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const repositoryMap = React.useMemo(
    () => new Map(repositories.map((repository) => [repository.id, repository] as const)),
    [repositories],
  );
  const globalIssueList = repositoryIds !== undefined && repositoryIds.length > 0;

  React.useEffect(() => {
    const nextGrouping = groupingFromSavedView(activeSavedView);
    if (nextGrouping) setGrouping(nextGrouping);
  }, [activeSavedView]);

  const statusCounts = React.useMemo(
    () => countBy(issues, (issue) => normalizeValue(issue.frontmatter.status)),
    [issues],
  );
  const priorityCounts = React.useMemo(
    () => countBy(issues, (issue) => normalizeValue(issue.frontmatter.priority)),
    [issues],
  );
  const assigneeCounts = React.useMemo(
    () => countBy(issues, (issue) => issue.frontmatter.assignee?.trim() || "none"),
    [issues],
  );
  const labelCounts = React.useMemo(
    () => countBy(issues, (issue) => issue.frontmatter.labels?.[0] ?? "none"),
    [issues],
  );
  const statusOptions = React.useMemo(() => statusDefinitions(statusCounts), [statusCounts]);
  const priorityOptions = React.useMemo(
    () => priorityDefinitions(priorityCounts),
    [priorityCounts],
  );
  const assigneeOptions = React.useMemo(
    () =>
      assigneeDefinitions({
        counts: assigneeCounts,
        issues,
        profile,
        users,
      }),
    [assigneeCounts, issues, profile, users],
  );
  const labelOptions = React.useMemo(
    () =>
      labelDefinitions({
        counts: labelCounts,
        labels,
      }),
    [labelCounts, labels],
  );
  const rows = React.useMemo(
    () =>
      issues.map((issue) => {
        const ownerRepositoryId = repositoryIdForIssue(issue, repositoryId);

        return issueRow({
          assigneeOptions,
          labelMap,
          issue,
          priorityOptions,
          repositoryDisplayName:
            ownerRepositoryId === undefined
              ? undefined
              : (repositoryMap.get(ownerRepositoryId)?.displayName ?? ownerRepositoryId),
          repositoryId: ownerRepositoryId,
          showRepositoryMeta: globalIssueList,
          statusOptions,
          userMap,
        });
      }),
    [
      assigneeOptions,
      globalIssueList,
      issues,
      labelMap,
      priorityOptions,
      repositoryId,
      repositoryMap,
      statusOptions,
      userMap,
    ],
  );
  const issueById = React.useMemo(
    () => new Map(issues.map((issue) => [issue.id, issue] as const)),
    [issues],
  );
  const handleIssueSelect = React.useCallback(
    (issueId: string) => {
      const issue = issueById.get(issueId);
      onIssueSelect?.({
        issueId,
        repositoryId:
          issue === undefined ? repositoryId : repositoryIdForIssue(issue, repositoryId),
      });
    },
    [issueById, onIssueSelect, repositoryId],
  );
  const rowById = React.useMemo(() => new Map(rows.map((row) => [row.id, row] as const)), [rows]);
  const createGroupAction = React.useCallback(
    (label: string) =>
      onCreateIssue ? (
        <IconButton
          className="size-7"
          icon={<Plus aria-hidden className="size-4" />}
          label={label}
          onClick={onCreateIssue}
          size="sm"
          title={label}
          variant="ghost"
        />
      ) : undefined,
    [onCreateIssue],
  );
  const toggleGroup = React.useCallback((group: IssuesListGroup) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(group.id)) {
        next.delete(group.id);
      } else {
        next.add(group.id);
      }
      return next;
    });
  }, []);
  const groups = React.useMemo(() => {
    if (grouping === "none") return undefined;

    const definitions =
      grouping === "status"
        ? statusOptions
        : grouping === "priority"
          ? priorityOptions
          : grouping === "label"
            ? labelOptions
            : assigneeOptions;

    return definitions
      .map((definition): IssuesListGroup | undefined => {
        const groupId = `${grouping}:${definition.id}`;
        const groupIssues = issues.filter(
          (issue) => groupKeyForIssue(issue, grouping) === definition.id,
        );
        const groupRows = groupIssues.flatMap((issue) => {
          const row = rowById.get(issue.id);
          return row ? [row] : [];
        });

        if (groupRows.length === 0) return undefined;

        return {
          action: createGroupAction(`Create issue in ${String(definition.label)}`),
          collapsed: collapsedGroupIds.has(groupId),
          count: groupRows.length,
          icon: definition.icon,
          id: groupId,
          onToggle: toggleGroup,
          rows: groupRows,
          title: definition.title,
        };
      })
      .filter((group): group is IssuesListGroup => group !== undefined);
  }, [
    assigneeOptions,
    collapsedGroupIds,
    createGroupAction,
    grouping,
    issues,
    labelOptions,
    priorityOptions,
    rowById,
    statusOptions,
    toggleGroup,
  ]);

  const saveCurrentView = React.useCallback(() => {
    const name = window.prompt("Saved view name");
    const trimmedName = name?.trim();

    if (!trimmedName) return;

    createSavedView.mutate({
      groupBy: grouping,
      kind: "list",
      name: trimmedName,
      pinned: true,
      query: effectiveQuery,
    });
  }, [createSavedView, effectiveQuery, grouping]);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="relative min-w-64 max-w-md flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search issues"
              className="h-9 pl-9"
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder="Search issues"
              value={searchText}
            />
          </label>
          {savedViewControlsVisible ? (
            <select
              aria-label="Saved view"
              className="h-9 max-w-56 rounded-md border border-border bg-popover px-3 text-sm font-medium text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onChange={(event) => setLocalActiveViewId(event.currentTarget.value || undefined)}
              value={activeViewId ?? ""}
            >
              <option value="">All issues</option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          ) : null}
          {savedViewControlsVisible && activeViewId ? (
            <IconButton
              icon={<X aria-hidden className="size-4" />}
              label="Clear saved view"
              onClick={() => setLocalActiveViewId(undefined)}
              size="sm"
              title="Clear saved view"
              variant="ghost"
            />
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {savedViewControlsVisible ? (
            <Button
              disabled={createSavedView.isPending}
              leftIcon={<Save aria-hidden className="size-4" />}
              loading={createSavedView.isPending}
              loadingLabel="Saving view"
              onClick={saveCurrentView}
              size="sm"
              variant="outline"
            >
              Save view
            </Button>
          ) : null}
          <ViewOptionsMenu grouping={grouping} onGroupingChange={setGrouping} />
        </div>
      </div>
      <IssuesList
        className="bg-transparent"
        count={issuesQuery.data ? String(issuesQuery.data.entries.length) : undefined}
        density="comfortable"
        emptyState={
          loadingRepository
            ? "Loading repository issues."
            : repositoryId || globalIssueList
              ? "No issues yet."
              : "Choose a repository before creating issues."
        }
        error={issuesQuery.error instanceof Error ? issuesQuery.error.message : undefined}
        groups={groups}
        loading={issuesQuery.isLoading || loadingRepository}
        onRowSelect={handleIssueSelect}
        rowMetaLimit={2}
        rows={rows}
        rowsClassName="grid gap-1"
        selectedRowId={selectedIssueId}
        showHeader={false}
        title={title}
      />
    </div>
  );
};
