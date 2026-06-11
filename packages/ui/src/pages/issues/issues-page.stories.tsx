import type { Meta, StoryObj } from "@storybook/react-vite";
import { IssuesPage } from "./index.ts";
const meta = {
  parameters: {
    backgrounds: {
      disable: true,
    },
    controls: {
      disable: true,
    },
    layout: "fullscreen",
  },
  title: "Examples/Workspace Issues",
} satisfies Meta<typeof IssuesPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: () => <IssuesPage />,
};
