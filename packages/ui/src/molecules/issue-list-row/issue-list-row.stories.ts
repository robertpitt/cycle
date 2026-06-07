import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diamond, Euro, GitBranch, Smartphone } from "lucide-react";
import * as React from "react";

import { IssueListRow } from "./index.ts";

const meta = {
  args: {
    assigneeInitials: "BR",
    date: "Jun 5",
    id: "ENG-416",
    priorityTone: "info",
    statusTone: "success",
    title: "Dropdown menu overlaps with submit button",
    updateCount: "1",
  },
  argTypes: {
    priorityTone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
    statusTone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: IssueListRow,
  tags: ["autodocs"],
  title: "Molecules/Issue List Row",
} satisfies Meta<typeof IssueListRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const DenseList: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "overflow-hidden rounded-lg border border-border bg-surface" },
      React.createElement(IssueListRow, {
        assigneeInitials: "BR",
        date: "Jun 5",
        id: "ENG-416",
        meta: [],
        priorityTone: "info",
        title: "Dropdown menu overlaps with submit button",
        updateCount: "1",
      }),
      React.createElement(IssueListRow, {
        assigneeInitials: "RP",
        date: "Jan 16",
        id: "ENG-811",
        meta: [
          {
            icon: React.createElement(Euro, { "aria-hidden": true, className: "size-3.5" }),
            label: "Currency Support",
            tone: "success",
          },
          {
            icon: React.createElement(Diamond, { "aria-hidden": true, className: "size-3.5" }),
            label: "Frontend user dashboard",
          },
        ],
        priorityTone: "neutral",
        title: "State Management for Selected Currency",
        updateCount: "1",
      }),
      React.createElement(IssueListRow, {
        assigneeInitials: "AL",
        date: "Jan 14",
        id: "ENG-786",
        meta: [
          {
            icon: React.createElement(Smartphone, { "aria-hidden": true, className: "size-3.5" }),
            label: "Frontend User Experience",
            tone: "danger",
          },
          {
            icon: React.createElement(GitBranch, { "aria-hidden": true, className: "size-3.5" }),
            label: "Developer release",
            tone: "danger",
          },
        ],
        priorityTone: "neutral",
        title: "Integrate internationalization support",
        updateCount: "1",
      }),
    ),
};
