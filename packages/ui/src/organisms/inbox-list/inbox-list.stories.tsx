import type { Meta, StoryObj } from "@storybook/react-vite";
import { InboxList, type InboxListEntry, type InboxListRepository } from "./index.ts";

const entries: readonly InboxListEntry[] = [
  {
    actor: {
      email: "ada@example.com",
      name: "Ada Lovelace",
    },
    bodyExcerpt: "Can you confirm the renderer state copy?",
    createdAt: "2026-06-14T08:45:00.000Z",
    itemId: "inbox-1",
    reason: "mention",
    recordId: "record-1",
    repositoryId: "cycle",
    status: "unread",
    ticketId: "CYC-1024",
    title: "Standardize issue property menus",
  },
  {
    actor: {
      email: "grace@example.com",
      name: "Grace Hopper",
    },
    bodyExcerpt: "Status changed to in-progress",
    createdAt: "2026-06-13T17:20:00.000Z",
    itemId: "inbox-2",
    reason: "assigned",
    repositoryId: "desktop",
    sourceState: "active",
    status: "read",
    ticketId: "DESK-318",
    title: "Move settings panels into UI package",
  },
  {
    bodyExcerpt: "The source ticket was archived",
    createdAt: "2026-06-12T12:10:00.000Z",
    itemId: "inbox-3",
    reason: "comment_created",
    repositoryId: "mobile",
    sourceState: "source_archived",
    status: "archived",
    ticketId: "MOB-77",
    title: "Audit mobile import flow",
  },
];

const repositories: readonly InboxListRepository[] = [
  {
    label: "cycle",
    repositoryId: "cycle",
    status: "active",
  },
  {
    label: "desktop",
    repositoryId: "desktop",
    status: "degraded",
    warningCount: 2,
  },
  {
    label: "mobile",
    repositoryId: "mobile",
    status: "active",
  },
];

const meta = {
  args: {
    count: "3 unread · 3 shown",
    entries,
    repositories,
    title: "Inbox",
  },
  component: InboxList,
  tags: ["autodocs"],
  title: "Organisms/Inbox List",
} satisfies Meta<typeof InboxList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <InboxList {...args} className="h-[420px] rounded-lg border border-border" />,
};

export const Loading: Story = {
  args: {
    entries: [],
    loading: true,
  },
  render: Default.render,
};

export const Empty: Story = {
  args: {
    count: "0 unread · 0 shown",
    entries: [],
  },
  render: Default.render,
};

export const Selected: Story = {
  args: {
    selectedItemIds: ["inbox-1", "inbox-2"],
  },
  render: Default.render,
};
