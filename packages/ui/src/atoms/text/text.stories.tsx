import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text, type TextVariant } from "./index.ts";

const meta = {
  args: {
    children: "Cycle keeps product text consistent across every surface.",
    tone: "foreground",
    variant: "body",
  },
  argTypes: {
    tone: {
      control: "select",
      options: [
        "foreground",
        "muted",
        "subtle",
        "inherit",
        "neutral",
        "info",
        "success",
        "warning",
        "danger",
        "accent",
      ],
    },
    variant: {
      control: "select",
      options: [
        "pageTitle",
        "sectionTitle",
        "panelTitle",
        "body",
        "bodyCompact",
        "control",
        "meta",
        "code",
      ],
    },
  },
  component: Text,
  tags: ["autodocs"],
  title: "Atoms/Text",
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

const variants: readonly TextVariant[] = [
  "pageTitle",
  "sectionTitle",
  "panelTitle",
  "body",
  "bodyCompact",
  "control",
  "meta",
  "code",
];

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-4 rounded-lg border border-border bg-background p-6">
      {variants.map((variant) => (
        <div className="grid gap-1" key={variant}>
          <Text tone="muted" variant="meta">
            {variant}
          </Text>
          <Text as={variant === "pageTitle" ? "h1" : "p"} variant={variant}>
            Keep typography roles predictable in dense product screens.
          </Text>
        </div>
      ))}
    </div>
  ),
};

export const LongContent: Story = {
  render: () => (
    <div className="grid max-w-xs gap-3 rounded-lg border border-border bg-background p-6">
      <Text truncate variant="control">
        Repository path: /Users/robertpitt/Projects/cycle/packages/ui/src/atoms/text
      </Text>
      <Text truncate="line-clamp-2" tone="muted" variant="bodyCompact">
        This description is intentionally long so the component demonstrates a stable two-line clamp
        without resizing surrounding controls or overlapping adjacent metadata.
      </Text>
    </div>
  ),
};
