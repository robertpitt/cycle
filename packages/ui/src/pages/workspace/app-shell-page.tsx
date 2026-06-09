import {
  Bell,
  ChevronDown,
  ClipboardList,
  Command,
  FolderOpen,
  GitBranch,
  Inbox,
  LayoutDashboard,
  ListFilter,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback } from "../../atoms/avatar/index.ts";
import { Badge } from "../../atoms/badge/index.ts";
import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Separator } from "../../atoms/separator/index.ts";
import { cn } from "../../lib/index.ts";
import {
  WorkspaceShell,
  WorkspaceSidebar,
  WorkspaceSurface,
  type WorkspaceItem,
  type WorkspaceNavItem,
} from "../../organisms/workspace-shell/index.ts";

type WorkspaceAppShellPageProps = {
  readonly className?: string;
};

type AppShellFrameProps = {
  readonly className?: string;
  readonly collapsed?: boolean;
  readonly compact?: boolean;
  readonly menuOpen?: boolean;
  readonly onToggleSidebar?: () => void;
  readonly title: string;
};

const icon = (Icon: LucideIcon, className = "size-4") => (
  <Icon aria-hidden className={className} strokeWidth={1.8} />
);

const shellNavItems: readonly WorkspaceNavItem[] = [
  {
    count: "5",
    icon: Inbox,
    label: "Inbox",
  },
  {
    count: "24",
    icon: ClipboardList,
    label: "Issues",
  },
  {
    icon: SquareKanban,
    label: "Projects",
  },
  {
    icon: LayoutDashboard,
    label: "Views",
  },
];

const shellWorkspaces: readonly WorkspaceItem[] = [
  {
    expanded: true,
    id: "horizon",
    items: [
      {
        count: "12",
        icon: ClipboardList,
        id: "issues",
        label: "Issues",
      },
      {
        count: "3",
        icon: SquareKanban,
        id: "projects",
        label: "Projects",
      },
      {
        icon: LayoutDashboard,
        id: "views",
        label: "Views",
      },
    ],
    label: "Horizon",
  },
  {
    collapsed: true,
    id: "atlas",
    items: [
      {
        count: "8",
        icon: ClipboardList,
        id: "issues",
        label: "Issues",
      },
      {
        icon: SquareKanban,
        id: "projects",
        label: "Projects",
      },
    ],
    label: "Atlas",
  },
];

const workRows = [
  ["CYC-104", "Repository-backed project import", "Active", "Git"],
  ["CYC-092", "Desktop app window frame pass", "Review", "Shell"],
  ["CYC-088", "First-run storage bootstrap", "Backlog", "Runtime"],
] as const;

const menuItems = [
  ["Create issue", Plus],
  ["Open project folder", FolderOpen],
  ["Switch branch", GitBranch],
  ["Workspace settings", Settings],
] as const;

const SidebarRail = () => (
  <aside className="grid min-h-full grid-rows-[auto_1fr_auto] border-r border-border bg-sidebar p-3 text-sidebar-foreground">
    <div className="grid justify-items-center gap-3">
      <BrandMark showLabel={false} />
      <IconButton icon={icon(Search)} label="Search workspace" size="sm" title="Search workspace" />
    </div>
    <nav
      aria-label="Cycle navigation"
      className="mt-5 grid content-start justify-items-center gap-2"
    >
      {shellNavItems.map((item) => (
        <IconButton
          icon={icon(item.icon)}
          key={item.label}
          label={item.label}
          size="sm"
          title={item.label}
          variant={item.label === "Issues" ? "outline" : "ghost"}
        />
      ))}
    </nav>
    <div className="grid justify-items-center gap-3">
      <Separator />
      <IconButton icon={icon(Settings)} label="Settings" size="sm" title="Settings" />
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">RP</AvatarFallback>
      </Avatar>
    </div>
  </aside>
);

const HeaderMenu = () => (
  <div
    className="absolute right-5 top-[72px] z-10 w-[220px] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-elevated"
    role="menu"
  >
    {menuItems.map(([label, Icon]) => (
      <button
        className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground hover:bg-subtle hover:text-foreground"
        key={label}
        role="menuitem"
        type="button"
      >
        {icon(Icon)}
        {label}
      </button>
    ))}
    <Separator className="my-2" />
    <button
      className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground hover:bg-subtle hover:text-foreground"
      role="menuitem"
      type="button"
    >
      {icon(Users)}
      Invite members
    </button>
  </div>
);

const AppHeader = ({
  collapsed = false,
  menuOpen = false,
  onToggleSidebar,
  title,
}: Pick<AppShellFrameProps, "collapsed" | "menuOpen" | "onToggleSidebar" | "title">) => (
  <header className="relative flex min-h-20 items-center justify-between gap-4 border-b border-border px-5 py-4">
    <div className="flex min-w-0 items-center gap-3">
      <IconButton
        aria-pressed={collapsed}
        icon={icon(collapsed ? PanelLeftOpen : PanelLeftClose)}
        label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggleSidebar}
        size="sm"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        variant="outline"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Horizon</span>
          {icon(ChevronDown, "size-3")}
        </div>
        <h2 className="truncate text-xl font-semibold tracking-normal">{title}</h2>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Button className="hidden sm:inline-flex" size="sm" variant="outline">
        {icon(Search)}
        Search
      </Button>
      <IconButton icon={icon(Bell)} label="Notifications" size="sm" title="Notifications" />
      <Button size="sm">
        {icon(Plus)}
        New issue
      </Button>
      <IconButton
        icon={icon(MoreHorizontal)}
        label="Open workspace menu"
        size="sm"
        title="Open workspace menu"
        variant={menuOpen ? "outline" : "ghost"}
      />
    </div>
    {menuOpen ? <HeaderMenu /> : null}
  </header>
);

const ShellBody = ({ compact = false }: Pick<AppShellFrameProps, "compact">) => (
  <div className={cn("grid gap-5 p-5", compact && "gap-4 p-4")}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone="info">Active cycle</Badge>
        <Badge appearance="outline">main</Badge>
        <Badge tone="success">Synced</Badge>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline">
          {icon(ListFilter)}
          Filter
        </Button>
        <Button size="sm" variant="secondary">
          {icon(Command)}
          Command
        </Button>
      </div>
    </div>
    <div className={cn("grid gap-4 xl:grid-cols-[1fr_280px]", compact && "xl:grid-cols-1")}>
      <WorkspaceSurface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Current work</h3>
          <Badge appearance="outline">{workRows.length}</Badge>
        </div>
        {workRows.map(([id, title, status, label]) => (
          <div
            className="grid grid-cols-[82px_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0"
            key={id}
          >
            <span className="text-muted-foreground">{id}</span>
            <span className="min-w-0 truncate text-foreground">{title}</span>
            <span className="flex items-center gap-2">
              <Badge appearance="outline">{label}</Badge>
              <Badge
                tone={status === "Active" ? "info" : status === "Review" ? "warning" : "neutral"}
              >
                {status}
              </Badge>
            </span>
          </div>
        ))}
      </WorkspaceSurface>
      <WorkspaceSurface className={cn("p-4", compact && "hidden")}>
        <h3 className="text-sm font-semibold">Repository</h3>
        <div className="mt-4 grid gap-3 text-sm">
          {[
            ["Branch", "main"],
            ["Storage", "Local Git"],
            ["Changes", "4 pending"],
          ].map(([label, value]) => (
            <div className="flex items-center justify-between gap-4" key={label}>
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </WorkspaceSurface>
    </div>
  </div>
);

const AppShellFrame = ({
  className,
  collapsed = false,
  compact = false,
  menuOpen = false,
  onToggleSidebar,
  title,
}: AppShellFrameProps) => (
  <div
    className={cn(
      "overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated",
      className,
    )}
  >
    <div
      className={cn(
        "grid min-h-[560px]",
        collapsed ? "grid-cols-[72px_minmax(0,1fr)]" : "grid-cols-[280px_minmax(0,1fr)]",
        compact && "min-h-[420px]",
      )}
    >
      {collapsed ? (
        <SidebarRail />
      ) : (
        <WorkspaceSidebar
          active="horizon:issues"
          brandLabel="Cycle"
          className="min-h-full"
          navItems={shellNavItems}
          searchLabel="Search workspace"
          workspaceLabel="Workspaces"
          workspaces={shellWorkspaces}
        />
      )}
      <main className="min-w-0 bg-surface">
        <AppHeader
          collapsed={collapsed}
          menuOpen={menuOpen}
          onToggleSidebar={onToggleSidebar}
          title={title}
        />
        <ShellBody compact={compact} />
      </main>
    </div>
  </div>
);

export const WorkspaceAppShellPage = ({ className }: WorkspaceAppShellPageProps) => {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <WorkspaceShell className={cn("min-h-screen p-6", className)}>
      <main className="mx-auto grid w-full max-w-7xl gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone="info">Electron</Badge>
              <Badge appearance="outline">Desktop shell</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-normal">App Shell</h1>
          </div>
          <Button variant="outline">
            {icon(Settings)}
            Shell settings
          </Button>
        </header>
        <AppShellFrame
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((value) => !value)}
          title="Issues"
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <AppShellFrame collapsed compact title="Collapsed rail" />
          <AppShellFrame compact menuOpen title="Header menu" />
        </div>
      </main>
    </WorkspaceShell>
  );
};
