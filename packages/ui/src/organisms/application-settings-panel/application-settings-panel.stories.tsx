import type { Meta, StoryObj } from "@storybook/react-vite";
import { ApplicationSettingsPanel } from "./index.ts";

const themeItems = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const densityItems = [
  { label: "Compact", value: "compact" },
  { label: "Spacious", value: "spacious" },
];

const meta = {
  args: {
    densityItems,
    densityPreference: "compact",
    onCacheClear: () => undefined,
    onDensityPreferenceChange: () => undefined,
    onProfileSave: () => undefined,
    onThemePreferenceChange: () => undefined,
    profile: {
      displayName: "Robert Pitt",
      email: "robert@example.com",
    },
    section: "general",
    themeItems,
    themePreference: "system",
  },
  component: ApplicationSettingsPanel,
  tags: ["autodocs"],
  title: "Organisms/Application Settings Panel",
} satisfies Meta<typeof ApplicationSettingsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Saving: Story = {
  args: {
    cacheLoading: true,
    profileLoading: true,
  },
};

export const Errors: Story = {
  args: {
    cacheError: "Unable to clear cache.",
    profileError: "Unable to save profile.",
  },
};
