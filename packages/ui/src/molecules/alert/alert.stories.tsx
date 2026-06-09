import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, AlertDescription, AlertTitle } from "./index.ts";
const meta = {
  args: {
    tone: "info",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "info", "success", "warning", "danger", "accent"],
    },
  },
  component: Alert,
  tags: ["autodocs"],
  title: "Molecules/Alert",
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Workspace synced</AlertTitle>
      <AlertDescription>The latest project state is available across your team.</AlertDescription>
    </Alert>
  ),
};
export const Variants: Story = {
  render: () => (
    <div className="grid gap-3">
      {(["info", "success", "warning", "danger"] as const).map((tone) => (
        <Alert key={tone} tone={tone}>
          <AlertTitle>{tone[0]?.toUpperCase() + tone.slice(1)}</AlertTitle>
          <AlertDescription>
            Use alert variants to communicate system state with matching semantic color.
          </AlertDescription>
        </Alert>
      ))}
    </div>
  ),
};
