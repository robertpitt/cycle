import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

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
    controls: { disable: true },
  },
  title: "Molecules/Feedback Examples",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const StatusSet: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-6" },
      React.createElement(
        "div",
        { className: "flex flex-wrap gap-2" },
        React.createElement(Badge, null, "Neutral"),
        React.createElement(Badge, { tone: "info" }, "Primary"),
        React.createElement(Badge, { tone: "success" }, "Success"),
        React.createElement(Badge, { tone: "warning" }, "Warning"),
        React.createElement(Badge, { tone: "danger" }, "Blocked"),
      ),
      React.createElement(
        "div",
        { className: "grid gap-3 md:grid-cols-2" },
        React.createElement(
          Alert,
          { tone: "info" },
          React.createElement(AlertTitle, null, "Cycle opened"),
          React.createElement(
            AlertDescription,
            null,
            "The workspace is ready for the next planning pass.",
          ),
        ),
        React.createElement(
          Alert,
          { tone: "danger" },
          React.createElement(AlertTitle, null, "Sync failed"),
          React.createElement(
            AlertDescription,
            null,
            "Review the integration token before retrying.",
          ),
        ),
      ),
    ),
};

export const LoadingAndIdentity: Story = {
  render: () =>
    React.createElement(
      Card,
      { className: "max-w-md" },
      React.createElement(CardHeader, null, React.createElement(CardTitle, null, "Review queue")),
      React.createElement(
        CardContent,
        { className: "grid gap-4" },
        React.createElement(
          "div",
          { className: "flex items-center gap-3" },
          React.createElement(
            Avatar,
            null,
            React.createElement(AvatarImage, {
              alt: "",
              src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&fit=crop&crop=faces",
            }),
            React.createElement(AvatarFallback, null, "AL"),
          ),
          React.createElement(
            "div",
            { className: "grid gap-1" },
            React.createElement("p", { className: "text-sm font-medium" }, "Ada Lovelace"),
            React.createElement(
              "p",
              { className: "text-sm text-muted-foreground" },
              "Queued 3 minutes ago",
            ),
          ),
          React.createElement(Spinner, { className: "ml-auto text-primary" }),
        ),
        React.createElement(Separator),
        React.createElement(Skeleton, { className: "h-4 w-3/4" }),
        React.createElement(Skeleton, { className: "h-4 w-1/2" }),
        React.createElement(
          "p",
          { className: "text-sm text-muted-foreground" },
          "Press ",
          React.createElement(Kbd, null, "⌘"),
          " ",
          React.createElement(Kbd, null, "K"),
          " to open command search.",
        ),
      ),
    ),
};
