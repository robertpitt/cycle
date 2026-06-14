import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewsPanel, type ViewsPanelRow } from "./index.ts";

const rows = [
  {
    description: "Pinned triage queue for the current milestone.",
    filterSummary: "status: Triage, In Progress · priority: High · unlabeled",
    id: "view-triage",
    layoutLabel: "List · grouped by Status",
    name: "Triage",
    ownerName: "Robert Pitt",
    pinned: true,
    scopeLabel: "Shared",
    searchText: "Triage List grouped by Status High unlabeled Robert Pitt",
    updatedAt: "2026-06-13T14:24:00Z",
  },
  {
    filterSummary: "assignees: 3 · labels: desktop, renderer",
    id: "view-desktop",
    layoutLabel: "Board · grouped by Assignee",
    name: "Desktop renderer",
    ownerName: "Amelia Lee",
    scopeLabel: "Shared",
    updatedAt: "2026-06-11T09:15:00Z",
  },
  {
    description: "Default repository view for unresolved issues.",
    filterSummary: "All active issues",
    id: "view-all-active",
    layoutLabel: "List · grouped by Priority",
    name: "All active",
    ownerName: "Cycle",
    scopeLabel: "Default",
    updatedAt: "2026-06-09T16:45:00Z",
  },
] satisfies readonly ViewsPanelRow[];

const meta = {
  args: {
    createDisabled: false,
    creating: false,
    onCreateView: () => undefined,
    onViewSelect: () => undefined,
    repositorySelected: true,
    rows,
  },
  component: ViewsPanel,
  tags: ["autodocs"],
  title: "Organisms/Views Panel",
} satisfies Meta<typeof ViewsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    loading: true,
    rows: [],
  },
};

export const Empty: Story = {
  args: {
    rows: [],
  },
};

export const Error: Story = {
  args: {
    error: "Unable to load saved views.",
    rows: [],
  },
};

export const RepositoryRequired: Story = {
  args: {
    createDisabled: true,
    repositorySelected: false,
    rows: [],
  },
};
