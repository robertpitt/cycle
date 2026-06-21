import type {
  LabelDefinitionDocument,
  SavedViewDocument,
  TicketDocument,
  TicketQuery,
  UserProfileDocument,
} from "@cycle/contracts";
import { Button, DateTime, IconButton, Input, Select } from "@cycle/ui/atoms";
import {
  IssueAssigneeMark,
  IssuePriorityMark,
  IssuePropertyOptionMenu,
  IssueStatusMark,
  type IssuePropertyMenuOption,
} from "@cycle/ui/molecules";
import { IssuesList, type IssuesListGroup, type IssuesListProps } from "@cycle/ui/organisms";
import { cn } from "@cycle/ui/utils";
import { Plus, Save, Search, SlidersHorizontal, X } from "lucide-react";
import * as React from "react";
import type { ProfileConfig } from "../../shared/AppConfig.ts";
import { useCreateSavedViewMutation } from "../mutations/index.ts";
import { useUpdateIssueMutation } from "../mutations/useUpdateIssueMutation.ts";
import { labelColorClassName } from "../screens/workspace/createIssueOptions.tsx";
import { useIssueListInfiniteQuery } from "../queries/issues.ts";
import {
  useLabelListsByRepositoryQuery,
  useSavedViewListQuery,
  useUserListsByRepositoryQuery,
} from "../queries/metadata.ts";

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

type IssuePanelSelection = {
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
const allIssuesViewValue = "__all_issues__";
const emptyUsers: readonly UserProfileDocument[] = [];
const emptyLabelMap = new Map<string, LabelDefinitionDocument>();
const emptyUserMap = new Map<string, UserProfileDocument>();

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

const menuOptionsForIssueProperty = (
  options: readonly IssueMenuOption[],
): readonly IssuePropertyMenuOption[] =>
  options.map((option) => ({
    icon: option.icon,
    label: option.label,
    rightMeta: option.rightMeta,
    value: option.id,
  }));

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
    <IssuePropertyOptionMenu
      disabled={updateIssue.isPending}
      label={`Change priority for ${issue.id}`}
      onChange={(nextPriority) => {
        if (nextPriority === priority) return;
        updateIssue.mutate({
          frontmatter: {
            priority: nextPriority,
          },
          message: `Updated ${issue.id} priority to ${nextPriority}`,
        });
      }}
      options={menuOptionsForIssueProperty(options)}
      stopPropagation
      trigger={<IssuePriorityMark priority={priority} />}
      value={priority}
    />
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
    <IssuePropertyOptionMenu
      disabled={updateIssue.isPending}
      label={`Change status for ${issue.id}`}
      onChange={(nextStatus) => {
        if (nextStatus === status) return;
        updateIssue.mutate({
          frontmatter: {
            status: nextStatus,
          },
          message: `Updated ${issue.id} status to ${nextStatus}`,
        });
      }}
      options={menuOptionsForIssueProperty(options)}
      stopPropagation
      trigger={<IssueStatusMark status={status} />}
      value={status}
    />
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
    <IssuePropertyOptionMenu
      align="end"
      disabled={updateIssue.isPending}
      label={`Change assignee for ${issue.id}`}
      onChange={(nextAssignee) => {
        if (nextAssignee === assignee) return;
        updateIssue.mutate({
          frontmatter: {
            assignee: nextAssignee === "none" ? null : nextAssignee,
          },
          message: `Updated ${issue.id} assignee`,
        });
      }}
      options={menuOptionsForIssueProperty(options)}
      stopPropagation
      trigger={<IssueAssigneeMark name={assigneeLabel ?? issue.frontmatter.assignee} size="md" />}
      value={assignee}
      widthClassName="w-[280px]"
    />
  );
};

const statusDefinitions = (counts: ReadonlyMap<string, number>): readonly IssueGroupDefinition[] =>
  [
    {
      icon: <IssueStatusMark status="in-progress" />,
      id: "in-progress",
      label: "In Progress",
      rightMeta: counts.get("in-progress") ?? 0,
      title: "In Progress",
    },
    {
      icon: <IssueStatusMark status="todo" />,
      id: "todo",
      label: "Todo",
      rightMeta: counts.get("todo") ?? 0,
      title: "Todo",
    },
    {
      icon: <IssueStatusMark status="backlog" />,
      id: "backlog",
      label: "Backlog",
      rightMeta: counts.get("backlog") ?? 0,
      title: "Backlog",
    },
    {
      icon: <IssueStatusMark status="done" />,
      id: "done",
      label: "Done",
      rightMeta: counts.get("done") ?? 0,
      title: "Done",
    },
    {
      icon: <IssueStatusMark status="canceled" />,
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
        icon: <IssueStatusMark status={status} />,
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
      icon: <IssuePriorityMark priority="none" />,
      id: "none",
      label: "No priority",
      rightMeta: counts.get("none") ?? 0,
      title: "No priority",
    },
    {
      icon: <IssuePriorityMark priority="urgent" />,
      id: "urgent",
      label: "Urgent",
      rightMeta: counts.get("urgent") ?? 0,
      title: "Urgent",
    },
    {
      icon: <IssuePriorityMark priority="high" />,
      id: "high",
      label: "High",
      rightMeta: counts.get("high") ?? 0,
      title: "High",
    },
    {
      icon: <IssuePriorityMark priority="medium" />,
      id: "medium",
      label: "Medium",
      rightMeta: counts.get("medium") ?? 0,
      title: "Medium",
    },
    {
      icon: <IssuePriorityMark priority="low" />,
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
        icon: <IssuePriorityMark priority={priority} />,
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
      icon: <IssueAssigneeMark />,
      id: "none",
      label: "No assignee",
      rightMeta: counts.get("none") ?? 0,
      title: "No assignee",
    },
    ...[...assignees.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({
        icon: <IssueAssigneeMark name={name} size="md" />,
        id,
        label: name,
        rightMeta: counts.get(id) ?? 0,
        title: name,
      })),
  ];
};

const assigneeOptionsForIssue = ({
  issue,
  profile,
  users,
}: {
  readonly issue: TicketDocument;
  readonly profile?: ProfileConfig;
  readonly users: readonly UserProfileDocument[];
}): readonly IssueMenuOption[] => {
  const assignees = new Map<string, string>();
  const profileName = profile?.displayName.trim();
  const issueAssignee = issue.frontmatter.assignee?.trim();

  for (const user of users) {
    assignees.set(user.id, user.displayName);
  }

  if (issueAssignee) {
    assignees.set(issueAssignee, assignees.get(issueAssignee) ?? issueAssignee);
  }

  if (assignees.size === 0 && profileName) {
    assignees.set(profileName, profileName);
  }

  return [
    {
      icon: <IssueAssigneeMark />,
      id: "none",
      label: "No assignee",
    },
    ...[...assignees.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({
        icon: <IssueAssigneeMark name={name} size="md" />,
        id,
        label: name,
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
    date: <DateTime fallback={null} format="compactDate" value={issue.frontmatter.updatedAt} />,
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
  const globalIssueList = repositoryIds !== undefined && repositoryIds.length > 0;
  const metadataRepositoryIds = React.useMemo(
    () => (globalIssueList ? repositoryIds : repositoryId === undefined ? [] : [repositoryId]),
    [globalIssueList, repositoryId, repositoryIds],
  );
  const savedViewsQuery = useSavedViewListQuery(repositoryId);
  const labelsQuery = useLabelListsByRepositoryQuery(metadataRepositoryIds, {
    archived: false,
  });
  const usersQuery = useUserListsByRepositoryQuery(metadataRepositoryIds, {
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
  const issuesQuery = useIssueListInfiniteQuery(repositoryId, effectiveQuery, repositoryIds);
  const issues = React.useMemo(
    () => issuesQuery.data?.pages.flatMap((page) => page.entries) ?? [],
    [issuesQuery.data],
  );
  const issueCount = issuesQuery.data
    ? `${issues.length}${issuesQuery.hasNextPage ? "+" : ""}`
    : undefined;
  const metadataLoading =
    metadataRepositoryIds.length > 0 && (labelsQuery.isLoading || usersQuery.isLoading);
  const metadataError = labelsQuery.error ?? usersQuery.error;
  const labelsByRepositoryId = labelsQuery.data;
  const usersByRepositoryId = usersQuery.data;
  const labels = React.useMemo(
    () => Array.from(labelsByRepositoryId.values()).flat(),
    [labelsByRepositoryId],
  );
  const users = React.useMemo(
    () => Array.from(usersByRepositoryId.values()).flat(),
    [usersByRepositoryId],
  );
  const labelMapByRepositoryId = React.useMemo(
    () =>
      new Map(
        Array.from(labelsByRepositoryId.entries()).map(
          ([metadataRepositoryId, repositoryLabels]) =>
            [
              metadataRepositoryId,
              new Map(repositoryLabels.map((label) => [label.id, label] as const)),
            ] as const,
        ),
      ),
    [labelsByRepositoryId],
  );
  const userMapByRepositoryId = React.useMemo(
    () =>
      new Map(
        Array.from(usersByRepositoryId.entries()).map(
          ([metadataRepositoryId, repositoryUsers]) =>
            [
              metadataRepositoryId,
              new Map(repositoryUsers.map((user) => [user.id, user] as const)),
            ] as const,
        ),
      ),
    [usersByRepositoryId],
  );
  const repositoryMap = React.useMemo(
    () => new Map(repositories.map((repository) => [repository.id, repository] as const)),
    [repositories],
  );

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
        const ownerUsers =
          ownerRepositoryId === undefined
            ? emptyUsers
            : (usersByRepositoryId.get(ownerRepositoryId) ?? emptyUsers);

        return issueRow({
          assigneeOptions: assigneeOptionsForIssue({
            issue,
            profile,
            users: ownerUsers,
          }),
          labelMap:
            ownerRepositoryId === undefined
              ? emptyLabelMap
              : (labelMapByRepositoryId.get(ownerRepositoryId) ?? emptyLabelMap),
          issue,
          priorityOptions,
          repositoryDisplayName:
            ownerRepositoryId === undefined
              ? undefined
              : (repositoryMap.get(ownerRepositoryId)?.displayName ?? ownerRepositoryId),
          repositoryId: ownerRepositoryId,
          showRepositoryMeta: globalIssueList,
          statusOptions,
          userMap:
            ownerRepositoryId === undefined
              ? emptyUserMap
              : (userMapByRepositoryId.get(ownerRepositoryId) ?? emptyUserMap),
        });
      }),
    [
      globalIssueList,
      issues,
      labelMapByRepositoryId,
      priorityOptions,
      profile,
      repositoryId,
      repositoryMap,
      statusOptions,
      userMapByRepositoryId,
      usersByRepositoryId,
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
            <Select
              aria-label="Saved view"
              className="max-w-56"
              items={[
                {
                  label: "All issues",
                  value: allIssuesViewValue,
                },
                ...savedViews.map((view) => ({
                  label: view.name,
                  value: view.id,
                })),
              ]}
              onValueChange={(value) => {
                setLocalActiveViewId(value && value !== allIssuesViewValue ? value : undefined);
              }}
              value={activeViewId ?? allIssuesViewValue}
            />
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
          <IssuePropertyOptionMenu
            align="end"
            label="View options"
            onChange={(value) => setGrouping(value as IssueGrouping)}
            options={menuOptionsForIssueProperty(groupingOptions)}
            trigger={<SlidersHorizontal aria-hidden className="size-4" />}
            value={grouping}
            widthClassName="w-[240px]"
          />
        </div>
      </div>
      <IssuesList
        className="bg-transparent"
        count={issueCount}
        density="comfortable"
        emptyState={
          loadingRepository
            ? "Loading repository issues."
            : repositoryId || globalIssueList
              ? "No issues yet."
              : "Choose a repository before creating issues."
        }
        error={
          issuesQuery.error instanceof Error
            ? issuesQuery.error.message
            : metadataError instanceof Error
              ? metadataError.message
              : undefined
        }
        groups={groups}
        loading={issuesQuery.isLoading || metadataLoading || loadingRepository}
        onRowSelect={handleIssueSelect}
        rowMetaLimit={2}
        rows={rows}
        rowsClassName="grid gap-1"
        selectedRowId={selectedIssueId}
        showHeader={false}
        title={title}
      />
      {issuesQuery.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button
            loading={issuesQuery.isFetchingNextPage}
            loadingLabel="Loading more issues"
            onClick={() => {
              void issuesQuery.fetchNextPage();
            }}
            size="sm"
            variant="outline"
          >
            Load more issues
          </Button>
        </div>
      ) : null}
    </div>
  );
};
