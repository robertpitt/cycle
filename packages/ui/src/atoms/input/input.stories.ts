import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Input } from "./index.ts";

const meta = {
  args: {
    placeholder: "name@company.com",
  },
  component: Input,
  tags: ["autodocs"],
  title: "Atoms/Input",
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid max-w-sm gap-3" },
      React.createElement(Input, { placeholder: "Default" }),
      React.createElement(Input, { defaultValue: "robert@example.com" }),
      React.createElement(Input, { "aria-invalid": true, defaultValue: "not-an-email" }),
      React.createElement(Input, { disabled: true, placeholder: "Disabled" }),
    ),
};
