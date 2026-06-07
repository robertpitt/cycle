import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bug, CircleDashed, ListTodo, Settings, SquareStack } from "lucide-react";
import * as React from "react";

import { IssuesToolbar } from "./index.ts";

const meta = {
  args: {
    tabs: [
      { active: true, icon: Settings, label: "Engineering" },
      { icon: ListTodo, label: "All issues" },
      { icon: SquareStack, label: "Active" },
      { icon: CircleDashed, label: "Backlog" },
      { icon: Bug, label: "Recent Urgent Bugs" },
    ],
    moreCount: 5,
    title: "Engineering > Active issues",
  },
  component: IssuesToolbar,
  tags: ["autodocs"],
  title: "Organisms/Issues Toolbar",
} satisfies Meta<typeof IssuesToolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) =>
    React.createElement(
      "div",
      { className: "overflow-hidden rounded-lg border border-border bg-surface" },
      React.createElement(IssuesToolbar, args),
    ),
};
