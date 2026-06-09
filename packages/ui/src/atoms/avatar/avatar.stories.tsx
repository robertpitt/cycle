import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback, AvatarImage } from "./index.ts";
const meta = {
  component: Avatar,
  tags: ["autodocs"],
  title: "Atoms/Avatar",
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>RP</AvatarFallback>
    </Avatar>
  ),
};
export const Image: Story = {
  render: () => (
    <Avatar>
      <AvatarImage
        alt=""
        src="https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=96&h=96&fit=crop&crop=faces"
      />
      <AvatarFallback>RP</AvatarFallback>
    </Avatar>
  ),
};
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar className="size-7">
        <AvatarFallback className="text-[10px]">AL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RP</AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    </div>
  ),
};
