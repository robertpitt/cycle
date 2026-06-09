import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceGitRepositoryDialogPage } from "./index.ts";

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
  title: "Pages/Git Repository Dialog",
} satisfies Meta<typeof WorkspaceGitRepositoryDialogPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <WorkspaceGitRepositoryDialogPage />,
};
