import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateTime } from "./index.ts";

const value = "2026-06-14T09:30:00.000Z";

const meta = {
  args: {
    format: "datetime",
    value,
  },
  argTypes: {
    format: {
      control: "select",
      options: ["date", "time", "datetime", "relative", "compactDate", "compactDateTime", "iso"],
    },
  },
  component: DateTime,
  tags: ["autodocs"],
  title: "Atoms/Date Time",
} satisfies Meta<typeof DateTime>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Formats: Story = {
  render: () => (
    <div className="grid max-w-xl gap-3 rounded-lg border border-border bg-background p-6 text-sm">
      {(
        ["date", "time", "datetime", "relative", "compactDate", "compactDateTime", "iso"] as const
      ).map((format) => (
        <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3" key={format}>
          <span className="font-medium text-muted-foreground">{format}</span>
          <DateTime format={format} relativeBase="2026-06-14T10:00:00.000Z" value={value} />
        </div>
      ))}
    </div>
  ),
};

export const TimeZones: Story = {
  render: () => (
    <div className="grid max-w-xl gap-3 rounded-lg border border-border bg-background p-6 text-sm">
      {["Europe/London", "America/New_York", "Asia/Tokyo"].map((timeZone) => (
        <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3" key={timeZone}>
          <span className="font-medium text-muted-foreground">{timeZone}</span>
          <DateTime format="datetime" timeZone={timeZone} value={value} />
        </div>
      ))}
    </div>
  ),
};

export const Invalid: Story = {
  args: {
    fallback: "Unknown time",
    value: "not-a-date",
  },
};
