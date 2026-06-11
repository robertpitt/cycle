import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inbox, ListTodo, Settings, SquareKanban } from "lucide-react";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { WorkItemRow } from "../../molecules/work-item-row/index.ts";
import {
  WorkspaceFrame,
  WorkspaceShell,
  WorkspaceSidebar,
  WorkspaceSurface,
  WorkspaceTopbar,
  type WorkspaceItem,
  type WorkspaceNavItem,
} from "./index.ts";

const navItems: readonly WorkspaceNavItem[] = [
  {
    count: "3",
    icon: Inbox,
    label: "Inbox",
  },
  {
    count: "12",
    icon: ListTodo,
    label: "Issues",
  },
  {
    icon: SquareKanban,
    label: "Projects",
  },
];

const workspaces: readonly WorkspaceItem[] = [
  {
    expanded: true,
    id: "horizon",
    items: [
      {
        active: true,
        count: "12",
        icon: ListTodo,
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
        icon: Settings,
        id: "settings",
        label: "Settings",
      },
    ],
    label: "Horizon",
  },
  {
    collapsed: true,
    id: "atlas",
    items: [
      {
        count: "6",
        icon: ListTodo,
        id: "issues",
        label: "Issues",
      },
    ],
    label: "Atlas",
  },
];

const meta = {
  component: WorkspaceShell,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Organisms/Workspace Shell",
} satisfies Meta<typeof WorkspaceShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <WorkspaceShell className="p-6" mode="system">
      <WorkspaceFrame className="min-h-[640px]">
        <WorkspaceSidebar
          active="horizon:issues"
          brandLabel="Cycle"
          navItems={navItems}
          searchLabel="Search workspace"
          workspaceLabel="Workspaces"
          workspaces={workspaces}
        />
        <main className="min-w-0">
          <WorkspaceTopbar eyebrow="Horizon workspace" title="Issues" />
          <div className="grid gap-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="info">Active cycle</Badge>
                <Badge appearance="outline">main</Badge>
                <Badge tone="success">Synced</Badge>
              </div>
              <Button size="sm" variant="outline">
                View settings
              </Button>
            </div>
            <WorkspaceSurface className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold tracking-normal">Current work</h2>
                <Badge appearance="outline">3</Badge>
              </div>
              <WorkItemRow
                assigneeInitials="RP"
                id="CYC-104"
                priority="high"
                status="Active"
                statusTone="info"
                title="Repository-backed project import"
              />
              <WorkItemRow
                assigneeInitials="AL"
                id="CYC-092"
                priority="medium"
                status="Review"
                statusTone="warning"
                title="Desktop app window frame pass"
              />
              <WorkItemRow
                assigneeInitials="JD"
                id="CYC-088"
                priority="low"
                status="Backlog"
                title="First-run storage bootstrap"
              />
            </WorkspaceSurface>
          </div>
        </main>
      </WorkspaceFrame>
    </WorkspaceShell>
  ),
};
