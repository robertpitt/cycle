import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssueSubIssueComposer } from "./index.ts";

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
