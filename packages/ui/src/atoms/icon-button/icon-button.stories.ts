import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bell, MoreHorizontal, Plus, Search } from "lucide-react";
import * as React from "react";

import { IconButton } from "./index.ts";

const meta = {
  args: {
    icon: React.createElement(Search, { "aria-hidden": true, className: "size-4" }),
    label: "Search",
    size: "md",
    variant: "ghost",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md"],
    },
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost", "destructive"],
    },
  },
  component: IconButton,
  tags: ["autodocs"],
  title: "Atoms/Icon Button",
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ToolbarSet: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex items-center gap-2" },
      React.createElement(IconButton, {
        icon: React.createElement(Search, { "aria-hidden": true, className: "size-4" }),
        label: "Search",
      }),
      React.createElement(IconButton, {
        icon: React.createElement(Bell, { "aria-hidden": true, className: "size-4" }),
        label: "Notifications",
      }),
      React.createElement(IconButton, {
        icon: React.createElement(MoreHorizontal, { "aria-hidden": true, className: "size-4" }),
        label: "More",
      }),
      React.createElement(IconButton, {
        icon: React.createElement(Plus, { "aria-hidden": true, className: "size-4" }),
        label: "Create",
        variant: "outline",
      }),
    ),
};
