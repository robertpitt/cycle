import type { Meta, StoryObj } from "@storybook/react-vite";
import { InitialSetupScreen } from "./index.ts";

const meta = {
  args: {
    email: "robert@example.com",
    enabledHarnessIds: new Set(["codex"]),
    fullName: "Robert Pitt",
    harnesses: [
      {
        executablePath: "/usr/local/bin/codex",
        id: "codex",
        name: "Codex",
        status: "available",
      },
      {
        description: "Executable was not found",
        id: "claude",
        name: "Claude Code",
        status: "missing",
      },
    ],
    onBack: () => undefined,
    onEmailChange: () => undefined,
    onFinish: () => undefined,
    onFullNameChange: () => undefined,
    onHarnessEnabledChange: () => undefined,
    onNext: () => undefined,
    step: "profile",
  },
  component: InitialSetupScreen,
  tags: ["autodocs"],
  title: "Organisms/Initial Setup Screen",
} satisfies Meta<typeof InitialSetupScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Profile: Story = {};

export const Harnesses: Story = {
  args: {
    step: "harnesses",
  },
};

export const Detecting: Story = {
  args: {
    detectingHarnesses: true,
    harnesses: [],
    step: "harnesses",
  },
};
