import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../badge/index.ts";
import { Container, Stack } from "./index.ts";
const meta = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Atoms/Layout",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Containers: Story = {
  render: () => (
    <div className="grid gap-4">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <Container
          className="rounded-md border border-border bg-elevated py-3"
          key={size}
          size={size}
        >
          <span className="text-sm text-muted-foreground">{size}</span>
        </Container>
      ))}
    </div>
  ),
};
export const StackDirections: Story = {
  render: () => (
    <div className="grid gap-6">
      <Stack direction="row" gap="sm">
        <Badge>Inbox</Badge>
        <Badge>Cycles</Badge>
        <Badge>Roadmaps</Badge>
      </Stack>
      <Stack gap="sm">
        <Badge tone="info">Product</Badge>
        <Badge tone="success">Engineering</Badge>
        <Badge tone="warning">Design</Badge>
      </Stack>
    </div>
  ),
};
