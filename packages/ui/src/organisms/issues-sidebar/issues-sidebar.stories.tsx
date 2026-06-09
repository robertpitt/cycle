import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Layers2, ListTodo, SquareStack } from "lucide-react";
import { IssuesSidebar, type IssuesSidebarSection } from "./index.ts";
const sections: readonly IssuesSidebarSection[] = [
  {
    label: "Workspaces",
    items: [
      {
        active: true,
        expanded: true,
        icon: SquareStack,
        label: "Horizon",
        showDisclosure: true,
      },
      {
        active: true,
        count: "12",
        depth: 1,
        icon: ListTodo,
        label: "Issues",
      },
      {
        count: "4",
        depth: 1,
        icon: Box,
        label: "Projects",
      },
      {
        depth: 1,
        icon: Layers2,
        label: "Views",
      },
      {
        expanded: true,
        icon: SquareStack,
        label: "Atlas",
        showDisclosure: true,
      },
      {
        count: "6",
        depth: 1,
        icon: ListTodo,
        label: "Issues",
      },
      {
        count: "2",
        depth: 1,
        icon: Box,
        label: "Projects",
      },
      {
        depth: 1,
        icon: Layers2,
        label: "Views",
      },
      {
        expanded: true,
        icon: SquareStack,
        label: "Ledger",
        showDisclosure: true,
      },
      {
        count: "3",
        depth: 1,
        icon: ListTodo,
        label: "Issues",
      },
      {
        depth: 1,
        icon: Box,
        label: "Projects",
      },
      {
        depth: 1,
        icon: Layers2,
        label: "Views",
      },
    ],
  },
];
const meta = {
  args: {
    brandLabel: "Cycle",
    sections,
  },
  component: IssuesSidebar,
  tags: ["autodocs"],
  title: "Organisms/Issues Sidebar",
} satisfies Meta<typeof IssuesSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: (args) => (
    <div className="h-[680px] w-[300px] overflow-hidden rounded-lg border border-border">
      <IssuesSidebar {...args} />
    </div>
  ),
};
