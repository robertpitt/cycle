import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Badge } from "./index.ts";

const meta = {
  args: {
    children: "Active",
    tone: "neutral",
  },
  argTypes: {
    appearance: {
      control: "select",
      options: ["soft", "solid", "outline"],
    },
    tone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: Badge,
  tags: ["autodocs"],
  title: "Atoms/Badge",
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

const tones = ["neutral", "info", "success", "warning", "danger", "accent"] as const;

export const Playground: Story = {};

export const Variants: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex flex-wrap gap-2" },
      ...tones.map((tone) =>
        React.createElement(Badge, { key: tone, tone }, tone[0]?.toUpperCase() + tone.slice(1)),
      ),
    ),
};
