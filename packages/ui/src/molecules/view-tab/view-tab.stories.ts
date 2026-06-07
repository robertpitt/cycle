import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bug, CircleDashed, Layers2, ListTodo, SquareStack } from "lucide-react";
import * as React from "react";

import { ViewTab } from "./index.ts";

const meta = {
  args: {
    active: true,
    label: "Active",
  },
  component: ViewTab,
  tags: ["autodocs"],
  title: "Molecules/View Tab",
} satisfies Meta<typeof ViewTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const TabSet: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex flex-wrap gap-2" },
      React.createElement(ViewTab, {
        icon: React.createElement(Layers2, { "aria-hidden": true, className: "size-4" }),
        label: "Engineering",
        active: true,
      }),
      React.createElement(ViewTab, {
        icon: React.createElement(ListTodo, { "aria-hidden": true, className: "size-4" }),
        label: "All issues",
      }),
      React.createElement(ViewTab, {
        icon: React.createElement(SquareStack, { "aria-hidden": true, className: "size-4" }),
        label: "Active",
      }),
      React.createElement(ViewTab, {
        icon: React.createElement(CircleDashed, { "aria-hidden": true, className: "size-4" }),
        label: "Backlog",
      }),
      React.createElement(ViewTab, {
        icon: React.createElement(Bug, { "aria-hidden": true, className: "size-4" }),
        label: "Recent Urgent Bugs",
      }),
    ),
};
