import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppLoadingScreen } from "./index.ts";

const meta = {
  args: {
    status: {
      message: "Opening workspace",
      repositories: [
        { displayName: "cycle", repositoryId: "cycle", stage: "ready" },
        { displayName: "desktop", repositoryId: "desktop", stage: "syncing" },
        { displayName: "mobile", repositoryId: "mobile", stage: "failed" },
      ],
    },
  },
  component: AppLoadingScreen,
  tags: ["autodocs"],
  title: "Organisms/App Loading Screen",
} satisfies Meta<typeof AppLoadingScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Minimal: Story = {
  args: {
    status: {
      message: "Loading",
      repositories: [],
    },
  },
};
