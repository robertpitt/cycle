import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Select } from "./index.ts";

const meta = {
  component: Select,
  tags: ["autodocs"],
  title: "Atoms/Select",
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () =>
    React.createElement(
      Select,
      { className: "max-w-sm", defaultValue: "product" },
      React.createElement("option", { value: "product" }, "Product"),
      React.createElement("option", { value: "design" }, "Design"),
      React.createElement("option", { value: "engineering" }, "Engineering"),
    ),
};

export const States: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid max-w-sm gap-3" },
      React.createElement(
        Select,
        { defaultValue: "active" },
        React.createElement("option", { value: "active" }, "Active"),
        React.createElement("option", { value: "backlog" }, "Backlog"),
      ),
      React.createElement(
        Select,
        { disabled: true },
        React.createElement("option", null, "Disabled"),
      ),
    ),
};
