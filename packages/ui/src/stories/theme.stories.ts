import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Badge } from "../atoms/badge/index.ts";
import { Button } from "../atoms/button/index.ts";
import { Stack } from "../atoms/layout/index.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../molecules/card/index.ts";
import { ThemeProvider, type ThemeMode } from "../theme/index.ts";

const meta = {
  parameters: {
    controls: { disable: true },
  },
  title: "Foundations/Theme",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const tokens = [
  "background",
  "foreground",
  "surface",
  "elevated",
  "popover",
  "sidebar",
  "muted",
  "subtle",
  "primary",
  "secondary",
  "accent",
  "destructive",
  "success",
  "warning",
  "border",
] as const;

const surfaces = [
  ["surface", "Default surface"],
  ["elevated", "Raised panel"],
  ["popover", "Floating popover"],
  ["sidebar", "Navigation rail"],
] as const;

const renderToken = (token: string) =>
  React.createElement(
    "div",
    { className: "grid gap-2" },
    React.createElement("div", {
      className: "h-14 rounded-md border border-border",
      style: { backgroundColor: `var(--cycle-color-${token})` },
    }),
    React.createElement("span", { className: "text-xs font-medium text-muted-foreground" }, token),
  );

const renderThemePanel = (mode: ThemeMode) =>
  React.createElement(
    ThemeProvider,
    {
      className: "rounded-lg border border-border p-5",
      mode,
    },
    React.createElement(
      Stack,
      { gap: "md" },
      React.createElement(
        "div",
        { className: "flex items-center justify-between gap-4" },
        React.createElement(
          "div",
          null,
          React.createElement("p", { className: "text-sm text-muted-foreground" }, mode),
          React.createElement("h3", { className: "text-lg font-semibold" }, "Cycle UI"),
        ),
        React.createElement(Badge, { tone: "info" }, "Theme"),
      ),
      React.createElement(
        Card,
        null,
        React.createElement(CardHeader, null, React.createElement(CardTitle, null, "Surface")),
        React.createElement(
          CardContent,
          { className: "flex flex-wrap gap-2" },
          React.createElement(Button, null, "Primary action"),
          React.createElement(Button, { variant: "outline" }, "Secondary"),
        ),
      ),
    ),
  );

export const Modes: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-4 md:grid-cols-2" },
      renderThemePanel("light"),
      renderThemePanel("dark"),
    ),
};

export const Tokens: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4" },
      ...tokens.map((token) =>
        React.createElement(
          Card,
          { key: token },
          React.createElement(CardContent, { className: "p-4" }, renderToken(token)),
        ),
      ),
    ),
};

export const SurfaceSystem: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "grid gap-4 md:grid-cols-2" },
      ...(["light", "dark"] as const).map((mode) =>
        React.createElement(
          ThemeProvider,
          {
            className: "grid gap-4 rounded-lg border border-border p-5",
            key: mode,
            mode,
          },
          React.createElement(
            "div",
            null,
            React.createElement("p", { className: "text-sm text-muted-foreground" }, mode),
            React.createElement("h3", { className: "text-lg font-semibold" }, "Layered surfaces"),
          ),
          React.createElement(
            "div",
            { className: "grid gap-3" },
            ...surfaces.map(([token, label]) =>
              React.createElement(
                "div",
                {
                  className: "rounded-md border border-border p-4 shadow-card",
                  key: token,
                  style: {
                    backgroundColor: `var(--cycle-color-${token})`,
                    color: `var(--cycle-color-${token}-foreground, var(--cycle-color-foreground))`,
                  },
                },
                React.createElement("p", { className: "text-sm font-medium" }, label),
                React.createElement(
                  "p",
                  { className: "mt-1 text-sm opacity-75" },
                  `--cycle-color-${token}`,
                ),
              ),
            ),
          ),
          React.createElement(
            "div",
            { className: "flex flex-wrap gap-2" },
            React.createElement(Button, null, "Primary"),
            React.createElement(Button, { variant: "outline" }, "Outline"),
            React.createElement(Button, { variant: "ghost" }, "Ghost"),
          ),
        ),
      ),
    ),
};
