import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssueGroupHeader } from "./index.ts";
const meta = {
  args: {
    count: "12",
    onAction: () => undefined,
    statusTone: "success",
    title: "In Review",
  },
  argTypes: {
    statusTone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: IssueGroupHeader,
  tags: ["autodocs"],
  title: "Molecules/Issue Group Header",
} satisfies Meta<typeof IssueGroupHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const States: Story = {
  render: () => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <IssueGroupHeader count="12" title="In Review" />
      <IssueGroupHeader count="8" statusTone="warning" title="Needs Attention" />
      <IssueGroupHeader count="4" statusTone="neutral" title="Backlog" />
    </div>
  ),
};
