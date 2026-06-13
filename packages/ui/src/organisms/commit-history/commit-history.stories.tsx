import type { Meta, StoryObj } from "@storybook/react-vite";
import { Circle, CircleCheck, CircleDashed, CircleDot, RefreshCw } from "lucide-react";
import { Button } from "../../atoms/button/index.ts";
import { CommitHistory, type CommitHistoryItem, type CommitHistoryState } from "./index.ts";

const iconClassName = "size-3.5";

const states = {
  backlog: {
    icon: <Circle aria-hidden className={iconClassName} />,
    id: "backlog",
    label: "Backlog",
    tone: "neutral",
  },
  done: {
    icon: <CircleCheck aria-hidden className={iconClassName} />,
    id: "done",
    label: "Done",
    tone: "success",
  },
  inProgress: {
    icon: <CircleDashed aria-hidden className={iconClassName} />,
    id: "in-progress",
    label: "In Progress",
    tone: "info",
  },
  inReview: {
    icon: <CircleDot aria-hidden className={iconClassName} />,
    id: "in-review",
    label: "In Review",
    tone: "warning",
  },
} satisfies Record<string, CommitHistoryState>;

const historyItems = [
  {
    author: {
      initials: "RP",
      name: "Robert Pitt",
    },
    branch: <span className="font-mono">feature/repository-history</span>,
    commitHref: "#",
    commitRef: "8f3c9a1",
    commitTitle: "Promote commit timeline into the shared UI package",
    id: "commit-8f3c9a1",
    occurredAt: "2026-06-13T09:42:00Z",
    timestamp: "Today, 09:42",
    transition: {
      from: states.inProgress,
      label: "Status",
      to: states.inReview,
    },
  },
  {
    author: {
      avatarSrc:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&fit=crop&crop=faces",
      initials: "AL",
      name: "Amelia Lee",
    },
    branch: <span className="font-mono">main</span>,
    commitHref: "#",
    commitRef: "14d7b62",
    commitTitle: "Wire repository snapshots into issue activity",
    id: "commit-14d7b62",
    occurredAt: "2026-06-12T16:18:00Z",
    timestamp: "Fri, 16:18",
    transition: {
      from: states.backlog,
      label: "Status",
      to: states.inProgress,
    },
  },
  {
    author: {
      initials: "JM",
      name: "Jules Martin",
    },
    branch: <span className="font-mono">release/desktop-sync</span>,
    commitHref: "#",
    commitRef: "c2a44ef",
    commitTitle: "Persist Linear status mapping during repository sync",
    id: "commit-c2a44ef",
    occurredAt: "2026-06-11T13:05:00Z",
    timestamp: "Thu, 13:05",
    transition: {
      from: states.inReview,
      label: "Status",
      to: states.done,
    },
  },
  {
    author: {
      initials: "NS",
      name: "Noor Shah",
    },
    commitHref: "#",
    commitRef: "0d19e83",
    commitTitle: "Refresh issue metadata after commit import",
    id: "commit-0d19e83",
    meta: ["Imported from origin/main", "2 files changed"],
    occurredAt: "2026-06-10T11:27:00Z",
    timestamp: "Wed, 11:27",
    transition: {
      label: (
        <span className="inline-flex items-center gap-1">
          <RefreshCw aria-hidden className="size-3" />
          Reopened
        </span>
      ),
      to: states.inProgress,
    },
  },
] satisfies readonly CommitHistoryItem[];

const meta = {
  args: {
    count: "4 commits",
    items: historyItems,
    title: "Repository history",
  },
  component: CommitHistory,
  tags: ["autodocs"],
  title: "Organisms/Commit History",
} satisfies Meta<typeof CommitHistory>;

export default meta;

type Story = StoryObj<typeof meta>;

const renderHistory = (args: React.ComponentProps<typeof CommitHistory>, className?: string) => (
  <div className={className ?? "overflow-hidden rounded-lg border border-border bg-surface"}>
    <CommitHistory {...args} />
  </div>
);

export const Default: Story = {
  render: (args) => renderHistory(args),
};

export const WithHeaderAction: Story = {
  args: {
    headerAction: (
      <Button size="sm" variant="outline">
        Compare
      </Button>
    ),
  },
  render: (args) => renderHistory(args),
};

export const Loading: Story = {
  args: {
    items: [],
    loading: true,
  },
  render: (args) => renderHistory(args),
};

export const Empty: Story = {
  args: {
    count: "0 commits",
    emptyState: "No commits have been imported for this repository.",
    items: [],
  },
  render: (args) => renderHistory(args),
};

export const Error: Story = {
  args: {
    error: "Unable to load commit history.",
    items: [],
  },
  render: (args) => renderHistory(args),
};

export const CompactSelected: Story = {
  args: {
    density: "compact",
    selectedCommitId: "commit-c2a44ef",
  },
  render: (args) => renderHistory(args),
};

export const LongContent: Story = {
  args: {
    items: [
      {
        ...historyItems[0],
        author: {
          initials: "MD",
          name: "Morgan Delacroix-Washington",
        },
        branch: (
          <span className="font-mono">
            feature/import-commit-history-from-very-large-monorepository-fixtures
          </span>
        ),
        commitRef: "8f3c9a1d4b6e7c2a5f0d9998887776665554443",
        commitTitle:
          "Document every repository transition emitted during a deeply nested ticket migration",
        id: "commit-long",
      },
      ...historyItems.slice(1, 3),
    ],
  },
  render: (args) => renderHistory(args),
};

export const NarrowViewport: Story = {
  render: (args) =>
    renderHistory(args, "max-w-[360px] overflow-hidden rounded-lg border border-border bg-surface"),
};
