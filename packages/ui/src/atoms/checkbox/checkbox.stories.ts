import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Label } from "../label/index.ts";
import { Checkbox } from "./index.ts";

const meta = {
  args: {
    defaultChecked: true,
  },
  component: Checkbox,
  tags: ["autodocs"],
  title: "Atoms/Checkbox",
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-3" },
      React.createElement(
        "label",
        { className: "flex items-center gap-2 text-sm" },
        React.createElement(Checkbox, { defaultChecked: true }),
        "Checked",
      ),
      React.createElement(
        "label",
        { className: "flex items-center gap-2 text-sm" },
        React.createElement(Checkbox),
        "Unchecked",
      ),
      React.createElement(
        "label",
        { className: "flex items-center gap-2 text-sm text-muted-foreground" },
        React.createElement(Checkbox, { disabled: true }),
        "Disabled",
      ),
    ),
};

export const WithLabel: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex items-center gap-2" },
      React.createElement(Checkbox, { id: "checkbox-summary" }),
      React.createElement(Label, { htmlFor: "checkbox-summary" }, "Send summary"),
    ),
};
