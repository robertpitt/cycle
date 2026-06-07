import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Button } from "../atoms/button/index.ts";
import { Checkbox } from "../atoms/checkbox/index.ts";
import { Input } from "../atoms/input/index.ts";
import { Stack } from "../atoms/layout/index.ts";
import { Select } from "../atoms/select/index.ts";
import { Switch } from "../atoms/switch/index.ts";
import { Textarea } from "../atoms/textarea/index.ts";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../molecules/card/index.ts";
import { Field, FieldDescription, FieldError, FieldLabel } from "../molecules/field/index.ts";

const meta = {
  parameters: {
    controls: { disable: true },
  },
  title: "Templates/Form Examples",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const AccountForm: Story = {
  render: () =>
    React.createElement(
      Card,
      { className: "max-w-xl" },
      React.createElement(
        CardHeader,
        null,
        React.createElement(CardTitle, null, "Account details"),
      ),
      React.createElement(
        CardContent,
        null,
        React.createElement(
          Stack,
          { gap: "md" },
          React.createElement(
            Field,
            null,
            React.createElement(FieldLabel, { htmlFor: "name" }, "Name"),
            React.createElement(Input, {
              id: "name",
              placeholder: "Ada Lovelace",
            }),
          ),
          React.createElement(
            Field,
            null,
            React.createElement(FieldLabel, { htmlFor: "role" }, "Role"),
            React.createElement(
              Select,
              { id: "role" },
              React.createElement("option", null, "Operations lead"),
              React.createElement("option", null, "Product manager"),
              React.createElement("option", null, "Engineer"),
            ),
            React.createElement(FieldDescription, null, "Used for default workflow permissions."),
          ),
          React.createElement(
            Field,
            null,
            React.createElement(FieldLabel, { htmlFor: "notes" }, "Notes"),
            React.createElement(Textarea, {
              id: "notes",
              placeholder: "Context for this workspace",
            }),
          ),
          React.createElement(
            "label",
            { className: "flex items-center gap-2 text-sm" },
            React.createElement(Checkbox, { defaultChecked: true }),
            "Send onboarding summary",
          ),
          React.createElement(
            "label",
            { className: "flex items-center justify-between gap-4 text-sm" },
            React.createElement("span", null, "Active workspace"),
            React.createElement(Switch, { defaultChecked: true }),
          ),
        ),
      ),
      React.createElement(
        CardFooter,
        null,
        React.createElement(Button, null, "Save changes"),
        React.createElement(Button, { variant: "ghost" }, "Cancel"),
      ),
    ),
};

export const Validation: Story = {
  render: () =>
    React.createElement(
      Field,
      { className: "max-w-sm" },
      React.createElement(FieldLabel, { htmlFor: "email" }, "Email"),
      React.createElement(Input, {
        "aria-invalid": true,
        defaultValue: "not-an-email",
        id: "email",
        placeholder: "name@example.com",
      }),
      React.createElement(FieldError, null, "Enter a valid email address."),
    ),
};
