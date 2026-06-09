import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./index.ts";
const meta = {
  component: Card,
  tags: ["autodocs"],
  title: "Molecules/Card",
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Basic: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Cycle health</CardTitle>
        <CardDescription>Current delivery status across active issues.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Badge tone="success">Healthy</Badge>
          <span className="text-sm text-muted-foreground">18 done</span>
        </div>
      </CardContent>
    </Card>
  ),
};
export const WithFooter: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Project update</CardTitle>
        <CardDescription>Publish a summary for the workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Summaries include status, blockers, and recently completed work.
        </p>
      </CardContent>
      <CardFooter>
        <Button>Publish</Button>
        <Button variant="ghost">Cancel</Button>
      </CardFooter>
    </Card>
  ),
};
