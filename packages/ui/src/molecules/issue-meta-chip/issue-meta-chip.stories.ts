import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diamond, Euro, GitBranch, Smartphone } from "lucide-react";
import * as React from "react";

import { IssueMetaChip } from "./index.ts";

const meta = {
  args: {
    label: "Currency Support",
    tone: "neutral",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger"],
    },
  },
  component: IssueMetaChip,
  tags: ["autodocs"],
  title: "Molecules/Issue Meta Chip",
} satisfies Meta<typeof IssueMetaChip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ChipSet: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex max-w-4xl flex-wrap gap-2" },
      React.createElement(IssueMetaChip, {
        icon: React.createElement(Euro, { "aria-hidden": true, className: "size-3.5" }),
        label: "Currency Support",
        tone: "success",
      }),
      React.createElement(IssueMetaChip, {
        icon: React.createElement(Smartphone, { "aria-hidden": true, className: "size-3.5" }),
        label: "Frontend User Experience",
        tone: "danger",
      }),
      React.createElement(IssueMetaChip, {
        icon: React.createElement(GitBranch, { "aria-hidden": true, className: "size-3.5" }),
        label: "MIC Release",
        tone: "warning",
      }),
      React.createElement(IssueMetaChip, {
        icon: React.createElement(Diamond, { "aria-hidden": true, className: "size-3.5" }),
        label: "Internal Release",
      }),
    ),
};
