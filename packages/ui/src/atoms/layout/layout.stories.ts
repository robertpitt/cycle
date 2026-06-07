import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Badge } from "../badge/index.ts";
import { Container, Stack } from "./index.ts";

const meta = {
  parameters: {
    controls: { disable: true },
  },
  title: "Atoms/Layout",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Containers: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-4" },
      ...(["sm", "md", "lg", "xl"] as const).map((size) =>
        React.createElement(
          Container,
          { className: "rounded-md border border-border bg-elevated py-3", key: size, size },
          React.createElement("span", { className: "text-sm text-muted-foreground" }, size),
        ),
      ),
    ),
};

export const StackDirections: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-6" },
      React.createElement(
        Stack,
        { direction: "row", gap: "sm" },
        React.createElement(Badge, null, "Inbox"),
        React.createElement(Badge, null, "Cycles"),
        React.createElement(Badge, null, "Roadmaps"),
      ),
      React.createElement(
        Stack,
        { gap: "sm" },
        React.createElement(Badge, { tone: "info" }, "Product"),
        React.createElement(Badge, { tone: "success" }, "Engineering"),
        React.createElement(Badge, { tone: "warning" }, "Design"),
      ),
    ),
};
