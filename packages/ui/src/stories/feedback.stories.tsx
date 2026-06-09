import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback, AvatarImage } from "../atoms/avatar/index.ts";
import { Badge } from "../atoms/badge/index.ts";
import { Kbd } from "../atoms/kbd/index.ts";
import { Separator } from "../atoms/separator/index.ts";
import { Skeleton } from "../atoms/skeleton/index.ts";
import { Spinner } from "../atoms/spinner/index.ts";
import { Alert, AlertDescription, AlertTitle } from "../molecules/alert/index.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../molecules/card/index.ts";
const meta = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Molecules/Feedback Examples",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const StatusSet: Story = {
  render: () => (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Badge>Neutral</Badge>
        <Badge tone="info">Primary</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="danger">Blocked</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Alert tone="info">
          <AlertTitle>Cycle opened</AlertTitle>
          <AlertDescription>The workspace is ready for the next planning pass.</AlertDescription>
        </Alert>
        <Alert tone="danger">
          <AlertTitle>Sync failed</AlertTitle>
          <AlertDescription>Review the integration token before retrying.</AlertDescription>
        </Alert>
      </div>
    </div>
  ),
};
export const LoadingAndIdentity: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Review queue</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage
              alt=""
              src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&fit=crop&crop=faces"
            />
            <AvatarFallback>AL</AvatarFallback>
          </Avatar>
          <div className="grid gap-1">
            <p className="text-sm font-medium">Ada Lovelace</p>
            <p className="text-sm text-muted-foreground">Queued 3 minutes ago</p>
          </div>
          <Spinner className="ml-auto text-primary" />
        </div>
        <Separator />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <p className="text-sm text-muted-foreground">
          {"Press "}
          <Kbd>⌘</Kbd> <Kbd>K</Kbd>
          {" to open command search."}
        </p>
      </CardContent>
    </Card>
  ),
};
