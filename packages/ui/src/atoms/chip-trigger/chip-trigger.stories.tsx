import { Circle, Tag } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChipTrigger } from "./index.ts";

const meta = {
  component: ChipTrigger,
  title: "Atoms/Chip Trigger",
} satisfies Meta<typeof ChipTrigger>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <Circle aria-hidden className="size-4" />,
    label: "Todo",
  },
};

export const Open: Story = {
  args: {
    icon: <Tag aria-hidden className="size-4" />,
    label: "Labels",
    open: true,
  },
};
