import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inbox, ListTodo, Plus, Settings, SquareKanban } from "lucide-react";
import { Button } from "../../atoms/button/index.ts";
import {
  AppShellFrame,
  AppShellHeader,
  AppShellMain,
  AppShellRoot,
  AppShellSidebar,
  type AppShellNavSection,
} from "./index.ts";

const navSections: readonly AppShellNavSection[] = [
  {
    id: "workspace",
    items: [
      {
        badge: "3",
        icon: <Inbox aria-hidden className="size-4" />,
        id: "inbox",
        label: "Inbox",
      },
      {
        icon: <ListTodo aria-hidden className="size-4" />,
        id: "issues",
        label: "Issues",
      },
      {
        icon: <SquareKanban aria-hidden className="size-4" />,
        id: "projects",
        label: "Projects",
      },
    ],
    title: "Workspace",
  },
  {
    id: "repositories",
    items: [
      {
        expanded: true,
        id: "repository:horizon",
        label: "Horizon",
        showDisclosure: true,
      },
      {
        depth: 1,
        icon: <ListTodo aria-hidden className="size-3.5" />,
        id: "repository:horizon:issues",
        label: "Issues",
      },
      {
        depth: 1,
        icon: <Settings aria-hidden className="size-3.5" />,
        id: "repository:horizon:settings",
        label: "Settings",
      },
    ],
    title: "Repositories",
  },
];

const ShellExample = ({ collapsed = false }: { readonly collapsed?: boolean }) => (
  <div className="h-[680px] overflow-hidden rounded-lg border border-border bg-background">
    <AppShellRoot className="min-h-[680px]">
      <AppShellFrame className="min-h-[680px]" collapsed={collapsed}>
        <AppShellSidebar
          activeItemId="issues"
          collapsed={collapsed}
          createLabel="Add repository"
          navSections={navSections}
          settingsActive={false}
        />
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-surface">
          <AppShellHeader
            actions={
              <Button leftIcon={<Plus aria-hidden className="size-4" />} size="sm">
                New issue
              </Button>
            }
            breadcrumb="Horizon"
            collapsed={collapsed}
            title="Issues"
          />
          <AppShellMain className="grid place-items-center bg-background/70 p-3">
            <div className="grid w-full max-w-md gap-2 text-center">
              <h2 className="text-base font-semibold tracking-normal">Workspace content</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                App packages own data and route state. The shell owns layout, navigation chrome, and
                action placement.
              </p>
            </div>
          </AppShellMain>
        </div>
      </AppShellFrame>
    </AppShellRoot>
  </div>
);

const meta = {
  component: AppShellRoot,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Organisms/App Shell",
} satisfies Meta<typeof AppShellRoot>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ShellExample />,
};

export const Collapsed: Story = {
  render: () => <ShellExample collapsed />,
};
