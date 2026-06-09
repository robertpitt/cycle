import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceNoProjectsPage } from "./index.ts";

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
  title: "Pages/No Projects",
} satisfies Meta<typeof WorkspaceNoProjectsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <WorkspaceNoProjectsPage />,
};
