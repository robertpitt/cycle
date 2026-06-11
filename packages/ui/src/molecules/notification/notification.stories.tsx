import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../../atoms/button/index.ts";
import { Notification, NotificationViewport } from "./index.ts";

const meta = {
  component: Notification,
  tags: ["autodocs"],
  title: "Molecules/Notification",
} satisfies Meta<typeof Notification>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    description: "Cycle saved the issue and refreshed the repository projection.",
    meta: "now",
    title: "Issue updated",
    tone: "success",
  },
};

export const Variants: Story = {
  args: {
    title: "Notification variants",
  },
  render: () => (
    <div className="grid max-w-md gap-2">
      {(["neutral", "info", "success", "warning", "danger", "accent"] as const).map((tone) => (
        <Notification
          description={
            tone === "danger"
              ? "The repository rejected this update. Check the issue details and try again."
              : "Short operational messages stay compact and easy to scan."
          }
          key={tone}
          meta={tone === "info" ? "sync" : undefined}
          onDismiss={() => undefined}
          title={`${tone[0]?.toUpperCase() ?? ""}${tone.slice(1)} notification`}
          tone={tone}
        />
      ))}
    </div>
  ),
};

export const WithAction: Story = {
  args: {
    title: "Notification with action",
  },
  render: () => (
    <Notification
      action={{
        label: "Open history",
        onSelect: () => undefined,
      }}
      description="Repository sync finished with warnings. Review the latest materialization report."
      meta="1 min"
      onDismiss={() => undefined}
      title="Sync completed"
      tone="warning"
    />
  ),
};

export const Viewport: Story = {
  args: {
    title: "Notification viewport",
  },
  render: () => (
    <div className="relative h-80 overflow-hidden rounded-lg border border-border bg-background">
      <NotificationViewport className="absolute" placement="bottom-right">
        <Notification
          description="The status is now In Progress."
          meta="now"
          onDismiss={() => undefined}
          title="Issue status changed"
          tone="success"
        />
        <Notification
          action={{
            label: "Retry",
            onSelect: () => undefined,
          }}
          description="Cycle could not update priority because the repository is still syncing."
          onDismiss={() => undefined}
          title="Priority update failed"
          tone="danger"
        />
      </NotificationViewport>
      <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
        Notifications anchor above the app surface without changing layout.
      </div>
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    title: "Long content",
  },
  render: () => (
    <Notification
      action={{
        label: "View issue",
        onSelect: () => undefined,
      }}
      description="This notification includes a long repository name, a verbose issue title, and enough detail to verify text clamps cleanly without overlapping the dismiss button."
      meta="manual"
      onDismiss={() => undefined}
      title="robertpitt/cycle-ui-navigation-foundation status update failed"
      tone="danger"
    />
  ),
};

export const TriggerExample: Story = {
  args: {
    title: "Trigger example",
  },
  render: () => (
    <Button onClick={() => undefined} variant="outline">
      Show notification
    </Button>
  ),
};
