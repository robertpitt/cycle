import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { BrandMark } from "./index.ts";

const meta = {
  args: {
    label: "Cycle",
    showLabel: true,
  },
  component: BrandMark,
  tags: ["autodocs"],
  title: "Atoms/Brand Mark",
} satisfies Meta<typeof BrandMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const IconOnly: Story = {
  args: {
    showLabel: false,
  },
};

export const CustomMark: Story = {
  render: () =>
    React.createElement(BrandMark, {
      label: "Northstar",
      mark: React.createElement(
        "span",
        {
          "aria-hidden": true,
          className: "grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground",
        },
        "N",
      ),
    }),
};
