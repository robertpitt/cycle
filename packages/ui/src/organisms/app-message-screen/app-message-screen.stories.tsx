import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppMessageScreen } from "./index.ts";

const meta = {
  args: {
    actionLabel: "Return home",
    description: "The requested screen is not available in this renderer.",
    onAction: () => undefined,
    title: "Screen not found",
  },
  component: AppMessageScreen,
  tags: ["autodocs"],
  title: "Organisms/App Message Screen",
} satisfies Meta<typeof AppMessageScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAction: Story = {};

export const Error: Story = {
  args: {
    actionLabel: undefined,
    description: "500 Internal Server Error",
    onAction: undefined,
    title: "Renderer error",
  },
};
