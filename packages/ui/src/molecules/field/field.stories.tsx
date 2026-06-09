import type { Meta, StoryObj } from "@storybook/react-vite";
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
  render: () => (
    <Field className="max-w-sm" controlId="field-title" required>
      <FieldLabel>Issue title</FieldLabel>
      <FieldInput placeholder="Ship command menu" />
      <FieldDescription>Keep titles short and action-oriented.</FieldDescription>
    </Field>
  ),
};
export const Invalid: Story = {
  render: () => (
    <Field className="max-w-sm" controlId="field-email" invalid>
      <FieldLabel>Email</FieldLabel>
      <FieldInput defaultValue="not-an-email" />
      <FieldError>Enter a valid email address.</FieldError>
    </Field>
  ),
};
export const TextareaField: Story = {
  render: () => (
    <Field className="max-w-lg" controlId="field-notes">
      <FieldLabel>Notes</FieldLabel>
      <FieldTextarea placeholder="Add context for this workspace" />
    </Field>
  ),
};
