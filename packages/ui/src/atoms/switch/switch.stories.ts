import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Switch } from "./index.ts";

const meta = {
  args: {
    defaultChecked: true,
  },
  component: Switch,
  tags: ["autodocs"],
  title: "Atoms/Switch",
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    defaultChecked: true,
  },
};

export const States: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-3" },
      React.createElement(
        "label",
        { className: "flex items-center justify-between gap-6 text-sm" },
        "Enabled",
        React.createElement(Switch, { defaultChecked: true }),
      ),
      React.createElement(
        "label",
        { className: "flex items-center justify-between gap-6 text-sm" },
        "Disabled",
        React.createElement(Switch),
      ),
      React.createElement(
        "label",
        { className: "flex items-center justify-between gap-6 text-sm text-muted-foreground" },
        "Unavailable",
        React.createElement(Switch, { disabled: true }),
      ),
    ),
};
