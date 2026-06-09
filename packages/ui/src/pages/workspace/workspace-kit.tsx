import {
  ArrowRight,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Command,
  Download,
  FilePlus2,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  HardDrive,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  MoreHorizontal,
  PlusCircle,
  Settings,
  ShieldCheck,
  SquareKanban,
  TerminalSquare,
  Upload,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../atoms/avatar/index.ts";
import { Badge } from "../../atoms/badge/index.ts";
import { BrandMark } from "../../atoms/brand-mark/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { Checkbox } from "../../atoms/checkbox/index.ts";
import { Input } from "../../atoms/input/index.ts";
import { Select } from "../../atoms/select/index.ts";
import { Separator } from "../../atoms/separator/index.ts";
import { Switch } from "../../atoms/switch/index.ts";
import { cn } from "../../lib/index.ts";
import { Field, FieldLabel } from "../../molecules/field/index.ts";
import { OtpCodeField } from "../../molecules/otp-code-field/index.ts";
import { SettingRow } from "../../molecules/setting-row/index.ts";
import { WorkItemRow, type WorkItemPriority } from "../../molecules/work-item-row/index.ts";
import {
  WorkspaceFrame,
  WorkspaceShell,
  WorkspaceSidebar,
  WorkspaceSurface,
  WorkspaceTopbar,
  type WorkspaceItem,
} from "../../organisms/workspace-shell/index.ts";
type WorkspacePageProps = {
  readonly className?: string;
};
type ShellProps = WorkspacePageProps & {
  readonly children?: React.ReactNode;
};
type Issue = {
  readonly assigneeInitials: string;
  readonly id: string;
  readonly priority: WorkItemPriority;
  readonly status: string;
  readonly title: string;
};
const icon = (Icon: LucideIcon, className = "size-4") => (
  <Icon aria-hidden className={className} strokeWidth={1.8} />
);
const AuthCard = ({
  children,
  title,
}: {
  readonly children?: React.ReactNode;
  readonly title: string;
}) => (
  <section className="grid min-h-[420px] place-items-center rounded-xl bg-surface p-6 shadow-card">
    <div className="grid w-full max-w-[320px] justify-items-center gap-5">
      <BrandMark label="Cycle" />
      <h2 className="text-center text-base font-semibold">{title}</h2>
      {children}
    </div>
  </section>
);
const AuthScreen = ({ children, className }: ShellProps) => (
  <WorkspaceShell className={cn("grid min-h-screen place-items-center p-6", className)}>
    <div className="w-full max-w-[420px]">{children}</div>
  </WorkspaceShell>
);
export const WorkspaceWelcomePage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("min-h-screen p-6", className)}>
    <main className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-5xl content-center gap-12">
      <header className="flex items-center justify-between">
        <BrandMark label="Cycle" />
        <Button variant="ghost">Sign in</Button>
      </header>
      <section className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">Workspace OS</Badge>
            <Badge appearance="outline">Issues</Badge>
            <Badge appearance="outline">Cycles</Badge>
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-tight tracking-normal">
            Build, track, and ship from one focused workspace.
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            A quiet interface for engineering teams to plan work, triage issues, and keep momentum
            visible.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button>Create workspace</Button>
            <Button variant="outline">Import workspace</Button>
          </div>
        </div>
        <WorkspaceSurface className="overflow-hidden">
          <div className="border-b border-border p-5">
            <p className="text-sm text-muted-foreground">Engineering</p>
            <h2 className="mt-1 text-xl font-semibold">Active issues</h2>
          </div>
          {issues.slice(0, 4).map((issue) => (
            <WorkItemRow {...issue} key={issue.id} />
          ))}
        </WorkspaceSurface>
      </section>
    </main>
  </WorkspaceShell>
);
export const WorkspaceSignInPage = ({ className }: WorkspacePageProps) => (
  <AuthScreen className={className}>
    <AuthCard title="Sign in">
      <Input className="text-center" placeholder="name@company.com" />
      <Button>Continue</Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Use SSO, email, or a workspace invite to continue.
      </p>
    </AuthCard>
  </AuthScreen>
);
export const WorkspaceCreateOrImportPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("grid min-h-screen place-items-center p-6", className)}>
    <main className="grid w-full max-w-4xl gap-8">
      <div className="grid justify-items-center gap-3 text-center">
        <BrandMark label="Cycle" />
        <h1 className="text-3xl font-semibold">Create or import workspace</h1>
        <p className="max-w-lg text-sm leading-6 text-muted-foreground">
          Start fresh or bring in an existing backlog, labels, members, and projects.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <WorkspaceSurface className="grid gap-5 p-6">
          <div className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
            {icon(Upload)}
          </div>
          <div>
            <h2 className="text-lg font-semibold">Create workspace</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Set up teams, issue views, cycles, and workspace preferences from scratch.
            </p>
          </div>
          <div className="grid gap-3">
            <Input placeholder="Workspace name" />
            <Input placeholder="app.company/workspace" />
          </div>
          <Button>Create workspace</Button>
        </WorkspaceSurface>
        <WorkspaceSurface className="grid gap-5 p-6">
          <div className="grid size-10 place-items-center rounded-lg bg-accent/15 text-accent">
            {icon(Download)}
          </div>
          <div>
            <h2 className="text-lg font-semibold">Import workspace</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Connect another tool or upload a project export to migrate existing work.
            </p>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            Import issues and projectsMap statuses and labelsInvite members after review
          </div>
          <Button variant="outline">Choose import source</Button>
        </WorkspaceSurface>
      </div>
    </main>
  </WorkspaceShell>
);
export const WorkspaceCreatePage = ({ className }: WorkspacePageProps) => (
  <AuthScreen className={className}>
    <AuthCard title="Create workspace">
      <div className="grid w-full gap-3">
        <Input placeholder="Workspace name" />
        <Input placeholder="app.company/workspace" />
      </div>
      <Button>Create workspace</Button>
    </AuthCard>
  </AuthScreen>
);
export const WorkspaceJoinPage = ({ className }: WorkspacePageProps) => (
  <AuthScreen className={className}>
    <AuthCard title="Join Horizon">
      <div className="flex -space-x-2">
        {["RP", "AL", "JD"].map((initials) => (
          <Avatar className="size-9 border border-surface" key={initials}>
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        ))}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        You have been invited to collaborate with this workspace.
      </p>
      <Button>Accept invite</Button>
    </AuthCard>
  </AuthScreen>
);
export const WorkspaceVerifyDevicePage = ({ className }: WorkspacePageProps) => (
  <AuthScreen className={className}>
    <AuthCard title="Verify device">
      <OtpCodeField />
      <p className="text-center text-xs text-muted-foreground">
        Enter the code sent to your email.
      </p>
    </AuthCard>
  </AuthScreen>
);
const workspaceSidebarItems: readonly WorkspaceItem[] = [
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
        count: "4",
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
    expanded: true,
    id: "atlas",
    items: [
      {
        count: "6",
        icon: ClipboardList,
        id: "issues",
        label: "Issues",
      },
      {
        count: "2",
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
    label: "Atlas",
  },
  {
    expanded: true,
    id: "ledger",
    items: [
      {
        count: "3",
        icon: ClipboardList,
        id: "issues",
        label: "Issues",
      },
      {
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
    label: "Ledger",
  },
];
const renderSidebar = (
  active: string,
  workspaces: readonly WorkspaceItem[] = workspaceSidebarItems,
) => (
  <WorkspaceSidebar
    active={active}
    brandLabel="Cycle"
    onAddWorkspace={() => undefined}
    searchLabel="Search workspace"
    workspaceLabel="Workspaces"
    workspaces={workspaces}
  />
);
const issues: readonly Issue[] = [
  {
    assigneeInitials: "RP",
    id: "ENG-842",
    priority: "high",
    status: "Review",
    title: "Ship command menu sections",
  },
  {
    assigneeInitials: "AL",
    id: "ENG-817",
    priority: "medium",
    status: "In progress",
    title: "Improve issue triage keyboard flow",
  },
  {
    assigneeInitials: "JD",
    id: "ENG-806",
    priority: "low",
    status: "Backlog",
    title: "Add empty state for project updates",
  },
  {
    assigneeInitials: "MK",
    id: "ENG-793",
    priority: "high",
    status: "In progress",
    title: "Expose cycle analytics summary",
  },
  {
    assigneeInitials: "SC",
    id: "ENG-755",
    priority: "medium",
    status: "Review",
    title: "Refine notification digest",
  },
];
const inboxItems = [
  ["Workspace added", "Horizon is ready for planning.", "2m"],
  ["Issue linked", "ENG-842 was added to Horizon issues.", "12m"],
  ["Project update", "Atlas moved the onboarding project to review.", "1h"],
  ["View created", "Ledger has a new finance operations view.", "3h"],
] as const;
const startupChecks = [
  ["App data", "Ready", Check, "success"],
  ["Repositories", "Initialising", LoaderCircle, "warning"],
  ["Workspace runtime", "Preparing", CircleDot, "info"],
] as const;
const emptyWorkspaceSidebarItems: readonly WorkspaceItem[] = [
  {
    expanded: true,
    id: "horizon",
    items: [
      {
        count: "8",
        icon: ClipboardList,
        id: "issues",
        label: "Issues",
      },
      {
        icon: LayoutDashboard,
        id: "views",
        label: "Views",
      },
    ],
    label: "Horizon",
  },
];
const projectGuideSteps = [
  [FolderOpen, "Choose folder", "Select the local project directory that Cycle will track."],
  [FolderGit2, "Create repository", "Initialise a Git store when the folder does not have one."],
  [FilePlus2, "Import work", "Bring in issues, docs, labels, and project history."],
] as const;
const repositoryDialogRows = [
  [FolderOpen, "Import source", "~/Projects/mobile-checkout"],
  [GitBranch, "Repository", "No .git directory found"],
  [HardDrive, "Storage mode", "Local Git commits"],
] as const;
export const WorkspaceSplashScreenPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("grid min-h-screen place-items-center p-6", className)}>
    <main className="w-full max-w-[520px]">
      <WorkspaceSurface className="overflow-hidden">
        <div className="grid gap-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <BrandMark label="Cycle" />
            <Badge appearance="outline">First run</Badge>
          </div>
          <div className="grid gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              {icon(LoaderCircle, "size-5 animate-spin")}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">Opening Cycle</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Preparing local app storage and repository state.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[58%] rounded-full bg-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Initialising repositories</p>
          </div>
        </div>
        <div className="grid gap-1 border-t border-border p-3">
          {startupChecks.map(([label, description, Icon, tone]) => (
            <div
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-3"
              key={label}
            >
              <span className="grid size-8 place-items-center rounded-lg bg-subtle text-muted-foreground">
                {icon(Icon, tone === "warning" ? "size-4 animate-spin" : "size-4")}
              </span>
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
              <Badge
                tone={tone === "success" ? "success" : tone === "warning" ? "warning" : "info"}
              >
                {description}
              </Badge>
            </div>
          ))}
        </div>
      </WorkspaceSurface>
    </main>
  </WorkspaceShell>
);
export const WorkspaceNoProjectsPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-6", className)}>
    <WorkspaceFrame className="min-h-[calc(100vh-3rem)]">
      {renderSidebar("horizon", emptyWorkspaceSidebarItems)}
      <main className="min-w-0">
        <WorkspaceTopbar createLabel="Add project" eyebrow="Horizon workspace" title="Projects" />
        <div className="grid gap-5 p-6">
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Workspace projects</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Projects turn a local folder into the planning surface for issues, notes, and
                commits.
              </p>
            </div>
            <Button variant="outline">
              {icon(FolderOpen)}
              Browse folder
            </Button>
          </section>
          <WorkspaceSurface className="grid min-h-[360px] place-items-center p-6">
            <div className="grid w-full max-w-[620px] justify-items-center gap-5 text-center">
              <div className="grid size-14 place-items-center rounded-2xl border border-border bg-primary/15 text-primary">
                {icon(PlusCircle, "size-6")}
              </div>
              <div className="grid gap-2">
                <h2 className="text-2xl font-semibold tracking-normal">Add your first project</h2>
                <p className="max-w-lg text-sm leading-6 text-muted-foreground">
                  Start with a local folder. Cycle will keep planning data beside the work through a
                  Git-backed project store.
                </p>
              </div>
              <ol className="grid w-full gap-0 text-left">
                {projectGuideSteps.map(([Icon, title, description], index) => (
                  <li
                    className="grid grid-cols-[auto_1fr] gap-4 border-t border-border py-3 first:border-t-0"
                    key={title}
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-subtle text-muted-foreground">
                      {icon(Icon, "size-4")}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">
                        {index + 1}. {title}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {description}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap justify-center gap-3">
                <Button>
                  {icon(PlusCircle)}
                  Add project
                </Button>
                <Button variant="outline">Import from Git</Button>
              </div>
            </div>
          </WorkspaceSurface>
        </div>
      </main>
    </WorkspaceFrame>
  </WorkspaceShell>
);
export const WorkspaceGitRepositoryDialogPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-6", className)}>
    <WorkspaceFrame>
      {renderSidebar("horizon", emptyWorkspaceSidebarItems)}
      <main className="relative min-w-0">
        <WorkspaceTopbar
          createLabel="Import project"
          eyebrow="Horizon workspace"
          title="Import mobile-checkout"
        />
        <div className="grid gap-6 p-7 xl:grid-cols-[1fr_320px]">
          <WorkspaceSurface className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <p className="text-sm text-muted-foreground">Project import</p>
              <h2 className="mt-1 text-lg font-semibold">mobile-checkout</h2>
            </div>
            <div className="grid gap-1 p-3">
              {repositoryDialogRows.map(([Icon, label, value]) => (
                <div
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-3"
                  key={label}
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-subtle text-muted-foreground">
                    {icon(Icon, "size-4")}
                  </span>
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="max-w-[220px] truncate text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>
          </WorkspaceSurface>
          <WorkspaceSurface className="p-5">
            <h2 className="text-base font-semibold">Import preview</h2>
            <div className="mt-5 grid gap-4 text-sm">
              {[
                ["Issues", "24 ready"],
                ["Documents", "7 detected"],
                ["Labels", "12 mapped"],
                ["History", "Needs repository"],
              ].map(([label, value]) => (
                <div className="flex items-center justify-between gap-3" key={label}>
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </WorkspaceSurface>
        </div>
        <div className="fixed inset-0 z-20 grid place-items-center bg-overlay/65 p-4 sm:p-6">
          <section
            aria-labelledby="repository-dialog-title"
            aria-modal="true"
            className="w-full max-w-[560px] rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-elevated"
            role="dialog"
          >
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
                {icon(GitPullRequest, "size-5")}
              </span>
              <div className="min-w-0 flex-1">
                <Badge className="mb-3" tone="warning">
                  Repository required
                </Badge>
                <h2 className="text-xl font-semibold tracking-normal" id="repository-dialog-title">
                  No Git repository found
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Cycle stores project state in Git. Initialise a repository now to keep the import
                  history, issues, and workspace metadata versioned from the first commit.
                </p>
              </div>
            </div>
            <div className="my-6 grid gap-3 rounded-xl border border-border bg-subtle/45 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  {icon(TerminalSquare)}
                  Command
                </span>
                <code className="rounded bg-background px-2 py-1 text-xs text-foreground">
                  git init
                </code>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  {icon(ShieldCheck)}
                  First commit
                </span>
                <span className="font-medium">Cycle import baseline</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  {icon(CircleDot)}
                  Location
                </span>
                <span className="min-w-0 truncate font-medium">~/Projects/mobile-checkout</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost">Cancel import</Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline">
                  {icon(FolderOpen)}
                  Choose folder
                </Button>
                <Button>
                  Initialise repository
                  {icon(ArrowRight)}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </WorkspaceFrame>
  </WorkspaceShell>
);
export const WorkspaceInboxPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-6", className)}>
    <WorkspaceFrame>
      {renderSidebar("horizon:issues")}
      <main className="min-w-0">
        <WorkspaceTopbar createLabel="Create issue" eyebrow="Horizon workspace" title="Inbox" />
        <div className="grid gap-6 p-7 xl:grid-cols-[1fr_320px]">
          <WorkspaceSurface className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Unread</h2>
              <Badge tone="info">4</Badge>
            </div>
            {inboxItems.map(([title, description, time]) => (
              <div
                className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-border px-5 py-4 last:border-b-0 hover:bg-subtle/60"
                key={title}
              >
                <span className="mt-1 size-2 rounded-full bg-primary" />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
                <span className="text-xs text-muted-foreground">{time}</span>
              </div>
            ))}
          </WorkspaceSurface>
          <WorkspaceSurface className="p-5">
            <h2 className="text-base font-semibold">Inbox rules</h2>
            <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
              Mentions and assignments appear first.Cycle and project updates are grouped.Imported
              work is summarized after migration.
            </div>
          </WorkspaceSurface>
        </div>
      </main>
    </WorkspaceFrame>
  </WorkspaceShell>
);
export const WorkspaceIssuesPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-6", className)}>
    <WorkspaceFrame>
      {renderSidebar("horizon:issues")}
      <main className="min-w-0">
        <WorkspaceTopbar createLabel="Create issue" eyebrow="Horizon workspace" title="Issues" />
        <div className="grid gap-6 p-7 xl:grid-cols-[1fr_360px]">
          <WorkspaceSurface className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium">Active</p>
              <Badge tone="info">42 issues</Badge>
            </div>
            {issues.map((issue) => (
              <WorkItemRow {...issue} key={issue.id} />
            ))}
          </WorkspaceSurface>
          <aside className="grid content-start gap-4">
            <WorkspaceSurface className="p-5">
              <h2 className="text-base font-semibold">Cycle health</h2>
              <div className="my-5 h-2 rounded-full bg-muted">
                <div className="h-2 w-[72%] rounded-full bg-primary" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                <span>18 done</span>
                <span>9 open</span>
                <span>3 blocked</span>
              </div>
            </WorkspaceSurface>
            <WorkspaceSurface className="p-5">
              <h2 className="text-base font-semibold">Activity</h2>
              <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                Alex moved ENG-842 to ReviewMaya added roadmap labelsSam closed notification digest
              </div>
            </WorkspaceSurface>
          </aside>
        </div>
      </main>
    </WorkspaceFrame>
  </WorkspaceShell>
);
const boardColumns = [
  ["Backlog", "Add empty state", "Refine filters", "Import project labels"],
  ["In progress", "Command palette", "Cycle analytics", "Notification digest"],
  ["Review", "Issue properties", "Roadmap sidebar"],
  ["Done", "Keyboard hints", "Workspace switcher"],
] as const;
export const WorkspaceBoardPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-6", className)}>
    <WorkspaceFrame>
      {renderSidebar("horizon:projects")}
      <main className="min-w-0">
        <WorkspaceTopbar
          createLabel="Create issue"
          eyebrow="Horizon workspace"
          title="Project roadmap"
        />
        <div className="grid grid-cols-4 gap-4 overflow-x-auto p-6">
          {boardColumns.map(([column, ...cards]) => (
            <section className="min-w-[260px]" key={column}>
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-medium text-foreground">{column}</h2>
                <span className="text-xs text-muted-foreground">{cards.length}</span>
              </div>
              <div className="grid gap-3">
                {cards.map((card, index) => (
                  <WorkspaceSurface className="p-4" key={card}>
                    <div className="mb-4 flex items-center justify-between">
                      <Badge appearance="outline">{`ENG-${730 + index}`}</Badge>
                      {icon(MoreHorizontal, "size-4 text-muted-foreground")}
                    </div>
                    <h3 className="text-sm font-medium">{card}</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Connected to workspace projects and issue scope.
                    </p>
                  </WorkspaceSurface>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </WorkspaceFrame>
  </WorkspaceShell>
);
export const WorkspaceIssueDetailPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-6", className)}>
    <WorkspaceFrame>
      {renderSidebar("horizon:issues")}
      <main className="relative min-w-0">
        <WorkspaceTopbar createLabel="Create issue" eyebrow="Issue" title="Command menu sections" />
        <div className="grid gap-6 p-7 xl:grid-cols-[1fr_360px]">
          <WorkspaceSurface className="p-6">
            <Badge className="mb-4" tone="info">
              ENG-842
            </Badge>
            <h2 className="text-2xl font-semibold">Ship command menu sections</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Group command actions by workspace, issue, project, and navigation context. Preserve
              keyboard shortcuts and fast filtering.
            </p>
            <Separator className="my-6" />
            <div className="grid gap-3">
              {issues.slice(0, 3).map((issue) => (
                <WorkItemRow {...issue} key={issue.id} />
              ))}
            </div>
          </WorkspaceSurface>
          <WorkspaceSurface className="p-5">
            <h2 className="text-base font-semibold">Properties</h2>
            <div className="mt-5 grid gap-4 text-sm">
              {[
                ["Status", "Review"],
                ["Priority", "High"],
                ["Assignee", "Robert Pitt"],
                ["Workspace", "Horizon"],
              ].map(([label, value]) => (
                <div className="flex items-center justify-between" key={label}>
                  <span className="text-muted-foreground">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </WorkspaceSurface>
        </div>
        <div className="absolute right-8 top-28 w-[360px] rounded-2xl border border-border bg-popover p-5 shadow-elevated">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Move issue</h3>
            {icon(MoreHorizontal, "size-4 text-muted-foreground")}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Select the next status for ENG-842.</p>
          <div className="mt-5 grid gap-2">
            {["Backlog", "In progress", "Review", "Done"].map((item, index) => (
              <button
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle",
                  index === 2 && "bg-primary/15 text-primary",
                )}
                key={item}
              >
                {item}
                {index === 2 ? icon(Check, "size-4") : null}
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline">Cancel</Button>
            <Button>Apply</Button>
          </div>
        </div>
      </main>
    </WorkspaceFrame>
  </WorkspaceShell>
);
const sidebarGroups = [
  {
    icon: Boxes,
    items: [
      "Overview",
      "General",
      "Security",
      "Members",
      "Labels",
      "Templates",
      "Roadmaps",
      "SLAs",
      "Project Updates",
      "Emojis",
      "Plans",
      "Billing",
      "Import / Export",
      "Integrations",
    ],
    label: "Application",
  },
  {
    icon: Users,
    items: ["Profile", "Preferences", "Linked Accounts", "Notifications", "Applications", "API"],
    label: "Account",
  },
  {
    icon: SquareKanban,
    items: ["Horizon", "Atlas", "Ledger", "Add workspace"],
    label: "Workspaces",
  },
] as const;
const SettingsSidebar = () => (
  <aside className="min-h-[900px] border-r border-border bg-sidebar px-3 py-6">
    <div className="mb-6 flex items-center gap-3 px-2">
      {icon(Settings, "size-4 text-muted-foreground")}
      <span className="text-base font-semibold">Settings</span>
    </div>
    <div className="space-y-7">
      {sidebarGroups.map((group) => (
        <section key={group.label}>
          <div className="mb-2 flex items-center gap-2 px-3 text-[13px] font-medium text-foreground">
            {icon(group.icon, "size-4 text-muted-foreground")}
            {group.label}
          </div>
          <div className="space-y-0.5 pl-6">
            {group.items.map((item) => (
              <div
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground",
                  item === "Preferences" && "bg-subtle text-foreground",
                )}
                key={item}
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  </aside>
);
const SelectButton = ({ children }: { readonly children?: React.ReactNode }) => (
  <button className="flex h-8 w-[200px] items-center justify-between rounded-lg border border-input bg-popover px-3 text-[13px]">
    {children}
    {icon(ChevronDown, "size-4 text-muted-foreground")}
  </button>
);
export const WorkspaceSettingsPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-6", className)}>
    <div className="mx-auto grid max-w-[1020px] overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated md:grid-cols-[220px_1fr]">
      <SettingsSidebar />
      <main className="bg-surface px-10 py-8">
        <div className="mb-9 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Preferences</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage account behavior, interface settings, and workspace defaults.
            </p>
          </div>
          <Button variant="outline">{icon(Command)}Shortcuts</Button>
        </div>
        <section className="mb-10">
          <h2 className="mb-4 text-base font-semibold">Profile</h2>
          <div className="grid gap-4 rounded-xl border border-border bg-elevated p-5">
            <div className="flex items-center gap-4">
              <Avatar className="size-11">
                <AvatarImage
                  alt=""
                  src="https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=96&h=96&fit=crop&crop=faces"
                />
                <AvatarFallback>RP</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-medium">Robert Pitt</p>
                <p className="text-sm text-muted-foreground">robert@example.com</p>
              </div>
              <Button variant="outline">Edit</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                <Input defaultValue="Robert Pitt" id="display-name" />
              </Field>
              <Field>
                <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                <Select defaultValue="Europe/London" id="timezone">
                  <option>Europe/London</option>
                  <option>America/New_York</option>
                </Select>
              </Field>
            </div>
          </div>
        </section>
        <section className="mb-10">
          <h2 className="mb-4 text-base font-semibold">Theme</h2>
          <SettingRow
            control={
              <SelectButton>
                <span className="inline-flex items-center gap-2">{icon(Moon)}Dark</span>
              </SelectButton>
            }
            description="Select or customize your interface color scheme."
            title="Interface theme"
          />
          <SettingRow
            control={<Switch defaultChecked />}
            description="Use transparency in UI elements like the sidebar and modal windows."
            title="Translucent UI"
          />
        </section>
        <section className="mb-10">
          <h2 className="mb-4 text-base font-semibold">Behavior</h2>
          {[
            ["Default home view", "Which view is opened when you open up Cycle.", "Active issues"],
            ["Developer preview", "Enable experimental features.", null],
            ["Open in desktop app", "Automatically open links in desktop app when possible.", null],
            [
              "Auto-assign to self",
              "When creating new issues, always assign them to yourself by default.",
              null,
            ],
            [
              "On suggested action, move issue to in progress",
              "After accepting a suggested action, issue status is moved to started state.",
              null,
            ],
            [
              "Open links in a new window",
              "Always open external links in a new window or tab.",
              null,
            ],
            [
              "Double click to edit",
              "Use double click instead of single click to edit documents and issue descriptions.",
              null,
            ],
          ].map(([title, description, select]) => (
            <SettingRow
              control={
                select ? (
                  <SelectButton>{select}</SelectButton>
                ) : (
                  <Switch defaultChecked={title !== "Developer preview"} />
                )
              }
              description={String(description)}
              key={String(title)}
              title={String(title)}
            />
          ))}
        </section>
        <section>
          <h2 className="mb-4 text-base font-semibold">Educational</h2>
          <SettingRow
            control={<Switch />}
            description="Do not show any keyboard shortcut hints."
            title="Disable keyboard shortcut hints"
          />
        </section>
      </main>
    </div>
  </WorkspaceShell>
);
const kitColors = [
  ["Background", "background"],
  ["Surface", "surface"],
  ["Elevated", "elevated"],
  ["Border", "border"],
  ["Primary", "primary"],
  ["Success", "success"],
  ["Warning", "warning"],
  ["Danger", "destructive"],
] as const;
export const WorkspaceKitOverviewPage = ({ className }: WorkspacePageProps) => (
  <WorkspaceShell className={cn("p-8", className)}>
    <div className="mx-auto grid max-w-6xl gap-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Design system</p>
          <h1 className="mt-2 text-3xl font-semibold">Cycle UI Kit</h1>
        </div>
        <Badge tone="info">Storybook pages</Badge>
      </div>
      <div className="grid gap-5 md:grid-cols-4">
        {kitColors.map(([name, token]) => (
          <div className="rounded-xl border border-border bg-elevated p-4 shadow-card" key={name}>
            <div
              className="h-16 rounded-lg border border-border"
              style={{
                background: `var(--cycle-color-${token})`,
              }}
            />
            <p className="mt-3 text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{`--cycle-color-${token}`}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <WorkspaceSurface className="p-6">
          <h2 className="mb-5 text-lg font-semibold">Controls</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <Separator className="my-6" />
          <div className="grid gap-4">
            <Field>
              <FieldLabel>Search</FieldLabel>
              <Input placeholder="Search issues" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked />
              Keyboard shortcuts enabled
            </label>
          </div>
        </WorkspaceSurface>
        <WorkspaceSurface className="p-6">
          <h2 className="mb-5 text-lg font-semibold">Status language</h2>
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">Planned</Badge>
            <Badge tone="success">Healthy</Badge>
            <Badge tone="warning">At risk</Badge>
            <Badge tone="danger">Blocked</Badge>
          </div>
          <div className="mt-6 grid gap-3">
            {["Roadmap sync complete", "Cycle scope updated", "Issue triage queued"].map(
              (item, index) => (
                <div
                  className="flex items-center gap-3 rounded-lg bg-subtle p-3 text-sm"
                  key={item}
                >
                  {icon([Check, Zap, Bell][index] as LucideIcon, "size-4 text-primary")}
                  {item}
                </div>
              ),
            )}
          </div>
        </WorkspaceSurface>
      </div>
    </div>
  </WorkspaceShell>
);
