import type { Meta, StoryObj } from "@storybook/react-vite";
import { PanelState } from "./index.ts";

const meta = {
  args: {
    kind: "empty",
    message: "Choose an issue to view details.",
  },
  component: PanelState,
  tags: ["autodocs"],
  title: "Molecules/Panel State",
} satisfies Meta<typeof PanelState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Loading: Story = {
  args: {
    kind: "loading",
    message: "Loading issue details.",
  },
};

export const Error: Story = {
  args: {
    kind: "error",
    message: "Unable to load issue details.",
  },
};
