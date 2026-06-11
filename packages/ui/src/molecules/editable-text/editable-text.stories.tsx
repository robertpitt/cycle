import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditableText } from "./index.ts";

const meta = {
  component: EditableText,
  title: "Molecules/Editable Text",
} satisfies Meta<typeof EditableText>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Title: Story = {
  args: {
    defaultValue: "Test Issue Title",
    placeholder: "Issue title",
    variant: "title",
  },
  render: (args) => (
    <div className="max-w-3xl rounded-lg border border-border bg-background p-6">
      <EditableText {...args} />
    </div>
  ),
};

export const Description: Story = {
  args: {
    defaultValue: "Test Issue Description",
    multiline: true,
    placeholder: "Add description...",
  },
  render: (args) => (
    <div className="max-w-3xl rounded-lg border border-border bg-background p-6">
      <EditableText {...args} />
    </div>
  ),
};
