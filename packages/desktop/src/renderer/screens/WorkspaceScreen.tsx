import {
  AppShellFrame,
  AppShellHeader,
  AppShellMain,
  AppShellRoot,
  AppShellSidebar,
  CreateIssueDialog,
  RepositoryInitialiseDialog,
  type AppShellNavSection,
  type InitialSetupStep,
} from "@cycle/ui/organisms";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconButton, StatusIndicator } from "@cycle/ui/atoms";
import { ArrowLeft, FolderPlus, GitBranch, History, Plus, Square } from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate, type NavigateOptions } from "react-router";
import {
  AddRepositoryStep,
  ApplicationSettingsPanel,
  BootloaderScreen,
  ChatPanel,
  InboxPanel,
  IssuesPanel,
  PageBodyPlaceholder,
  RepositoryHistoryPanel,
  RepositorySettingsIndexPanel,
  RepositorySettingsPanel,
  SettingsSidebar,
  SetupScreen,
  ViewIssuePanel,
  ViewsPanel,
} from "../components/index.ts";
import { fallbackAgentProviders, toSetupHarnesses } from "../lib/agentProviders.ts";
import { authoringTicketTypes, normalizeCreateTicketType } from "../lib/ticketTypes.ts";
import { cycleApiClient } from "../lib/cycleApiClient.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import { createMarkdownTagSuggestions } from "../lib/markdownTagSuggestions.ts";
import {
  useAddRepositoryMutation,
  useCompleteOnboardingMutation,
  useCreateIssueMutation,
  useInitialiseRepositoryMutation,
  useUpdateRepositoryPreferencesMutation,
} from "../mutations/index.ts";
import {
  useAgentProvidersQuery,
  useAppConfigQuery,
  useBootstrapStatusQuery,
  issueListQueryKey,
  issueListRootQueryKey,
  inboxRootQueryKey,
  repositoryHistoryRepositoryQueryKey,
  useInboxSummaryQuery,
  useIssueListQuery,
  useIssueTemplateListQuery,
  useLabelListQuery,
  useMaterializationWarningsQuery,
  useRepositoryStatusQuery,
  useSavedViewDetailQuery,
  useUserListQuery,
} from "../queries/index.ts";
import { useShortcutAction } from "../shortcuts/ShortcutProvider.tsx";
import { getCreateIssueFormDraft, useCreateIssueForm } from "./workspace/createIssueForm.ts";
import {
  createIssueDialogOptionSections,
  defaultCreateIssueMoreActionMessage,
} from "./workspace/createIssueOptions.tsx";
import {
  applicationSettingsSectionFromNavItemId,
  activePageTitleForNavItem,
  createRendererSettingsNavSections,
  createRendererNavSections,
  defaultApplicationSettingsSection,
  isApplicationSettingsSection,
  repositoryIdFromNavItem,
  settingsNavItemIdForApplicationSection,
} from "./workspace/navigation.tsx";
import {
  invalidRepositoryFallbackPath,
  parentWorkspacePath,
  parseWorkspacePath,
  toWorkspacePath,
  writeStoredWorkspacePath,
  type WorkspaceLocation,
} from "./workspace/workspaceRoute.ts";
import { useMacTrackpadSwipeNavigation } from "./workspace/macTrackpadSwipeNavigation.ts";
import type { AgentProviderId } from "@cycle/backend/client";

const ticketTypeSections = [
  {
    id: "type",
    options: authoringTicketTypes.map((type) => ({
      icon: <Square aria-hidden className="size-4" strokeWidth={2} />,
      id: type.id,
      label: type.label,
      rightMeta: type.description,
    })),
  },
];

const defaultWorkspaceLocation: WorkspaceLocation = {
  page: "inbox",
  scope: "workspace",
};

const defaultSettingsLocation: WorkspaceLocation = {
  page: "settings",
  scope: "workspace",
  settingsSection: defaultApplicationSettingsSection,
};

const activeItemIdForWorkspaceLocation = (location: WorkspaceLocation): string => {
  if (location.scope === "workspace") {
    return location.page === "initiatives" ? "projects" : location.page;
  }

  return `repository:${location.repositoryId}:${location.page}`;
};

const workspaceLocationForNavItemId = (itemId: string): WorkspaceLocation | undefined => {
  switch (itemId) {
    case "chat":
    case "inbox":
    case "issues":
    case "views":
      return {
        page: itemId,
        scope: "workspace",
      };
    case "settings":
      return {
        page: "settings",
        scope: "workspace",
        settingsSection: defaultApplicationSettingsSection,
      };
    case "projects":
      return {
        page: "initiatives",
        scope: "workspace",
      };
    default:
      break;
  }

  const [scope, repositoryId, page] = itemId.split(":");
  if (scope !== "repository" || !repositoryId) return undefined;

  if (page === "settings") {
    return {
      page: "settings",
      scope: "workspace",
      settingsRepositoryId: repositoryId,
      settingsSection: "repositories",
    };
  }

  if (page === "history" || page === "issues" || page === "views") {
    return {
      page,
      repositoryId,
      scope: "repository",
    };
  }

  return {
    page: "issues",
    repositoryId,
    scope: "repository",
  };
};

export const WorkspaceScreen = () => {
  const collapsed = false;
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceLocation =
    parseWorkspacePath(location.pathname) ??
    (location.pathname.startsWith("/settings")
      ? defaultSettingsLocation
      : defaultWorkspaceLocation);
  const currentWorkspacePath = toWorkspacePath(workspaceLocation);
  const activeItemId = activeItemIdForWorkspaceLocation(workspaceLocation);
  const applicationSettingsRouteSection =
    workspaceLocation.scope === "workspace" && workspaceLocation.page === "settings"
      ? workspaceLocation.settingsSection
      : undefined;
  const applicationSettingsSection = isApplicationSettingsSection(applicationSettingsRouteSection)
    ? applicationSettingsRouteSection
    : defaultApplicationSettingsSection;
  const settingsRepositoryId =
    workspaceLocation.scope === "workspace" &&
    workspaceLocation.page === "settings" &&
    applicationSettingsSection === "repositories"
      ? workspaceLocation.settingsRepositoryId
      : undefined;
  const routeHistoryRef = React.useRef<string[]>([]);
  const forwardHistoryRef = React.useRef<string[]>([]);
  const skipNextRouteHistoryPush = React.useRef(false);
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
  const createIssueForm = useCreateIssueForm();
  const queryClient = useQueryClient();
  const navigateWorkspace = React.useCallback(
    (next: WorkspaceLocation | string, options?: NavigateOptions) => {
      navigate(typeof next === "string" ? next : toWorkspacePath(next), options);
    },
    [navigate],
  );

  const bootstrapStatusQuery = useBootstrapStatusQuery();
  const appConfigQuery = useAppConfigQuery();
  const agentProvidersQuery = useAgentProvidersQuery();
  const repositories = appConfigQuery.data?.localWorkspace.repositories ?? [];
  const repositoryIds = React.useMemo(
    () => repositories.map((repository) => repository.id),
    [repositories],
  );
  const routeRepositoryId =
    workspaceLocation.scope === "repository"
      ? workspaceLocation.repositoryId
      : settingsRepositoryId;
  const isGlobalIssuesPage =
    workspaceLocation.scope === "workspace" && workspaceLocation.page === "issues";
  const isChatPage = workspaceLocation.scope === "workspace" && workspaceLocation.page === "chat";
  const isInboxPage = workspaceLocation.scope === "workspace" && workspaceLocation.page === "inbox";
  const isIssuesPage =
    isGlobalIssuesPage ||
    (workspaceLocation.scope === "repository" && workspaceLocation.page === "issues");
  const isInitiativesPage =
    workspaceLocation.scope === "workspace" && workspaceLocation.page === "initiatives";
  const isViewsPage =
    workspaceLocation.page === "views" &&
    (workspaceLocation.scope === "workspace" || workspaceLocation.scope === "repository");
  const selectedSavedViewId =
    workspaceLocation.scope === "repository" && workspaceLocation.page === "views"
      ? workspaceLocation.viewId
      : undefined;
  const isSavedViewDetailPage = isViewsPage && selectedSavedViewId !== undefined;
  const isWorkItemsPage = isIssuesPage || isInitiativesPage || isSavedViewDetailPage;
  const activeRepository =
    routeRepositoryId === undefined
      ? workspaceLocation.scope === "workspace" &&
        (workspaceLocation.page === "initiatives" || workspaceLocation.page === "views")
        ? repositories[0]
        : undefined
      : repositories.find((repository) => repository.id === routeRepositoryId);
  const issueRepository =
    isIssuesPage || isInitiativesPage || isViewsPage ? activeRepository : undefined;
  const createIssueRepositoryId =
    createIssueForm.values.repositoryId || issueRepository?.id || repositories[0]?.id;
  const createIssueRepository =
    repositories.find((repository) => repository.id === createIssueRepositoryId) ?? issueRepository;
  const selectedIssueId =
    workspaceLocation.scope === "repository" &&
    (workspaceLocation.page === "issues" || workspaceLocation.page === "views")
      ? workspaceLocation.issueId
      : undefined;
  const selectedIssueRepositoryId = activeRepository?.id;
  const isIssueDetailPage = isWorkItemsPage && selectedIssueId !== undefined;
  const isRepositoryHistoryPage =
    workspaceLocation.scope === "repository" && workspaceLocation.page === "history";
  const isApplicationSettingsPage =
    workspaceLocation.scope === "workspace" && workspaceLocation.page === "settings";
  const isRepositorySettingsPage =
    isApplicationSettingsPage &&
    applicationSettingsSection === "repositories" &&
    settingsRepositoryId !== undefined;
  const isRepositorySettingsIndexPage =
    isApplicationSettingsPage &&
    applicationSettingsSection === "repositories" &&
    settingsRepositoryId === undefined;
  const isSettingsPage = isApplicationSettingsPage;
  const activeSettingsItemId = isApplicationSettingsPage
    ? settingsNavItemIdForApplicationSection(applicationSettingsSection)
    : undefined;

  const completeOnboarding = useCompleteOnboardingMutation({
    appConfig: appConfigQuery.data,
    email,
    enabledHarnessIds,
    fullName,
    onCompleted: () => navigateWorkspace(defaultWorkspaceLocation, { replace: true }),
  });

  const addRepository = useAddRepositoryMutation({
    appConfig: appConfigQuery.data,
    onImportError: setRepositoryImportError,
    onInitialiseError: setRepositoryInitialiseError,
    onInitialiseRequest: setRepositoryInitialiseRequest,
  });

  const initialiseRepository = useInitialiseRepositoryMutation({
    appConfig: appConfigQuery.data,
    onErrorMessage: setRepositoryInitialiseError,
    onInitialised: () => setRepositoryInitialiseRequest(null),
  });

  const updateRepositoryPreferences = useUpdateRepositoryPreferencesMutation({
    appConfig: appConfigQuery.data,
  });

  const createIssue = useCreateIssueMutation({
    repositoryId: createIssueRepository?.id,
  });
  const createTicketDraftChat = useMutation({
    mutationFn: (input: { readonly instructions: string }) => {
      if (!createIssueRepository) {
        throw new Error("Choose a repository before drafting an issue.");
      }

      return cycleApiClient.startTicketDraftChat({
        instructions: input.instructions,
        repository: createIssueRepository,
      });
    },
  });
  const repositoryStatusQuery = useRepositoryStatusQuery(activeRepository?.id);
  const materializationWarningsQuery = useMaterializationWarningsQuery(activeRepository?.id);
  const userListQuery = useUserListQuery(createIssueRepository?.id, {
    disabled: false,
  });
  const createIssueSuggestionsQuery = useIssueListQuery(createIssueRepository?.id);
  const inboxSummaryQuery = useInboxSummaryQuery(
    appConfigQuery.data?.profile.email
      ? {
          limit: 1,
          repositoryIds,
          status: "all",
          userId: appConfigQuery.data.profile.email,
        }
      : undefined,
  );
  const labelListQuery = useLabelListQuery(createIssueRepository?.id, {
    archived: false,
  });
  const templateListQuery = useIssueTemplateListQuery(createIssueRepository?.id, {
    active: true,
  });
  const selectedSavedViewQuery = useSavedViewDetailQuery(issueRepository?.id, selectedSavedViewId);
  const selectedSavedView = selectedSavedViewQuery.data ?? undefined;
  const repositoryStatus = repositoryStatusQuery.data;
  const repositoryColdSyncing =
    repositoryStatus?.status === "syncing" && repositoryStatus.activeSnapshotId === null;
  const onboardingCompleted = appConfigQuery.data?.onboarding.completed ?? false;
  const detectedAgentProviders = React.useMemo(
    () => agentProvidersQuery.data ?? fallbackAgentProviders(),
    [agentProvidersQuery.data],
  );
  const createIssueTagSuggestions = React.useMemo(
    () =>
      createMarkdownTagSuggestions({
        agentProviders: detectedAgentProviders,
        issues: createIssueSuggestionsQuery.data?.entries,
        repositories,
        users: userListQuery.data?.entries,
      }),
    [
      createIssueSuggestionsQuery.data?.entries,
      detectedAgentProviders,
      repositories,
      userListQuery.data?.entries,
    ],
  );
  const createIssueRepositorySections = React.useMemo(
    () => [
      {
        id: "repositories",
        options: repositories.map((repository) => ({
          icon: <GitBranch aria-hidden className="size-5" strokeWidth={2} />,
          id: repository.id,
          label: repository.displayName,
          rightMeta: repository.id,
        })),
      },
    ],
    [repositories],
  );
  const createIssueOptions = React.useMemo(
    () =>
      createIssueDialogOptionSections({
        labels: labelListQuery.data?.entries,
        profile: appConfigQuery.data?.profile,
        repository: createIssueRepository,
        templates: templateListQuery.data?.entries,
        users: userListQuery.data?.entries,
      }),
    [
      appConfigQuery.data?.profile,
      createIssueRepository,
      labelListQuery.data?.entries,
      templateListQuery.data?.entries,
      userListQuery.data?.entries,
    ],
  );
  const applyIssueTemplate = React.useCallback(
    (templateId: string | null) => {
      createIssueForm.setTemplate(templateId);
      if (templateId === null) return;

      const template = templateListQuery.data?.entries.find(
        (candidate) => candidate.id === templateId,
      );
      if (!template) return;

      const defaults = template.defaults ?? {};
      if (
        createIssueForm.values.title.trim().length === 0 &&
        !template.titleTemplate.includes("{{")
      ) {
        createIssueForm.setTitle(template.titleTemplate);
      }
      if (template.bodyTemplate.trim().length > 0) {
        createIssueForm.setDescription(template.bodyTemplate);
      }
      if (defaults.assignee !== undefined) {
        createIssueForm.setAssignee(defaults.assignee);
      }
      if (defaults.labels !== undefined) {
        createIssueForm.setLabels(defaults.labels);
      }
      if (typeof defaults.priority === "string") {
        createIssueForm.setPriority(defaults.priority as typeof createIssueForm.values.priority);
      }
      if (typeof defaults.status === "string") {
        createIssueForm.setStatus(defaults.status as typeof createIssueForm.values.status);
      }
      if (defaults.dueDate !== undefined && defaults.dueDate !== null) {
        createIssueForm.setDueDate(String(defaults.dueDate));
      }
      if (defaults.estimate !== undefined && defaults.estimate !== null) {
        createIssueForm.setEstimate(String(defaults.estimate));
      }
      if (typeof defaults.type === "string") {
        createIssueForm.setType(normalizeCreateTicketType(defaults.type) ?? "task");
      } else if (template.kind === "initiative") {
        createIssueForm.setType("epic");
      } else if (template.kind === "story" || template.kind === "specification") {
        createIssueForm.setType(template.kind);
      } else {
        createIssueForm.setType("task");
      }
    },
    [createIssueForm, templateListQuery.data?.entries],
  );

  React.useEffect(() => {
    const profile = appConfigQuery.data?.profile;
    if (!profile || hydratedProfile.current) return;

    setFullName(profile.displayName);
    setEmail(profile.email);
    hydratedProfile.current = true;
  }, [appConfigQuery.data?.profile]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute(
      "data-density",
      appConfigQuery.data?.theme.density ?? "compact",
    );
  }, [appConfigQuery.data?.theme.density]);

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

  React.useEffect(() => {
    if (!onboardingCompleted || appConfigQuery.isLoading) return;
    if (workspaceLocation.scope !== "repository" && settingsRepositoryId === undefined) return;
    if (activeRepository !== undefined) return;

    navigateWorkspace(
      settingsRepositoryId === undefined
        ? invalidRepositoryFallbackPath(repositories.length > 0)
        : "/settings/repositories",
      { replace: true },
    );
  }, [
    activeRepository,
    appConfigQuery.isLoading,
    navigateWorkspace,
    onboardingCompleted,
    repositories.length,
    settingsRepositoryId,
    workspaceLocation,
  ]);

  React.useEffect(() => {
    if (
      !onboardingCompleted ||
      appConfigQuery.isLoading ||
      workspaceLocation.scope !== "workspace" ||
      workspaceLocation.page !== "settings" ||
      location.pathname === currentWorkspacePath
    ) {
      return;
    }

    navigateWorkspace(currentWorkspacePath, { replace: true });
  }, [
    appConfigQuery.isLoading,
    currentWorkspacePath,
    location.pathname,
    navigateWorkspace,
    onboardingCompleted,
    workspaceLocation,
  ]);

  React.useEffect(() => {
    if (!onboardingCompleted || appConfigQuery.isLoading) return;
    if (workspaceLocation.scope !== "repository" || workspaceLocation.page !== "views") return;
    if (!workspaceLocation.viewId || !selectedSavedViewQuery.isSuccess) return;
    if (selectedSavedViewQuery.data !== null) return;

    navigateWorkspace(
      {
        page: "views",
        repositoryId: workspaceLocation.repositoryId,
        scope: "repository",
      },
      { replace: true },
    );
  }, [
    appConfigQuery.isLoading,
    navigateWorkspace,
    onboardingCompleted,
    selectedSavedViewQuery.data,
    selectedSavedViewQuery.isSuccess,
    workspaceLocation,
  ]);

  React.useEffect(() => {
    if (!onboardingCompleted || appConfigQuery.isLoading) return;
    if (workspaceLocation.scope === "repository" && activeRepository === undefined) return;

    if (skipNextRouteHistoryPush.current) {
      skipNextRouteHistoryPush.current = false;
    } else {
      const stack = routeHistoryRef.current;
      const expectedForwardPath = forwardHistoryRef.current.at(-1);

      if (expectedForwardPath === currentWorkspacePath) {
        forwardHistoryRef.current.pop();
      } else {
        forwardHistoryRef.current = [];
      }

      const existingIndex = stack.lastIndexOf(currentWorkspacePath);

      if (existingIndex >= 0) {
        stack.splice(existingIndex + 1);
      } else {
        stack.push(currentWorkspacePath);
        if (stack.length > 50) stack.splice(0, stack.length - 50);
      }
    }

    writeStoredWorkspacePath(
      typeof window === "undefined" ? undefined : window.localStorage,
      currentWorkspacePath,
    );
  }, [
    activeRepository,
    appConfigQuery.isLoading,
    currentWorkspacePath,
    onboardingCompleted,
    workspaceLocation.scope,
  ]);

  React.useEffect(() => {
    if (!onboardingCompleted || appConfigQuery.isLoading || !isApplicationSettingsPage) return;
    if (applicationSettingsRouteSection === applicationSettingsSection) return;

    navigateWorkspace(
      {
        page: "settings",
        scope: "workspace",
        settingsSection: applicationSettingsSection,
      },
      { replace: true },
    );
  }, [
    appConfigQuery.isLoading,
    applicationSettingsRouteSection,
    applicationSettingsSection,
    isApplicationSettingsPage,
    navigateWorkspace,
    onboardingCompleted,
  ]);

  React.useEffect(() => {
    if (!activeRepository?.id || repositoryStatus === undefined) return;
    if (repositoryStatus.status === "syncing") return;

    void queryClient.invalidateQueries({
      queryKey: repositoryHistoryRepositoryQueryKey(activeRepository.id),
    });
    void queryClient.invalidateQueries({
      queryKey: inboxRootQueryKey,
    });

    if (!issueRepository?.id) return;

    void queryClient.invalidateQueries({
      queryKey: issueListQueryKey(issueRepository.id),
    });
    void queryClient.invalidateQueries({
      queryKey: issueListRootQueryKey,
    });
  }, [
    activeRepository?.id,
    issueRepository?.id,
    queryClient,
    repositoryStatus?.activeGeneration,
    repositoryStatus?.status,
  ]);

  const navigationShortcutsDisabled =
    !onboardingCompleted || createIssueForm.open || repositoryInitialiseRequest !== null;

  const navigateToParent = React.useCallback(() => {
    const parentPath = parentWorkspacePath(workspaceLocation);
    if (!parentPath || parentPath === currentWorkspacePath) return;

    routeHistoryRef.current = [];
    forwardHistoryRef.current = [];
    skipNextRouteHistoryPush.current = false;
    navigateWorkspace(parentPath, { replace: true });
  }, [currentWorkspacePath, navigateWorkspace, workspaceLocation]);

  const navigateBackFromHistory = React.useCallback(() => {
    const stack = routeHistoryRef.current;

    if (stack.length > 1) {
      const currentPath = stack.pop();
      if (currentPath !== undefined) forwardHistoryRef.current.push(currentPath);
      skipNextRouteHistoryPush.current = true;
      navigate(-1);
      return;
    }

    navigateToParent();
  }, [navigate, navigateToParent]);

  const navigateForwardFromHistory = React.useCallback(() => {
    if (forwardHistoryRef.current.length === 0) return;

    navigate(1);
  }, [navigate]);

  useMacTrackpadSwipeNavigation({
    disabled: navigationShortcutsDisabled,
    onNavigateBack: navigateBackFromHistory,
    onNavigateForward: navigateForwardFromHistory,
  });

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["Escape"]],
        disabled: navigationShortcutsDisabled,
        id: "navigation.goBack",
        label: "Go back",
        run: navigateBackFromHistory,
      }),
      [navigateBackFromHistory, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "n"]],
        disabled: navigationShortcutsDisabled,
        id: "navigation.inbox",
        label: "Open inbox",
        run: () =>
          navigateWorkspace({
            page: "inbox",
            scope: "workspace",
          }),
      }),
      [navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "i"]],
        disabled: navigationShortcutsDisabled,
        id: "navigation.issues",
        label: "Open issues",
        run: () =>
          navigateWorkspace({
            page: "issues",
            scope: "workspace",
          }),
      }),
      [navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "c"]],
        disabled: navigationShortcutsDisabled,
        id: "navigation.chat",
        label: "Open chat",
        run: () =>
          navigateWorkspace({
            page: "chat",
            scope: "workspace",
          }),
      }),
      [navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "p"]],
        disabled: navigationShortcutsDisabled,
        id: "navigation.initiatives",
        label: "Open initiatives",
        run: () =>
          navigateWorkspace({
            page: "initiatives",
            scope: "workspace",
          }),
      }),
      [navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "v"]],
        disabled: navigationShortcutsDisabled,
        id: "navigation.views",
        label: "Open views",
        run: () =>
          navigateWorkspace({
            page: "views",
            scope: "workspace",
          }),
      }),
      [navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", ","]],
        disabled: navigationShortcutsDisabled,
        id: "navigation.settings",
        label: "Open settings",
        run: () =>
          navigateWorkspace({
            page: "settings",
            scope: "workspace",
            settingsSection: defaultApplicationSettingsSection,
          }),
      }),
      [navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "r", "i"]],
        disabled: navigationShortcutsDisabled || !activeRepository,
        id: "navigation.repositoryIssues",
        label: "Open repository issues",
        run: () => {
          if (!activeRepository) return;
          navigateWorkspace({
            page: "issues",
            repositoryId: activeRepository.id,
            scope: "repository",
          });
        },
      }),
      [activeRepository, navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "r", "v"]],
        disabled: navigationShortcutsDisabled || !activeRepository,
        id: "navigation.repositoryViews",
        label: "Open repository views",
        run: () => {
          if (!activeRepository) return;
          navigateWorkspace({
            page: "views",
            repositoryId: activeRepository.id,
            scope: "repository",
          });
        },
      }),
      [activeRepository, navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "r", "h"]],
        disabled: navigationShortcutsDisabled || !activeRepository,
        id: "navigation.repositoryHistory",
        label: "Open repository history",
        run: () => {
          if (!activeRepository) return;
          navigateWorkspace({
            page: "history",
            repositoryId: activeRepository.id,
            scope: "repository",
          });
        },
      }),
      [activeRepository, navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  useShortcutAction(
    React.useMemo(
      () => ({
        bindings: [["g", "r", ","]],
        disabled: navigationShortcutsDisabled || !activeRepository,
        id: "navigation.repositorySettings",
        label: "Open repository settings",
        run: () => {
          if (!activeRepository) return;
          navigateWorkspace({
            page: "settings",
            scope: "workspace",
            settingsRepositoryId: activeRepository.id,
            settingsSection: "repositories",
          });
        },
      }),
      [activeRepository, navigateWorkspace, navigationShortcutsDisabled],
    ),
  );

  if (bootstrapStatusQuery.data?.blocking !== false || appConfigQuery.isLoading) {
    return <BootloaderScreen status={bootstrapStatusQuery.data} />;
  }

  const setupHarnesses = toSetupHarnesses(agentProvidersQuery.data ?? fallbackAgentProviders());
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

  const chooseRepositoryFolder = () => addRepository.mutate();
  const openCreateIssueDialog = () => {
    createIssueForm.openDialog({
      mode: "agent",
      repositoryId: issueRepository?.id ?? repositories[0]?.id ?? "",
      type: isInitiativesPage ? "epic" : "auto",
    });
  };
  const closeCreateIssueDialog = () => {
    if (createIssue.isPending || createTicketDraftChat.isPending) return;

    createIssueForm.closeDialog();
  };
  const selectCreateIssueRepository = (repositoryId: string | null) => {
    createIssueForm.selectRepository(repositoryId);
  };
  const submitCreateIssueDraft = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createIssueRepository) {
      createIssueForm.setError("Choose a repository before drafting an issue.");
      return;
    }

    const instructions = createIssueForm.values.draftInstructions.trim();
    if (instructions.length === 0) {
      createIssueForm.setError("Tell the agent what ticket to draft.");
      return;
    }

    createIssueForm.setError(undefined);
    createTicketDraftChat.mutate(
      { instructions },
      {
        onError: (error) => {
          createIssueForm.setError(
            error instanceof Error ? error.message : "Unable to start ticket draft.",
          );
        },
        onSuccess: () => {
          createIssueForm.closeDialog();
          navigateWorkspace({
            page: "chat",
            scope: "workspace",
          });
        },
      },
    );
  };
  const submitCreateIssue = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createIssueRepository) {
      createIssueForm.setError("Choose a repository before creating an issue.");
      return;
    }

    const draft = getCreateIssueFormDraft(createIssueForm.values);

    if (!draft) {
      createIssueForm.setError("Enter an issue title and choose a canonical type.");
      return;
    }

    createIssueForm.setError(undefined);
    createIssue.mutate(
      {
        assignee: createIssueForm.values.assignee,
        body: draft.body,
        dueDate: draft.dueDate,
        estimate: draft.estimate,
        labels: createIssueForm.values.labels,
        priority: createIssueForm.values.priority,
        status: createIssueForm.values.status,
        title: draft.title,
        type: draft.type,
      },
      {
        onError: (error) => {
          createIssueForm.setError(
            error instanceof Error ? error.message : "Unable to create issue.",
          );
        },
        onSuccess: () => {
          if (createIssueForm.values.createMore) {
            createIssueForm.reset({
              createMore: true,
              mode: "manual",
              repositoryId: createIssueRepository.id,
            });
            return;
          }

          createIssueForm.closeDialog();
        },
      },
    );
  };
  const chooseRepositoryFolderFromDialog = () => {
    setRepositoryInitialiseRequest(null);
    setRepositoryInitialiseError(undefined);
    chooseRepositoryFolder();
  };
  const rendererNavSections = createRendererNavSections(repositories, {
    inboxUnreadCount: inboxSummaryQuery.data?.unreadCount,
    repositoryAction: (
      <IconButton
        className="-mr-[9px] text-muted-foreground hover:bg-transparent hover:text-foreground"
        icon={<Plus aria-hidden className="size-3.5" />}
        label="Add repository"
        onClick={chooseRepositoryFolder}
        size="sm"
        title="Add repository"
        variant="ghost"
      />
    ),
  });
  const settingsNavSections = createRendererSettingsNavSections();
  const activePageTitle = isIssueDetailPage
    ? (selectedIssueId ?? "Issue")
    : selectedSavedView
      ? selectedSavedView.name
      : activePageTitleForNavItem(activeItemId, repositories);
  const warningCount =
    repositoryStatus?.warningCount ?? materializationWarningsQuery.data?.length ?? 0;
  const repositoryStatusTone =
    repositoryStatusQuery.error !== null ||
    repositoryStatus?.status === "failed" ||
    repositoryStatus?.status === "degraded"
      ? "warning"
      : repositoryStatus?.status === "syncing"
        ? "info"
        : repositoryStatus?.status === "ready"
          ? "success"
          : "neutral";
  const repositoryStatusText = (() => {
    if (repositoryStatusQuery.error instanceof Error) return "Status unavailable";
    if (repositoryStatus?.status === "syncing") return "Syncing";
    if (repositoryStatus?.status === "failed") return "Failed";
    if (repositoryStatus?.status === "degraded") return `Warnings ${warningCount}`;
    if (repositoryStatus?.status === "ready") return "Ready";
    if (repositoryStatus?.status === "empty") return "Empty";
    return undefined;
  })();
  const repositoryStatusTitle =
    repositoryStatus?.lastSyncError ??
    (warningCount > 0
      ? `${warningCount} materialization warning${warningCount === 1 ? "" : "s"}`
      : undefined) ??
    repositoryStatusText;
  const pageHeaderActions = (
    <>
      {activeRepository ? (
        <div
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-subtle px-2 text-xs font-medium text-muted-foreground"
          title={repositoryStatusTitle}
        >
          <StatusIndicator label={repositoryStatusText} tone={repositoryStatusTone} />
          {repositoryStatusText}
        </div>
      ) : null}
      {isIssueDetailPage ? (
        <IconButton
          icon={<ArrowLeft aria-hidden className="size-4" />}
          label={isSavedViewDetailPage ? "Back to view" : "Back to issues"}
          onClick={navigateToParent}
          size="sm"
          title={isSavedViewDetailPage ? "Back to view" : "Back to issues"}
          variant="outline"
        />
      ) : null}
      {isSavedViewDetailPage && !isIssueDetailPage ? (
        <IconButton
          icon={<ArrowLeft aria-hidden className="size-4" />}
          label="Back to views"
          onClick={navigateToParent}
          size="sm"
          title="Back to views"
          variant="outline"
        />
      ) : null}
      {!hasRepositories ? (
        <IconButton
          icon={<FolderPlus aria-hidden className="size-4" />}
          label="Add repository"
          onClick={chooseRepositoryFolder}
          size="sm"
          title="Add repository"
          variant="outline"
        />
      ) : null}
      {isWorkItemsPage ? (
        <IconButton
          disabled={
            createIssue.isPending || createTicketDraftChat.isPending || repositories.length === 0
          }
          icon={<Plus aria-hidden className="size-4" />}
          label="Create issue"
          onClick={openCreateIssueDialog}
          size="sm"
          title="Create issue"
          variant="outline"
        />
      ) : null}
    </>
  );
  const handleNavItemSelect = (item: AppShellNavSection["items"][number]) => {
    const repositoryId = repositoryIdFromNavItem(item.id);
    if (repositoryId) {
      const repository = repositories.find((candidate) => candidate.id === repositoryId);
      if (repository) {
        const nextLocation = activeItemId.startsWith(`repository:${repository.id}:`)
          ? workspaceLocationForNavItemId(activeItemId)
          : ({
              page: "issues",
              repositoryId: repository.id,
              scope: "repository",
            } satisfies WorkspaceLocation);
        if (nextLocation) {
          navigateWorkspace(nextLocation);
        }
        updateRepositoryPreferences.mutate({
          id: repository.id,
          preferences: {
            sidebarExpanded: !repository.preferences.sidebarExpanded,
          },
        });
        return;
      }
    }

    const nextLocation = workspaceLocationForNavItemId(item.id);
    if (nextLocation) navigateWorkspace(nextLocation);
  };
  const handleSettingsNavItemSelect = (item: AppShellNavSection["items"][number]) => {
    const applicationSection = applicationSettingsSectionFromNavItemId(item.id);
    if (applicationSection !== undefined) {
      navigateWorkspace({
        page: "settings",
        scope: "workspace",
        settingsSection: applicationSection,
      });
      return;
    }
  };

  return (
    <>
      <AppShellRoot className="h-full overflow-hidden">
        <AppShellFrame className="h-full !min-h-0" collapsed={collapsed}>
          {isSettingsPage ? (
            <SettingsSidebar
              activeItemId={activeSettingsItemId}
              navSections={settingsNavSections}
              onBack={navigateToParent}
              onNavItemSelect={handleSettingsNavItemSelect}
            />
          ) : (
            <AppShellSidebar
              activeItemId={activeItemId}
              collapsed={collapsed}
              navSections={rendererNavSections}
              onNavItemSelect={handleNavItemSelect}
              onSettingsSelect={() =>
                navigateWorkspace({
                  page: "settings",
                  scope: "workspace",
                  settingsSection: defaultApplicationSettingsSection,
                })
              }
              settingsActive={activeItemId === "settings"}
            />
          )}
          {/* add rounded corners */}
          <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-surface">
            <AppShellHeader title={activePageTitle} actions={pageHeaderActions} />
            <AppShellMain
              className={
                isIssueDetailPage
                  ? "relative overflow-hidden bg-background p-0"
                  : isRepositoryHistoryPage
                    ? "relative bg-background p-0"
                    : "relative bg-background/70 p-3"
              }
            >
              {isApplicationSettingsPage && appConfigQuery.data && isRepositorySettingsIndexPage ? (
                <RepositorySettingsIndexPanel
                  bootstrapStatus={bootstrapStatusQuery.data}
                  onRepositorySelect={(repositoryId) =>
                    navigateWorkspace({
                      page: "settings",
                      scope: "workspace",
                      settingsRepositoryId: repositoryId,
                      settingsSection: "repositories",
                    })
                  }
                  repositories={repositories}
                />
              ) : isApplicationSettingsPage &&
                appConfigQuery.data &&
                isRepositorySettingsPage &&
                activeRepository ? (
                <RepositorySettingsPanel
                  agentProviders={detectedAgentProviders}
                  appConfig={appConfigQuery.data}
                  bootstrapStatus={bootstrapStatusQuery.data}
                  onRemoved={() =>
                    navigateWorkspace(
                      {
                        page: "settings",
                        scope: "workspace",
                        settingsSection: "repositories",
                      },
                      { replace: true },
                    )
                  }
                  repository={activeRepository}
                  status={repositoryStatus}
                />
              ) : isApplicationSettingsPage && appConfigQuery.data ? (
                <ApplicationSettingsPanel
                  agentProviders={detectedAgentProviders}
                  appConfig={appConfigQuery.data}
                  bootstrapStatus={bootstrapStatusQuery.data}
                  section={applicationSettingsSection}
                />
              ) : isChatPage ? (
                <ChatPanel
                  agentProviders={detectedAgentProviders}
                  profile={appConfigQuery.data?.profile}
                  repositories={repositories}
                />
              ) : hasRepositories && isInboxPage ? (
                <InboxPanel
                  onIssueSelect={(selection) =>
                    navigateWorkspace({
                      issueId: selection.issueId,
                      page: "issues",
                      repositoryId: selection.repositoryId,
                      scope: "repository",
                    })
                  }
                  profile={appConfigQuery.data?.profile}
                  repositories={repositories}
                />
              ) : hasRepositories && isIssueDetailPage ? (
                <ViewIssuePanel
                  agentProviders={detectedAgentProviders}
                  issueId={selectedIssueId}
                  onArchived={navigateToParent}
                  onChatOpen={() =>
                    navigateWorkspace({
                      page: "chat",
                      scope: "workspace",
                    })
                  }
                  repositories={repositories}
                  repositoryId={selectedIssueRepositoryId}
                />
              ) : hasRepositories && isViewsPage && !isSavedViewDetailPage ? (
                <ViewsPanel
                  onViewSelect={(view) => {
                    if (!issueRepository) return;
                    navigateWorkspace({
                      page: "views",
                      repositoryId: issueRepository.id,
                      scope: "repository",
                      viewId: view.id,
                    });
                  }}
                  repositoryId={issueRepository?.id}
                />
              ) : hasRepositories && isWorkItemsPage ? (
                <IssuesPanel
                  loadingRepository={repositoryColdSyncing}
                  onCreateIssue={repositories.length > 0 ? openCreateIssueDialog : undefined}
                  onIssueSelect={(selection) => {
                    const repositoryId = selection.repositoryId ?? issueRepository?.id;
                    if (!repositoryId) return;

                    if (selectedSavedViewId) {
                      navigateWorkspace({
                        issueId: selection.issueId,
                        page: "views",
                        repositoryId,
                        scope: "repository",
                        viewId: selectedSavedViewId,
                      });
                      return;
                    }

                    navigateWorkspace({
                      issueId: selection.issueId,
                      page: "issues",
                      repositoryId,
                      scope: "repository",
                    });
                  }}
                  profile={appConfigQuery.data?.profile}
                  query={isInitiativesPage ? { type: "epic" } : {}}
                  repositoryId={issueRepository?.id}
                  repositoryIds={isGlobalIssuesPage ? repositoryIds : undefined}
                  repositories={repositories}
                  savedViewId={selectedSavedView?.id}
                  selectedIssueId={selectedIssueId}
                  showSavedViewControls={!isSavedViewDetailPage && issueRepository !== undefined}
                  title={
                    isInitiativesPage
                      ? "Initiatives"
                      : selectedSavedView
                        ? selectedSavedView.name
                        : "Issues"
                  }
                />
              ) : hasRepositories && isRepositoryHistoryPage ? (
                <RepositoryHistoryPanel
                  onIssueSelect={(issueId) => {
                    if (!activeRepository) return;

                    navigateWorkspace({
                      issueId,
                      page: "issues",
                      repositoryId: activeRepository.id,
                      scope: "repository",
                    });
                  }}
                  repositoryId={activeRepository?.id}
                />
              ) : hasRepositories ? (
                <PageBodyPlaceholder label={`${activePageTitle} content`} />
              ) : (
                <AddRepositoryStep
                  error={repositoryImportError}
                  onSubmit={chooseRepositoryFolder}
                  saving={addRepository.isPending}
                />
              )}
              {activeRepository &&
              !isIssueDetailPage &&
              !isRepositoryHistoryPage &&
              !isRepositorySettingsPage ? (
                <IconButton
                  className="absolute bottom-3 right-3 shadow-card"
                  icon={<History aria-hidden className="size-4" />}
                  label="History"
                  onClick={() =>
                    navigateWorkspace({
                      page: "history",
                      repositoryId: activeRepository.id,
                      scope: "repository",
                    })
                  }
                  size="sm"
                  title="History"
                  variant="outline"
                />
              ) : null}
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
      {createIssueForm.open ? (
        <CreateIssueDialog
          assignee={createIssueForm.values.assignee}
          assigneeSections={createIssueOptions.assigneeSections}
          createDisabled={createIssueForm.createDisabled || !createIssueRepository}
          createMore={createIssueForm.values.createMore}
          description={createIssueForm.values.description}
          draftDisabled={createIssueForm.draftDisabled || !createIssueRepository}
          draftInstructions={createIssueForm.values.draftInstructions}
          draftSaving={createTicketDraftChat.isPending}
          dueDate={createIssueForm.values.dueDate}
          error={createIssueForm.values.error}
          estimate={createIssueForm.values.estimate}
          labelSections={createIssueOptions.labelSections}
          labels={createIssueForm.values.labels}
          moreSections={createIssueOptions.moreSections}
          mode={createIssueForm.values.mode}
          onAssigneeChange={createIssueForm.setAssignee}
          onClose={closeCreateIssueDialog}
          onCreate={submitCreateIssue}
          onCreateMoreChange={createIssueForm.setCreateMore}
          onDescriptionChange={createIssueForm.setDescription}
          onDraftInstructionsChange={createIssueForm.setDraftInstructions}
          onDraftSubmit={submitCreateIssueDraft}
          onDueDateChange={createIssueForm.setDueDate}
          onEstimateChange={createIssueForm.setEstimate}
          onLabelsChange={createIssueForm.setLabels}
          onModeChange={createIssueForm.setMode}
          onMoreAction={(actionId) =>
            createIssueForm.setError(defaultCreateIssueMoreActionMessage(actionId))
          }
          onPriorityChange={createIssueForm.setPriority}
          onProjectChange={createIssueForm.setProject}
          onRepositoryChange={selectCreateIssueRepository}
          onStatusChange={createIssueForm.setStatus}
          onTemplateChange={applyIssueTemplate}
          onTitleChange={createIssueForm.setTitle}
          onTypeChange={createIssueForm.setType}
          priority={createIssueForm.values.priority}
          prioritySections={createIssueOptions.prioritySections}
          project={createIssueForm.values.project}
          projectSections={createIssueOptions.projectSections}
          repository={createIssueRepository?.id ?? null}
          repositorySections={createIssueRepositorySections}
          saving={createIssue.isPending}
          status={createIssueForm.values.status}
          statusSections={createIssueOptions.statusSections}
          tagSuggestions={createIssueTagSuggestions}
          teamLabel={createIssueRepository?.displayName ?? "Repository"}
          template={createIssueForm.values.template}
          templateSections={createIssueOptions.templateSections}
          title={createIssueForm.values.title}
          type={createIssueForm.values.type}
          typeSections={ticketTypeSections}
        />
      ) : null}
    </>
  );
};
