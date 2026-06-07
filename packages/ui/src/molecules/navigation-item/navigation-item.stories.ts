import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Inbox, Layers, ListChecks } from "lucide-react";
import * as React from "react";

import { NavigationItem } from "./index.ts";

const meta = {
  args: {
    active: false,
    label: "Issues",
  },
  component: NavigationItem,
  tags: ["autodocs"],
  title: "Molecules/Navigation Item",
} satisfies Meta<typeof NavigationItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SidebarSet: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid w-64 gap-1 rounded-lg border border-border bg-sidebar p-2" },
      React.createElement(NavigationItem, {
        count: "1",
        icon: React.createElement(Inbox, { "aria-hidden": true, className: "size-4" }),
        label: "Inbox",
      }),
      React.createElement(NavigationItem, {
        icon: React.createElement(ListChecks, { "aria-hidden": true, className: "size-4" }),
        label: "Issues",
        active: true,
      }),
      React.createElement(NavigationItem, {
        icon: React.createElement(Layers, { "aria-hidden": true, className: "size-4" }),
        label: "Views",
      }),
      React.createElement(NavigationItem, {
        depth: 1,
        icon: React.createElement(Box, { "aria-hidden": true, className: "size-4" }),
        label: "Projects",
      }),
    ),
};
