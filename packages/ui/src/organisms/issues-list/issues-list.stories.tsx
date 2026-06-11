import type { Meta, StoryObj } from "@storybook/react-vite";
import { Circle, CircleCheck, CircleDashed, Diamond, Euro, Smartphone } from "lucide-react";
import { IssuesList } from "./index.ts";
const meta = {
  args: {
    count: "12",
    rows: [
      {
        assigneeInitials: "BR",
        date: "Jun 5",
        id: "ENG-416",
        priorityTone: "info",
        title: "Dropdown menu overlaps with submit button",
        updateCount: "1",
      },
      {
        assigneeInitials: "RP",
        date: "Jan 16",
        id: "ENG-811",
        meta: [
          {
            icon: <Euro aria-hidden className="size-3.5" />,
            label: "Currency Support",
            tone: "success",
          },
          {
            icon: <Diamond aria-hidden className="size-3.5" />,
            label: "Frontend user dashboard",
          },
        ],
        title: "State Management for Selected Currency",
        updateCount: "1",
      },
      {
        assigneeInitials: "AL",
        date: "Jan 14",
        id: "ENG-786",
        meta: [
          {
            icon: <Smartphone aria-hidden className="size-3.5" />,
            label: "Frontend User Experience",
            tone: "danger",
          },
        ],
        title: "Integrate internationalization support",
        updateCount: "1",
      },
    ],
    title: "In Review",
  },
  component: IssuesList,
  tags: ["autodocs"],
  title: "Organisms/Issues List",
} satisfies Meta<typeof IssuesList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesList {...args} />
    </div>
  ),
};

export const Loading: Story = {
  args: {
    loading: true,
    rows: [],
  },
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesList {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: {
    count: "0",
    emptyState: "No issues in this view.",
    rows: [],
  },
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesList {...args} />
    </div>
  ),
};

export const Error: Story = {
  args: {
    error: "Unable to load issues.",
    rows: [],
  },
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesList {...args} />
    </div>
  ),
};

export const CompactSelected: Story = {
  args: {
    density: "compact",
    selectedRowId: "ENG-811",
  },
  render: (args) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssuesList {...args} />
    </div>
  ),
};

export const GroupedByStatus: Story = {
  args: {
    showHeader: false,
  },
  render: (args) => {
    const rows = meta.args.rows;
    return (
      <div className="bg-background p-3">
        <IssuesList
          {...args}
          groups={[
            {
              count: 1,
              icon: <Circle aria-hidden className="size-4 text-warning" />,
              id: "status:in-progress",
              rows: [rows[0]],
              title: "In Progress",
            },
            {
              count: 1,
              icon: <CircleDashed aria-hidden className="size-4 text-muted-foreground" />,
              id: "status:backlog",
              rows: [rows[1]],
              title: "Backlog",
            },
            {
              count: 1,
              icon: <CircleCheck aria-hidden className="size-4 text-primary" />,
              id: "status:done",
              rows: [rows[2]],
              title: "Done",
            },
          ]}
          rows={rows}
          rowsClassName="grid gap-1"
        />
      </div>
    );
  },
};
