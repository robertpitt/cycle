import {
  Bell,
  Box,
  Bug,
  CircleDashed,
  Diamond,
  Euro,
  Layers2,
  ListTodo,
  PanelRight,
  Settings,
  Smartphone,
  SquareStack,
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
const metaIcon = (Icon: LucideIcon) => <Icon aria-hidden className="size-3.5" strokeWidth={1.8} />;
const initialRows: readonly WorkspaceIssue[] = [
  {
    area: "Data model",
    assigneeInitials: "",
    date: "Dec 2023",
    description: "Map every external dependency before the migration plan is locked.",
    id: "ENG-139",
    kind: "task",
    meta: [
      {
        label: "1.0",
        tone: "warning",
      },
      {
        label: "Squad",
      },
      {
        label: "Migration",
        tone: "info",
      },
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
    meta: [
      {
        icon: metaIcon(Bug),
        label: "Regression",
        tone: "danger",
      },
    ],
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
    meta: [
      {
        icon: metaIcon(Settings),
        label: "Settings Refresh",
        tone: "warning",
      },
    ],
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
      {
        icon: metaIcon(Euro),
        label: "Currency Support",
        tone: "success",
      },
      {
        icon: metaIcon(Diamond),
        label: "Frontend user dashboard",
      },
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
      {
        icon: metaIcon(Euro),
        label: "Currency Support",
        tone: "success",
      },
      {
        icon: metaIcon(Diamond),
        label: "Frontend user dashboard",
      },
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
      {
        icon: metaIcon(Diamond),
        label: "Developer release",
        tone: "danger",
      },
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
      {
        icon: metaIcon(Diamond),
        label: "Frontend Infrastructure",
        tone: "danger",
      },
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
    meta: [
      {
        icon: metaIcon(Euro),
        label: "Currency Support Enablement",
        tone: "success",
      },
    ],
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
      {
        icon: metaIcon(Diamond),
        label: "Design Systems",
        tone: "danger",
      },
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
    {
      label: "Storybook",
      tone: "accent",
    },
    {
      label: "Sample data",
      tone: "info",
    },
  ],
  priorityTone: "accent",
  queue: "triage",
  team: "Engineering",
  title: "Review interactive workspace state",
  updateCount: "new",
});
const tabDefinitions: readonly Omit<IssuesToolbarTab, "active" | "count">[] = [
  {
    icon: SquareStack,
    label: "Horizon",
    value: "workspace",
  },
  {
    icon: ListTodo,
    label: "All issues",
    value: "all",
  },
  {
    icon: SquareStack,
    label: "Active",
    value: "active",
  },
  {
    icon: CircleDashed,
    label: "Backlog",
    value: "backlog",
  },
  {
    icon: Bug,
    label: "Recent Urgent Bugs",
    value: "bugs",
  },
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
  workspace: "Horizon",
} satisfies Record<string, string>;
export const IssuesPage = ({ className }: IssuesPageProps) => {
  const [activeNav, setActiveNav] = React.useState("horizon:issues");
  const [collapsedSections, setCollapsedSections] = React.useState<readonly string[]>([]);
  const [expandedWorkspaces, setExpandedWorkspaces] = React.useState<readonly string[]>([
    "horizon",
    "atlas",
    "ledger",
  ]);
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
  const isWorkspaceExpanded = (id: string) => expandedWorkspaces.includes(id);
  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((current) =>
      current.includes(id) ? current.filter((workspaceId) => workspaceId !== id) : [...current, id],
    );
  };
  const sidebarSections: readonly IssuesSidebarSection[] = [
    {
      collapsed: isSectionCollapsed("workspaces"),
      collapsible: true,
      id: "workspaces",
      items: [
        {
          active: activeNav.startsWith("horizon:"),
          expanded: isWorkspaceExpanded("horizon"),
          icon: SquareStack,
          id: "horizon",
          label: "Horizon",
          showDisclosure: true,
        },
        {
          active: activeNav === "horizon:issues",
          count: issues.filter((issue) => issue.queue === "triage").length,
          depth: 1,
          icon: ListTodo,
          id: "horizon:issues",
          label: "Issues",
        },
        {
          active: activeNav === "horizon:projects",
          depth: 1,
          icon: Box,
          id: "horizon:projects",
          label: "Projects",
        },
        {
          active: activeNav === "horizon:views",
          depth: 1,
          icon: Layers2,
          id: "horizon:views",
          label: "Views",
        },
        {
          active: activeNav.startsWith("atlas:"),
          expanded: isWorkspaceExpanded("atlas"),
          icon: SquareStack,
          id: "atlas",
          label: "Atlas",
          showDisclosure: true,
        },
        {
          active: activeNav === "atlas:issues",
          count: "6",
          depth: 1,
          icon: ListTodo,
          id: "atlas:issues",
          label: "Issues",
        },
        {
          active: activeNav === "atlas:projects",
          count: "2",
          depth: 1,
          icon: Box,
          id: "atlas:projects",
          label: "Projects",
        },
        {
          active: activeNav === "atlas:views",
          depth: 1,
          icon: Layers2,
          id: "atlas:views",
          label: "Views",
        },
        {
          active: activeNav.startsWith("ledger:"),
          expanded: isWorkspaceExpanded("ledger"),
          icon: SquareStack,
          id: "ledger",
          label: "Ledger",
          showDisclosure: true,
        },
        {
          active: activeNav === "ledger:issues",
          count: "3",
          depth: 1,
          icon: ListTodo,
          id: "ledger:issues",
          label: "Issues",
        },
        {
          active: activeNav === "ledger:projects",
          depth: 1,
          icon: Box,
          id: "ledger:projects",
          label: "Projects",
        },
        {
          active: activeNav === "ledger:views",
          depth: 1,
          icon: Layers2,
          id: "ledger:views",
          label: "Views",
        },
      ],
      label: "Workspaces",
    },
  ];
  const createIssue = () => {
    const nextIssue = createDraftIssue(issues.length);
    setIssues((current) => [nextIssue, ...current]);
    setActiveNav("horizon:issues");
    setSelectedTab("all");
    setSelectedRowId(nextIssue.id);
    setPanelOpen(true);
  };
  return (
    <WorkspaceShell
      className={cn(
        "grid min-h-screen place-items-center bg-[radial-gradient(circle_at_72%_18%,#1e7cc6,transparent_34rem),linear-gradient(135deg,#11145f,#27bfd1)] p-8",
        className,
      )}
    >
      <div
        className={cn(
          "grid h-[760px] w-full max-w-[1500px] overflow-hidden rounded-2xl border border-white/10 bg-background shadow-elevated md:grid-cols-[300px_minmax(0,1fr)]",
          panelOpen && "xl:grid-cols-[300px_minmax(0,1fr)_340px]",
        )}
      >
        <IssuesSidebar
          brandLabel="Cycle"
          onCreate={createIssue}
          onItemSelect={(item) => {
            if (item.id === "horizon" || item.id === "atlas" || item.id === "ledger") {
              toggleWorkspace(item.id);
            }
            if (item.id) {
              setActiveNav(item.id);
            }
            if (item.id?.endsWith(":issues")) {
              setSelectedTab("active");
            }
            if (item.id === "horizon:issues") {
              setSelectedTab("all");
              setFilterActive(true);
            }
          }}
          onSearch={() => setFilterActive((active) => !active)}
          onSectionToggle={toggleSection}
          sections={sidebarSections}
        />
        <main className="min-w-0 overflow-hidden">
          <IssuesToolbar
            displayActive={displayCompact}
            displayLabel={displayCompact ? "Compact" : "Comfortable"}
            filterActive={filterActive}
            filterControls={
              <span className="text-sm text-muted-foreground">{`${filteredIssues.length} shown`}</span>
            }
            filterLabel={filterActive ? "High signal" : "Filter"}
            layersActive={layersActive}
            notificationsActive={notificationsActive}
            onCreate={createIssue}
            onDisplay={() => setDisplayCompact((compact) => !compact)}
            onFilter={() => setFilterActive((active) => !active)}
            onNotifications={() => setNotificationsActive((active) => !active)}
            onPanel={() => setPanelOpen((open) => !open)}
            onTabSelect={(tab) => {
              if (tab.value) {
                setSelectedTab(tab.value);
              }
            }}
            onToggleLayers={() => setLayersActive((active) => !active)}
            panelOpen={panelOpen}
            selectedTab={selectedTab}
            tabs={tabs}
            title={
              <span className="inline-flex min-w-0 items-center gap-2">
                <PanelRight aria-hidden className="size-4 shrink-0 text-primary" />
                <span className="truncate">Horizon</span>
                <span className="text-muted-foreground">&gt;</span>
                <span className="truncate">{tabTitles[selectedTab] ?? "Issues"}</span>
              </span>
            }
          />
          {notificationsActive ? (
            <div
              className="flex h-10 items-center gap-2 border-b border-border bg-accent/10 px-7 text-sm text-accent"
              role="status"
            >
              <Bell aria-hidden className="size-4" />
              Watching updates for this workspace
            </div>
          ) : null}
          <div className="min-w-0 overflow-auto">
            <IssuesList
              count={filteredIssues.length}
              density={displayCompact ? "compact" : "comfortable"}
              emptyState={
                filterActive ? "No high-signal issues in this view." : "No issues in this view."
              }
              onCreateIssue={createIssue}
              onRowSelect={setSelectedRowId}
              rowMetaLimit={layersActive ? 3 : 0}
              rows={rows}
              selectedRowId={selectedRowId}
              title={selectedTab === "backlog" ? "Backlog" : "In Review"}
            />
          </div>
        </main>
        {panelOpen && selectedIssue ? (
          <aside className="hidden min-w-0 border-l border-border bg-elevated/70 text-elevated-foreground xl:flex xl:flex-col">
            <div className="flex h-12 items-center justify-between border-b border-border px-5">
              <span className="text-sm font-semibold">{selectedIssue.id}</span>
              <IconButton
                icon={<X aria-hidden className="size-4" />}
                label="Close details"
                onClick={() => setPanelOpen(false)}
                size="sm"
              />
            </div>
            <div className="grid gap-5 overflow-auto p-5">
              <div className="grid gap-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {selectedIssue.area}
                </p>
                <h2 className="text-lg font-semibold leading-6">{selectedIssue.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {selectedIssue.description}
                </p>
              </div>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Team</dt>
                  <dd className="font-medium">{selectedIssue.team}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Queue</dt>
                  <dd className="font-medium capitalize">{selectedIssue.queue}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Kind</dt>
                  <dd className="font-medium capitalize">{selectedIssue.kind}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {(selectedIssue.meta ?? []).map((item, index) => (
                  <span
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-popover px-2 text-sm text-muted-foreground"
                    key={`${String(item.label)}-${index}`}
                  >
                    {item.icon}
                    {item.label}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm">Move forward</Button>
                <Button size="sm" variant="outline">
                  Assign
                </Button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </WorkspaceShell>
  );
};
