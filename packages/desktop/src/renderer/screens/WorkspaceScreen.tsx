import {
  AppShellFrame,
  AppShellHeader,
  AppShellMain,
  AppShellRoot,
  AppShellSidebar,
  InitialSetupCard,
  RepositoryInitialiseDialog,
  type AppShellNavSection,
  type InitialSetupHarness,
  type InitialSetupStep,
} from "@cycle/ui/organisms";
import { BrandMark, Button, IconButton } from "@cycle/ui/atoms";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CircleDot,
  FolderPlus,
  History,
  Inbox,
  LoaderCircle,
  ListTodo,
  PanelsTopLeft,
  Settings,
  SquareKanban,
} from "lucide-react";
import * as React from "react";
import {
  defaultRepositoryPreferences,
  defaultAppConfig,
  type AppConfigState,
  type RepositoryRecord,
} from "../../shared/AppConfig.ts";
import {
  supportedAgentProviders,
  type AgentProviderId,
  type DetectedAgentProvider,
} from "../../shared/AgentProviders.ts";
import type {
  InitializeRepositoryPathInput,
  UpdateRepositoryPreferencesInput,
} from "../../shared/LocalWorkspace.ts";

const createRepositoryNavItems = (repositories: readonly RepositoryRecord[]) =>
  repositories.flatMap((repository) => {
    const expanded = repository.preferences.sidebarExpanded;
    const repositoryItem = {
      className: "h-7 px-2 text-xs font-medium text-muted-foreground",
      expanded,
      id: `repository:${repository.id}`,
      label: repository.displayName,
      showDisclosure: true,
    };

    if (!expanded) return [repositoryItem];

    return [
      repositoryItem,
      {
        className: "h-7 text-xs",
        depth: 1 as const,
        icon: <ListTodo aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:issues`,
        label: "Issues",
      },
      {
        className: "h-7 text-xs",
        depth: 1 as const,
        icon: <PanelsTopLeft aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:views`,
        label: "Views",
      },
      {
        className: "h-7 text-xs",
        depth: 1 as const,
        icon: <Settings aria-hidden className="size-3.5" />,
        id: `repository:${repository.id}:settings`,
        label: "Settings",
      },
    ];
  });

const createRendererNavSections = (repositories: readonly RepositoryRecord[]) =>
  [
    {
      id: "workspace",
      items: [
        {
          badge: "3",
          icon: <Inbox aria-hidden className="size-4" />,
          id: "inbox",
          label: "Inbox",
        },
        {
          icon: <ListTodo aria-hidden className="size-4" />,
          id: "issues",
          label: "Issues",
        },
        {
          icon: <SquareKanban aria-hidden className="size-4" />,
          id: "projects",
          label: "Projects",
        },
        {
          icon: <PanelsTopLeft aria-hidden className="size-4" />,
          id: "views",
          label: "Views",
        },
      ],
      title: "Workspace",
    },
    {
      id: "repositories",
      items: createRepositoryNavItems(repositories),
      title: "Repositories",
    },
  ] satisfies readonly AppShellNavSection[];

const repositoryIdFromNavItem = (itemId: string): string | undefined => {
  const [scope, repositoryId, child] = itemId.split(":");
  if (scope !== "repository" || !repositoryId || child !== undefined) {
    return undefined;
  }

  return repositoryId;
};

const fallbackAgentProviders = (): ReadonlyArray<DetectedAgentProvider> =>
  supportedAgentProviders.map((provider) => ({
    detectedAt: new Date().toISOString(),
    executable: provider.executable,
    id: provider.id,
    name: provider.name,
    status: "missing",
  }));

const getDesktopBridge = () => window.cycleDesktop;

const detectAgentProvidersForRenderer = async (): Promise<ReadonlyArray<DetectedAgentProvider>> => {
  const bridge = getDesktopBridge();

  if (!bridge) {
    console.warn(
      "Cycle desktop bridge is unavailable; harness detection only works in the Electron renderer.",
    );
    return fallbackAgentProviders();
  }

  const providers = await bridge.detectAgentProviders();
  console.info("Cycle detected agent providers", providers);
  return providers;
};

const bootloaderDurationMs = 2200;

const isAgentProviderId = (value: string): value is AgentProviderId =>
  value === "codex" || value === "claude" || value === "opencode";

const toSetupHarnesses = (
  providers: ReadonlyArray<DetectedAgentProvider>,
): readonly InitialSetupHarness[] =>
  providers.map((provider) => ({
    description: provider.executable,
    executablePath: provider.executablePath,
    id: provider.id,
    name: provider.name,
    status: provider.status,
  }));

const makeFallbackRepository = (path: string): RepositoryRecord => {
  const trimmed = path.trim();
  const displayName = trimmed.split(/[\\/]/u).filter(Boolean).at(-1) ?? trimmed;

  return {
    addedAt: new Date().toISOString(),
    displayName,
    id: `repo_${Math.abs(
      Array.from(trimmed).reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7),
    )}`,
    path: trimmed,
    preferences: defaultRepositoryPreferences(),
  };
};

const BootloaderScreen = () => (
  <AppShellRoot className="grid place-items-center">
    <div className="grid justify-items-center gap-4">
      <BrandMark showLabel={false} />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Loading
      </div>
    </div>
  </AppShellRoot>
);

type SetupScreenProps = {
  readonly agentProvidersQuery: ReturnType<typeof useQuery<ReadonlyArray<DetectedAgentProvider>>>;
  readonly completeOnboarding: ReturnType<typeof useMutation<AppConfigState, Error, void>>;
  readonly email: string;
  readonly enabledHarnessIds: ReadonlySet<AgentProviderId>;
  readonly fullName: string;
  readonly harnessNotice?: React.ReactNode;
  readonly harnesses: readonly InitialSetupHarness[];
  readonly setEmail: (value: string) => void;
  readonly setEnabledHarnessIds: React.Dispatch<React.SetStateAction<ReadonlySet<AgentProviderId>>>;
  readonly setFullName: (value: string) => void;
  readonly setSetupStep: (step: InitialSetupStep) => void;
  readonly setupStep: InitialSetupStep;
};

const SetupScreen = ({
  agentProvidersQuery,
  completeOnboarding,
  email,
  enabledHarnessIds,
  fullName,
  harnessNotice,
  harnesses,
  setEmail,
  setEnabledHarnessIds,
  setFullName,
  setSetupStep,
  setupStep,
}: SetupScreenProps) => (
  <AppShellRoot className="grid min-h-screen place-items-center p-6">
    <div className="grid w-full justify-items-center gap-6">
      <BrandMark />
      <InitialSetupCard
        detectingHarnesses={agentProvidersQuery.isLoading}
        email={email}
        enabledHarnessIds={enabledHarnessIds}
        error={
          completeOnboarding.error instanceof Error ? completeOnboarding.error.message : undefined
        }
        fullName={fullName}
        harnessNotice={harnessNotice}
        harnesses={harnesses}
        onBack={() => setSetupStep("profile")}
        onEmailChange={setEmail}
        onFinish={() => completeOnboarding.mutate()}
        onFullNameChange={setFullName}
        onHarnessEnabledChange={(id, enabled) => {
          if (!isAgentProviderId(id)) return;
          setEnabledHarnessIds((current) => {
            const next = new Set(current);
            if (enabled) next.add(id);
            else next.delete(id);
            return next;
          });
        }}
        onNext={() => setSetupStep("harnesses")}
        saving={completeOnboarding.isPending}
        step={setupStep}
      />
    </div>
  </AppShellRoot>
);

type AddRepositoryStepProps = {
  readonly error?: React.ReactNode;
  readonly onSubmit: () => void;
  readonly saving?: boolean;
};

const AddRepositoryStep = ({ error, onSubmit, saving = false }: AddRepositoryStepProps) => (
  <div className="grid h-full place-items-center">
    <section className="grid w-full max-w-[520px] gap-5 rounded-lg border border-border bg-surface p-6 shadow-card">
      <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
        <FolderPlus aria-hidden className="size-5" />
      </div>
      <div className="grid gap-2">
        <h2 className="text-xl font-semibold tracking-normal">Add Repository</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Connect a local repository so Cycle can read project context and start tracking tickets.
        </p>
      </div>
      {error ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-5 text-warning">
          {error}
        </div>
      ) : null}
      <Button
        disabled={saving}
        leftIcon={
          saving ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
          ) : (
            <FolderPlus aria-hidden className="size-4" />
          )
        }
        onClick={onSubmit}
      >
        Choose Folder
      </Button>
    </section>
  </div>
);

export const WorkspaceScreen = () => {
  const queryClient = useQueryClient();
  const [bootComplete, setBootComplete] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [activeItemId, setActiveItemId] = React.useState("inbox");
  const [setupStep, setSetupStep] = React.useState<InitialSetupStep>("profile");
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [repositoryImportError, setRepositoryImportError] = React.useState<React.ReactNode>();
  const [repositoryInitialiseRequest, setRepositoryInitialiseRequest] = React.useState<{
    readonly message?: string;
    readonly path: string;
  } | null>(null);
  const [repositoryInitialiseError, setRepositoryInitialiseError] =
    React.useState<React.ReactNode>();
  const [enabledHarnessIds, setEnabledHarnessIds] = React.useState<ReadonlySet<AgentProviderId>>(
    () => new Set(),
  );
  const hydratedProfile = React.useRef(false);

  const appConfigQuery = useQuery({
    queryFn: async () => getDesktopBridge()?.getAppConfig() ?? defaultAppConfig(),
    queryKey: ["desktop", "appConfig"],
  });

  const agentProvidersQuery = useQuery({
    queryFn: detectAgentProvidersForRenderer,
    queryKey: ["desktop", "agentProviders"],
  });

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      const current = appConfigQuery.data ?? defaultAppConfig();
      const input = {
        displayName: fullName,
        email,
        enabledAgentProviderIds: [...enabledHarnessIds],
        themePreference: current.theme.preference,
      } as const;

      const bridge = getDesktopBridge();
      if (bridge) return bridge.completeOnboarding(input);

      return {
        ...current,
        onboarding: {
          completed: true,
          completedAt: new Date().toISOString(),
        },
        agentProviders: {
          preferences: supportedAgentProviders.map((provider) => ({
            enabled: enabledHarnessIds.has(provider.id),
            id: provider.id,
          })),
        },
        profile: {
          displayName: fullName.trim(),
          email: email.trim(),
        },
      } satisfies AppConfigState;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["desktop", "appConfig"], next);
      setActiveItemId("inbox");
    },
  });

  const addRepository = useMutation({
    mutationFn: async () => {
      const bridge = getDesktopBridge();

      if (bridge) return bridge.selectRepositoryFolder();
      return {
        repository: makeFallbackRepository("/Users/robertpitt/Projects/cycle"),
        status: "added" as const,
      };
    },
    onMutate: () => {
      setRepositoryImportError(undefined);
      setRepositoryInitialiseError(undefined);
    },
    onSuccess: async (result) => {
      if (result.status === "cancelled") return;

      if (result.status === "not-git") {
        setRepositoryInitialiseRequest({
          message: result.message,
          path: result.path,
        });
        return;
      }

      const bridge = getDesktopBridge();
      if (bridge) {
        queryClient.setQueryData(["desktop", "appConfig"], await bridge.getAppConfig());
        return;
      }

      const current = appConfigQuery.data ?? defaultAppConfig();
      queryClient.setQueryData(["desktop", "appConfig"], {
        ...current,
        localWorkspace: {
          repositories: [
            ...current.localWorkspace.repositories.filter(
              (repository) => repository.id !== result.repository.id,
            ),
            result.repository,
          ],
        },
      } satisfies AppConfigState);
    },
    onError: (error) => {
      setRepositoryImportError(
        error instanceof Error ? error.message : "Unable to add repository.",
      );
    },
  });

  const initialiseRepository = useMutation({
    mutationFn: async (input: InitializeRepositoryPathInput) => {
      const bridge = getDesktopBridge();
      if (bridge) return bridge.initializeRepositoryPath(input);
      return makeFallbackRepository(input.path);
    },
    onMutate: () => {
      setRepositoryInitialiseError(undefined);
    },
    onSuccess: async (repository) => {
      setRepositoryInitialiseRequest(null);

      const bridge = getDesktopBridge();
      if (bridge) {
        queryClient.setQueryData(["desktop", "appConfig"], await bridge.getAppConfig());
        return;
      }

      const current = appConfigQuery.data ?? defaultAppConfig();
      queryClient.setQueryData(["desktop", "appConfig"], {
        ...current,
        localWorkspace: {
          repositories: [
            ...current.localWorkspace.repositories.filter(
              (candidate) => candidate.id !== repository.id,
            ),
            repository,
          ],
        },
      } satisfies AppConfigState);
    },
    onError: (error) => {
      setRepositoryInitialiseError(
        error instanceof Error ? error.message : "Unable to initialise repository.",
      );
    },
  });

  const updateRepositoryPreferences = useMutation({
    mutationFn: async (input: UpdateRepositoryPreferencesInput) => {
      const bridge = getDesktopBridge();
      if (bridge) return bridge.updateRepositoryPreferences(input);

      const current = appConfigQuery.data ?? defaultAppConfig();
      const repository = current.localWorkspace.repositories.find(({ id }) => id === input.id);
      if (!repository) return null;

      return {
        ...repository,
        preferences: {
          ...repository.preferences,
          ...input.preferences,
        },
      } satisfies RepositoryRecord;
    },
    onSuccess: async (repository, input) => {
      const bridge = getDesktopBridge();
      if (bridge) {
        queryClient.setQueryData(["desktop", "appConfig"], await bridge.getAppConfig());
        return;
      }

      if (!repository) return;

      queryClient.setQueryData<AppConfigState>(["desktop", "appConfig"], (current) => {
        const state = current ?? appConfigQuery.data ?? defaultAppConfig();
        return {
          ...state,
          localWorkspace: {
            repositories: state.localWorkspace.repositories.map((candidate) =>
              candidate.id === input.id ? repository : candidate,
            ),
          },
        };
      });
    },
  });

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setBootComplete(true), bootloaderDurationMs);
    return () => window.clearTimeout(timeout);
  }, []);

  React.useEffect(() => {
    const profile = appConfigQuery.data?.profile;
    if (!profile || hydratedProfile.current) return;

    setFullName(profile.displayName);
    setEmail(profile.email);
    hydratedProfile.current = true;
  }, [appConfigQuery.data?.profile]);

  React.useEffect(() => {
    const providers = agentProvidersQuery.data;
    if (!providers) return;

    setEnabledHarnessIds(
      new Set(
        providers
          .filter((provider) => provider.status === "available")
          .map((provider) => provider.id),
      ),
    );
  }, [agentProvidersQuery.data]);

  if (!bootComplete || appConfigQuery.isLoading) return <BootloaderScreen />;

  const onboardingCompleted = appConfigQuery.data?.onboarding.completed ?? false;
  const setupHarnesses = toSetupHarnesses(agentProvidersQuery.data ?? fallbackAgentProviders());
  const repositories = appConfigQuery.data?.localWorkspace.repositories ?? [];
  const hasRepositories = repositories.length > 0;
  const harnessNotice = !getDesktopBridge()
    ? "Harness detection is only available in the Electron desktop renderer. Open the desktop app window to detect local tools."
    : agentProvidersQuery.error instanceof Error
      ? `Unable to detect harnesses: ${agentProvidersQuery.error.message}`
      : undefined;

  if (!onboardingCompleted) {
    return (
      <SetupScreen
        agentProvidersQuery={agentProvidersQuery}
        completeOnboarding={completeOnboarding}
        email={email}
        enabledHarnessIds={enabledHarnessIds}
        fullName={fullName}
        harnessNotice={harnessNotice}
        harnesses={setupHarnesses}
        setEmail={setEmail}
        setEnabledHarnessIds={setEnabledHarnessIds}
        setFullName={setFullName}
        setSetupStep={setSetupStep}
        setupStep={setupStep}
      />
    );
  }

  const activeSection =
    activeItemId === "settings"
      ? "Settings"
      : activeItemId.startsWith("repository:") || !hasRepositories
        ? "Repositories"
        : "Workspace";
  const chooseRepositoryFolder = () => addRepository.mutate();
  const chooseRepositoryFolderFromDialog = () => {
    setRepositoryInitialiseRequest(null);
    setRepositoryInitialiseError(undefined);
    chooseRepositoryFolder();
  };
  const rendererNavSections = createRendererNavSections(repositories);
  const handleNavItemSelect = (item: AppShellNavSection["items"][number]) => {
    const repositoryId = repositoryIdFromNavItem(item.id);
    if (repositoryId) {
      const repository = repositories.find((candidate) => candidate.id === repositoryId);
      if (repository) {
        setActiveItemId(item.id);
        updateRepositoryPreferences.mutate({
          id: repository.id,
          preferences: {
            sidebarExpanded: !repository.preferences.sidebarExpanded,
          },
        });
        return;
      }
    }

    setActiveItemId(item.id);
  };

  return (
    <>
      <AppShellRoot className="p-3">
        <AppShellFrame className="min-h-[calc(100vh-1.5rem)] gap-3" collapsed={collapsed}>
          <AppShellSidebar
            activeItemId={activeItemId}
            collapsed={collapsed}
            createLabel="Add Repository"
            navSections={rendererNavSections}
            onCreate={chooseRepositoryFolder}
            onNavItemSelect={handleNavItemSelect}
            onSettingsSelect={() => setActiveItemId("settings")}
            settingsActive={activeItemId === "settings"}
          />
          <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            <AppShellHeader
              breadcrumb="Cycle"
              collapsed={collapsed}
              onToggleSidebar={() => setCollapsed((value) => !value)}
              subtitle={
                hasRepositories ? "Desktop workspace" : "Add a repository to finish preparing Cycle"
              }
              title={activeSection}
              actions={
                <>
                  <IconButton
                    icon={<Bell aria-hidden className="size-4" />}
                    label="Notifications"
                    size="sm"
                    title="Notifications"
                  />
                  <IconButton
                    icon={<CircleDot aria-hidden className="size-4" />}
                    label="Status"
                    size="sm"
                    title="Status"
                  />
                </>
              }
            />
            <AppShellMain className="relative bg-background/60 p-4">
              {hasRepositories ? (
                <div
                  aria-label="Workspace content"
                  className="h-full rounded-md border border-border bg-surface"
                />
              ) : (
                <AddRepositoryStep
                  error={repositoryImportError}
                  onSubmit={chooseRepositoryFolder}
                  saving={addRepository.isPending}
                />
              )}
              <IconButton
                className="absolute bottom-3 right-3 shadow-card"
                icon={<History aria-hidden className="size-4" />}
                label="History"
                size="sm"
                title="History"
                variant="outline"
              />
            </AppShellMain>
          </div>
        </AppShellFrame>
      </AppShellRoot>
      {repositoryInitialiseRequest ? (
        <RepositoryInitialiseDialog
          error={repositoryInitialiseError}
          onCancel={() => {
            setRepositoryInitialiseRequest(null);
            setRepositoryInitialiseError(undefined);
          }}
          onChooseFolder={chooseRepositoryFolderFromDialog}
          onInitialise={() =>
            initialiseRepository.mutate({
              path: repositoryInitialiseRequest.path,
            })
          }
          path={repositoryInitialiseRequest.path}
          saving={initialiseRepository.isPending}
        />
      ) : null}
    </>
  );
};
