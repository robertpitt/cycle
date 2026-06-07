import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { StatusIndicator } from "./index.ts";

const meta = {
  args: {
    label: "In review",
    shape: "ring",
    tone: "success",
  },
  argTypes: {
    shape: {
      control: "select",
      options: ["dot", "ring", "bar"],
    },
    tone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: StatusIndicator,
  tags: ["autodocs"],
  title: "Atoms/Status Indicator",
} satisfies Meta<typeof StatusIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

const tones = ["neutral", "info", "success", "warning", "danger", "accent"] as const;

export const Playground: Story = {};

export const Tones: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-4" },
      ...(["dot", "ring", "bar"] as const).map((shape) =>
        React.createElement(
          "div",
          { className: "flex items-center gap-4", key: shape },
          React.createElement("span", { className: "w-12 text-sm text-muted-foreground" }, shape),
          ...tones.map((tone) =>
            React.createElement(StatusIndicator, {
              key: `${shape}-${tone}`,
              label: `${tone} ${shape}`,
              shape,
              tone,
            }),
          ),
        ),
      ),
    ),
};
