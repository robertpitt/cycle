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
import { useQueryClient } from "@tanstack/react-query";
import { Button, IconButton, StatusIndicator } from "@cycle/ui/atoms";
import { ArrowLeft, FolderPlus, History, Plus, RefreshCw, Upload } from "lucide-react";
import * as React from "react";
import type { SavedViewDocument } from "@cycle/database";
import {
  AddRepositoryStep,
  ApplicationSettingsPanel,
  BootloaderScreen,
  IssuesPanel,
  PageBodyPlaceholder,
  RepositoryHistoryPanel,
  RepositorySettingsPanel,
  SetupScreen,
  ViewIssuePanel,
  ViewsPanel,
} from "../components/index.ts";
import { fallbackAgentProviders, toSetupHarnesses } from "../lib/agentProviders.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";
import {
  useAddRepositoryMutation,
  useCompleteOnboardingMutation,
  useCreateIssueMutation,
  useInitialiseRepositoryMutation,
  usePushRepositoryMutation,
  useSyncRepositoryMutation,
  useUpdateRepositoryPreferencesMutation,
} from "../mutations/index.ts";
import {
  useAgentProvidersQuery,
  useAppConfigQuery,
  useBootstrapStatusQuery,
  issueListQueryKey,
  issueListRootQueryKey,
  repositoryHistoryRepositoryQueryKey,
  useIssueTemplateListQuery,
  useLabelListQuery,
  useMaterializationWarningsQuery,
  useRepositoryStatusQuery,
  useUserListQuery,
} from "../queries/index.ts";
import { getCreateIssueFormDraft, useCreateIssueForm } from "./workspace/createIssueForm.ts";
import {
  createIssueDialogOptionSections,
  defaultCreateIssueMoreActionMessage,
} from "./workspace/createIssueOptions.tsx";
import {
  activePageTitleForNavItem,
  createRendererNavSections,
  repositoryIdFromNavItem,
  repositoryPageFromNavItem,
} from "./workspace/navigation.tsx";
import type { AgentProviderId } from "../../shared/AgentProviders.ts";

export const WorkspaceScreen = () => {
  const collapsed = false;
  const [activeItemId, setActiveItemId] = React.useState("inbox");
  const [setupStep, setSetupStep] = React.useState<InitialSetupStep>("profile");
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [selectedIssue, setSelectedIssue] = React.useState<{
    readonly issueId: string;
    readonly repositoryId?: string;
  }>();
  const [selectedSavedView, setSelectedSavedView] = React.useState<SavedViewDocument>();
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

  const bootstrapStatusQuery = useBootstrapStatusQuery();
  const appConfigQuery = useAppConfigQuery();
  const agentProvidersQuery = useAgentProvidersQuery();
  const repositories = appConfigQuery.data?.localWorkspace.repositories ?? [];
  const repositoryIds = React.useMemo(
    () => repositories.map((repository) => repository.id),
    [repositories],
  );
  const selectedRepositoryPage = repositoryPageFromNavItem(activeItemId, repositories);
  const isGlobalIssuesPage = activeItemId === "issues";
  const isIssuesPage = activeItemId === "issues" || selectedRepositoryPage?.kind === "issues";
  const isInitiativesPage = activeItemId === "projects";
  const isViewsPage = activeItemId === "views" || selectedRepositoryPage?.kind === "views";
  const isSavedViewDetailPage = isViewsPage && selectedSavedView !== undefined;
  const isWorkItemsPage = isIssuesPage || isInitiativesPage || isSavedViewDetailPage;
  const activeRepository =
    selectedRepositoryPage?.repository ??
    (activeItemId === "projects" || activeItemId === "views" ? repositories[0] : undefined);
  const issueRepository =
    isIssuesPage || isInitiativesPage || isViewsPage ? activeRepository : undefined;
  const selectedIssueId = selectedIssue?.issueId;
  const selectedIssueRepositoryId = selectedIssue?.repositoryId ?? issueRepository?.id;
  const isIssueDetailPage = isWorkItemsPage && selectedIssueId !== undefined;
  const isRepositoryHistoryPage = selectedRepositoryPage?.kind === "history";
  const isRepositorySettingsPage = selectedRepositoryPage?.kind === "settings";
  const isApplicationSettingsPage = activeItemId === "settings";

  const completeOnboarding = useCompleteOnboardingMutation({
    appConfig: appConfigQuery.data,
    email,
    enabledHarnessIds,
    fullName,
    onCompleted: () => setActiveItemId("inbox"),
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
    repositoryId: issueRepository?.id,
  });
  const repositoryStatusQuery = useRepositoryStatusQuery(activeRepository?.id);
  const materializationWarningsQuery = useMaterializationWarningsQuery(activeRepository?.id);
  const userListQuery = useUserListQuery(issueRepository?.id, {
    disabled: false,
  });
  const labelListQuery = useLabelListQuery(issueRepository?.id, {
    archived: false,
  });
  const templateListQuery = useIssueTemplateListQuery(issueRepository?.id, {
    active: true,
  });
  const syncRepository = useSyncRepositoryMutation({
    repositoryId: activeRepository?.id,
  });
  const pushRepository = usePushRepositoryMutation({
    repositoryId: activeRepository?.id,
  });
  const repositoryStatus = repositoryStatusQuery.data;
  const repositoryDefaultRemote = repositoryStatus?.metadata?.defaultRemote;
  const repositoryRemoteBusy = syncRepository.isPending || pushRepository.isPending;
  const repositoryActionError = pushRepository.error ?? syncRepository.error;
  const repositoryActionErrorMessage =
    repositoryActionError instanceof Error
      ? repositoryActionError.message
      : repositoryActionError === null
        ? undefined
        : String(repositoryActionError);
  const repositoryColdSyncing =
    repositoryStatus?.status === "syncing" && repositoryStatus.activeSnapshotId === null;
  const createIssueOptions = React.useMemo(
    () =>
      createIssueDialogOptionSections({
        labels: labelListQuery.data?.entries,
        profile: appConfigQuery.data?.profile,
        repository: issueRepository,
        templates: templateListQuery.data?.entries,
        users: userListQuery.data?.entries,
      }),
    [
      appConfigQuery.data?.profile,
      issueRepository,
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
        createIssueForm.setType(defaults.type);
      } else if (template.kind === "initiative") {
        createIssueForm.setType("initiative");
      } else {
        createIssueForm.setType("issue");
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
    if (!isWorkItemsPage) {
      setSelectedIssue(undefined);
    }
  }, [isWorkItemsPage]);

  React.useEffect(() => {
    if (!isViewsPage) {
      setSelectedSavedView(undefined);
    }
  }, [isViewsPage]);

  React.useEffect(() => {
    if (!activeRepository?.id || repositoryStatus === undefined) return;
    if (repositoryStatus.status === "syncing") return;

    void queryClient.invalidateQueries({
      queryKey: repositoryHistoryRepositoryQueryKey(activeRepository.id),
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

  if (bootstrapStatusQuery.data?.blocking !== false || appConfigQuery.isLoading) {
    return <BootloaderScreen status={bootstrapStatusQuery.data} />;
  }

  const onboardingCompleted = appConfigQuery.data?.onboarding.completed ?? false;
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
    createIssueForm.openDialog();
    if (isInitiativesPage) {
      createIssueForm.setType("initiative");
    }
  };
  const closeCreateIssueDialog = () => {
    if (createIssue.isPending) return;

    createIssueForm.closeDialog();
  };
  const submitCreateIssue = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!issueRepository) {
      createIssueForm.setError("Choose a repository before creating an issue.");
      return;
    }

    const draft = getCreateIssueFormDraft(createIssueForm.values);

    if (!draft) {
      createIssueForm.setError("Enter an issue title before creating the issue.");
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
        type: draft.type ?? createIssueForm.values.type,
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
  const activePageTitle = isIssueDetailPage
    ? (selectedIssueId ?? "Issue")
    : selectedSavedView
      ? selectedSavedView.name
      : activePageTitleForNavItem(activeItemId, repositories);
  const warningCount =
    repositoryStatus?.warningCount ?? materializationWarningsQuery.data?.length ?? 0;
  const repositoryStatusTone =
    repositoryActionError !== null ||
    repositoryStatusQuery.error !== null ||
    repositoryStatus?.status === "failed" ||
    repositoryStatus?.status === "degraded"
      ? "warning"
      : repositoryStatus?.status === "syncing" || repositoryRemoteBusy
        ? "info"
        : repositoryStatus?.status === "ready"
          ? "success"
          : "neutral";
  const repositoryStatusText = (() => {
    if (pushRepository.error !== null) return "Push failed";
    if (syncRepository.error !== null) return "Sync failed";
    if (repositoryStatusQuery.error instanceof Error) return "Status unavailable";
    if (pushRepository.isPending) return "Pushing";
    if (repositoryStatus?.status === "syncing" || syncRepository.isPending) return "Syncing";
    if (repositoryStatus?.status === "failed") return "Failed";
    if (repositoryStatus?.status === "degraded") return `Warnings ${warningCount}`;
    if (repositoryStatus?.status === "ready") return "Ready";
    if (repositoryStatus?.status === "empty") return "Empty";
    return undefined;
  })();
  const repositoryStatusTitle =
    repositoryActionErrorMessage ??
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
      {activeRepository ? (
        <IconButton
          disabled={repositoryRemoteBusy}
          icon={
            <RefreshCw
              aria-hidden
              className={syncRepository.isPending ? "size-4 animate-spin" : "size-4"}
            />
          }
          label="Sync repository"
          onClick={() => syncRepository.mutate()}
          size="sm"
          title="Sync repository"
          variant="outline"
        />
      ) : null}
      {activeRepository ? (
        <Button
          disabled={repositoryRemoteBusy || !repositoryDefaultRemote}
          leftIcon={<Upload aria-hidden className="size-4" />}
          loading={pushRepository.isPending}
          loadingLabel="Pushing repository"
          onClick={() => pushRepository.mutate()}
          size="sm"
          title={
            repositoryDefaultRemote
              ? `Push GitDB refs to ${repositoryDefaultRemote}`
              : "Repository has no default remote"
          }
          variant="outline"
        >
          Push
        </Button>
      ) : null}
      {isIssueDetailPage ? (
        <IconButton
          icon={<ArrowLeft aria-hidden className="size-4" />}
          label={isSavedViewDetailPage ? "Back to view" : "Back to issues"}
          onClick={() => setSelectedIssue(undefined)}
          size="sm"
          title={isSavedViewDetailPage ? "Back to view" : "Back to issues"}
          variant="outline"
        />
      ) : null}
      {isSavedViewDetailPage && !isIssueDetailPage ? (
        <IconButton
          icon={<ArrowLeft aria-hidden className="size-4" />}
          label="Back to views"
          onClick={() => setSelectedSavedView(undefined)}
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
          disabled={createIssue.isPending || !issueRepository}
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
    if (item.id !== activeItemId) {
      setSelectedIssue(undefined);
      setSelectedSavedView(undefined);
    }

    const repositoryId = repositoryIdFromNavItem(item.id);
    if (repositoryId) {
      const repository = repositories.find((candidate) => candidate.id === repositoryId);
      if (repository) {
        const nextActiveItemId = activeItemId.startsWith(`repository:${repository.id}:`)
          ? activeItemId
          : `repository:${repository.id}:issues`;
        setActiveItemId(nextActiveItemId);
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
      <AppShellRoot className="h-full overflow-hidden">
        <AppShellFrame className="h-full !min-h-0" collapsed={collapsed}>
          <AppShellSidebar
            activeItemId={activeItemId}
            collapsed={collapsed}
            navSections={rendererNavSections}
            onNavItemSelect={handleNavItemSelect}
            onSettingsSelect={() => setActiveItemId("settings")}
            settingsActive={activeItemId === "settings"}
          />
          <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-surface">
            <AppShellHeader title={activePageTitle} actions={pageHeaderActions} />
            <AppShellMain
              className={
                isIssueDetailPage || isRepositoryHistoryPage
                  ? "relative bg-background p-0"
                  : "relative bg-background/70 p-3"
              }
            >
              {isApplicationSettingsPage && appConfigQuery.data ? (
                <ApplicationSettingsPanel appConfig={appConfigQuery.data} />
              ) : hasRepositories && isRepositorySettingsPage && activeRepository ? (
                <RepositorySettingsPanel
                  appConfig={appConfigQuery.data}
                  repository={activeRepository}
                  status={repositoryStatus}
                />
              ) : hasRepositories && isIssueDetailPage ? (
                <ViewIssuePanel
                  issueId={selectedIssueId}
                  repositoryId={selectedIssueRepositoryId}
                />
              ) : hasRepositories && isViewsPage && !isSavedViewDetailPage ? (
                <ViewsPanel
                  onViewSelect={(view) => {
                    setSelectedIssue(undefined);
                    setSelectedSavedView(view);
                  }}
                  repositoryId={issueRepository?.id}
                />
              ) : hasRepositories && isWorkItemsPage ? (
                <IssuesPanel
                  loadingRepository={repositoryColdSyncing}
                  onCreateIssue={issueRepository ? openCreateIssueDialog : undefined}
                  onIssueSelect={setSelectedIssue}
                  profile={appConfigQuery.data?.profile}
                  query={isInitiativesPage ? { type: "initiative" } : {}}
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

                    setActiveItemId(`repository:${activeRepository.id}:issues`);
                    setSelectedIssue({
                      issueId,
                      repositoryId: activeRepository.id,
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
                  onClick={() => setActiveItemId(`repository:${activeRepository.id}:history`)}
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
          createDisabled={createIssueForm.createDisabled}
          createMore={createIssueForm.values.createMore}
          description={createIssueForm.values.description}
          dueDate={createIssueForm.values.dueDate}
          error={createIssueForm.values.error}
          estimate={createIssueForm.values.estimate}
          labelSections={createIssueOptions.labelSections}
          labels={createIssueForm.values.labels}
          moreSections={createIssueOptions.moreSections}
          onAssigneeChange={createIssueForm.setAssignee}
          onClose={closeCreateIssueDialog}
          onCreate={submitCreateIssue}
          onCreateMoreChange={createIssueForm.setCreateMore}
          onDescriptionChange={createIssueForm.setDescription}
          onDueDateChange={createIssueForm.setDueDate}
          onEstimateChange={createIssueForm.setEstimate}
          onLabelsChange={createIssueForm.setLabels}
          onMoreAction={(actionId) =>
            createIssueForm.setError(defaultCreateIssueMoreActionMessage(actionId))
          }
          onPriorityChange={createIssueForm.setPriority}
          onProjectChange={createIssueForm.setProject}
          onStatusChange={createIssueForm.setStatus}
          onTemplateChange={applyIssueTemplate}
          onTitleChange={createIssueForm.setTitle}
          priority={createIssueForm.values.priority}
          prioritySections={createIssueOptions.prioritySections}
          project={createIssueForm.values.project}
          projectSections={createIssueOptions.projectSections}
          saving={createIssue.isPending}
          status={createIssueForm.values.status}
          statusSections={createIssueOptions.statusSections}
          teamLabel={issueRepository?.displayName ?? "Repository"}
          template={createIssueForm.values.template}
          templateSections={createIssueOptions.templateSections}
          title={createIssueForm.values.title}
        />
      ) : null}
    </>
  );
};
