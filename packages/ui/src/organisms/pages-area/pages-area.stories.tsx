import type { Meta, StoryObj } from "@storybook/react-vite";
import { PagesArea, type PagesAreaComment, type PagesAreaPage } from "./index.ts";

const pages = [
  {
    body: [
      "# Payments",
      "",
      "This area documents payment ownership, operating boundaries, and release procedures.",
      "",
      "Continue with [refund handling](cycle://repository/cycle/pages/0198f6d4-90a2-7a2a-9f0f-04d232812d32).",
    ].join("\n"),
    id: "0198f6d4-90a2-7a2a-9f0f-04d232812d31",
    path: "payments/index.md",
    revisionId: "8f3c9a1d522fb08b24d7dd4cb673bfb7514e3a99",
    title: "Payments",
    updatedAt: "2026-07-11T10:00:00.000Z",
    updatedBy: "Robert Pitt",
  },
  {
    body: "# Refund handling\n\n1. Confirm the provider state.\n2. Record the refund reference.\n3. Notify support.",
    id: "0198f6d4-90a2-7a2a-9f0f-04d232812d32",
    path: "payments/refunds.md",
    revisionId: "14d7b62a99091b962dd2f36bd2c9cfad7eb27521",
    title: "Refund handling",
    updatedAt: "2026-07-10T16:20:00.000Z",
    updatedBy: "Amelia Lee",
  },
  {
    body: "# Stripe provider\n\nProvider-specific recovery notes.",
    id: "0198f6d4-90a2-7a2a-9f0f-04d232812d33",
    path: "payments/providers/stripe.md",
    revisionId: "2d19e83e514a2e251c7b732647a4c31cda3f646a",
    title: "Stripe provider",
  },
  {
    archived: true,
    body: "# Legacy settlement\n\nRetained for audit history.",
    id: "0198f6d4-90a2-7a2a-9f0f-04d232812d34",
    path: "archive/legacy-settlement.md",
    revisionId: "3e20f94f625b3f362ec843758b5d42edb386757b",
    title: "Legacy settlement",
  },
] satisfies readonly PagesAreaPage[];

const comments = [
  {
    author: { initials: "RP", name: "Robert Pitt" },
    body: "The escalation owner is now listed in the support runbook.",
    id: "comment-1",
    occurredAt: "2026-07-11T10:15:00.000Z",
  },
  {
    author: { initials: "CO", name: "Codex" },
    body: "Verified the recovery steps against the current provider workflow.",
    id: "comment-2",
    occurredAt: "2026-07-11T10:20:00.000Z",
  },
] satisfies readonly PagesAreaComment[];

const history = [
  {
    author: { initials: "RP", name: "Robert Pitt" },
    commitRef: "8f3c9a1d52",
    commitTitle: "Clarify payments ownership",
    id: "history-1",
    meta: ["page.replace", "payments/index.md"],
    occurredAt: "2026-07-11T10:00:00.000Z",
  },
  {
    author: { initials: "CO", name: "Codex" },
    commitRef: "6c2b811e44",
    commitTitle: "Create payments page",
    id: "history-2",
    meta: ["page.create", "payments/index.md"],
    occurredAt: "2026-07-09T08:30:00.000Z",
  },
] as const;

const meta = {
  args: {
    comments: {
      entries: comments,
      onSubmit: () => undefined,
      viewer: { initials: "RP", name: "Robert Pitt" },
    },
    defaultSelectedPageId: pages[0].id,
    history: { items: history },
    onArchive: () => undefined,
    onCopyLink: () => undefined,
    onCreate: () => undefined,
    onPageSelect: () => undefined,
    onRestore: () => undefined,
    onSave: () => undefined,
    pages,
  },
  component: PagesArea,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Organisms/Pages Area",
} satisfies Meta<typeof PagesArea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Editing: Story = {
  args: {
    defaultEditing: true,
    draft: {
      body: `${pages[0].body}\n\n## Release checklist\n\n- [ ] Confirm provider health`,
      path: pages[0].path,
      title: pages[0].title,
    },
  },
};

export const Archived: Story = {
  args: {
    defaultIncludeArchived: true,
    defaultSelectedPageId: pages[3].id,
  },
};

export const RevisionConflict: Story = {
  args: {
    defaultEditing: true,
    draft: {
      body: `${pages[0].body}\n\nUnsaved local investigation notes.`,
      path: pages[0].path,
      title: pages[0].title,
    },
    onCopyUnsaved: () => undefined,
    onReloadCurrent: () => undefined,
    revisionConflict: {
      actualRevisionId: "9a4d0b2ab72f31f771e106681bb596f0b75b80e1",
      currentPath: pages[0].path,
      currentTitle: pages[0].title,
      expectedRevisionId: pages[0].revisionId,
    },
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    pages: [],
  },
};

export const Empty: Story = {
  args: {
    defaultSelectedPageId: undefined,
    pages: [],
  },
};

export const Error: Story = {
  args: {
    defaultSelectedPageId: undefined,
    error: "The Pages projection is temporarily unavailable.",
    pages: [],
  },
};

export const LongContent: Story = {
  args: {
    pages: [
      ...pages,
      {
        body: Array.from(
          { length: 20 },
          (_, index) =>
            `## Operating section ${index + 1}\n\nDetailed operating guidance for this section.`,
        ).join("\n\n"),
        id: "0198f6d4-90a2-7a2a-9f0f-04d232812d35",
        path: "platform/operations/quarterly-provider-reconciliation-and-escalation.md",
        revisionId: "a130b23b775c6948b717ee8b1b9ce796d6ed32bc",
        title: "Quarterly provider reconciliation and escalation",
      },
    ],
  },
};
