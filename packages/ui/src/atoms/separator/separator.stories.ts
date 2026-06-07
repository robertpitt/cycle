import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Separator } from "./index.ts";

const meta = {
  args: {
    decorative: true,
    orientation: "horizontal",
  },
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
  },
  component: Separator,
  tags: ["autodocs"],
  title: "Atoms/Separator",
} satisfies Meta<typeof Separator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Orientations: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-4" },
      React.createElement(
        "div",
        { className: "grid gap-2" },
        React.createElement("p", { className: "text-sm" }, "Horizontal"),
        React.createElement(Separator),
      ),
      React.createElement(
        "div",
        { className: "flex h-16 items-center gap-4" },
        React.createElement("span", { className: "text-sm" }, "Left"),
        React.createElement(Separator, { orientation: "vertical" }),
        React.createElement("span", { className: "text-sm" }, "Right"),
      ),
    ),
};
