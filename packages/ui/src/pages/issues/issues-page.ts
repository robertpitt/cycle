import {
  Bell,
  Box,
  Bug,
  CircleDashed,
  CircleUserRound,
  Diamond,
  Euro,
  Inbox,
  Layers2,
  ListTodo,
  PanelRight,
  Settings,
  Smartphone,
  SquareStack,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { cn } from "../../lib/index.ts";
import { IssuesList, type IssuesListProps } from "../../organisms/issues-list/index.ts";
import { IssuesSidebar, type IssuesSidebarSection } from "../../organisms/issues-sidebar/index.ts";
import { IssuesToolbar, type IssuesToolbarTab } from "../../organisms/issues-toolbar/index.ts";
import { WorkspaceShell } from "../../organisms/workspace-shell/index.ts";

const h = React.createElement;

export type IssuesPageProps = {
  readonly className?: string;
};

type WorkspaceIssue = IssuesListProps["rows"][number] & {
  readonly area: string;
  readonly description: React.ReactNode;
  readonly kind: "bug" | "feature" | "task";
  readonly queue: "active" | "backlog" | "review" | "triage";
  readonly team: "Engineering" | "Infrastructure";
};

const metaIcon = (Icon: LucideIcon) =>
  h(Icon, { "aria-hidden": true, className: "size-3.5", strokeWidth: 1.8 });

const initialRows: readonly WorkspaceIssue[] = [
  {
    area: "Data model",
    assigneeInitials: "",
    date: "Dec 2023",
    description: "Map every external dependency before the migration plan is locked.",
    id: "ENG-139",
    kind: "task",
    meta: [
      { label: "1.0", tone: "warning" },
      { label: "Squad" },
      { label: "Migration", tone: "info" },
    ],
    priorityTone: "info",
    queue: "review",
    team: "Engineering",
    title: "Identify Missing Data Dependencies",
  },
  {
    area: "Forms",
    assigneeInitials: "BR",
    date: "Jun 5",
    description: "Dropdown popups should avoid blocking primary form actions.",
    id: "ENG-416",
    kind: "bug",
    meta: [{ icon: metaIcon(Bug), label: "Regression", tone: "danger" }],
    priorityTone: "danger",
    queue: "triage",
    team: "Engineering",
    title: "Dropdown menu overlaps with submit button",
    updateCount: "1",
  },
  {
    area: "Settings",
    assigneeInitials: "",
    date: "Jan 3",
    description: "Consolidate application settings into workspace-level configuration.",
    id: "ENG-742",
    kind: "feature",
    meta: [{ icon: metaIcon(Settings), label: "Settings Refresh", tone: "warning" }],
    priorityTone: "info",
    queue: "active",
    team: "Engineering",
    title: "Applications",
    updateCount: "1",
  },
  {
    area: "Payments",
    assigneeInitials: "RP",
    date: "Jan 16",
    description: "Persist selected currency across dashboard sessions and reports.",
    id: "ENG-811",
    kind: "task",
    meta: [
      { icon: metaIcon(Euro), label: "Currency Support", tone: "success" },
      { icon: metaIcon(Diamond), label: "Frontend user dashboard" },
    ],
    queue: "review",
    team: "Engineering",
    title: "State Management for Selected Currency",
    updateCount: "1",
  },
  {
    area: "Payments",
    assigneeInitials: "JD",
    date: "Jan 16",
    description: "Format values using the active workspace currency and locale.",
    id: "ENG-810",
    kind: "feature",
    meta: [
      { icon: metaIcon(Euro), label: "Currency Support", tone: "success" },
      { icon: metaIcon(Diamond), label: "Frontend user dashboard" },
    ],
    queue: "active",
    team: "Engineering",
    title: "Localized Currency Formatting",
    updateCount: "1",
  },
  {
    area: "Localization",
    assigneeInitials: "",
    date: "Jan 14",
    description: "Route copy and locale preferences through the workspace runtime.",
    id: "ENG-786",
    kind: "task",
    meta: [
      {
        icon: metaIcon(Smartphone),
        label: "Frontend User Experience",
        tone: "danger",
      },
      { icon: metaIcon(Diamond), label: "Developer release", tone: "danger" },
    ],
    priorityTone: "warning",
    queue: "active",
    team: "Engineering",
    title: "Integrate internationalization support",
    updateCount: "1",
  },
  {
    area: "Design system",
    assigneeInitials: "",
    date: "Jan 14",
    description: "Add responsive keyboard and screen-reader behavior to shared surfaces.",
    id: "ENG-784",
    kind: "task",
    meta: [
      {
        icon: metaIcon(Smartphone),
        label: "Frontend User Experience",
        tone: "danger",
      },
      { icon: metaIcon(Diamond), label: "Frontend Infrastructure", tone: "danger" },
    ],
    queue: "active",
    team: "Infrastructure",
    title: "Add responsive and accessible UI behavior",
    updateCount: "1",
  },
  {
    area: "API",
    assigneeInitials: "",
    date: "Dec 20",
    description: "Return supported currencies from the workspace configuration endpoint.",
    id: "ENG-722",
    kind: "feature",
    meta: [{ icon: metaIcon(Euro), label: "Currency Support Enablement", tone: "success" }],
    queue: "backlog",
    team: "Infrastructure",
    title: "Expose Supported Currencies API",
    updateCount: "1",
  },
  {
    area: "Design",
    assigneeInitials: "",
    date: "Jan 14",
    description: "Prototype compact and expanded currency selector states.",
    id: "ENG-788",
    kind: "feature",
    meta: [
      {
        icon: metaIcon(Smartphone),
        label: "Frontend User Experience foundation",
        tone: "danger",
      },
      { icon: metaIcon(Diamond), label: "Design Systems", tone: "danger" },
    ],
    queue: "backlog",
    team: "Engineering",
    title: "Wireframe currency selector UI",
  },
];

const createDraftIssue = (nextIndex: number): WorkspaceIssue => ({
  area: "Workspace",
  assigneeInitials: "RP",
  date: "Today",
  description: "Track follow-up work from the latest workspace planning review.",
  id: `ENG-${900 + nextIndex}`,
  kind: "task",
  meta: [
    { label: "Storybook", tone: "accent" },
    { label: "Sample data", tone: "info" },
  ],
  priorityTone: "accent",
  queue: "triage",
  team: "Engineering",
  title: "Review interactive workspace state",
  updateCount: "new",
});

const tabDefinitions: readonly Omit<IssuesToolbarTab, "active" | "count">[] = [
  { icon: Settings, label: "Engineering", value: "engineering" },
  { icon: ListTodo, label: "All issues", value: "all" },
  { icon: SquareStack, label: "Active", value: "active" },
  { icon: CircleDashed, label: "Backlog", value: "backlog" },
  { icon: Bug, label: "Recent Urgent Bugs", value: "bugs" },
];

const getTabCount = (tab: string, rows: readonly WorkspaceIssue[]) => {
  if (tab === "active") {
    return rows.filter((row) => row.queue === "active" || row.queue === "review").length;
  }

  if (tab === "backlog") {
    return rows.filter((row) => row.queue === "backlog").length;
  }

  if (tab === "bugs") {
    return rows.filter((row) => row.kind === "bug").length;
  }

  return rows.length;
};

const matchesTab = (issue: WorkspaceIssue, tab: string) => {
  if (tab === "active") {
    return issue.queue === "active" || issue.queue === "review";
  }

  if (tab === "backlog") {
    return issue.queue === "backlog";
  }

  if (tab === "bugs") {
    return issue.kind === "bug";
  }

  return true;
};

const tabTitles: Record<string, string> = {
  active: "Active issues",
  all: "All issues",
  backlog: "Backlog",
  bugs: "Recent Urgent Bugs",
  engineering: "Engineering",
} satisfies Record<string, string>;

export const IssuesPage = ({ className }: IssuesPageProps) => {
  const [activeNav, setActiveNav] = React.useState("issues");
  const [collapsedSections, setCollapsedSections] = React.useState<readonly string[]>([]);
  const [engineeringExpanded, setEngineeringExpanded] = React.useState(true);
  const [displayCompact, setDisplayCompact] = React.useState(false);
  const [filterActive, setFilterActive] = React.useState(false);
  const [issues, setIssues] = React.useState<readonly WorkspaceIssue[]>(initialRows);
  const [layersActive, setLayersActive] = React.useState(true);
  const [notificationsActive, setNotificationsActive] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [selectedRowId, setSelectedRowId] = React.useState<string | undefined>(initialRows[0]?.id);
  const [selectedTab, setSelectedTab] = React.useState("active");

  const toggleSection = React.useCallback((section: IssuesSidebarSection) => {
    if (!section.id) {
      return;
    }

    setCollapsedSections((current) =>
      current.includes(section.id as string)
        ? current.filter((id) => id !== section.id)
        : [...current, section.id as string],
    );
  }, []);

  const filteredIssues = React.useMemo(
    () =>
      issues
        .filter((issue) => matchesTab(issue, selectedTab))
        .filter((issue) => !filterActive || issue.kind === "bug" || issue.updateCount),
    [filterActive, issues, selectedTab],
  );

  React.useEffect(() => {
    if (filteredIssues.length === 0) {
      setSelectedRowId(undefined);
      return;
    }

    if (!selectedRowId || !filteredIssues.some((issue) => issue.id === selectedRowId)) {
      setSelectedRowId(filteredIssues[0]?.id);
    }
  }, [filteredIssues, selectedRowId]);

  const selectedIssue =
    filteredIssues.find((issue) => issue.id === selectedRowId) ??
    issues.find((issue) => issue.id === selectedRowId) ??
    filteredIssues[0];

  const rows: IssuesListProps["rows"] = filteredIssues.map(
    ({
      area: _area,
      description: _description,
      kind: _kind,
      queue: _queue,
      team: _team,
      ...issue
    }) => ({
      ...issue,
      meta: layersActive ? issue.meta : [],
    }),
  );

  const tabs: readonly IssuesToolbarTab[] = tabDefinitions.map((tab) => ({
    ...tab,
    count: getTabCount(tab.value ?? "all", issues),
  }));

  const isSectionCollapsed = (id: string) => collapsedSections.includes(id);

  const sidebarSections: readonly IssuesSidebarSection[] = [
    {
      id: "primary",
      items: [
        { active: activeNav === "inbox", count: "1", icon: Inbox, id: "inbox", label: "Inbox" },
        { active: activeNav === "my-issues", icon: Target, id: "my-issues", label: "My issues" },
      ],
    },
    {
      collapsed: isSectionCollapsed("workspace"),
      collapsible: true,
      id: "workspace",
      items: [
        {
          active: activeNav === "initiatives",
          icon: CircleUserRound,
          id: "initiatives",
          label: "Initiatives",
        },
        { active: activeNav === "projects", icon: Box, id: "projects", label: "Projects" },
        { active: activeNav === "views", icon: Layers2, id: "views", label: "Views" },
        { active: activeNav === "more", id: "more", label: "More" },
      ],
      label: "Workspace",
    },
    {
      collapsed: isSectionCollapsed("teams"),
      collapsible: true,
      id: "teams",
      items: [
        {
          active: activeNav === "engineering",
          expanded: engineeringExpanded,
          icon: Settings,
          id: "engineering",
          label: "Engineering",
          showDisclosure: true,
        },
        {
          active: activeNav === "triage",
          count: issues.filter((issue) => issue.queue === "triage").length,
          depth: 1,
          icon: Target,
          id: "triage",
          label: "Triage",
        },
        {
          active: activeNav === "issues",
          depth: 1,
          icon: SquareStack,
          id: "issues",
          label: "Issues",
        },
        {
          active: activeNav === "cycles",
          depth: 1,
          icon: CircleDashed,
          id: "cycles",
          label: "Cycles",
        },
        { active: activeNav === "current", depth: 2, id: "current", label: "Current" },
        { active: activeNav === "upcoming", depth: 2, id: "upcoming", label: "Upcoming" },
        {
          active: activeNav === "team-projects",
          depth: 1,
          icon: Box,
          id: "team-projects",
          label: "Projects",
        },
        {
          active: activeNav === "team-views",
          depth: 1,
          icon: Layers2,
          id: "team-views",
          label: "Views",
        },
      ],
      label: "Your teams",
    },
  ];

  const createIssue = () => {
    const nextIssue = createDraftIssue(issues.length);

    setIssues((current) => [nextIssue, ...current]);
    setActiveNav("triage");
    setSelectedTab("all");
    setSelectedRowId(nextIssue.id);
    setPanelOpen(true);
  };

  return h(
    WorkspaceShell,
    {
      className: cn(
        "grid min-h-screen place-items-center bg-[radial-gradient(circle_at_72%_18%,#1e7cc6,transparent_34rem),linear-gradient(135deg,#11145f,#27bfd1)] p-8",
        className,
      ),
    },
    h(
      "div",
      {
        className: cn(
          "grid h-[760px] w-full max-w-[1500px] overflow-hidden rounded-2xl border border-white/10 bg-background shadow-elevated md:grid-cols-[300px_minmax(0,1fr)]",
          panelOpen && "xl:grid-cols-[300px_minmax(0,1fr)_340px]",
        ),
      },
      h(IssuesSidebar, {
        brandLabel: "Vast.craft",
        onCreate: createIssue,
        onItemSelect: (item) => {
          if (item.id === "engineering") {
            setEngineeringExpanded((expanded) => !expanded);
          }

          if (item.id) {
            setActiveNav(item.id);
          }

          if (item.id === "issues") {
            setSelectedTab("active");
          }

          if (item.id === "triage") {
            setSelectedTab("all");
            setFilterActive(true);
          }
        },
        onSearch: () => setFilterActive((active) => !active),
        onSectionToggle: toggleSection,
        sections: sidebarSections,
      }),
      h(
        "main",
        { className: "min-w-0 overflow-hidden" },
        h(IssuesToolbar, {
          displayActive: displayCompact,
          displayLabel: displayCompact ? "Compact" : "Comfortable",
          filterActive,
          filterControls: h(
            "span",
            { className: "text-sm text-muted-foreground" },
            `${filteredIssues.length} shown`,
          ),
          filterLabel: filterActive ? "High signal" : "Filter",
          layersActive,
          notificationsActive,
          onCreate: createIssue,
          onDisplay: () => setDisplayCompact((compact) => !compact),
          onFilter: () => setFilterActive((active) => !active),
          onNotifications: () => setNotificationsActive((active) => !active),
          onPanel: () => setPanelOpen((open) => !open),
          onTabSelect: (tab) => {
            if (tab.value) {
              setSelectedTab(tab.value);
            }
          },
          onToggleLayers: () => setLayersActive((active) => !active),
          panelOpen,
          selectedTab,
          tabs,
          title: h(
            "span",
            { className: "inline-flex min-w-0 items-center gap-2" },
            h(PanelRight, { "aria-hidden": true, className: "size-4 shrink-0 text-primary" }),
            h("span", { className: "truncate" }, "Engineering"),
            h("span", { className: "text-muted-foreground" }, ">"),
            h("span", { className: "truncate" }, tabTitles[selectedTab] ?? "Issues"),
          ),
        }),
        notificationsActive
          ? h(
              "div",
              {
                className:
                  "flex h-10 items-center gap-2 border-b border-border bg-accent/10 px-7 text-sm text-accent",
                role: "status",
              },
              h(Bell, { "aria-hidden": true, className: "size-4" }),
              "Watching updates for this workspace",
            )
          : null,
        h(
          "div",
          { className: "min-w-0 overflow-auto" },
          h(IssuesList, {
            count: filteredIssues.length,
            density: displayCompact ? "compact" : "comfortable",
            emptyState: filterActive
              ? "No high-signal issues in this view."
              : "No issues in this view.",
            onCreateIssue: createIssue,
            onRowSelect: setSelectedRowId,
            rowMetaLimit: layersActive ? 3 : 0,
            rows,
            selectedRowId,
            title: selectedTab === "backlog" ? "Backlog" : "In Review",
          }),
        ),
      ),
      panelOpen && selectedIssue
        ? h(
            "aside",
            {
              className:
                "hidden min-w-0 border-l border-border bg-elevated/70 text-elevated-foreground xl:flex xl:flex-col",
            },
            h(
              "div",
              { className: "flex h-12 items-center justify-between border-b border-border px-5" },
              h("span", { className: "text-sm font-semibold" }, selectedIssue.id),
              h(IconButton, {
                icon: h(X, { "aria-hidden": true, className: "size-4" }),
                label: "Close details",
                onClick: () => setPanelOpen(false),
                size: "sm",
              }),
            ),
            h(
              "div",
              { className: "grid gap-5 overflow-auto p-5" },
              h(
                "div",
                { className: "grid gap-2" },
                h(
                  "p",
                  { className: "text-xs font-medium uppercase text-muted-foreground" },
                  selectedIssue.area,
                ),
                h("h2", { className: "text-lg font-semibold leading-6" }, selectedIssue.title),
                h(
                  "p",
                  { className: "text-sm leading-6 text-muted-foreground" },
                  selectedIssue.description,
                ),
              ),
              h(
                "dl",
                { className: "grid gap-3 text-sm" },
                h(
                  "div",
                  { className: "flex items-center justify-between gap-4" },
                  h("dt", { className: "text-muted-foreground" }, "Team"),
                  h("dd", { className: "font-medium" }, selectedIssue.team),
                ),
                h(
                  "div",
                  { className: "flex items-center justify-between gap-4" },
                  h("dt", { className: "text-muted-foreground" }, "Queue"),
                  h("dd", { className: "font-medium capitalize" }, selectedIssue.queue),
                ),
                h(
                  "div",
                  { className: "flex items-center justify-between gap-4" },
                  h("dt", { className: "text-muted-foreground" }, "Kind"),
                  h("dd", { className: "font-medium capitalize" }, selectedIssue.kind),
                ),
              ),
              h(
                "div",
                { className: "flex flex-wrap gap-2" },
                (selectedIssue.meta ?? []).map((item, index) =>
                  h(
                    "span",
                    {
                      className:
                        "inline-flex h-7 items-center gap-1 rounded-full border border-border bg-popover px-2 text-sm text-muted-foreground",
                      key: `${String(item.label)}-${index}`,
                    },
                    item.icon,
                    item.label,
                  ),
                ),
              ),
              h(
                "div",
                { className: "flex gap-2 pt-2" },
                h(Button, { size: "sm" }, "Move forward"),
                h(Button, { size: "sm", variant: "outline" }, "Assign"),
              ),
            ),
          )
        : null,
    ),
  );
};
