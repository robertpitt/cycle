import type { Meta, StoryObj } from "@storybook/react-vite";
import { OtpCodeField } from "./index.ts";
const meta = {
  args: {
    length: 6,
  },
  argTypes: {
    length: {
      control: {
        max: 8,
        min: 4,
        step: 1,
        type: "number",
      },
    },
  },
  component: OtpCodeField,
  tags: ["autodocs"],
  title: "Molecules/OTP Code Field",
} satisfies Meta<typeof OtpCodeField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Lengths: Story = {
  render: () => (
    <div className="grid gap-5">
      <OtpCodeField length={4} />
      <OtpCodeField length={6} />
    </div>
  ),
};
