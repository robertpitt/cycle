import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

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
  render: () =>
    React.createElement(
      Card,
      { className: "max-w-md" },
      React.createElement(
        CardHeader,
        null,
        React.createElement(CardTitle, null, "Cycle health"),
        React.createElement(CardDescription, null, "Current delivery status across active issues."),
      ),
      React.createElement(
        CardContent,
        null,
        React.createElement(
          "div",
          { className: "flex items-center gap-2" },
          React.createElement(Badge, { tone: "success" }, "Healthy"),
          React.createElement("span", { className: "text-sm text-muted-foreground" }, "18 done"),
        ),
      ),
    ),
};

export const WithFooter: Story = {
  render: () =>
    React.createElement(
      Card,
      { className: "max-w-md" },
      React.createElement(
        CardHeader,
        null,
        React.createElement(CardTitle, null, "Project update"),
        React.createElement(CardDescription, null, "Publish a summary for the workspace."),
      ),
      React.createElement(
        CardContent,
        null,
        React.createElement(
          "p",
          { className: "text-sm text-muted-foreground" },
          "Summaries include status, blockers, and recently completed work.",
        ),
      ),
      React.createElement(
        CardFooter,
        null,
        React.createElement(Button, null, "Publish"),
        React.createElement(Button, { variant: "ghost" }, "Cancel"),
      ),
    ),
};
