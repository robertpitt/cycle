import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../../atoms/button/index.ts";
import { Select } from "../../atoms/select/index.ts";
import { Switch } from "../../atoms/switch/index.ts";
import { SettingRow } from "./index.ts";
const meta = {
  args: {
    control: <Switch defaultChecked />,
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
  render: () => (
    <SettingRow
      control={<Switch defaultChecked />}
      description="Use transparency in UI elements like the sidebar and modal windows."
      title="Translucent UI"
    />
  ),
};
export const ControlSet: Story = {
  render: () => (
    <div className="max-w-2xl rounded-lg border border-border bg-elevated px-5">
      <SettingRow
        control={<Switch defaultChecked />}
        description="Show hints in command menus and empty states."
        title="Keyboard shortcut hints"
      />
      <SettingRow
        control={
          <Select className="w-[180px]" defaultValue="active">
            <option value="active">Active issues</option>
            <option value="roadmap">Roadmap</option>
          </Select>
        }
        description="Choose the first screen opened for this workspace."
        title="Default home view"
      />
      <SettingRow
        control={<Button variant="outline">Edit</Button>}
        description="Change account display name and public avatar."
        title="Profile"
      />
    </div>
  ),
};
