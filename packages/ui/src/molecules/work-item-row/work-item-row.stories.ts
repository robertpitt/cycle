import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { WorkItemRow } from "./index.ts";

const meta = {
  args: {
    assigneeInitials: "RP",
    id: "ENG-842",
    priority: "high",
    status: "Review",
    title: "Ship command menu sections",
  },
  argTypes: {
    priority: {
      control: "select",
      options: ["low", "medium", "high"],
    },
  },
  component: WorkItemRow,
  tags: ["autodocs"],
  title: "Molecules/Work Item Row",
} satisfies Meta<typeof WorkItemRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const List: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "max-w-3xl overflow-hidden rounded-lg border border-border bg-elevated" },
      React.createElement(WorkItemRow, {
        assigneeInitials: "RP",
        id: "ENG-842",
        priority: "high",
        status: "Review",
        title: "Ship command menu sections",
      }),
      React.createElement(WorkItemRow, {
        assigneeInitials: "AL",
        id: "ENG-817",
        priority: "medium",
        status: "In progress",
        title: "Improve issue triage keyboard flow",
      }),
      React.createElement(WorkItemRow, {
        assigneeInitials: "JD",
        id: "ENG-806",
        priority: "low",
        status: "Backlog",
        title: "Add empty state for project updates",
      }),
    ),
};
