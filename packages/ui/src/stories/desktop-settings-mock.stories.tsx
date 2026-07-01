import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Bot,
  ChevronRight,
  CircleAlert,
  FolderGit2,
  PlugZap,
  RefreshCcw,
  RotateCcw,
  Settings,
  TerminalSquare,
  Trash2,
  User,
} from "lucide-react";
import * as React from "react";
import { Badge } from "../atoms/badge/index.ts";
import { Button } from "../atoms/button/index.ts";
import { Input } from "../atoms/input/index.ts";
import { Select } from "../atoms/select/index.ts";
import { Separator } from "../atoms/separator/index.ts";
import { StatusIndicator } from "../atoms/status-indicator/index.ts";
import { Switch } from "../atoms/switch/index.ts";
import { Text } from "../atoms/text/index.ts";
import { NavigationItem } from "../molecules/navigation-item/index.ts";
import { SettingRow } from "../molecules/setting-row/index.ts";
import { ThemeProvider, type ThemeMode } from "../theme/index.ts";
import { cn } from "../lib/cn.ts";

type SettingsSection = "advanced" | "agents" | "endpoints" | "general" | "profile" | "repositories";

type RepositoryId = "cycle" | "codex-app" | "mcp-tools";

type ActiveLocation =
  | {
      readonly section: Exclude<SettingsSection, "repositories">;
    }
  | {
      readonly repositoryId?: RepositoryId;
      readonly section: "repositories";
    };

type RepositoryMock = {
  readonly branch: string;
  readonly error?: string;
  readonly id: RepositoryId;
  readonly name: string;
  readonly path: string;
  readonly remote: string;
  readonly snapshot: string;
  readonly stage: "failed" | "ready" | "syncing";
  readonly warnings: number;
};

type HarnessMock = {
  readonly capability: string;
  readonly executable: string;
  readonly id: string;
  readonly name: string;
  readonly path?: string;
  readonly status: "available" | "missing";
};

const repositories = [
  {
    branch: "main",
    id: "cycle",
    name: "cycle",
    path: "/Users/robertpitt/Projects/cycle",
    remote: "origin",
    snapshot: "2f3a9c10d422",
    stage: "ready",
    warnings: 0,
  },
  {
    branch: "settings-spec",
    id: "codex-app",
    name: "codex-app",
    path: "/Users/robertpitt/Projects/codex-app",
    remote: "origin",
    snapshot: "8cd16ab0331f",
    stage: "syncing",
    warnings: 1,
  },
  {
    branch: "main",
    error: "Remote GitDB ref was not found.",
    id: "mcp-tools",
    name: "mcp-tools",
    path: "/Users/robertpitt/Projects/mcp-tools",
    remote: "No default remote",
    snapshot: "Not committed",
    stage: "failed",
    warnings: 3,
  },
] satisfies readonly RepositoryMock[];

const harnesses = [
  {
    capability: "MCP, workspace write, sessions",
    executable: "codex",
    id: "codex",
    name: "Codex",
    path: "/opt/homebrew/bin/codex",
    status: "available",
  },
  {
    capability: "Provider schema pending",
    executable: "opencode",
    id: "opencode",
    name: "OpenCode",
    status: "missing",
  },
] satisfies readonly HarnessMock[];

const sectionItems = [
  { icon: Settings, id: "general", label: "General" },
  { icon: User, id: "profile", label: "Profile" },
  { icon: Bot, id: "agents", label: "Agents" },
  { icon: FolderGit2, id: "repositories", label: "Repositories" },
  { icon: PlugZap, id: "endpoints", label: "Endpoints" },
  { icon: TerminalSquare, id: "advanced", label: "Advanced" },
] satisfies readonly {
  readonly icon: React.ComponentType<{ readonly className?: string }>;
  readonly id: SettingsSection;
  readonly label: string;
}[];

const stageTone = (stage: RepositoryMock["stage"]) =>
  stage === "failed" ? "danger" : stage === "syncing" ? "warning" : "success";

const stageLabel = (stage: RepositoryMock["stage"]) =>
  stage === "failed" ? "Failed" : stage === "syncing" ? "Syncing" : "Ready";

const SectionHeader = ({
  eyebrow,
  title,
}: {
  readonly eyebrow?: React.ReactNode;
  readonly title: React.ReactNode;
}) => (
  <header className="flex min-w-0 items-start justify-between gap-4">
    <div className="min-w-0">
      {eyebrow ? (
        <Text as="p" tone="muted" variant="meta">
          {eyebrow}
        </Text>
      ) : null}
      <Text as="h1" className="mt-1" variant="pageTitle" wrap="break">
        {title}
      </Text>
    </div>
  </header>
);

const Panel = ({
  children,
  className,
  title,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly title?: React.ReactNode;
}) => (
  <section className={cn("rounded-lg border border-border bg-surface shadow-card", className)}>
    {title ? (
      <div className="border-b border-border px-5 py-4">
        <Text as="h2" variant="sectionTitle">
          {title}
        </Text>
      </div>
    ) : null}
    {children}
  </section>
);

const InfoRow = ({
  action,
  label,
  value,
}: {
  readonly action?: React.ReactNode;
  readonly label: React.ReactNode;
  readonly value: React.ReactNode;
}) => (
  <div className="grid min-h-12 gap-2 border-b border-border px-5 py-3 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-center">
    <Text as="dt" tone="muted" variant="control">
      {label}
    </Text>
    <Text as="dd" className="min-w-0" variant="bodyCompact" wrap="break">
      {value}
    </Text>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

const SectionTabs = ({
  active,
  onSelect,
}: {
  readonly active: ActiveLocation;
  readonly onSelect: (next: ActiveLocation) => void;
}) => (
  <aside className="grid min-h-0 grid-rows-[auto_1fr] border-r border-border bg-sidebar">
    <div className="flex h-14 items-center gap-3 border-b border-border px-4">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground"
      >
        <Settings className="size-4" />
      </span>
      <Text as="p" truncate variant="panelTitle">
        Settings
      </Text>
    </div>
    <nav aria-label="Settings mock navigation" className="min-h-0 overflow-y-auto p-3">
      <div className="grid gap-5">
        <div className="grid gap-1">
          <Text as="h2" className="px-2 py-1" tone="muted" variant="meta">
            User
          </Text>
          {sectionItems.slice(0, 2).map((item) => (
            <NavigationItem
              active={active.section === item.id}
              icon={<item.icon aria-hidden className="size-4" />}
              key={item.id}
              label={item.label}
              onNavigate={() => onSelect({ section: item.id })}
            />
          ))}
        </div>

        <div className="grid gap-1">
          <Text as="h2" className="px-2 py-1" tone="muted" variant="meta">
            Automation
          </Text>
          <NavigationItem
            active={active.section === "agents"}
            count="2"
            icon={<Bot aria-hidden className="size-4" />}
            label="Agents"
            onNavigate={() => onSelect({ section: "agents" })}
          />
        </div>

        <div className="grid gap-1">
          <Text as="h2" className="px-2 py-1" tone="muted" variant="meta">
            Workspace
          </Text>
          <NavigationItem
            active={active.section === "repositories" && !active.repositoryId}
            count={repositories.length}
            icon={<FolderGit2 aria-hidden className="size-4" />}
            label="Repositories"
            onNavigate={() => onSelect({ section: "repositories" })}
            showDisclosure
            expanded={active.section === "repositories"}
          />
          {repositories.map((repository) => (
            <NavigationItem
              active={active.section === "repositories" && active.repositoryId === repository.id}
              count={
                repository.warnings > 0 ? (
                  <span className="text-warning">{repository.warnings}</span>
                ) : undefined
              }
              depth={1}
              key={repository.id}
              label={repository.name}
              onNavigate={() => onSelect({ repositoryId: repository.id, section: "repositories" })}
            />
          ))}
        </div>

        <div className="grid gap-1">
          <Text as="h2" className="px-2 py-1" tone="muted" variant="meta">
            Diagnostics
          </Text>
          {sectionItems.slice(4).map((item) => (
            <NavigationItem
              active={active.section === item.id}
              icon={<item.icon aria-hidden className="size-4" />}
              key={item.id}
              label={item.label}
              onNavigate={() => onSelect({ section: item.id })}
            />
          ))}
        </div>
      </div>
    </nav>
  </aside>
);

const GeneralPanel = () => {
  const [theme, setTheme] = React.useState("system");
  const [density, setDensity] = React.useState("compact");

  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow="Application" title="General" />
      <Panel title="General">
        <div className="px-5">
          <SettingRow
            control={
              <Button
                leftIcon={<RotateCcw aria-hidden className="size-4" />}
                size="sm"
                variant="outline"
              >
                Clear
              </Button>
            }
            description="Clears Electron renderer cache without touching repositories, logs, or local data."
            title="Renderer cache"
          />
          <SettingRow
            control={<Switch defaultChecked />}
            description="Starts repository materialization and remote checks when Cycle opens."
            title="Open repositories on launch"
          />
        </div>
      </Panel>
      <Panel title="Appearance">
        <div className="px-5">
          <SettingRow
            control={
              <Select
                aria-label="Interface theme"
                className="w-40"
                items={[
                  { label: "System", value: "system" },
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                ]}
                onValueChange={(value) => {
                  if (value) setTheme(value);
                }}
                value={theme}
              />
            }
            description="Follows native system appearance unless a fixed theme is selected."
            title="Interface theme"
          />
          <SettingRow
            control={
              <Select
                aria-label="Interface density"
                className="w-40"
                items={[
                  { label: "Compact", value: "compact" },
                  { label: "Spacious", value: "spacious" },
                ]}
                onValueChange={(value) => {
                  if (value) setDensity(value);
                }}
                value={density}
              />
            }
            description="Compact is optimized for developer workflows with dense lists and panels."
            title="Density"
          />
        </div>
      </Panel>
    </div>
  );
};

const ProfilePanel = () => (
  <div className="grid gap-6">
    <SectionHeader eyebrow="Identity" title="Profile" />
    <Panel className="p-5">
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          <span>Display name</span>
          <Input defaultValue="Robert Pitt" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          <span>Email</span>
          <Input defaultValue="robert@example.com" type="email" />
        </label>
      </div>
      <div className="mt-5 flex justify-end">
        <Button size="sm" variant="outline">
          Save profile
        </Button>
      </div>
    </Panel>
  </div>
);

const HarnessRow = ({ harness }: { readonly harness: HarnessMock }) => {
  const [enabled, setEnabled] = React.useState(harness.status === "available");
  const available = harness.status === "available";

  return (
    <div className="grid gap-3 border-b border-border px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusIndicator
            label={`${harness.name} status`}
            tone={available ? "success" : "warning"}
          />
          <Text as="h3" variant="panelTitle">
            {harness.name}
          </Text>
          <Badge tone={available ? "success" : "warning"}>
            {available ? "Available" : "Missing"}
          </Badge>
        </div>
        <Text as="p" className="mt-1" tone="muted" variant="bodyCompact" wrap="break">
          {harness.path ?? `${harness.executable} executable was not found`}
        </Text>
      </div>
      <Text as="p" tone="muted" variant="bodyCompact">
        {harness.capability}
      </Text>
      <Switch
        checked={enabled}
        disabled={!available}
        onCheckedChange={(checked) => setEnabled(checked === true)}
      />
    </div>
  );
};

const AgentsPanel = () => {
  const [provider, setProvider] = React.useState("codex");
  const [concurrency, setConcurrency] = React.useState("unlimited");
  const [reasoning, setReasoning] = React.useState("medium");

  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow="Harness management" title="Agents" />
      <Panel title="Global agent work">
        <div className="px-5">
          <SettingRow
            control={<Switch defaultChecked />}
            description="Controls whether Cycle can start new local agent work."
            title="Enable agents"
          />
          <SettingRow
            control={
              <Select
                aria-label="Global concurrency"
                className="w-40"
                items={[
                  { label: "Unlimited", value: "unlimited" },
                  { label: "1 job", value: "1" },
                  { label: "2 jobs", value: "2" },
                  { label: "4 jobs", value: "4" },
                ]}
                onValueChange={(value) => {
                  if (value) setConcurrency(value);
                }}
                value={concurrency}
              />
            }
            description="Global limit before repository-specific agent overrides are applied."
            title="Concurrency"
          />
        </div>
      </Panel>
      <Panel title="Harnesses">
        {harnesses.map((harness) => (
          <HarnessRow harness={harness} key={harness.id} />
        ))}
      </Panel>
      <Panel title="Provider defaults">
        <div className="px-5">
          <SettingRow
            control={
              <Select
                aria-label="Preferred harness"
                className="w-44"
                items={[
                  { label: "Codex", value: "codex" },
                  { disabled: true, label: "OpenCode missing", value: "opencode" },
                ]}
                onValueChange={(value) => {
                  if (value) setProvider(value);
                }}
                value={provider}
              />
            }
            description="Repositories inherit this harness unless they override it."
            title="Preferred harness"
          />
          <SettingRow
            control={
              <Select
                aria-label="Reasoning effort"
                className="w-44"
                items={[
                  { label: "Low", value: "low" },
                  { label: "Medium", value: "medium" },
                  { label: "High", value: "high" },
                ]}
                onValueChange={(value) => {
                  if (value) setReasoning(value);
                }}
                value={reasoning}
              />
            }
            description="Shown because the selected harness reports reasoning controls."
            title="Reasoning effort"
          />
        </div>
      </Panel>
    </div>
  );
};

const RepositoryIndexPanel = ({
  onRepositorySelect,
}: {
  readonly onRepositorySelect: (repositoryId: RepositoryId) => void;
}) => (
  <div className="grid gap-6">
    <SectionHeader eyebrow="Workspace" title="Repositories" />
    <div className="grid gap-3">
      {repositories.map((repository) => (
        <button
          className="grid w-full gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-card transition-colors hover:bg-subtle md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          key={repository.id}
          onClick={() => onRepositorySelect(repository.id)}
          type="button"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusIndicator
                label={`${repository.name} status`}
                tone={stageTone(repository.stage)}
              />
              <Text as="h2" variant="sectionTitle">
                {repository.name}
              </Text>
              <Badge tone={stageTone(repository.stage)}>{stageLabel(repository.stage)}</Badge>
            </div>
            <Text as="p" className="mt-1" tone="muted" variant="bodyCompact" wrap="break">
              {repository.path}
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <Text as="span" tone="muted" variant="meta">
              {repository.branch} · {repository.remote}
            </Text>
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  </div>
);

const RepositoryDetailPanel = ({ repository }: { readonly repository: RepositoryMock }) => {
  const [commitStyle, setCommitStyle] = React.useState("descriptive");
  const [provider, setProvider] = React.useState("inherit");

  return (
    <div className="grid gap-6">
      <SectionHeader eyebrow="Repository settings" title={repository.name} />
      <Panel className="overflow-hidden">
        <div className="grid gap-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusIndicator
                  label={`${repository.name} status`}
                  tone={stageTone(repository.stage)}
                />
                <Text as="h2" variant="sectionTitle">
                  {repository.name}
                </Text>
                <Badge tone={stageTone(repository.stage)}>{stageLabel(repository.stage)}</Badge>
              </div>
              <Text as="p" className="mt-2" tone="muted" variant="bodyCompact" wrap="break">
                {repository.path}
              </Text>
            </div>
            <Button size="sm" variant="outline">
              Reveal
            </Button>
          </div>
          <div className="grid gap-3">
            {[
              ["Branch", repository.branch],
              ["Remote", repository.remote],
              ["Snapshot", repository.snapshot],
              ["Warnings", String(repository.warnings)],
            ].map(([label, value]) => (
              <div className="rounded-md border border-border bg-subtle px-3 py-2" key={label}>
                <Text as="p" tone="muted" variant="meta">
                  {label}
                </Text>
                <Text as="p" className="mt-1" variant="control" wrap="break">
                  {value}
                </Text>
              </div>
            ))}
          </div>
          {repository.error ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{repository.error}</span>
            </div>
          ) : null}
        </div>
      </Panel>
      <Panel title="Preferences">
        <div className="px-5">
          <SettingRow
            control={
              <Select
                aria-label="Commit style"
                className="w-40"
                items={[
                  { label: "Descriptive", value: "descriptive" },
                  { label: "Compact", value: "compact" },
                ]}
                onValueChange={(value) => {
                  if (value) setCommitStyle(value);
                }}
                value={commitStyle}
              />
            }
            description="Saved preference for Cycle commit message formatting."
            title="Commit style"
          />
          <SettingRow
            control={<Switch defaultChecked />}
            description="Runs background sync checks for this repository."
            title="Auto sync"
          />
        </div>
      </Panel>
      <Panel title="Agent work">
        <div className="px-5">
          <SettingRow
            control={<Switch defaultChecked={false} />}
            description="Pauses new starts for this repository only."
            title="Repository paused"
          />
          <SettingRow
            control={
              <Select
                aria-label="Provider override"
                className="w-44"
                items={[
                  { label: "Inherit global", value: "inherit" },
                  { label: "Codex", value: "codex" },
                ]}
                onValueChange={(value) => {
                  if (value) setProvider(value);
                }}
                value={provider}
              />
            }
            description="Overrides the global harness for this repository."
            title="Harness override"
          />
        </div>
      </Panel>
      <Panel title="Remote operations">
        <div className="grid gap-3 p-5">
          <div className="flex flex-wrap gap-2">
            <Button leftIcon={<RefreshCcw aria-hidden className="size-4" />} variant="outline">
              Resync
            </Button>
            <Button leftIcon={<RotateCcw aria-hidden className="size-4" />} variant="outline">
              Pull
            </Button>
            <Button variant="outline">Push</Button>
          </div>
          <Separator />
          <Button
            leftIcon={<Trash2 aria-hidden className="size-4" />}
            tone="danger"
            variant="outline"
          >
            Remove repository
          </Button>
        </div>
      </Panel>
    </div>
  );
};

const RepositoriesPanel = ({
  activeRepositoryId,
  onRepositorySelect,
}: {
  readonly activeRepositoryId?: RepositoryId;
  readonly onRepositorySelect: (repositoryId: RepositoryId) => void;
}) => {
  const repository = repositories.find((candidate) => candidate.id === activeRepositoryId);

  if (!repository) {
    return <RepositoryIndexPanel onRepositorySelect={onRepositorySelect} />;
  }

  return <RepositoryDetailPanel repository={repository} />;
};

const EndpointsPanel = () => (
  <div className="grid gap-6">
    <SectionHeader eyebrow="Read-only diagnostics" title="Endpoints" />
    <Panel title="Local services">
      <dl>
        <InfoRow
          action={
            <Button size="sm" variant="outline">
              Open
            </Button>
          }
          label="Cycle API"
          value="http://127.0.0.1:4738"
        />
        <InfoRow
          action={
            <Button size="sm" variant="outline">
              Open
            </Button>
          }
          label="MCP endpoint"
          value="http://127.0.0.1:4738/mcp"
        />
        <InfoRow
          action={<Badge tone="neutral">Redacted</Badge>}
          label="Auth token"
          value="Configured"
        />
        <InfoRow
          action={
            <Button size="sm" variant="outline">
              Open
            </Button>
          }
          label="OpenAPI spec"
          value="http://127.0.0.1:4738/spec.json"
        />
      </dl>
    </Panel>
  </div>
);

const AdvancedPanel = () => (
  <div className="grid gap-6">
    <SectionHeader eyebrow="Developer details" title="Advanced" />
    <Panel title="Directories">
      <dl>
        <InfoRow
          action={
            <Button size="sm" variant="outline">
              Reveal
            </Button>
          }
          label="Cycle home"
          value="/Users/robertpitt/.cycle"
        />
        <InfoRow label="App config" value="/Users/robertpitt/.cycle/app-config.json" />
        <InfoRow label="Database" value="/Users/robertpitt/.cycle/cycle.db" />
        <InfoRow
          action={
            <Button size="sm" variant="outline">
              Reveal
            </Button>
          }
          label="Log file"
          value="/Users/robertpitt/.cycle/logs/cycle.jsonl"
        />
        <InfoRow label="Agent worktrees" value="/Users/robertpitt/.cycle/agent-worktrees" />
      </dl>
    </Panel>
    <Panel title="Runtime">
      <dl>
        <InfoRow
          action={<Badge tone="success">Ready</Badge>}
          label="Bootstrap phase"
          value="ready-with-background-sync"
        />
        <InfoRow label="Config schema" value="3" />
        <InfoRow label="API runtime file" value="/var/folders/.../cycle-api-501.json" />
        <InfoRow label="Provider detection" value="1 available · 1 missing" />
        <InfoRow label="Repository summary" value="2 ready · 1 failed · 4 warnings" />
      </dl>
    </Panel>
  </div>
);

const Content = ({
  active,
  onRepositorySelect,
}: {
  readonly active: ActiveLocation;
  readonly onRepositorySelect: (repositoryId: RepositoryId) => void;
}) => {
  switch (active.section) {
    case "general":
      return <GeneralPanel />;
    case "profile":
      return <ProfilePanel />;
    case "agents":
      return <AgentsPanel />;
    case "repositories":
      return (
        <RepositoriesPanel
          activeRepositoryId={active.repositoryId}
          onRepositorySelect={onRepositorySelect}
        />
      );
    case "endpoints":
      return <EndpointsPanel />;
    case "advanced":
      return <AdvancedPanel />;
  }
};

const DesktopSettingsMock = ({ mode }: { readonly mode: ThemeMode }) => {
  const [active, setActive] = React.useState<ActiveLocation>({ section: "general" });

  return (
    <ThemeProvider className="min-h-screen bg-background text-foreground" mode={mode}>
      <div className="grid h-screen min-h-[760px] grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
        <SectionTabs active={active} onSelect={setActive} />
        <main className="min-h-0 overflow-y-auto bg-background">
          <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
            <Content
              active={active}
              onRepositorySelect={(repositoryId) =>
                setActive({ repositoryId, section: "repositories" })
              }
            />
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
};

const meta = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  title: "Examples/Desktop Settings Mock",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: (_args, context) => (
    <DesktopSettingsMock mode={(context.globals["theme"] as ThemeMode) ?? "system"} />
  ),
};
