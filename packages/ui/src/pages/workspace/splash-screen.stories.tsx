import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceSplashScreenPage } from "./index.ts";

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
  title: "Examples/Splash Screen",
} satisfies Meta<typeof WorkspaceSplashScreenPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <WorkspaceSplashScreenPage />,
};
