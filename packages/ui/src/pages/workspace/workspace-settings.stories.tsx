import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceSettingsPage } from "./index.ts";
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
  title: "Examples/Workspace Settings",
} satisfies Meta<typeof WorkspaceSettingsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: () => <WorkspaceSettingsPage />,
};
