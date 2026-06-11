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
import {
  AddRepositoryStep,
  BootloaderScreen,
  IssuesPanel,
  PageBodyPlaceholder,
  RepositoryHistoryPanel,
  SetupScreen,
  ViewIssuePanel,
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
  repositoryHistoryRepositoryQueryKey,
  useMaterializationWarningsQuery,
  useRepositoryStatusQuery,
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
  const [selectedIssueId, setSelectedIssueId] = React.useState<string>();
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
  const selectedRepositoryPage = repositoryPageFromNavItem(activeItemId, repositories);
  const isIssuesPage = activeItemId === "issues" || selectedRepositoryPage?.kind === "issues";
  const activeRepository =
    selectedRepositoryPage?.repository ?? (activeItemId === "issues" ? repositories[0] : undefined);
  const issueRepository = isIssuesPage ? activeRepository : undefined;
  const selectedIssueRepositoryId = issueRepository?.id;
  const isIssueDetailPage = isIssuesPage && selectedIssueId !== undefined;
  const isRepositoryHistoryPage = selectedRepositoryPage?.kind === "history";

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
        profile: appConfigQuery.data?.profile,
        repository: issueRepository,
      }),
    [appConfigQuery.data?.profile, issueRepository],
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
    setSelectedIssueId(undefined);
  }, [selectedIssueRepositoryId]);

  React.useEffect(() => {
    if (!isIssuesPage) {
      setSelectedIssueId(undefined);
    }
  }, [isIssuesPage]);

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
        type: "issue",
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
  const rendererNavSections = createRendererNavSections(repositories);
  const activePageTitle = isIssueDetailPage
    ? (selectedIssueId ?? "Issue")
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
          label="Back to issues"
          onClick={() => setSelectedIssueId(undefined)}
          size="sm"
          title="Back to issues"
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
      {isIssuesPage ? (
        <IconButton
          disabled={createIssue.isPending || !issueRepository}
          icon={<Plus aria-hidden className="size-4" />}
          label="Create issue"
          onClick={createIssueForm.openDialog}
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
            createLabel="Add Repository"
            navSections={rendererNavSections}
            onCreate={chooseRepositoryFolder}
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
              {hasRepositories && isIssueDetailPage ? (
                <ViewIssuePanel issueId={selectedIssueId} repositoryId={issueRepository?.id} />
              ) : hasRepositories && isIssuesPage ? (
                <IssuesPanel
                  loadingRepository={repositoryColdSyncing}
                  onCreateIssue={createIssueForm.openDialog}
                  onIssueSelect={setSelectedIssueId}
                  profile={appConfigQuery.data?.profile}
                  repositoryId={issueRepository?.id}
                  selectedIssueId={selectedIssueId}
                />
              ) : hasRepositories && isRepositoryHistoryPage ? (
                <RepositoryHistoryPanel
                  onIssueSelect={(issueId) => {
                    if (!activeRepository) return;

                    setActiveItemId(`repository:${activeRepository.id}:issues`);
                    setSelectedIssueId(issueId);
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
              {activeRepository && !isIssueDetailPage && !isRepositoryHistoryPage ? (
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
          onTitleChange={createIssueForm.setTitle}
          priority={createIssueForm.values.priority}
          prioritySections={createIssueOptions.prioritySections}
          project={createIssueForm.values.project}
          projectSections={createIssueOptions.projectSections}
          saving={createIssue.isPending}
          status={createIssueForm.values.status}
          statusSections={createIssueOptions.statusSections}
          teamLabel={issueRepository?.displayName ?? "Repository"}
          title={createIssueForm.values.title}
        />
      ) : null}
    </>
  );
};
