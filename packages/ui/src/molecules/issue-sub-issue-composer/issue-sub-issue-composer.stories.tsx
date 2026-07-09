import type { Meta, StoryObj } from "@storybook/react-vite";
import { Circle, UserRound } from "lucide-react";
import { IssueSubIssueComposer } from "./index.ts";

const assigneeSections = [
  {
    id: "assignee",
    options: [
      { icon: <UserRound aria-hidden className="size-4" />, id: "unassigned", label: "Unassigned" },
      { id: "alex", label: "Alex Morgan" },
    ],
  },
] as const;

const prioritySections = [
  {
    id: "priority",
    options: [
      { id: "none", label: "No priority" },
      { id: "high", label: "High" },
    ],
  },
] as const;

const statusSections = [
  {
    id: "status",
    options: [
      { icon: <Circle aria-hidden className="size-4" />, id: "todo", label: "Todo" },
      {
        icon: <Circle aria-hidden className="size-4 text-warning" />,
        id: "started",
        label: "Started",
      },
    ],
  },
] as const;

const meta = {
  component: IssueSubIssueComposer,
  title: "Molecules/Issue Sub-Issue Composer",
} satisfies Meta<typeof IssueSubIssueComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="rounded-lg border border-border bg-background p-6">
      <IssueSubIssueComposer />
    </div>
  ),
};

export const WithActionsAndProperties: Story = {
  render: () => (
    <div className="rounded-lg border border-border bg-background p-6">
      <IssueSubIssueComposer
        assigneeSections={assigneeSections}
        defaultAssignee="unassigned"
        defaultPriority="none"
        defaultStatus="todo"
        onAttach={() => undefined}
        onCancel={() => undefined}
        onMore={() => undefined}
        onSubmit={() => undefined}
        prioritySections={prioritySections}
        statusSections={statusSections}
      />
    </div>
  ),
};
