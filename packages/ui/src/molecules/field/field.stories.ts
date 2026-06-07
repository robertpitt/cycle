import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "./index.ts";

const meta = {
  component: Field,
  tags: ["autodocs"],
  title: "Molecules/Field",
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
  render: () =>
    React.createElement(
      Field,
      { className: "max-w-sm", controlId: "field-title", required: true },
      React.createElement(FieldLabel, null, "Issue title"),
      React.createElement(FieldInput, { placeholder: "Ship command menu" }),
      React.createElement(FieldDescription, null, "Keep titles short and action-oriented."),
    ),
};

export const Invalid: Story = {
  render: () =>
    React.createElement(
      Field,
      { className: "max-w-sm", controlId: "field-email", invalid: true },
      React.createElement(FieldLabel, null, "Email"),
      React.createElement(FieldInput, {
        defaultValue: "not-an-email",
      }),
      React.createElement(FieldError, null, "Enter a valid email address."),
    ),
};

export const TextareaField: Story = {
  render: () =>
    React.createElement(
      Field,
      { className: "max-w-lg", controlId: "field-notes" },
      React.createElement(FieldLabel, null, "Notes"),
      React.createElement(FieldTextarea, {
        placeholder: "Add context for this workspace",
      }),
    ),
};
