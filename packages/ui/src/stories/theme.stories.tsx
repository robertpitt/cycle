import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../atoms/badge/index.ts";
import { Button } from "../atoms/button/index.ts";
import { Stack } from "../atoms/layout/index.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../molecules/card/index.ts";
import { ThemeProvider, type ThemeMode } from "../theme/index.ts";
const meta = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Foundations/Theme",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const tokens = [
  "background",
  "foreground",
  "surface",
  "elevated",
  "popover",
  "sidebar",
  "muted",
  "subtle",
  "primary",
  "secondary",
  "accent",
  "destructive",
  "success",
  "warning",
  "border",
] as const;
const surfaces = [
  ["surface", "Default surface"],
  ["elevated", "Raised panel"],
  ["popover", "Floating popover"],
  ["sidebar", "Navigation rail"],
] as const;
const renderToken = (token: string) => (
  <div className="grid gap-2">
    <div
      className="h-14 rounded-md border border-border"
      style={{
        backgroundColor: `var(--cycle-color-${token})`,
      }}
    />
    <span className="text-xs font-medium text-muted-foreground">{token}</span>
  </div>
);
const renderThemePanel = (mode: ThemeMode) => (
  <ThemeProvider className="rounded-lg border border-border p-5" mode={mode}>
    <Stack gap="md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{mode}</p>
          <h3 className="text-lg font-semibold">Cycle UI</h3>
        </div>
        <Badge tone="info">Theme</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Surface</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button>Primary action</Button>
          <Button variant="outline">Secondary</Button>
        </CardContent>
      </Card>
    </Stack>
  </ThemeProvider>
);
export const Modes: Story = {
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      {renderThemePanel("light")}
      {renderThemePanel("dark")}
    </div>
  ),
};
export const Tokens: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tokens.map((token) => (
        <Card key={token}>
          <CardContent className="p-4">{renderToken(token)}</CardContent>
        </Card>
      ))}
    </div>
  ),
};
export const SurfaceSystem: Story = {
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      {(["light", "dark"] as const).map((mode) => (
        <ThemeProvider
          className="grid gap-4 rounded-lg border border-border p-5"
          key={mode}
          mode={mode}
        >
          <div>
            <p className="text-sm text-muted-foreground">{mode}</p>
            <h3 className="text-lg font-semibold">Layered surfaces</h3>
          </div>
          <div className="grid gap-3">
            {surfaces.map(([token, label]) => (
              <div
                className="rounded-md border border-border p-4 shadow-card"
                key={token}
                style={{
                  backgroundColor: `var(--cycle-color-${token})`,
                  color: `var(--cycle-color-${token}-foreground, var(--cycle-color-foreground))`,
                }}
              >
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-1 text-sm opacity-75">{`--cycle-color-${token}`}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </ThemeProvider>
      ))}
    </div>
  ),
};
