import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diamond, Euro, Smartphone } from "lucide-react";
import * as React from "react";

import { IssuesList } from "./index.ts";

const meta = {
  args: {
    count: "12",
    rows: [
      {
        assigneeInitials: "BR",
        date: "Jun 5",
        id: "ENG-416",
        priorityTone: "info",
        title: "Dropdown menu overlaps with submit button",
        updateCount: "1",
      },
      {
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
        title: "State Management for Selected Currency",
        updateCount: "1",
      },
      {
        assigneeInitials: "AL",
        date: "Jan 14",
        id: "ENG-786",
        meta: [
          {
            icon: React.createElement(Smartphone, {
              "aria-hidden": true,
              className: "size-3.5",
            }),
            label: "Frontend User Experience",
            tone: "danger",
          },
        ],
        title: "Integrate internationalization support",
        updateCount: "1",
      },
    ],
    title: "In Review",
  },
  component: IssuesList,
  tags: ["autodocs"],
  title: "Organisms/Issues List",
} satisfies Meta<typeof IssuesList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) =>
    React.createElement(
      "div",
      { className: "overflow-hidden rounded-lg border border-border bg-surface" },
      React.createElement(IssuesList, args),
    ),
};
