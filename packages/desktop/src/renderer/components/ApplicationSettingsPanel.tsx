import {
  ApplicationSettingsPanel as UiApplicationSettingsPanel,
  type ApplicationSettingsSection as UiApplicationSettingsSection,
  type ApplicationSettingsProfile,
} from "@cycle/ui/organisms";
import * as React from "react";
import {
  isThemePreference,
  isInterfaceDensity,
  type AppConfigState,
  type InterfaceDensity,
  type ThemePreference,
} from "../../shared/AppConfig.ts";
import {
  useClearCacheMutation,
  useSetInterfaceDensityMutation,
  useSetThemePreferenceMutation,
  useUpdateProfileMutation,
} from "../mutations/index.ts";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import type { BootstrapStatus } from "../../shared/Bootstrap.ts";
import { useSettingsDiagnosticsQuery } from "../queries/index.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { Button, StatusIndicator } from "@cycle/ui/atoms";
import { ExternalLink } from "lucide-react";
import type { SettingsDiagnostics } from "../../ipc/Channels.ts";

export type ApplicationSettingsSection =
  | UiApplicationSettingsSection
  | "advanced"
  | "agents"
  | "endpoints"
  | "repositories";

type ApplicationSettingsPanelProps = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly appConfig: AppConfigState;
  readonly bootstrapStatus?: BootstrapStatus;
  readonly section: ApplicationSettingsSection;
};

const themeItems = [
  {
    label: "System",
    value: "system",
  },
  {
    label: "Light",
    value: "light",
  },
  {
    label: "Dark",
    value: "dark",
  },
] satisfies ReadonlyArray<{ readonly label: string; readonly value: ThemePreference }>;

const densityItems = [
  {
    label: "Compact",
    value: "compact",
  },
  {
    label: "Spacious",
    value: "spacious",
  },
] satisfies ReadonlyArray<{ readonly label: string; readonly value: InterfaceDensity }>;

const settingPageCopy = {
  advanced: {
    description: "Filesystem paths, bootstrap state, provider status, and runtime versions.",
    title: "Advanced",
  },
  agents: {
    description: "Local background agent defaults and harness controls for this desktop profile.",
    title: "Agents",
  },
  endpoints: {
    description: "Read-only status for the local Cycle API and MCP endpoint.",
    title: "Endpoints",
  },
  general: {
    description: "Baseline application behavior, local maintenance, and appearance.",
    title: "General",
  },
  profile: {
    description: "Your identity for Cycle records and repository activity.",
    title: "Profile",
  },
  repositories: {
    description: "Registered local repositories and per-repository settings.",
    title: "Repositories",
  },
} satisfies Record<
  ApplicationSettingsSection,
  { readonly description: string; readonly title: string }
>;

const PageShell = ({
  children,
  description,
  title,
}: {
  readonly children?: React.ReactNode;
  readonly description: string;
  readonly title: string;
}) => (
  <div className="mx-auto grid w-full max-w-3xl gap-6 p-5">
    <header className="grid gap-1">
      <h1 className="text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
    {children}
  </div>
);

const SectionShell = ({
  children,
  description,
  title,
}: {
  readonly children: React.ReactNode;
  readonly description?: string;
  readonly title: string;
}) => (
  <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
    <div className="mb-3">
      <h2 className="text-base font-semibold tracking-normal text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </section>
);

const asText = (value: unknown, fallback = "Unavailable"): string => {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message;
  return fallback;
};

const statusTone = (status: string): React.ComponentProps<typeof StatusIndicator>["tone"] => {
  if (status === "available" || status === "present" || status === "ready") return "success";
  if (status === "missing" || status === "unavailable" || status === "failed") return "warning";
  return "neutral";
};

const DiagnosticRow = ({
  actionUrl,
  label,
  status,
  value,
}: {
  readonly actionUrl?: string;
  readonly label: string;
  readonly status?: string;
  readonly value: React.ReactNode;
}) => (
  <div className="grid gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
    <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words text-sm text-foreground">
      {status ? (
        <span className="inline-flex items-center gap-2">
          <StatusIndicator label={status} tone={statusTone(status)} />
          {value}
        </span>
      ) : (
        value
      )}
    </dd>
    {actionUrl ? (
      <Button
        leftIcon={<ExternalLink aria-hidden className="size-3.5" />}
        onClick={() => void getDesktopBridge()?.openExternal(actionUrl)}
        size="sm"
        variant="outline"
      >
        Open
      </Button>
    ) : null}
  </div>
);

const EndpointsSettingsPanel = ({
  diagnostics,
  error,
}: {
  readonly diagnostics?: SettingsDiagnostics;
  readonly error?: unknown;
}) => (
  <PageShell {...settingPageCopy.endpoints}>
    <SectionShell title="Cycle API">
      <dl>
        <DiagnosticRow label="Enabled" value={diagnostics?.api.enabled ? "Yes" : "No"} />
        <DiagnosticRow
          actionUrl={diagnostics?.api.baseUrl}
          label="Base URL"
          status={diagnostics?.api.status}
          value={asText(diagnostics?.api.baseUrl)}
        />
        <DiagnosticRow label="Auth" value={asText(diagnostics?.api.auth, "Unknown")} />
        <DiagnosticRow
          actionUrl={diagnostics?.runtimeFile.specUrl}
          label="OpenAPI spec"
          value={asText(diagnostics?.runtimeFile.specUrl)}
        />
      </dl>
    </SectionShell>
    <SectionShell title="MCP">
      <dl>
        <DiagnosticRow label="Enabled" value={diagnostics?.mcp.enabled ? "Yes" : "No"} />
        <DiagnosticRow
          actionUrl={diagnostics?.mcp.url}
          label="URL"
          status={diagnostics?.mcp.status}
          value={asText(diagnostics?.mcp.url)}
        />
        <DiagnosticRow label="Path" value={asText(diagnostics?.mcp.path)} />
      </dl>
    </SectionShell>
    <SectionShell title="Runtime Discovery">
      <dl>
        <DiagnosticRow
          label="File"
          status={diagnostics?.runtimeFile.status}
          value={asText(diagnostics?.runtimeFile.path)}
        />
        <DiagnosticRow label="Process ID" value={asText(diagnostics?.runtimeFile.pid)} />
        <DiagnosticRow label="Started" value={asText(diagnostics?.runtimeFile.startedAt)} />
      </dl>
      {error ? <p className="mt-3 text-sm text-destructive">{asText(error)}</p> : null}
    </SectionShell>
  </PageShell>
);

const AdvancedSettingsPanel = ({
  bootstrapStatus,
  diagnostics,
  providers,
}: {
  readonly bootstrapStatus?: BootstrapStatus;
  readonly diagnostics?: SettingsDiagnostics;
  readonly providers: readonly DetectedAgentProvider[];
}) => {
  const repositorySummary =
    bootstrapStatus?.repositories.length === 0
      ? "No registered repositories"
      : (bootstrapStatus?.repositories ?? [])
          .map((repository) => `${repository.displayName}: ${repository.stage}`)
          .join(", ");
  const providerSummary =
    providers.length === 0
      ? "No providers detected"
      : providers.map((provider) => `${provider.name}: ${provider.status}`).join(", ");

  return (
    <PageShell {...settingPageCopy.advanced}>
      <SectionShell title="Filesystem">
        <dl>
          <DiagnosticRow label="Cycle home" value={asText(diagnostics?.paths.cycleHome)} />
          <DiagnosticRow label="App config" value={asText(diagnostics?.paths.appConfig)} />
          <DiagnosticRow label="Database" value={asText(diagnostics?.paths.database)} />
          <DiagnosticRow label="Log" value={asText(diagnostics?.paths.log)} />
          <DiagnosticRow
            label="Agent worktrees"
            value={asText(diagnostics?.paths.agentWorktrees)}
          />
          <DiagnosticRow
            label="Runtime discovery"
            status={diagnostics?.runtimeFile.status}
            value={asText(diagnostics?.paths.runtimeDiscovery)}
          />
          <DiagnosticRow label="CLI config" value={asText(diagnostics?.paths.cliConfig)} />
        </dl>
      </SectionShell>
      <SectionShell title="Bootstrap">
        <dl>
          <DiagnosticRow
            label="Phase"
            status={bootstrapStatus?.phase}
            value={asText(bootstrapStatus?.phase)}
          />
          <DiagnosticRow label="Message" value={asText(bootstrapStatus?.message)} />
          <DiagnosticRow label="Started" value={asText(bootstrapStatus?.startedAt)} />
          <DiagnosticRow label="Completed" value={asText(bootstrapStatus?.completedAt)} />
          <DiagnosticRow label="Repositories" value={repositorySummary} />
          <DiagnosticRow label="Last error" value={asText(bootstrapStatus?.error)} />
        </dl>
      </SectionShell>
      <SectionShell title="Runtime">
        <dl>
          <DiagnosticRow label="Provider detection" value={providerSummary} />
          <DiagnosticRow label="Config schema" value={asText(diagnostics?.app.schemaVersion)} />
          <DiagnosticRow label="Electron" value={asText(diagnostics?.app.electronVersion)} />
          <DiagnosticRow label="Node" value={asText(diagnostics?.app.nodeVersion)} />
        </dl>
      </SectionShell>
    </PageShell>
  );
};

export const ApplicationSettingsPanel = ({
  agentProviders = [],
  appConfig,
  bootstrapStatus,
  section,
}: ApplicationSettingsPanelProps) => {
  const [cacheCleared, setCacheCleared] = React.useState(false);
  const updateProfile = useUpdateProfileMutation({ appConfig });
  const setThemePreference = useSetThemePreferenceMutation({ appConfig });
  const setInterfaceDensity = useSetInterfaceDensityMutation();
  const clearCache = useClearCacheMutation();
  const diagnosticsQuery = useSettingsDiagnosticsQuery(
    section === "endpoints" || section === "advanced",
  );

  const saveProfile = (profile: ApplicationSettingsProfile) => {
    updateProfile.mutate(profile);
  };

  const changeTheme = (value: string) => {
    if (!isThemePreference(value) || value === appConfig.theme.preference) return;
    setThemePreference.mutate(value);
  };

  const changeDensity = (value: string) => {
    if (!isInterfaceDensity(value) || value === appConfig.theme.density) return;
    setInterfaceDensity.mutate(value);
  };

  const clearRendererCache = () => {
    setCacheCleared(false);
    clearCache.mutate(undefined, {
      onSuccess: () => setCacheCleared(true),
    });
  };

  if (section === "agents") {
    return <PageShell {...settingPageCopy.agents} />;
  }

  if (section === "endpoints") {
    return (
      <EndpointsSettingsPanel diagnostics={diagnosticsQuery.data} error={diagnosticsQuery.error} />
    );
  }

  if (section === "advanced") {
    return (
      <AdvancedSettingsPanel
        bootstrapStatus={bootstrapStatus}
        diagnostics={diagnosticsQuery.data}
        providers={agentProviders}
      />
    );
  }

  if (section === "repositories") {
    return <PageShell {...settingPageCopy.repositories} />;
  }

  return (
    <UiApplicationSettingsPanel
      cacheCleared={cacheCleared}
      cacheError={
        clearCache.error
          ? clearCache.error instanceof Error
            ? clearCache.error.message
            : "Unable to clear cache."
          : undefined
      }
      cacheLoading={clearCache.isPending}
      densityItems={densityItems}
      densityPreference={appConfig.theme.density}
      onCacheClear={clearRendererCache}
      onDensityPreferenceChange={changeDensity}
      onProfileSave={saveProfile}
      onThemePreferenceChange={changeTheme}
      profile={{
        displayName: appConfig.profile.displayName,
        email: appConfig.profile.email,
      }}
      profileError={
        updateProfile.error
          ? updateProfile.error instanceof Error
            ? updateProfile.error.message
            : "Unable to save profile."
          : undefined
      }
      profileLoading={updateProfile.isPending}
      section={section}
      themeItems={themeItems}
      themePreference={appConfig.theme.preference}
    />
  );
};
