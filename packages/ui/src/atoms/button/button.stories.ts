import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Badge } from "../badge/index.ts";
import { Stack } from "../layout/index.ts";
import { Button } from "./index.ts";

const meta = {
  args: {
    children: "Create cycle",
    size: "md",
    variant: "primary",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon"],
    },
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost", "destructive", "link"],
    },
  },
  component: Button,
  tags: ["autodocs"],
  title: "Atoms/Button",
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

const variants = ["primary", "secondary", "outline", "ghost", "destructive", "link"] as const;

const sizes = ["sm", "md", "lg", "icon"] as const;

export const Playground: Story = {};

export const Variants: Story = {
  render: () =>
    React.createElement(
      Stack,
      { gap: "lg" },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-3" },
        ...variants.map((variant) =>
          React.createElement(
            Button,
            { key: variant, variant },
            variant[0]?.toUpperCase() + variant.slice(1),
          ),
        ),
      ),
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center gap-3" },
        React.createElement(Badge, { tone: "info" }, "Default"),
        React.createElement(Button, { loading: true }, "Saving"),
        React.createElement(Button, { disabled: true }, "Disabled"),
      ),
    ),
};

export const Sizes: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex flex-wrap items-center gap-3" },
      ...sizes.map((size) =>
        React.createElement(
          Button,
          { key: size, size, variant: "outline" },
          size === "icon" ? "C" : size.toUpperCase(),
        ),
      ),
    ),
};
