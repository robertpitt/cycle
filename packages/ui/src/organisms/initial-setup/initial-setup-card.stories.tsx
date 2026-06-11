import type { Meta, StoryObj } from "@storybook/react-vite";
import { InitialSetupCard, type InitialSetupHarness } from "./index.ts";

const harnesses: readonly InitialSetupHarness[] = [
  {
    description: "Available on this machine",
    executablePath: "/opt/homebrew/bin/codex",
    id: "codex",
    name: "Codex",
    status: "available",
  },
  {
    description: "Executable was not found",
    id: "claude-code",
    name: "Claude Code",
    status: "missing",
  },
];

const noop = () => undefined;

const meta = {
  args: {
    email: "robert@example.com",
    enabledHarnessIds: new Set(["codex"]),
    fullName: "Robert Pitt",
    harnesses,
    onEmailChange: noop,
    onFinish: noop,
    onFullNameChange: noop,
    onHarnessEnabledChange: noop,
    onNext: noop,
    step: "profile",
  },
  component: InitialSetupCard,
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Organisms/Initial Setup Card",
} satisfies Meta<typeof InitialSetupCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Profile: Story = {};

export const Harnesses: Story = {
  args: {
    onBack: noop,
    step: "harnesses",
  },
};

export const DetectingHarnesses: Story = {
  args: {
    detectingHarnesses: true,
    harnesses: [],
    onBack: noop,
    step: "harnesses",
  },
};

export const MissingHarnesses: Story = {
  args: {
    enabledHarnessIds: new Set(),
    harnesses: [
      {
        description: "Executable was not found",
        id: "codex",
        name: "Codex",
        status: "missing",
      },
    ],
    harnessNotice: "No supported harnesses were detected on this machine.",
    onBack: noop,
    step: "harnesses",
  },
};

export const Error: Story = {
  args: {
    error: "Unable to complete setup. Check the profile details and try again.",
  },
};
