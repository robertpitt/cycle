import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Kbd } from "./index.ts";

const meta = {
  args: {
    children: "K",
  },
  component: Kbd,
  tags: ["autodocs"],
  title: "Atoms/Kbd",
} satisfies Meta<typeof Kbd>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ShortcutSet: Story = {
  render: () =>
    React.createElement(
      "p",
      { className: "flex items-center gap-1.5 text-sm text-muted-foreground" },
      "Open command search with",
      React.createElement(Kbd, null, "Cmd"),
      React.createElement(Kbd, null, "K"),
      "or create with",
      React.createElement(Kbd, null, "C"),
    ),
};
