import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "./index.ts";

const meta = {
  args: {
    tone: "info",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: Alert,
  tags: ["autodocs"],
  title: "Molecules/Alert",
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) =>
    React.createElement(
      Alert,
      args,
      React.createElement(AlertTitle, null, "Workspace synced"),
      React.createElement(
        AlertDescription,
        null,
        "The latest project state is available across your team.",
      ),
    ),
};

export const Variants: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-3" },
      ...(["info", "success", "warning", "danger"] as const).map((tone) =>
        React.createElement(
          Alert,
          { key: tone, tone },
          React.createElement(AlertTitle, null, tone[0]?.toUpperCase() + tone.slice(1)),
          React.createElement(
            AlertDescription,
            null,
            "Use alert variants to communicate system state with matching semantic color.",
          ),
        ),
      ),
    ),
};
