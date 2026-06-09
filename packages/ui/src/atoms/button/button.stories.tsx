import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../badge/index.ts";
import { Stack } from "../layout/index.ts";
import { Button } from "./index.ts";
const meta = {
  args: {
    children: "Create cycle",
    size: "md",
    variant: "primary",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon"],
    },
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost", "destructive", "link"],
    },
  },
  component: Button,
  tags: ["autodocs"],
  title: "Atoms/Button",
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
const variants = ["primary", "secondary", "outline", "ghost", "destructive", "link"] as const;
const sizes = ["sm", "md", "lg", "icon"] as const;
export const Playground: Story = {};
export const Variants: Story = {
  render: () => (
    <Stack gap="lg">
      <div className="flex flex-wrap items-center gap-3">
        {variants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant[0]?.toUpperCase() + variant.slice(1)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="info">Default</Badge>
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
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
