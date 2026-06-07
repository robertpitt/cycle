import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Textarea } from "./index.ts";

const meta = {
  args: {
    placeholder: "Add context for this workspace",
  },
  component: Textarea,
  tags: ["autodocs"],
  title: "Atoms/Textarea",
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid max-w-lg gap-3" },
      React.createElement(Textarea, { placeholder: "Default" }),
      React.createElement(Textarea, {
        defaultValue: "Review scope, owner, and expected launch date.",
      }),
      React.createElement(Textarea, { disabled: true, placeholder: "Disabled" }),
    ),
};
