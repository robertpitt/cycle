import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { IssueGroupHeader } from "./index.ts";

const meta = {
  args: {
    count: "12",
    statusTone: "success",
    title: "In Review",
  },
  argTypes: {
    statusTone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: IssueGroupHeader,
  tags: ["autodocs"],
  title: "Molecules/Issue Group Header",
} satisfies Meta<typeof IssueGroupHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "overflow-hidden rounded-lg border border-border bg-surface" },
      React.createElement(IssueGroupHeader, { count: "12", title: "In Review" }),
      React.createElement(IssueGroupHeader, {
        count: "8",
        statusTone: "warning",
        title: "Needs Attention",
      }),
      React.createElement(IssueGroupHeader, {
        count: "4",
        statusTone: "neutral",
        title: "Backlog",
      }),
    ),
};
