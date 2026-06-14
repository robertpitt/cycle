import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddRepositoryPanel } from "./index.ts";

const meta = {
  args: {
    onSubmit: () => undefined,
  },
  component: AddRepositoryPanel,
  tags: ["autodocs"],
  title: "Organisms/Add Repository Panel",
} satisfies Meta<typeof AddRepositoryPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Saving: Story = {
  args: {
    saving: true,
  },
};

export const Error: Story = {
  args: {
    error: "The selected folder is not a Git repository.",
  },
};
