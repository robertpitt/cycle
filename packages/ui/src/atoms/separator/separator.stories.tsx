import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./index.ts";
const meta = {
  args: {
    decorative: true,
    orientation: "horizontal",
  },
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
  },
  component: Separator,
  tags: ["autodocs"],
  title: "Atoms/Separator",
} satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Orientations: Story = {
  render: () => (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-sm">Horizontal</p>
        <Separator />
      </div>
      <div className="flex h-16 items-center gap-4">
        <span className="text-sm">Left</span>
        <Separator orientation="vertical" />
        <span className="text-sm">Right</span>
      </div>
    </div>
  ),
};
