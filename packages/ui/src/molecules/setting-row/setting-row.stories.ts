import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Button } from "../../atoms/button/index.ts";
import { Select } from "../../atoms/select/index.ts";
import { Switch } from "../../atoms/switch/index.ts";
import { SettingRow } from "./index.ts";

const meta = {
  args: {
    control: React.createElement(Switch, { defaultChecked: true }),
    description: "Use transparency in UI elements like the sidebar and modal windows.",
    title: "Translucent UI",
  },
  component: SettingRow,
  tags: ["autodocs"],
  title: "Molecules/Setting Row",
} satisfies Meta<typeof SettingRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Toggle: Story = {
  render: () =>
    React.createElement(SettingRow, {
      control: React.createElement(Switch, { defaultChecked: true }),
      description: "Use transparency in UI elements like the sidebar and modal windows.",
      title: "Translucent UI",
    }),
};

export const ControlSet: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "max-w-2xl rounded-lg border border-border bg-elevated px-5" },
      React.createElement(SettingRow, {
        control: React.createElement(Switch, { defaultChecked: true }),
        description: "Show hints in command menus and empty states.",
        title: "Keyboard shortcut hints",
      }),
      React.createElement(SettingRow, {
        control: React.createElement(
          Select,
          { className: "w-[180px]", defaultValue: "active" },
          React.createElement("option", { value: "active" }, "Active issues"),
          React.createElement("option", { value: "roadmap" }, "Roadmap"),
        ),
        description: "Choose the first screen opened for this workspace.",
        title: "Default home view",
      }),
      React.createElement(SettingRow, {
        control: React.createElement(Button, { variant: "outline" }, "Edit"),
        description: "Change account display name and public avatar.",
        title: "Profile",
      }),
    ),
};
