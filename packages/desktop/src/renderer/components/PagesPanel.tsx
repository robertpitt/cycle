import { serializeCycleUri } from "@cycle/contracts";
import type { Actor, PageDocument, PageSummary } from "@cycle/contracts/schemas";
import { PageId as PageIdSchema } from "@cycle/contracts/schemas";
import { Button } from "@cycle/ui/atoms";
import {
  DialogBackdrop,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
} from "@cycle/ui/molecules";
import {
  PagesArea,
  isPageDraftDirty,
  pagePathFromTitle,
  pageDraftFrom,
  type PagesAreaComment,
  type PagesAreaDraft,
  type PagesAreaNavigationTarget,
  type PagesAreaPage,
  type PagesAreaRevisionConflict,
} from "@cycle/ui/organisms";
import { Effect, Result, Schema } from "effect";
import * as React from "react";
import { useBlocker } from "react-router";
import { usePageMutations } from "../mutations/usePageMutations.ts";
import { useNotifications } from "../notifications/NotificationProvider.tsx";
import {
  usePageCommentsQuery,
  usePageDetailQuery,
  usePageHistoryQuery,
  usePageListQuery,
} from "../queries/pages.ts";
import { getDesktopBridge } from "../lib/desktopBridge.ts";

type PagesPanelProps = {
  readonly onIssueSelect?: (issueId: string, repositoryId: string) => void;
  readonly onPageSelect: (pageId: string, repositoryId: string) => void;
  readonly onPagesRootSelect: (repositoryId: string) => void;
  readonly pageId?: string;
  readonly profile?: { readonly displayName: string };
  readonly repositoryId?: string;
};

const emptyDraft: PagesAreaDraft = { body: "", path: "", title: "" };

const initialsForName = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const authorPresentation = (actor: Actor) => ({
  initials: initialsForName(actor.name) || "?",
  name: actor.name,
});

const pageFromSummary = (page: PageSummary): PagesAreaPage => ({
  archived: page.archived,
  body: "",
  id: page.id,
  path: page.path,
  revisionId: page.revisionId,
  title: page.title,
  updatedAt: page.updatedAt,
});

const pageFromDocument = (page: PageDocument): PagesAreaPage => ({
  archived: page.frontmatter.archivedAt !== undefined,
  body: page.body,
  id: page.id,
  path: page.path,
  revisionId: page.revisionId,
  title: page.frontmatter.title,
  updatedAt: page.frontmatter.updatedAt,
  updatedBy: page.frontmatter.updatedBy.name,
});

const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const revisionConflictFrom = (
  error: unknown,
  expectedRevisionId: string,
): PagesAreaRevisionConflict | undefined => {
  if (!isRecord(error) || error.code !== "PAGE_REVISION_CONFLICT") return undefined;
  const details = isRecord(error.details) ? error.details : {};
  const current = isRecord(details.current) ? details.current : {};
  const actualRevisionId = details.actualRevisionId;

  if (typeof actualRevisionId !== "string") return undefined;

  return {
    actualRevisionId,
    currentPath: typeof current.path === "string" ? current.path : undefined,
    currentTitle: typeof current.title === "string" ? current.title : undefined,
    expectedRevisionId:
      typeof details.expectedRevisionId === "string"
        ? details.expectedRevisionId
        : expectedRevisionId,
  };
};

const writeClipboard = Effect.fn("writeClipboard")((value: string) =>
  Effect.tryPromise({
    catch: (cause) => (cause instanceof Error ? cause : new Error("Clipboard access failed.")),
    try: () => navigator.clipboard.writeText(value),
  }),
);

const UnsavedChangesDialog = ({
  onCancel,
  onDiscard,
  onSave,
  open,
  saving,
}: {
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
  readonly open: boolean;
  readonly saving: boolean;
}) => (
  <DialogRoot onOpenChange={(nextOpen) => !nextOpen && !saving && onCancel()} open={open}>
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport>
        <DialogPanel width="sm">
          <DialogHeader>
            <div>
              <DialogTitle>Unsaved Page changes</DialogTitle>
              <DialogDescription>
                Save this Page, discard the local changes, or stay here.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={saving} onClick={onCancel} variant="outline">
              Cancel
            </Button>
            <Button disabled={saving} onClick={onDiscard} tone="danger" variant="outline">
              Discard
            </Button>
            <Button loading={saving} onClick={onSave}>
              Save and continue
            </Button>
          </DialogFooter>
        </DialogPanel>
      </DialogViewport>
    </DialogPortal>
  </DialogRoot>
);

export const PagesPanel = ({
  onIssueSelect,
  onPageSelect,
  onPagesRootSelect,
  pageId,
  profile,
  repositoryId,
}: PagesPanelProps) => {
  const notifications = useNotifications();
  const pageList = usePageListQuery(repositoryId);
  const pageDetail = usePageDetailQuery(repositoryId, pageId);
  const pageHistory = usePageHistoryQuery(repositoryId, pageId);
  const pageComments = usePageCommentsQuery(repositoryId, pageId);
  const mutations = usePageMutations(repositoryId, pageId);
  const selectedDocument = pageDetail.data ?? undefined;
  const selectedPage = selectedDocument ? pageFromDocument(selectedDocument) : undefined;
  const [draft, setDraft] = React.useState<PagesAreaDraft>(emptyDraft);
  const [saveError, setSaveError] = React.useState<React.ReactNode>();
  const [revisionConflict, setRevisionConflict] = React.useState<PagesAreaRevisionConflict>();
  const [comment, setComment] = React.useState("");
  const [createDirectory, setCreateDirectory] = React.useState<string>();
  const [createDraft, setCreateDraft] = React.useState<PagesAreaDraft>(emptyDraft);
  const [createError, setCreateError] = React.useState<React.ReactNode>();
  const [cancelCreatePending, setCancelCreatePending] = React.useState(false);
  const [directoryPath, setDirectoryPath] = React.useState("");
  const [pendingNavigation, setPendingNavigation] = React.useState<PagesAreaNavigationTarget>();
  const previousPage = React.useRef<PagesAreaPage | undefined>(undefined);

  const dirty = isPageDraftDirty(draft, selectedPage);
  const creationDirty =
    createDirectory !== undefined &&
    (createDraft.title.trim().length > 0 || createDraft.body.trim().length > 0);
  const blocker = useBlocker(dirty || creationDirty);

  React.useEffect(() => {
    const previous = previousPage.current;
    previousPage.current = selectedPage;
    if (!selectedPage) {
      setDraft(emptyDraft);
      return;
    }

    if (
      previous?.id !== selectedPage.id ||
      (previous.revisionId !== selectedPage.revisionId && !isPageDraftDirty(draft, previous))
    ) {
      setDraft(pageDraftFrom(selectedPage));
      setSaveError(undefined);
      setRevisionConflict(undefined);
    }
  }, [draft, selectedPage]);

  React.useEffect(() => {
    if (!pageId || !pageDetail.isSuccess || pageDetail.data !== null) return;
    notifications.notify({
      description: "The requested Page is unavailable or no longer exists.",
      title: "Page not found",
      tone: "danger",
    });
    if (repositoryId) onPagesRootSelect(repositoryId);
  }, [
    notifications,
    onPagesRootSelect,
    pageDetail.data,
    pageDetail.isSuccess,
    pageId,
    repositoryId,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined" || (!dirty && !creationDirty)) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [creationDirty, dirty]);

  const pages = React.useMemo(() => {
    const summaries = (pageList.data?.entries ?? []).map(pageFromSummary);
    if (!selectedPage) return summaries;
    const index = summaries.findIndex((page) => page.id === selectedPage.id);
    if (index < 0) return [...summaries, selectedPage];
    return summaries.map((page, entryIndex) => (entryIndex === index ? selectedPage : page));
  }, [pageList.data?.entries, selectedPage]);
  const pageTagSuggestions = React.useMemo(
    () =>
      repositoryId
        ? pages.flatMap((page) => {
            const pageIdResult = Schema.decodeUnknownResult(PageIdSchema)(page.id);
            if (Result.isFailure(pageIdResult)) return [];
            const uri = serializeCycleUri({
              kind: "page",
              pageId: pageIdResult.success,
              repositoryId,
            });
            if (Result.isFailure(uri)) return [];

            return [
              {
                description: page.path,
                id: page.id,
                insertLabel: `[${page.title}](${uri.success})`,
                kind: "page" as const,
                label: page.title,
                searchText: `${page.title} ${page.path}`,
              },
            ];
          })
        : [],
    [pages, repositoryId],
  );

  const comments = React.useMemo<readonly PagesAreaComment[]>(
    () =>
      (pageComments.data?.entries ?? []).map((entry) => ({
        author: authorPresentation(entry.createdBy),
        body: entry.body,
        id: entry.id,
        occurredAt: entry.createdAt,
      })),
    [pageComments.data?.entries],
  );

  const history = React.useMemo(
    () =>
      (pageHistory.data?.entries ?? []).map((entry) => ({
        author: authorPresentation(entry.actor),
        commitRef: entry.snapshotId.slice(0, 12),
        commitTitle: entry.message ?? entry.operation.replace("page.", "Page "),
        id: entry.snapshotId,
        meta: [entry.path],
        occurredAt: entry.committedAt,
      })),
    [pageHistory.data?.entries],
  );

  const notifyFailure = React.useCallback(
    (title: string, error: unknown) =>
      notifications.notify({
        description: messageFrom(error, `${title} failed.`),
        durationMs: 9000,
        title,
        tone: "danger",
      }),
    [notifications],
  );

  const save = React.useCallback(async (): Promise<boolean> => {
    if (!selectedPage) return false;
    setSaveError(undefined);
    setRevisionConflict(undefined);

    try {
      const saved = await mutations.update.mutateAsync({
        body: draft.body,
        expectedRevisionId: selectedPage.revisionId,
        pageId: selectedPage.id,
        path: draft.path.trim(),
        title: draft.title.trim(),
      });
      setDraft(pageDraftFrom(pageFromDocument(saved)));
      return true;
    } catch (error) {
      const conflict = revisionConflictFrom(error, selectedPage.revisionId);
      if (conflict) setRevisionConflict(conflict);
      else setSaveError(messageFrom(error, "Cycle could not save this Page."));
      return false;
    }
  }, [draft, mutations.update, selectedPage]);

  const create = React.useCallback(async (): Promise<PageDocument | undefined> => {
    setCreateError(undefined);

    try {
      const created = await mutations.create.mutateAsync({
        body: createDraft.body,
        path: createDraft.path.trim(),
        title: createDraft.title.trim(),
      });
      setCreateDirectory(undefined);
      setCreateDraft(emptyDraft);
      setCreateError(undefined);
      setCancelCreatePending(false);
      return created;
    } catch (error) {
      setCreateError(messageFrom(error, "Page creation failed."));
      return undefined;
    }
  }, [createDraft, mutations.create]);

  const followPendingNavigation = React.useCallback(() => {
    const target = pendingNavigation;
    setPendingNavigation(undefined);
    if (!target || !repositoryId) return;

    if (target.kind === "page") {
      setDirectoryPath("");
      onPageSelect(target.page.id, repositoryId);
    } else {
      setDirectoryPath(target.path);
      onPagesRootSelect(repositoryId);
    }
  }, [onPageSelect, onPagesRootSelect, pendingNavigation, repositoryId]);

  const cancelNavigation = () => {
    setPendingNavigation(undefined);
    setCancelCreatePending(false);
    if (blocker.state === "blocked") blocker.reset();
  };

  const discardAndContinue = () => {
    if (createDirectory !== undefined) {
      setCreateDirectory(undefined);
      setCreateDraft(emptyDraft);
      setCreateError(undefined);
      setCancelCreatePending(false);
    }
    if (selectedPage) setDraft(pageDraftFrom(selectedPage));
    setSaveError(undefined);
    setRevisionConflict(undefined);
    if (pendingNavigation) followPendingNavigation();
    else if (blocker.state === "blocked") blocker.proceed();
  };

  const saveAndContinue = () => {
    if (createDirectory !== undefined) {
      void create().then((created) => {
        if (!created) return;
        if (pendingNavigation) followPendingNavigation();
        else if (blocker.state === "blocked") blocker.proceed();
        else if (repositoryId) onPageSelect(created.id, repositoryId);
      });
      return;
    }

    void save().then((saved) => {
      if (!saved) return;
      if (pendingNavigation) followPendingNavigation();
      else if (blocker.state === "blocked") blocker.proceed();
    });
  };

  const copy = (value: string, title: string) => {
    void Effect.runPromise(writeClipboard(value)).then(
      () => notifications.notify({ title }),
      (error) => notifyFailure("Copy failed", error),
    );
  };

  const pendingAction = mutations.update.isPending
    ? "save"
    : mutations.archive.isPending
      ? "archive"
      : mutations.restore.isPending
        ? "restore"
        : undefined;

  return (
    <>
      <PagesArea
        className="h-full min-h-0"
        comments={{
          entries: comments,
          error: pageComments.error?.message ?? mutations.addComment.error?.message,
          loading: pageComments.isLoading,
          onSubmit: (body) => {
            mutations.addComment.mutate(body, {
              onError: (error) => notifyFailure("Comment failed", error),
              onSuccess: () => setComment(""),
            });
          },
          onValueChange: setComment,
          submitting: mutations.addComment.isPending,
          value: comment,
          viewer: profile
            ? { initials: initialsForName(profile.displayName) || "?", name: profile.displayName }
            : undefined,
        }}
        creation={
          createDirectory === undefined
            ? undefined
            : {
                directoryPath: createDirectory,
                draft: createDraft,
                error: createError,
                onCancel: () => {
                  if (creationDirty) {
                    setCancelCreatePending(true);
                    return;
                  }
                  setCreateDirectory(undefined);
                  setCreateDraft(emptyDraft);
                  setCreateError(undefined);
                },
                onDraftChange: (nextDraft) => {
                  setCreateDraft(nextDraft);
                  setCreateError(undefined);
                },
                onSave: () => {
                  void create().then((created) => {
                    if (created && repositoryId) onPageSelect(created.id, repositoryId);
                  });
                },
                saving: mutations.create.isPending,
              }
        }
        defaultViewedDirectoryPath={directoryPath}
        draft={draft}
        error={pageList.error?.message ?? pageDetail.error?.message}
        history={{
          error: pageHistory.error?.message,
          items: history,
          loading: pageHistory.isLoading,
        }}
        key={`${repositoryId ?? "none"}:${pageId ?? `directory:${directoryPath}`}`}
        loading={pageList.isLoading || (pageId !== undefined && pageDetail.isLoading)}
        onArchive={(page) =>
          mutations.archive.mutate(
            { expectedRevisionId: page.revisionId, pageId: page.id },
            { onError: (error) => notifyFailure("Archive failed", error) },
          )
        }
        onCopyLink={(page) => {
          if (!repositoryId) return;
          const decodedPageId = Schema.decodeUnknownResult(
            // The UI package intentionally keeps identifiers transport-agnostic.
            // Decode at this contract boundary before canonical serialization.
            PageIdSchema,
          )(page.id);
          if (Result.isFailure(decodedPageId)) {
            notifyFailure("Copy failed", decodedPageId.failure);
            return;
          }
          const uri = serializeCycleUri({
            kind: "page",
            pageId: decodedPageId.success,
            repositoryId,
          });
          if (Result.isSuccess(uri)) copy(uri.success, "Page link copied");
          else notifyFailure("Copy failed", uri.failure);
        }}
        onCopyUnsaved={(unsavedDraft) => copy(unsavedDraft.body, "Unsaved source copied")}
        onCreate={(path) => {
          setCreateError(undefined);
          setCreateDraft({ body: "", path: pagePathFromTitle(path, ""), title: "" });
          setCreateDirectory(path);
        }}
        onDirectorySelect={(path) => {
          setDirectoryPath(path);
          if (repositoryId) onPagesRootSelect(repositoryId);
        }}
        onDiscard={() => {
          setSaveError(undefined);
          setRevisionConflict(undefined);
        }}
        onDraftChange={setDraft}
        onExternalLinkClick={(url) => void getDesktopBridge()?.openExternal(url)}
        onCycleReferenceClick={(reference) => {
          if (reference.kind === "page") {
            onPageSelect(reference.id, reference.repositoryId);
            return;
          }
          if (reference.kind === "issue") {
            const targetRepositoryId = reference.repositoryId ?? repositoryId;
            if (targetRepositoryId) onIssueSelect?.(reference.id, targetRepositoryId);
            return;
          }
          if (reference.kind === "repository") {
            onPagesRootSelect(reference.repositoryId ?? reference.id);
          }
        }}
        onPageSelect={(page) => {
          setDirectoryPath("");
          if (repositoryId) onPageSelect(page.id, repositoryId);
        }}
        onReloadCurrent={() => {
          void pageDetail.refetch().then((result) => {
            if (result.data) setDraft(pageDraftFrom(pageFromDocument(result.data)));
            setRevisionConflict(undefined);
            setSaveError(undefined);
          });
        }}
        onRestore={(page) =>
          mutations.restore.mutate(
            { expectedRevisionId: page.revisionId, pageId: page.id },
            { onError: (error) => notifyFailure("Restore failed", error) },
          )
        }
        onRevisionConflictDismiss={() => setRevisionConflict(undefined)}
        onSave={() => void save()}
        onUnsavedNavigationAttempt={setPendingNavigation}
        pages={pages}
        pendingAction={pendingAction}
        revisionConflict={revisionConflict}
        saveError={saveError}
        selectedPageId={pageId}
        tagSuggestions={pageTagSuggestions}
      />
      <UnsavedChangesDialog
        onCancel={cancelNavigation}
        onDiscard={discardAndContinue}
        onSave={saveAndContinue}
        open={pendingNavigation !== undefined || cancelCreatePending || blocker.state === "blocked"}
        saving={mutations.create.isPending || mutations.update.isPending}
      />
    </>
  );
};
