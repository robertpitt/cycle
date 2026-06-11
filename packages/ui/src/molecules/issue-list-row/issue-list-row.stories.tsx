import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diamond, Euro, GitBranch, Smartphone } from "lucide-react";
import { IssueListRow } from "./index.ts";
const meta = {
  args: {
    assigneeInitials: "BR",
    date: "Jun 5",
    id: "ENG-416",
    priorityTone: "info",
    statusTone: "success",
    title: "Dropdown menu overlaps with submit button",
    updateCount: "1",
  },
  argTypes: {
    priorityTone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
    statusTone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: IssueListRow,
  tags: ["autodocs"],
  title: "Molecules/Issue List Row",
} satisfies Meta<typeof IssueListRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const DenseList: Story = {
  render: () => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssueListRow
        assigneeInitials="BR"
        date="Jun 5"
        id="ENG-416"
        meta={[]}
        priorityTone="info"
        title="Dropdown menu overlaps with submit button"
        updateCount="1"
      />
      <IssueListRow
        assigneeInitials="RP"
        date="Jan 16"
        id="ENG-811"
        meta={[
          {
            icon: <Euro aria-hidden className="size-3.5" />,
            label: "Currency Support",
            tone: "success",
          },
          {
            icon: <Diamond aria-hidden className="size-3.5" />,
            label: "Frontend user dashboard",
          },
        ]}
        priorityTone="neutral"
        title="State Management for Selected Currency"
        updateCount="1"
      />
      <IssueListRow
        assigneeInitials="AL"
        date="Jan 14"
        id="ENG-786"
        meta={[
          {
            icon: <Smartphone aria-hidden className="size-3.5" />,
            label: "Frontend User Experience",
            tone: "danger",
          },
          {
            icon: <GitBranch aria-hidden className="size-3.5" />,
            label: "Developer release",
            tone: "danger",
          },
        ]}
        priorityTone="neutral"
        title="Integrate internationalization support"
        updateCount="1"
      />
    </div>
  ),
};

export const LongId: Story = {
  args: {
    id: "iss_c6e3d13bfe454029bb12be381747f077",
    title: "Long issue identifiers should truncate without overlapping the title text",
  },
};
