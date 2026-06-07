import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Skeleton } from "./index.ts";

const meta = {
  component: Skeleton,
  tags: ["autodocs"],
  title: "Atoms/Skeleton",
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Line: Story = {
  render: () => React.createElement(Skeleton, { className: "h-4 w-64" }),
};

export const CardPlaceholder: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid max-w-sm gap-4 rounded-lg border border-border bg-elevated p-4" },
      React.createElement(
        "div",
        { className: "flex items-center gap-3" },
        React.createElement(Skeleton, { className: "size-10 rounded-full" }),
        React.createElement(
          "div",
          { className: "grid flex-1 gap-2" },
          React.createElement(Skeleton, { className: "h-4 w-2/3" }),
          React.createElement(Skeleton, { className: "h-3 w-1/2" }),
        ),
      ),
      React.createElement(Skeleton, { className: "h-20 w-full" }),
    ),
};
