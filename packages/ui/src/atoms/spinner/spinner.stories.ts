import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Spinner } from "./index.ts";

const meta = {
  args: {
    label: "Loading",
  },
  component: Spinner,
  tags: ["autodocs"],
  title: "Atoms/Spinner",
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Sizes: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex items-center gap-4 text-primary" },
      React.createElement(Spinner, { className: "size-3" }),
      React.createElement(Spinner),
      React.createElement(Spinner, { className: "size-6" }),
    ),
};
