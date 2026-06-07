import {
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ClipboardList,
  Command,
  Download,
  GitBranch,
  Globe2,
  Inbox,
  LayoutDashboard,
  Moon,
  MoreHorizontal,
  Settings,
  SquareKanban,
  Upload,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

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
  type WorkspaceNavItem,
  type WorkspaceTeamItem,
} from "../../organisms/workspace-shell/index.ts";

const h = React.createElement;

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

const icon = (Icon: LucideIcon, className = "size-4") =>
  h(Icon, { "aria-hidden": true, className, strokeWidth: 1.8 });

const AuthCard = ({
  children,
  title,
}: {
  readonly children?: React.ReactNode;
  readonly title: string;
}) =>
  h(
    "section",
    {
      className: "grid min-h-[420px] place-items-center rounded-xl bg-surface p-6 shadow-card",
    },
    h(
      "div",
      { className: "grid w-full max-w-[320px] justify-items-center gap-5" },
      h(BrandMark, { label: "Cycle" }),
      h("h2", { className: "text-center text-base font-semibold" }, title),
      children,
    ),
  );

const AuthScreen = ({ children, className }: ShellProps) =>
  h(
    WorkspaceShell,
    { className: cn("grid min-h-screen place-items-center p-6", className) },
    h("div", { className: "w-full max-w-[420px]" }, children),
  );

export const WorkspaceWelcomePage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("min-h-screen p-6", className) },
    h(
      "main",
      {
        className: "mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-5xl content-center gap-12",
      },
      h(
        "header",
        { className: "flex items-center justify-between" },
        h(BrandMark, { label: "Cycle" }),
        h(Button, { variant: "ghost" }, "Sign in"),
      ),
      h(
        "section",
        { className: "grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center" },
        h(
          "div",
          { className: "grid gap-5" },
          h(
            "div",
            { className: "flex flex-wrap gap-2" },
            h(Badge, { tone: "info" }, "Workspace OS"),
            h(Badge, { appearance: "outline" }, "Issues"),
            h(Badge, { appearance: "outline" }, "Cycles"),
          ),
          h(
            "h1",
            {
              className: "max-w-2xl text-5xl font-semibold leading-tight tracking-normal",
            },
            "Build, track, and ship from one focused workspace.",
          ),
          h(
            "p",
            { className: "max-w-xl text-base leading-7 text-muted-foreground" },
            "A quiet interface for engineering teams to plan work, triage issues, and keep momentum visible.",
          ),
          h(
            "div",
            { className: "flex flex-wrap gap-3" },
            h(Button, null, "Create workspace"),
            h(Button, { variant: "outline" }, "Import workspace"),
          ),
        ),
        h(
          WorkspaceSurface,
          { className: "overflow-hidden" },
          h(
            "div",
            { className: "border-b border-border p-5" },
            h("p", { className: "text-sm text-muted-foreground" }, "Engineering"),
            h("h2", { className: "mt-1 text-xl font-semibold" }, "Active issues"),
          ),
          issues.slice(0, 4).map((issue) => h(WorkItemRow, { ...issue, key: issue.id })),
        ),
      ),
    ),
  );

export const WorkspaceSignInPage = ({ className }: WorkspacePageProps) =>
  h(
    AuthScreen,
    { className },
    h(
      AuthCard,
      { title: "Sign in" },
      h(Input, {
        className: "text-center",
        placeholder: "name@company.com",
      }),
      h(Button, null, "Continue"),
      h(
        "p",
        { className: "text-center text-xs leading-5 text-muted-foreground" },
        "Use SSO, email, or a workspace invite to continue.",
      ),
    ),
  );

export const WorkspaceCreateOrImportPage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("grid min-h-screen place-items-center p-6", className) },
    h(
      "main",
      { className: "grid w-full max-w-4xl gap-8" },
      h(
        "div",
        { className: "grid justify-items-center gap-3 text-center" },
        h(BrandMark, { label: "Cycle" }),
        h("h1", { className: "text-3xl font-semibold" }, "Create or import workspace"),
        h(
          "p",
          { className: "max-w-lg text-sm leading-6 text-muted-foreground" },
          "Start fresh or bring in an existing backlog, labels, members, and projects.",
        ),
      ),
      h(
        "div",
        { className: "grid gap-4 md:grid-cols-2" },
        h(
          WorkspaceSurface,
          { className: "grid gap-5 p-6" },
          h(
            "div",
            {
              className: "grid size-10 place-items-center rounded-lg bg-primary/15 text-primary",
            },
            icon(Upload),
          ),
          h(
            "div",
            null,
            h("h2", { className: "text-lg font-semibold" }, "Create workspace"),
            h(
              "p",
              { className: "mt-2 text-sm leading-6 text-muted-foreground" },
              "Set up teams, issue views, cycles, and workspace preferences from scratch.",
            ),
          ),
          h(
            "div",
            { className: "grid gap-3" },
            h(Input, { placeholder: "Workspace name" }),
            h(Input, { placeholder: "app.company/workspace" }),
          ),
          h(Button, null, "Create workspace"),
        ),
        h(
          WorkspaceSurface,
          { className: "grid gap-5 p-6" },
          h(
            "div",
            {
              className: "grid size-10 place-items-center rounded-lg bg-accent/15 text-accent",
            },
            icon(Download),
          ),
          h(
            "div",
            null,
            h("h2", { className: "text-lg font-semibold" }, "Import workspace"),
            h(
              "p",
              { className: "mt-2 text-sm leading-6 text-muted-foreground" },
              "Connect another tool or upload a project export to migrate existing work.",
            ),
          ),
          h(
            "div",
            { className: "grid gap-2 text-sm text-muted-foreground" },
            "Import issues and projects",
            "Map statuses and labels",
            "Invite members after review",
          ),
          h(Button, { variant: "outline" }, "Choose import source"),
        ),
      ),
    ),
  );

export const WorkspaceCreatePage = ({ className }: WorkspacePageProps) =>
  h(
    AuthScreen,
    { className },
    h(
      AuthCard,
      { title: "Create workspace" },
      h(
        "div",
        { className: "grid w-full gap-3" },
        h(Input, {
          placeholder: "Workspace name",
        }),
        h(Input, {
          placeholder: "app.company/workspace",
        }),
      ),
      h(Button, null, "Create workspace"),
    ),
  );

export const WorkspaceJoinPage = ({ className }: WorkspacePageProps) =>
  h(
    AuthScreen,
    { className },
    h(
      AuthCard,
      { title: "Join Horizon" },
      h(
        "div",
        { className: "flex -space-x-2" },
        ["RP", "AL", "JD"].map((initials) =>
          h(
            Avatar,
            { className: "size-9 border border-surface", key: initials },
            h(AvatarFallback, { className: "text-xs" }, initials),
          ),
        ),
      ),
      h(
        "p",
        { className: "text-center text-sm text-muted-foreground" },
        "You have been invited to collaborate with this workspace.",
      ),
      h(Button, null, "Accept invite"),
    ),
  );

export const WorkspaceVerifyDevicePage = ({ className }: WorkspacePageProps) =>
  h(
    AuthScreen,
    { className },
    h(
      AuthCard,
      { title: "Verify device" },
      h(OtpCodeField),
      h(
        "p",
        { className: "text-center text-xs text-muted-foreground" },
        "Enter the code sent to your email.",
      ),
    ),
  );

const navItems: readonly WorkspaceNavItem[] = [
  { count: "12", icon: Inbox, label: "Inbox" },
  { count: "6", icon: ClipboardList, label: "My issues" },
  { icon: LayoutDashboard, label: "Views" },
  { count: "3", icon: GitBranch, label: "Cycles" },
  { icon: Globe2, label: "Roadmaps" },
];

const teams: readonly WorkspaceTeamItem[] = [
  { color: "primary", label: "Product" },
  { color: "accent", label: "Design" },
  { color: "success", label: "Engineering" },
];

const renderSidebar = (active: string) =>
  h(WorkspaceSidebar, {
    active,
    brandLabel: "Cycle",
    navItems,
    teams,
  });

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
  ["Cycle ended", "Engineering cycle 24 closed with 18 completed issues.", "2m"],
  ["Mentioned in ENG-842", "Alex asked for review on command menu sections.", "12m"],
  ["Project update", "Roadmap sidebar moved to review.", "1h"],
  ["Import finished", "Currency support backlog was imported successfully.", "3h"],
] as const;

export const WorkspaceInboxPage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("p-6", className) },
    h(
      WorkspaceFrame,
      null,
      renderSidebar("Inbox"),
      h(
        "main",
        { className: "min-w-0" },
        h(WorkspaceTopbar, {
          createLabel: "Create issue",
          eyebrow: "Workspace",
          title: "Inbox",
        }),
        h(
          "div",
          { className: "grid gap-6 p-7 xl:grid-cols-[1fr_320px]" },
          h(
            WorkspaceSurface,
            { className: "overflow-hidden" },
            h(
              "div",
              {
                className: "flex items-center justify-between border-b border-border px-5 py-4",
              },
              h("h2", { className: "text-base font-semibold" }, "Unread"),
              h(Badge, { tone: "info" }, "4"),
            ),
            inboxItems.map(([title, description, time]) =>
              h(
                "div",
                {
                  className:
                    "grid grid-cols-[auto_1fr_auto] gap-3 border-b border-border px-5 py-4 last:border-b-0 hover:bg-subtle/60",
                  key: title,
                },
                h("span", { className: "mt-1 size-2 rounded-full bg-primary" }),
                h(
                  "div",
                  null,
                  h("p", { className: "text-sm font-semibold" }, title),
                  h("p", { className: "mt-1 text-sm text-muted-foreground" }, description),
                ),
                h("span", { className: "text-xs text-muted-foreground" }, time),
              ),
            ),
          ),
          h(
            WorkspaceSurface,
            { className: "p-5" },
            h("h2", { className: "text-base font-semibold" }, "Inbox rules"),
            h(
              "div",
              { className: "mt-4 grid gap-3 text-sm text-muted-foreground" },
              "Mentions and assignments appear first.",
              "Cycle and project updates are grouped.",
              "Imported work is summarized after migration.",
            ),
          ),
        ),
      ),
    ),
  );

export const WorkspaceIssuesPage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("p-6", className) },
    h(
      WorkspaceFrame,
      null,
      renderSidebar("My issues"),
      h(
        "main",
        { className: "min-w-0" },
        h(WorkspaceTopbar, {
          createLabel: "Create issue",
          eyebrow: "Product",
          title: "My issues",
        }),
        h(
          "div",
          { className: "grid gap-6 p-7 xl:grid-cols-[1fr_360px]" },
          h(
            WorkspaceSurface,
            { className: "overflow-hidden" },
            h(
              "div",
              {
                className: "flex items-center justify-between border-b border-border px-4 py-3",
              },
              h("p", { className: "text-sm font-medium" }, "Active"),
              h(Badge, { tone: "info" }, "42 issues"),
            ),
            issues.map((issue) => h(WorkItemRow, { ...issue, key: issue.id })),
          ),
          h(
            "aside",
            { className: "grid content-start gap-4" },
            h(
              WorkspaceSurface,
              { className: "p-5" },
              h("h2", { className: "text-base font-semibold" }, "Cycle health"),
              h(
                "div",
                { className: "my-5 h-2 rounded-full bg-muted" },
                h("div", { className: "h-2 w-[72%] rounded-full bg-primary" }),
              ),
              h(
                "div",
                {
                  className: "grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground",
                },
                h("span", null, "18 done"),
                h("span", null, "9 open"),
                h("span", null, "3 blocked"),
              ),
            ),
            h(
              WorkspaceSurface,
              { className: "p-5" },
              h("h2", { className: "text-base font-semibold" }, "Activity"),
              h(
                "div",
                { className: "mt-4 grid gap-3 text-sm text-muted-foreground" },
                "Alex moved ENG-842 to Review",
                "Maya added roadmap labels",
                "Sam closed notification digest",
              ),
            ),
          ),
        ),
      ),
    ),
  );

const boardColumns = [
  ["Backlog", "Add empty state", "Refine filters", "Import project labels"],
  ["In progress", "Command palette", "Cycle analytics", "Notification digest"],
  ["Review", "Issue properties", "Roadmap sidebar"],
  ["Done", "Keyboard hints", "Workspace switcher"],
] as const;

export const WorkspaceBoardPage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("p-6", className) },
    h(
      WorkspaceFrame,
      null,
      renderSidebar("Roadmaps"),
      h(
        "main",
        { className: "min-w-0" },
        h(WorkspaceTopbar, {
          createLabel: "Create issue",
          eyebrow: "Roadmaps",
          title: "Product roadmap",
        }),
        h(
          "div",
          { className: "grid grid-cols-4 gap-4 overflow-x-auto p-6" },
          boardColumns.map(([column, ...cards]) =>
            h(
              "section",
              { className: "min-w-[260px]", key: column },
              h(
                "div",
                { className: "mb-3 flex items-center justify-between px-1" },
                h("h2", { className: "text-sm font-medium text-foreground" }, column),
                h("span", { className: "text-xs text-muted-foreground" }, cards.length),
              ),
              h(
                "div",
                { className: "grid gap-3" },
                cards.map((card, index) =>
                  h(
                    WorkspaceSurface,
                    { className: "p-4", key: card },
                    h(
                      "div",
                      { className: "mb-4 flex items-center justify-between" },
                      h(Badge, { appearance: "outline" }, `ENG-${730 + index}`),
                      icon(MoreHorizontal, "size-4 text-muted-foreground"),
                    ),
                    h("h3", { className: "text-sm font-medium" }, card),
                    h(
                      "p",
                      {
                        className: "mt-2 text-xs leading-5 text-muted-foreground",
                      },
                      "Connected to roadmap milestones and team cycle scope.",
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

export const WorkspaceIssueDetailPage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("p-6", className) },
    h(
      WorkspaceFrame,
      null,
      renderSidebar("My issues"),
      h(
        "main",
        { className: "relative min-w-0" },
        h(WorkspaceTopbar, {
          createLabel: "Create issue",
          eyebrow: "Issue",
          title: "Command menu sections",
        }),
        h(
          "div",
          { className: "grid gap-6 p-7 xl:grid-cols-[1fr_360px]" },
          h(
            WorkspaceSurface,
            { className: "p-6" },
            h(Badge, { className: "mb-4", tone: "info" }, "ENG-842"),
            h("h2", { className: "text-2xl font-semibold" }, "Ship command menu sections"),
            h(
              "p",
              {
                className: "mt-4 max-w-2xl text-sm leading-6 text-muted-foreground",
              },
              "Group command actions by workspace, issue, project, and navigation context. Preserve keyboard shortcuts and fast filtering.",
            ),
            h(Separator, { className: "my-6" }),
            h(
              "div",
              { className: "grid gap-3" },
              issues.slice(0, 3).map((issue) => h(WorkItemRow, { ...issue, key: issue.id })),
            ),
          ),
          h(
            WorkspaceSurface,
            { className: "p-5" },
            h("h2", { className: "text-base font-semibold" }, "Properties"),
            h(
              "div",
              { className: "mt-5 grid gap-4 text-sm" },
              [
                ["Status", "Review"],
                ["Priority", "High"],
                ["Assignee", "Robert Pitt"],
                ["Team", "Engineering"],
              ].map(([label, value]) =>
                h(
                  "div",
                  {
                    className: "flex items-center justify-between",
                    key: label,
                  },
                  h("span", { className: "text-muted-foreground" }, label),
                  h("span", null, value),
                ),
              ),
            ),
          ),
        ),
        h(
          "div",
          {
            className:
              "absolute right-8 top-28 w-[360px] rounded-2xl border border-border bg-popover p-5 shadow-elevated",
          },
          h(
            "div",
            { className: "flex items-center justify-between" },
            h("h3", { className: "font-semibold" }, "Move issue"),
            icon(MoreHorizontal, "size-4 text-muted-foreground"),
          ),
          h(
            "p",
            { className: "mt-2 text-sm text-muted-foreground" },
            "Select the next status for ENG-842.",
          ),
          h(
            "div",
            { className: "mt-5 grid gap-2" },
            ["Backlog", "In progress", "Review", "Done"].map((item, index) =>
              h(
                "button",
                {
                  className: cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle",
                    index === 2 && "bg-primary/15 text-primary",
                  ),
                  key: item,
                },
                item,
                index === 2 ? icon(Check, "size-4") : null,
              ),
            ),
          ),
          h(
            "div",
            { className: "mt-5 flex justify-end gap-2" },
            h(Button, { variant: "outline" }, "Cancel"),
            h(Button, null, "Apply"),
          ),
        ),
      ),
    ),
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
    label: "Workspace",
  },
  {
    icon: Users,
    items: ["Profile", "Preferences", "Linked Accounts", "Notifications", "Applications", "API"],
    label: "Account",
  },
  {
    icon: SquareKanban,
    items: ["Horizon", "Add team"],
    label: "Teams",
  },
] as const;

const SettingsSidebar = () =>
  h(
    "aside",
    { className: "min-h-[900px] border-r border-border bg-sidebar px-3 py-6" },
    h(
      "div",
      { className: "mb-6 flex items-center gap-3 px-2" },
      icon(Settings, "size-4 text-muted-foreground"),
      h("span", { className: "text-base font-semibold" }, "Settings"),
    ),
    h(
      "div",
      { className: "space-y-7" },
      sidebarGroups.map((group) =>
        h(
          "section",
          { key: group.label },
          h(
            "div",
            {
              className:
                "mb-2 flex items-center gap-2 px-3 text-[13px] font-medium text-foreground",
            },
            icon(group.icon, "size-4 text-muted-foreground"),
            group.label,
          ),
          h(
            "div",
            { className: "space-y-0.5 pl-6" },
            group.items.map((item) =>
              h(
                "div",
                {
                  className: cn(
                    "rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground",
                    item === "Preferences" && "bg-subtle text-foreground",
                  ),
                  key: item,
                },
                item,
              ),
            ),
          ),
        ),
      ),
    ),
  );

const SelectButton = ({ children }: { readonly children?: React.ReactNode }) =>
  h(
    "button",
    {
      className:
        "flex h-8 w-[200px] items-center justify-between rounded-lg border border-input bg-popover px-3 text-[13px]",
    },
    children,
    icon(ChevronDown, "size-4 text-muted-foreground"),
  );

export const WorkspaceSettingsPage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("p-6", className) },
    h(
      "div",
      {
        className:
          "mx-auto grid max-w-[1020px] overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated md:grid-cols-[220px_1fr]",
      },
      h(SettingsSidebar),
      h(
        "main",
        { className: "bg-surface px-10 py-8" },
        h(
          "div",
          { className: "mb-9 flex items-center justify-between" },
          h(
            "div",
            null,
            h("h1", { className: "text-xl font-semibold" }, "Preferences"),
            h(
              "p",
              { className: "mt-1 text-sm text-muted-foreground" },
              "Manage account behavior, interface settings, and workspace defaults.",
            ),
          ),
          h(Button, { variant: "outline" }, icon(Command), "Shortcuts"),
        ),
        h(
          "section",
          { className: "mb-10" },
          h("h2", { className: "mb-4 text-base font-semibold" }, "Profile"),
          h(
            "div",
            {
              className: "grid gap-4 rounded-xl border border-border bg-elevated p-5",
            },
            h(
              "div",
              { className: "flex items-center gap-4" },
              h(
                Avatar,
                { className: "size-11" },
                h(AvatarImage, {
                  alt: "",
                  src: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=96&h=96&fit=crop&crop=faces",
                }),
                h(AvatarFallback, null, "RP"),
              ),
              h(
                "div",
                { className: "flex-1" },
                h("p", { className: "text-sm font-medium" }, "Robert Pitt"),
                h("p", { className: "text-sm text-muted-foreground" }, "robert@example.com"),
              ),
              h(Button, { variant: "outline" }, "Edit"),
            ),
            h(
              "div",
              { className: "grid gap-4 md:grid-cols-2" },
              h(
                Field,
                null,
                h(FieldLabel, { htmlFor: "display-name" }, "Display name"),
                h(Input, {
                  defaultValue: "Robert Pitt",
                  id: "display-name",
                }),
              ),
              h(
                Field,
                null,
                h(FieldLabel, { htmlFor: "timezone" }, "Timezone"),
                h(
                  Select,
                  {
                    defaultValue: "Europe/London",
                    id: "timezone",
                  },
                  h("option", null, "Europe/London"),
                  h("option", null, "America/New_York"),
                ),
              ),
            ),
          ),
        ),
        h(
          "section",
          { className: "mb-10" },
          h("h2", { className: "mb-4 text-base font-semibold" }, "Theme"),
          h(SettingRow, {
            control: h(
              SelectButton,
              null,
              h("span", { className: "inline-flex items-center gap-2" }, icon(Moon), "Dark"),
            ),
            description: "Select or customize your interface color scheme.",
            title: "Interface theme",
          }),
          h(SettingRow, {
            control: h(Switch, { defaultChecked: true }),
            description: "Use transparency in UI elements like the sidebar and modal windows.",
            title: "Translucent UI",
          }),
        ),
        h(
          "section",
          { className: "mb-10" },
          h("h2", { className: "mb-4 text-base font-semibold" }, "Behavior"),
          [
            ["Default home view", "Which view is opened when you open up Cycle.", "Active issues"],
            ["Developer preview", "Enable experimental features.", null],
            ["Open in desktop app", "Automatically open links in desktop app when possible.", null],
            [
              "Auto-assign to self",
              "When creating new issues, always assign them to yourself by default.",
              null,
            ],
            [
              "On git branch copy, move issue to in progress",
              "After copying suggested git branch name, issue status is moved to started state.",
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
          ].map(([title, description, select]) =>
            h(SettingRow, {
              control: select
                ? h(SelectButton, null, select)
                : h(Switch, { defaultChecked: title !== "Developer preview" }),
              description: String(description),
              key: String(title),
              title: String(title),
            }),
          ),
        ),
        h(
          "section",
          null,
          h("h2", { className: "mb-4 text-base font-semibold" }, "Educational"),
          h(SettingRow, {
            control: h(Switch),
            description: "Do not show any keyboard shortcut hints.",
            title: "Disable keyboard shortcut hints",
          }),
        ),
      ),
    ),
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

export const WorkspaceKitOverviewPage = ({ className }: WorkspacePageProps) =>
  h(
    WorkspaceShell,
    { className: cn("p-8", className) },
    h(
      "div",
      { className: "mx-auto grid max-w-6xl gap-8" },
      h(
        "div",
        { className: "flex items-center justify-between" },
        h(
          "div",
          null,
          h("p", { className: "text-sm text-muted-foreground" }, "Design system"),
          h("h1", { className: "mt-2 text-3xl font-semibold" }, "Cycle UI Kit"),
        ),
        h(Badge, { tone: "info" }, "Storybook pages"),
      ),
      h(
        "div",
        { className: "grid gap-5 md:grid-cols-4" },
        kitColors.map(([name, token]) =>
          h(
            "div",
            {
              className: "rounded-xl border border-border bg-elevated p-4 shadow-card",
              key: name,
            },
            h("div", {
              className: "h-16 rounded-lg border border-border",
              style: { background: `var(--cycle-color-${token})` },
            }),
            h("p", { className: "mt-3 text-sm font-medium" }, name),
            h("p", { className: "text-xs text-muted-foreground" }, `--cycle-color-${token}`),
          ),
        ),
      ),
      h(
        "div",
        { className: "grid gap-6 lg:grid-cols-2" },
        h(
          WorkspaceSurface,
          { className: "p-6" },
          h("h2", { className: "mb-5 text-lg font-semibold" }, "Controls"),
          h(
            "div",
            { className: "flex flex-wrap gap-3" },
            h(Button, null, "Primary"),
            h(Button, { variant: "secondary" }, "Secondary"),
            h(Button, { variant: "ghost" }, "Ghost"),
          ),
          h(Separator, { className: "my-6" }),
          h(
            "div",
            { className: "grid gap-4" },
            h(
              Field,
              null,
              h(FieldLabel, null, "Search"),
              h(Input, {
                placeholder: "Search issues",
              }),
            ),
            h(
              "label",
              { className: "flex items-center gap-2 text-sm" },
              h(Checkbox, { defaultChecked: true }),
              "Keyboard shortcuts enabled",
            ),
          ),
        ),
        h(
          WorkspaceSurface,
          { className: "p-6" },
          h("h2", { className: "mb-5 text-lg font-semibold" }, "Status language"),
          h(
            "div",
            { className: "flex flex-wrap gap-2" },
            h(Badge, { tone: "info" }, "Planned"),
            h(Badge, { tone: "success" }, "Healthy"),
            h(Badge, { tone: "warning" }, "At risk"),
            h(Badge, { tone: "danger" }, "Blocked"),
          ),
          h(
            "div",
            { className: "mt-6 grid gap-3" },
            ["Roadmap sync complete", "Cycle scope updated", "Issue triage queued"].map(
              (item, index) =>
                h(
                  "div",
                  {
                    className: "flex items-center gap-3 rounded-lg bg-subtle p-3 text-sm",
                    key: item,
                  },
                  icon([Check, Zap, Bell][index] as LucideIcon, "size-4 text-primary"),
                  item,
                ),
            ),
          ),
        ),
      ),
    ),
  );
