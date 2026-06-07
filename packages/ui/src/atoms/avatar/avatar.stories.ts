import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "./index.ts";

const meta = {
  component: Avatar,
  tags: ["autodocs"],
  title: "Atoms/Avatar",
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Fallback: Story = {
  render: () => React.createElement(Avatar, null, React.createElement(AvatarFallback, null, "RP")),
};

export const Image: Story = {
  render: () =>
    React.createElement(
      Avatar,
      null,
      React.createElement(AvatarImage, {
        alt: "",
        src: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=96&h=96&fit=crop&crop=faces",
      }),
      React.createElement(AvatarFallback, null, "RP"),
    ),
};

export const Sizes: Story = {
  render: () =>
    React.createElement(
      "div",
      { className: "flex items-center gap-3" },
      React.createElement(
        Avatar,
        { className: "size-7" },
        React.createElement(AvatarFallback, { className: "text-[10px]" }, "AL"),
      ),
      React.createElement(Avatar, null, React.createElement(AvatarFallback, null, "RP")),
      React.createElement(
        Avatar,
        { className: "size-12" },
        React.createElement(AvatarFallback, null, "JD"),
      ),
    ),
};
