import type { Meta, StoryObj } from "@storybook/react-vite";
import { Diamond, Euro, GitBranch, Smartphone } from "lucide-react";
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
  render: () => (
    <div className="flex max-w-4xl flex-wrap gap-2">
      <IssueMetaChip
        icon={<Euro aria-hidden className="size-3.5" />}
        label="Currency Support"
        tone="success"
      />
      <IssueMetaChip
        icon={<Smartphone aria-hidden className="size-3.5" />}
        label="Frontend User Experience"
        tone="danger"
      />
      <IssueMetaChip
        icon={<GitBranch aria-hidden className="size-3.5" />}
        label="MIC Release"
        tone="warning"
      />
      <IssueMetaChip icon={<Diamond aria-hidden className="size-3.5" />} label="Internal Release" />
    </div>
  ),
};
