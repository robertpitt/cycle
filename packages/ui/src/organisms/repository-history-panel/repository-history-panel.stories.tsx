import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepositoryHistoryPanel, type RepositoryHistoryEntry } from "./index.ts";

const entries = [
  {
    authorEmail: "robert@example.com",
    authorName: "Robert Pitt",
    changedIssueIds: ["CYC-142", "CYC-143"],
    committedAt: "2026-06-13T09:42:00Z",
    id: "8f3c9a1",
    message: "Promote repository history into the shared UI package",
    parentCount: 1,
    sequence: 42,
    snapshotId: "8f3c9a1d522fb08b24d7dd4cb673bfb7514e3a99",
    warningCount: 0,
  },
  {
    authorEmail: "amelia@example.com",
    authorName: "Amelia Lee",
    changedIssueIds: ["CYC-128"],
    committedAt: "2026-06-12T16:18:00Z",
    id: "14d7b62",
    message: "Wire repository snapshots into issue activity",
    parentCount: 2,
    sequence: 41,
    snapshotId: "14d7b62a99091b962dd2f36bd2c9cfad7eb27521",
    warningCount: 1,
  },
  {
    authorEmail: "cycle@example.com",
    changedIssueIds: [],
    committedAt: "2026-06-10T11:27:00Z",
    id: "0d19e83",
    message: "Refresh issue metadata after commit import",
    parentCount: 1,
    sequence: 40,
    snapshotId: "0d19e83e514a2e251c7b732647a4c31cda3f646a",
    warningCount: 0,
  },
] satisfies readonly RepositoryHistoryEntry[];

const meta = {
  args: {
    canNextPage: true,
    canPreviousPage: false,
    entries,
    loading: false,
    loadingNextPage: false,
    onCopyText: () => undefined,
    onIssueSelect: () => undefined,
    onNextPage: () => undefined,
    onPreviousPage: () => undefined,
    pageLabel: "Page 1",
    repositorySelected: true,
  },
  component: RepositoryHistoryPanel,
  tags: ["autodocs"],
  title: "Organisms/Repository History Panel",
} satisfies Meta<typeof RepositoryHistoryPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    entries: [],
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    entries: [],
  },
};

export const Error: Story = {
  args: {
    entries: [],
    error: "Unable to load repository history.",
  },
};

export const RepositoryRequired: Story = {
  args: {
    entries: [],
    repositorySelected: false,
  },
};
