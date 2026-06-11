import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../badge/index.ts";
import { Stack } from "../layout/index.ts";
import { componentActionVariants, componentTones } from "../../lib/contracts.ts";
import { Button } from "./index.ts";
const meta = {
  args: {
    children: "Create cycle",
    size: "md",
    tone: "info",
    variant: "primary",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon"],
    },
    tone: {
      control: "select",
      options: componentTones,
    },
    variant: {
      control: "select",
      options: componentActionVariants,
    },
  },
  component: Button,
  tags: ["autodocs"],
  title: "Atoms/Button",
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
const sizes = ["sm", "md", "lg", "icon"] as const;
export const Playground: Story = {};
export const Variants: Story = {
  render: () => (
    <Stack gap="lg">
      <div className="flex flex-wrap items-center gap-3">
        {componentActionVariants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant[0]?.toUpperCase() + variant.slice(1)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {componentTones.map((tone) => (
          <Button key={tone} tone={tone}>
            {tone[0]?.toUpperCase() + tone.slice(1)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="info">States</Badge>
        <Button loading>Saving</Button>
        <Button disabled tone="danger">
          Disabled
        </Button>
      </div>
    </Stack>
  ),
};
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {sizes.map((size) => (
        <Button key={size} size={size} variant="outline">
          {size === "icon" ? "C" : size.toUpperCase()}
        </Button>
      ))}
    </div>
  ),
};
