import type { Meta, StoryObj } from "@storybook/react-vite";
import type * as React from "react";
import { CreateIssueDialog } from "./index.ts";

const meta = {
  component: CreateIssueDialog,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Organisms/Create Issue Dialog",
} satisfies Meta<typeof CreateIssueDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

const renderDialog = (props?: React.ComponentProps<typeof CreateIssueDialog>) => (
  <div className="relative min-h-[560px] overflow-hidden rounded-lg border border-border bg-background">
    <CreateIssueDialog {...props} className="absolute" />
  </div>
);

export const Default: Story = {
  render: () => renderDialog(),
};

export const StatusOpen: Story = {
  render: () => renderDialog({ defaultOpenChip: "status" }),
};

export const DarkStatusOpen: Story = {
  globals: {
    theme: "dark",
  },
  render: () =>
    renderDialog({
      defaultOpenChip: "status",
      teamLabel: "Cycle UI",
      title: "Check create issue theme",
    }),
};

export const Filled: Story = {
  render: () =>
    renderDialog({
      assignee: "robert-pitt",
      description:
        "Add a first-class issue dialog API with data-driven property pickers and reusable footer actions.",
      labels: ["feature"],
      priority: "high",
      status: "in-progress",
      teamLabel: "Cycle UI",
      title: "Make create issue dialog data-driven",
    }),
};

export const Saving: Story = {
  render: () =>
    renderDialog({
      createMore: true,
      saving: true,
      teamLabel: "Cycle UI",
      title: "Persist the new issue draft",
    }),
};

export const Error: Story = {
  render: () =>
    renderDialog({
      error: "Unable to create the issue. Check the repository connection and try again.",
      teamLabel: "Cycle UI",
      title: "Handle repository write failures",
    }),
};

export const NarrowViewport: Story = {
  render: () => (
    <div className="relative min-h-[640px] w-[390px] overflow-hidden rounded-lg border border-border bg-background">
      <CreateIssueDialog
        className="absolute"
        description="Narrow layouts should keep title, property chips, errors, and footer actions readable."
        labels={["improvement"]}
        priority="medium"
        status="todo"
        teamLabel="Cycle UI"
        title="Check mobile dialog layout"
      />
    </div>
  ),
};
