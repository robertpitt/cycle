import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, CircleDashed, Inbox, Layers2, Settings, SquareStack, Target } from "lucide-react";
import * as React from "react";

import { IssuesSidebar, type IssuesSidebarSection } from "./index.ts";

const sections: readonly IssuesSidebarSection[] = [
  {
    items: [
      { count: "1", icon: Inbox, label: "Inbox" },
      { icon: Target, label: "My issues" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { icon: Target, label: "Initiatives" },
      { icon: Box, label: "Projects" },
      { icon: Layers2, label: "Views" },
      { label: "More" },
    ],
  },
  {
    label: "Your teams",
    items: [
      { icon: Settings, label: "Engineering", showDisclosure: true },
      { count: "39", depth: 1, icon: Target, label: "Triage" },
      { active: true, depth: 1, icon: SquareStack, label: "Issues" },
      { depth: 1, icon: CircleDashed, label: "Cycles" },
      { depth: 2, label: "Current" },
      { depth: 2, label: "Upcoming" },
    ],
  },
];

const meta = {
  args: {
    brandLabel: "Vast.craft",
    sections,
  },
  component: IssuesSidebar,
  tags: ["autodocs"],
  title: "Organisms/Issues Sidebar",
} satisfies Meta<typeof IssuesSidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) =>
    React.createElement(
      "div",
      { className: "h-[680px] w-[300px] overflow-hidden rounded-lg border border-border" },
      React.createElement(IssuesSidebar, args),
    ),
};
