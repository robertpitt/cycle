import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceAppShellPage } from "./index.ts";

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
  title: "Pages/App Shell",
} satisfies Meta<typeof WorkspaceAppShellPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <WorkspaceAppShellPage />,
};
