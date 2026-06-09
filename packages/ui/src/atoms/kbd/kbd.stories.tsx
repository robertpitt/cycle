import type { Meta, StoryObj } from "@storybook/react-vite";
import { Kbd } from "./index.ts";
const meta = {
  args: {
    children: "K",
  },
  component: Kbd,
  tags: ["autodocs"],
  title: "Atoms/Kbd",
} satisfies Meta<typeof Kbd>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const ShortcutSet: Story = {
  render: () => (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      Open command search with<Kbd>Cmd</Kbd>
      <Kbd>K</Kbd>or create with<Kbd>C</Kbd>
    </p>
  ),
};
