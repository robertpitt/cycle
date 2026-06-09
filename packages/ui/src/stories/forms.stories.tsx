import type { Meta, StoryObj } from "@storybook/react-vite";
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
    controls: {
      disable: true,
    },
  },
  title: "Templates/Form Examples",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const AccountForm: Story = {
  render: () => (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Account details</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack gap="md">
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" placeholder="Ada Lovelace" />
          </Field>
          <Field>
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <Select id="role">
              <option>Operations lead</option>
              <option>Product manager</option>
              <option>Engineer</option>
            </Select>
            <FieldDescription>Used for default workflow permissions.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" placeholder="Context for this workspace" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked />
            Send onboarding summary
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Active workspace</span>
            <Switch defaultChecked />
          </label>
        </Stack>
      </CardContent>
      <CardFooter>
        <Button>Save changes</Button>
        <Button variant="ghost">Cancel</Button>
      </CardFooter>
    </Card>
  ),
};
export const Validation: Story = {
  render: () => (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input aria-invalid defaultValue="not-an-email" id="email" placeholder="name@example.com" />
      <FieldError>Enter a valid email address.</FieldError>
    </Field>
  ),
};
