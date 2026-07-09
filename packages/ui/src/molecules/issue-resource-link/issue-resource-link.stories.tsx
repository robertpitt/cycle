import type { Meta, StoryObj } from "@storybook/react-vite";
import { cn } from "../../lib/cn.ts";
import { typography } from "../../lib/styles.ts";
import { IssueResourceLink } from "./index.ts";

const meta = {
  component: IssueResourceLink,
  title: "Molecules/Issue Resource Link",
} satisfies Meta<typeof IssueResourceLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    description: "Search the world's information, including webpages, images, videos and more.",
    favicon: <span className={cn(typography.sectionTitle, "font-bold text-primary")}>G</span>,
    meta: "6d",
    onMore: () => undefined,
    title: "Test Link",
  },
  render: (args) => (
    <div className="max-w-5xl rounded-lg border border-border bg-background p-6">
      <IssueResourceLink {...args} />
    </div>
  ),
};
