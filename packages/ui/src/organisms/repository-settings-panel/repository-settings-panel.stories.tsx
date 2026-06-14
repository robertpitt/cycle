import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepositorySettingsPanel } from "./index.ts";

const meta = {
  args: {
    commitStyleItems: [
      { label: "Descriptive", value: "descriptive" },
      { label: "Compact", value: "compact" },
    ],
    informationRows: [
      { label: "Current branch", value: "main" },
      { label: "Default remote", value: "origin" },
      { label: "Default remote URL", value: "git@github.com:cycle/cycle.git" },
      { label: "Remotes", value: "origin (git@github.com:cycle/cycle.git)" },
      { label: "Cycle snapshot", value: "2f3a9c10d422" },
      { label: "Status", value: "ready" },
      { label: "Warnings", value: "0" },
    ],
    onCommitStyleChange: () => undefined,
    repository: {
      commitStyle: "descriptive",
      displayName: "cycle",
      path: "/Users/robertpitt/Projects/cycle",
    },
  },
  component: RepositorySettingsPanel,
  tags: ["autodocs"],
  title: "Organisms/Repository Settings Panel",
} satisfies Meta<typeof RepositorySettingsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MissingRemote: Story = {
  args: {
    informationRows: [
      { label: "Current branch", value: "Detached or unavailable" },
      { label: "Default remote", value: "No default remote" },
      { label: "Default remote URL", value: "No remote URL" },
      { label: "Remotes", value: "No remotes configured" },
      { label: "Cycle snapshot", value: "Not committed" },
      { label: "Status", value: "Unavailable" },
      { label: "Warnings", value: "2" },
    ],
  },
};
