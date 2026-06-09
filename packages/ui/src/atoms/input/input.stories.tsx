import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./index.ts";
const meta = {
  args: {
    placeholder: "name@company.com",
  },
  component: Input,
  tags: ["autodocs"],
  title: "Atoms/Input",
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const States: Story = {
  render: () => (
    <div className="grid max-w-sm gap-3">
      <Input placeholder="Default" />
      <Input defaultValue="robert@example.com" />
      <Input aria-invalid defaultValue="not-an-email" />
      <Input disabled placeholder="Disabled" />
    </div>
  ),
};
