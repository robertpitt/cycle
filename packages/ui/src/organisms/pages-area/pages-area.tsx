import {
  Archive,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Edit3,
  FileText,
  Folder,
  FolderOpen,
  History,
  Link,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";
import * as React from "react";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { DateTime } from "../../atoms/date-time/index.ts";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { Input } from "../../atoms/input/index.ts";
import { Select } from "../../atoms/select/index.ts";
import { Switch } from "../../atoms/switch/index.ts";
import { Alert, AlertDescription, AlertTitle } from "../../molecules/alert/index.ts";
import {
  CommentCard,
  CommentComposer,
  type CommentAuthor,
} from "../../molecules/issue-comment/index.ts";
import {
  DialogBackdrop,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
} from "../../molecules/dialog/index.ts";
import {
  MarkdownEditor,
  type MarkdownEditorTagSuggestion,
} from "../../molecules/markdown-editor/index.ts";
import {
  MarkdownRenderer,
  type MarkdownReferenceHandlers,
} from "../../molecules/markdown-renderer/index.ts";
import { PanelState } from "../../molecules/panel-state/index.ts";
import { ViewTab } from "../../molecules/view-tab/index.ts";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";
import { CommitHistory, type CommitHistoryItem } from "../commit-history/index.ts";
import {
  buildPagesTree,
  findPagesTreeDirectory,
  isPageDraftDirty,
  pageFileNameFromTitle,
  pageDraftFrom,
  pagePathFromTitle,
  type PagesAreaDraft,
  type PagesAreaPage,
  type PagesTreeDirectory,
  type PagesTreePageEntry,
} from "./pages-tree.ts";

export type PagesAreaSection = "comments" | "document" | "history";

export type PagesAreaComment = {
  readonly author: CommentAuthor;
  readonly body: string;
  readonly id: string;
  readonly occurredAt?: Date | number | string;
  readonly timestamp?: React.ReactNode;
};

export type PagesAreaComments = {
  readonly defaultValue?: string;
  readonly entries: readonly PagesAreaComment[];
  readonly error?: React.ReactNode;
  readonly loading?: boolean;
  readonly onSubmit?: (body: string) => void;
  readonly onValueChange?: (value: string) => void;
  readonly submitting?: boolean;
  readonly value?: string;
  readonly viewer?: CommentAuthor;
};

export type PagesAreaHistory = {
  readonly error?: React.ReactNode;
  readonly items: readonly CommitHistoryItem[];
  readonly loading?: boolean;
  readonly onSelect?: (item: CommitHistoryItem) => void;
};

export type PagesAreaCreation = {
  readonly directoryPath: string;
  readonly draft: PagesAreaDraft;
  readonly error?: React.ReactNode;
  readonly onCancel: () => void;
  readonly onDraftChange: (draft: PagesAreaDraft) => void;
  readonly onSave: (draft: PagesAreaDraft) => void;
  readonly saving?: boolean;
};

export type PagesAreaRevisionConflict = {
  readonly actualRevisionId: string;
  readonly currentPath?: string;
  readonly currentTitle?: string;
  readonly expectedRevisionId: string;
};

export type PagesAreaNavigationTarget =
  | { readonly kind: "directory"; readonly path: string }
  | { readonly kind: "page"; readonly page: PagesAreaPage };

export type PagesAreaLabels = {
  readonly addComment: string;
  readonly archive: string;
  readonly archiveConfirmDescription: string;
  readonly archiveConfirmTitle: string;
  readonly archived: string;
  readonly archivedDescription: string;
  readonly archivedFilter: string;
  readonly comments: string;
  readonly conflictActual: string;
  readonly conflictDescription: string;
  readonly conflictExpected: string;
  readonly conflictTitle: string;
  readonly copyLink: string;
  readonly copyUnsaved: string;
  readonly createDescription: string;
  readonly createFirst: string;
  readonly createTitle: string;
  readonly create: string;
  readonly directoryDescription: string;
  readonly directoryEmpty: string;
  readonly discard: string;
  readonly document: string;
  readonly edit: string;
  readonly emptyBody: string;
  readonly emptyComments: string;
  readonly emptyHistory: string;
  readonly emptyPages: string;
  readonly emptyPagesDescription: string;
  readonly fileName: string;
  readonly findPages: string;
  readonly history: string;
  readonly loading: string;
  readonly location: string;
  readonly move: string;
  readonly moveDescription: string;
  readonly noMatchingPages: string;
  readonly pages: string;
  readonly pageTitlePlaceholder: string;
  readonly preview: string;
  readonly reloadCurrent: string;
  readonly restore: string;
  readonly save: string;
  readonly source: string;
  readonly unsaved: string;
  readonly updated: string;
  readonly writePlaceholder: string;
};

export type PagesAreaProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> &
  MarkdownReferenceHandlers & {
    readonly activeSection?: PagesAreaSection;
    readonly comments?: PagesAreaComments;
    readonly creation?: PagesAreaCreation;
    readonly defaultActiveSection?: PagesAreaSection;
    readonly defaultEditing?: boolean;
    readonly defaultExpandedDirectoryPaths?: readonly string[];
    readonly defaultIncludeArchived?: boolean;
    readonly defaultSelectedPageId?: string;
    readonly defaultViewedDirectoryPath?: string;
    readonly draft?: PagesAreaDraft;
    readonly editing?: boolean;
    readonly error?: React.ReactNode;
    readonly expandedDirectoryPaths?: readonly string[];
    readonly history?: PagesAreaHistory;
    readonly includeArchived?: boolean;
    readonly labels?: Partial<PagesAreaLabels>;
    readonly loading?: boolean;
    readonly onActiveSectionChange?: (section: PagesAreaSection) => void;
    readonly onArchive?: (page: PagesAreaPage) => void;
    readonly onCopyLink?: (page: PagesAreaPage) => void;
    readonly onCopyUnsaved?: (draft: PagesAreaDraft, page: PagesAreaPage) => void;
    readonly onCreate?: (directoryPath: string) => void;
    readonly onDirectorySelect?: (directoryPath: string) => void;
    readonly onDiscard?: (page: PagesAreaPage) => void;
    readonly onDraftChange?: (draft: PagesAreaDraft) => void;
    readonly onEditingChange?: (editing: boolean) => void;
    readonly onExpandedDirectoryPathsChange?: (paths: readonly string[]) => void;
    readonly onIncludeArchivedChange?: (includeArchived: boolean) => void;
    readonly onPageSelect?: (page: PagesAreaPage) => void;
    readonly onReloadCurrent?: (page: PagesAreaPage, conflict: PagesAreaRevisionConflict) => void;
    readonly onRevisionConflictDismiss?: () => void;
    readonly onRestore?: (page: PagesAreaPage) => void;
    readonly onSave?: (draft: PagesAreaDraft, page: PagesAreaPage) => void;
    readonly onUnsavedNavigationAttempt?: (target: PagesAreaNavigationTarget) => void;
    readonly pages: readonly PagesAreaPage[];
    readonly pendingAction?: "archive" | "restore" | "save";
    readonly revisionConflict?: PagesAreaRevisionConflict;
    readonly saveError?: React.ReactNode;
    readonly selectedPageId?: string;
    readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
  };

const defaultLabels: PagesAreaLabels = {
  addComment: "Send comment",
  archive: "Archive page",
  archiveConfirmDescription:
    "This page will leave the active hierarchy. Its history and comments will remain available.",
  archiveConfirmTitle: "Archive this page?",
  archived: "Archived",
  archivedDescription:
    "This page is archived. Restore it before editing; comments remain available.",
  archivedFilter: "Show archived",
  comments: "Comments",
  conflictActual: "Current revision",
  conflictDescription:
    "This page changed after you opened it. Your unsaved source is still here; reload the current revision or copy your work first.",
  conflictExpected: "Your revision",
  conflictTitle: "Page changed",
  copyLink: "Copy page link",
  copyUnsaved: "Copy unsaved source",
  createDescription: "Start writing now. Cycle will choose a safe Markdown filename for you.",
  createFirst: "Create your first page",
  createTitle: "New page",
  create: "Create page",
  directoryDescription: "Choose a page or create one in this section.",
  directoryEmpty: "This directory has no visible pages.",
  discard: "Discard changes",
  document: "Document",
  edit: "Edit page",
  emptyBody: "This page is empty.",
  emptyComments: "No comments yet.",
  emptyHistory: "No page history yet.",
  emptyPages: "No pages yet.",
  emptyPagesDescription:
    "Create a home for architecture notes, plans, runbooks, and shared repository knowledge.",
  fileName: "File name",
  findPages: "Find pages",
  history: "History",
  loading: "Loading pages",
  location: "Location",
  move: "Change location",
  moveDescription: "Choose where this page belongs. The Markdown filename remains stable.",
  noMatchingPages: "No matching pages.",
  pages: "Pages",
  pageTitlePlaceholder: "Untitled page",
  preview: "Preview",
  reloadCurrent: "Reload current",
  restore: "Restore page",
  save: "Save",
  source: "Markdown source",
  unsaved: "Unsaved",
  updated: "Updated",
  writePlaceholder: "Start writing, or type / for commands…",
};

const emptyDraft: PagesAreaDraft = { body: "", path: "", title: "" };

const shortRevision = (revisionId: string): string =>
  revisionId.length > 12 ? revisionId.slice(0, 12) : revisionId;

const useControllableState = <Value,>({
  defaultValue,
  onValueChange,
  value,
}: {
  readonly defaultValue: Value;
  readonly onValueChange?: (value: Value) => void;
  readonly value?: Value;
}) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const currentValue = value ?? uncontrolledValue;
  const setValue = React.useCallback(
    (nextValue: Value) => {
      if (value === undefined) setUncontrolledValue(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );
  return [currentValue, setValue] as const;
};

const directoryPaths = (root: PagesTreeDirectory): readonly string[] =>
  root.directories.flatMap((directory) => [directory.path, ...directoryPaths(directory)]);

const PageTreeRow = ({
  active,
  depth,
  entry,
  labels,
  onSelect,
}: {
  readonly active: boolean;
  readonly depth: number;
  readonly entry: PagesTreePageEntry;
  readonly labels: PagesAreaLabels;
  readonly onSelect: () => void;
}) => (
  <button
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex h-8 w-full min-w-0 items-center gap-2 rounded-md pr-2 text-left text-sm text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground",
      active && "bg-subtle text-foreground",
    )}
    onClick={onSelect}
    role="treeitem"
    style={{ paddingLeft: `${8 + depth * 16}px` }}
    type="button"
  >
    <FileText aria-hidden className="size-4 shrink-0" />
    <span className="min-w-0 flex-1 truncate" title={entry.page.path}>
      {entry.page.title}
    </span>
    {entry.page.archived ? (
      <span className="shrink-0 text-[10px] text-muted-foreground">{labels.archived}</span>
    ) : null}
  </button>
);

const PageTreeDirectoryRows = ({
  depth,
  directory,
  isExpanded,
  labels,
  onDirectorySelect,
  onPageSelect,
  onToggle,
  selectedPageId,
}: {
  readonly depth: number;
  readonly directory: PagesTreeDirectory;
  readonly isExpanded: (path: string) => boolean;
  readonly labels: PagesAreaLabels;
  readonly onDirectorySelect: (directory: PagesTreeDirectory) => void;
  readonly onPageSelect: (page: PagesAreaPage) => void;
  readonly onToggle: (path: string) => void;
  readonly selectedPageId?: string;
}) => {
  const expanded = isExpanded(directory.path);
  const activeCover = directory.cover?.archived ? undefined : directory.cover;
  const selected = activeCover?.id === selectedPageId;

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <div className="flex min-w-0 items-center">
        <button
          aria-label={`${expanded ? "Collapse" : "Expand"} ${directory.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-subtle hover:text-foreground"
          onClick={() => onToggle(directory.path)}
          style={{ marginLeft: `${depth * 16}px` }}
          type="button"
        >
          {expanded ? (
            <ChevronDown aria-hidden className="size-3.5" />
          ) : (
            <ChevronRight aria-hidden className="size-3.5" />
          )}
        </button>
        <button
          aria-current={selected ? "page" : undefined}
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left text-sm text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground",
            selected && "bg-subtle text-foreground",
          )}
          onClick={() => onDirectorySelect(directory)}
          type="button"
        >
          {expanded ? (
            <FolderOpen aria-hidden className="size-4 shrink-0" />
          ) : (
            <Folder aria-hidden className="size-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{directory.name}</span>
          {activeCover ? (
            <BookOpen aria-label="Has cover page" className="size-3.5 shrink-0" />
          ) : null}
        </button>
      </div>
      {expanded ? (
        <div role="group">
          {directory.cover?.archived ? (
            <PageTreeRow
              active={directory.cover.id === selectedPageId}
              depth={depth + 1}
              entry={{ fileName: "index.md", page: directory.cover }}
              labels={labels}
              onSelect={() => onPageSelect(directory.cover!)}
            />
          ) : null}
          {directory.directories.map((child) => (
            <PageTreeDirectoryRows
              depth={depth + 1}
              directory={child}
              isExpanded={isExpanded}
              key={child.path}
              labels={labels}
              onDirectorySelect={onDirectorySelect}
              onPageSelect={onPageSelect}
              onToggle={onToggle}
              selectedPageId={selectedPageId}
            />
          ))}
          {directory.pages.map((entry) => (
            <PageTreeRow
              active={entry.page.id === selectedPageId}
              depth={depth + 1}
              entry={entry}
              key={entry.page.id}
              labels={labels}
              onSelect={() => onPageSelect(entry.page)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const Breadcrumbs = ({
  labels,
  onDirectorySelect,
  page,
  path,
}: {
  readonly labels: PagesAreaLabels;
  readonly onDirectorySelect: (path: string) => void;
  readonly page?: PagesAreaPage;
  readonly path: string;
}) => {
  const directoryPath = page ? page.path.split("/").slice(0, -1).join("/") : path;
  const segments = directoryPath.length === 0 ? [] : directoryPath.split("/");

  return (
    <nav aria-label="Page breadcrumbs" className="flex min-w-0 items-center gap-1 text-sm">
      <button
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => onDirectorySelect("")}
        type="button"
      >
        {labels.pages}
      </button>
      {segments.map((segment, index) => {
        const segmentPath = segments.slice(0, index + 1).join("/");
        return (
          <React.Fragment key={segmentPath}>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <button
              className="min-w-0 truncate text-muted-foreground hover:text-foreground"
              onClick={() => onDirectorySelect(segmentPath)}
              type="button"
            >
              {segment}
            </button>
          </React.Fragment>
        );
      })}
      {page ? (
        <>
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium text-foreground">{page.title}</span>
        </>
      ) : null}
    </nav>
  );
};

const PageEmptyState = ({
  description,
  label,
  onCreate,
  title,
}: {
  readonly description: React.ReactNode;
  readonly label: string;
  readonly onCreate?: () => void;
  readonly title: React.ReactNode;
}) => (
  <div className="grid min-h-full place-items-center px-6 py-12">
    <div className="grid max-w-md justify-items-center gap-4 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface text-muted-foreground shadow-sm">
        <BookOpen aria-hidden className="size-5" />
      </span>
      <div className="grid gap-1.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {onCreate ? (
        <Button leftIcon={<Plus aria-hidden className="size-4" />} onClick={onCreate}>
          {label}
        </Button>
      ) : null}
    </div>
  </div>
);

const PageLocation = ({
  labels,
  path,
}: {
  readonly labels: PagesAreaLabels;
  readonly path: string;
}) => (
  <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
    <Folder aria-hidden className="size-4 shrink-0" />
    <span className="shrink-0">{labels.pages}</span>
    {path
      .split("/")
      .filter(Boolean)
      .map((segment, index, segments) => (
        <React.Fragment key={segments.slice(0, index + 1).join("/")}>
          <ChevronRight aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{segment}</span>
        </React.Fragment>
      ))}
  </div>
);

const PageCreationView = ({
  creation,
  labels,
  referenceHandlers,
  tagSuggestions,
}: {
  readonly creation: PagesAreaCreation;
  readonly labels: PagesAreaLabels;
  readonly referenceHandlers: MarkdownReferenceHandlers;
  readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
}) => {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const canSave = creation.draft.title.trim().length > 0 && !creation.saving;
  const save = () => {
    if (canSave) creation.onSave(creation.draft);
  };

  return (
    <section
      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "s") {
          event.preventDefault();
          save();
        }
      }}
    >
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-6 py-2">
        <PageLocation labels={labels} path={creation.directoryPath} />
        <div className="flex items-center gap-2">
          <Button disabled={creation.saving} onClick={creation.onCancel} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            leftIcon={<Save aria-hidden className="size-4" />}
            loading={creation.saving}
            onClick={save}
            size="sm"
          >
            {labels.create}
          </Button>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-4xl gap-6 px-8 py-10">
          <div className="grid gap-2">
            <input
              aria-label="Page title"
              autoFocus
              className={cn(
                "-mx-2 w-[calc(100%+1rem)] rounded-md bg-transparent px-2 py-1 text-3xl font-semibold leading-tight tracking-tight text-foreground placeholder:text-muted-foreground/55",
                focusRing,
              )}
              onChange={(event) => {
                const title = event.currentTarget.value;
                creation.onDraftChange({
                  ...creation.draft,
                  path: pagePathFromTitle(creation.directoryPath, title),
                  title,
                });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                editorRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
              }}
              placeholder={labels.pageTitlePlaceholder}
              value={creation.draft.title}
            />
            <PageLocation labels={labels} path={creation.directoryPath} />
          </div>
          {creation.error ? (
            <Alert tone="danger">
              <AlertTitle>{labels.create}</AlertTitle>
              <AlertDescription>{creation.error}</AlertDescription>
            </Alert>
          ) : null}
          <MarkdownEditor
            {...referenceHandlers}
            aria-label="Page content"
            contentClassName="px-0 py-2"
            editorClassName="rounded-none"
            minHeightClassName="min-h-[440px]"
            mode="page"
            onValueChange={(body) => creation.onDraftChange({ ...creation.draft, body })}
            placeholder={labels.writePlaceholder}
            ref={editorRef}
            tagSuggestions={tagSuggestions}
            value={creation.draft.body}
          />
        </div>
      </div>
    </section>
  );
};

const PageLocationDialog = ({
  directoryOptions,
  draft,
  labels,
  onCancel,
  onChange,
}: {
  readonly directoryOptions: readonly string[];
  readonly draft: PagesAreaDraft;
  readonly labels: PagesAreaLabels;
  readonly onCancel: () => void;
  readonly onChange: (path: string) => void;
}) => {
  const pathSegments = draft.path.split("/");
  const initialFileName = pathSegments.pop() ?? pageFileNameFromTitle(draft.title);
  const initialDirectory = pathSegments.join("/");
  const [directoryPath, setDirectoryPath] = React.useState(initialDirectory);
  const [fileName, setFileName] = React.useState(initialFileName);
  const rootLocationValue = "__pages_root__";
  const normalizedFileName = fileName.trim();
  const valid =
    normalizedFileName.length > 3 &&
    normalizedFileName.endsWith(".md") &&
    !normalizedFileName.includes("/") &&
    !normalizedFileName.includes("\\");

  return (
    <DialogRoot onOpenChange={(open) => !open && onCancel()} open>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPanel width="sm">
            <DialogHeader>
              <div>
                <DialogTitle>{labels.move}</DialogTitle>
                <DialogDescription>{labels.moveDescription}</DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                {labels.location}
                <Select
                  items={directoryOptions.map((path) => ({
                    label: path.length === 0 ? labels.pages : `${labels.pages} / ${path}`,
                    value: path.length === 0 ? rootLocationValue : path,
                  }))}
                  onValueChange={(value) => {
                    if (value !== null) {
                      setDirectoryPath(value === rootLocationValue ? "" : value);
                    }
                  }}
                  value={directoryPath.length === 0 ? rootLocationValue : directoryPath}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                {labels.fileName}
                <Input
                  aria-invalid={!valid || undefined}
                  className="font-mono"
                  onChange={(event) => setFileName(event.currentTarget.value)}
                  value={fileName}
                />
              </label>
            </DialogBody>
            <DialogFooter>
              <Button onClick={onCancel} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={!valid}
                onClick={() =>
                  onChange(
                    `${directoryPath.length > 0 ? `${directoryPath}/` : ""}${normalizedFileName}`,
                  )
                }
              >
                {labels.move}
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
};

const DirectoryView = ({
  directory,
  labels,
  onCreate,
  onDirectoryPathSelect,
  onDirectorySelect,
  onPageSelect,
}: {
  readonly directory: PagesTreeDirectory;
  readonly labels: PagesAreaLabels;
  readonly onCreate?: (path: string) => void;
  readonly onDirectoryPathSelect: (path: string) => void;
  readonly onDirectorySelect: (directory: PagesTreeDirectory) => void;
  readonly onPageSelect: (page: PagesAreaPage) => void;
}) => {
  const pageEntries = [
    ...(directory.cover === undefined
      ? []
      : [{ fileName: "index.md", page: directory.cover } satisfies PagesTreePageEntry]),
    ...directory.pages,
  ];
  const empty = directory.directories.length === 0 && pageEntries.length === 0;

  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="border-b border-border px-6 py-4">
        <Breadcrumbs
          labels={labels}
          onDirectorySelect={onDirectoryPathSelect}
          path={directory.path}
        />
        <h2 className={cn("mt-2", typography.pageTitle)}>{directory.name || labels.pages}</h2>
      </header>
      {empty ? (
        <PageEmptyState
          description={labels.directoryDescription}
          label={labels.create}
          onCreate={onCreate ? () => onCreate(directory.path) : undefined}
          title={labels.directoryEmpty}
        />
      ) : (
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="grid gap-1">
            {directory.directories.map((child) => (
              <button
                className="flex min-h-10 items-center gap-3 rounded-md px-3 text-left text-sm text-foreground hover:bg-subtle"
                key={child.path}
                onClick={() => onDirectorySelect(child)}
                type="button"
              >
                <Folder aria-hidden className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{child.name}</span>
                {child.cover && !child.cover.archived ? (
                  <BookOpen
                    aria-label="Has cover page"
                    className="size-3.5 text-muted-foreground"
                  />
                ) : null}
              </button>
            ))}
            {pageEntries.map((entry) => (
              <button
                className="flex min-h-10 items-center gap-3 rounded-md px-3 text-left text-sm text-foreground hover:bg-subtle"
                key={entry.page.id}
                onClick={() => onPageSelect(entry.page)}
                type="button"
              >
                <FileText aria-hidden className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{entry.page.title}</span>
                <span className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                  {entry.fileName}
                </span>
                {entry.page.archived ? <Badge appearance="outline">{labels.archived}</Badge> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

const RevisionConflictDialog = ({
  conflict,
  draft,
  labels,
  onCopyUnsaved,
  onDismiss,
  onReloadCurrent,
}: {
  readonly conflict: PagesAreaRevisionConflict;
  readonly draft: PagesAreaDraft;
  readonly labels: PagesAreaLabels;
  readonly onCopyUnsaved?: (draft: PagesAreaDraft) => void;
  readonly onDismiss?: () => void;
  readonly onReloadCurrent?: () => void;
}) => (
  <DialogRoot
    onOpenChange={(open) => {
      if (!open) onDismiss?.();
    }}
    open
  >
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport>
        <DialogPanel width="sm">
          <DialogHeader>
            <div>
              <DialogTitle>{labels.conflictTitle}</DialogTitle>
              <DialogDescription>{labels.conflictDescription}</DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="grid gap-3">
            {conflict.currentTitle || conflict.currentPath ? (
              <div className="grid gap-1 rounded-md border border-border bg-subtle px-3 py-2 text-sm">
                {conflict.currentTitle ? (
                  <span className="font-medium text-foreground">{conflict.currentTitle}</span>
                ) : null}
                {conflict.currentPath ? (
                  <code className="text-xs text-muted-foreground">{conflict.currentPath}</code>
                ) : null}
              </div>
            ) : null}
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{labels.conflictExpected}</dt>
              <dd className="font-mono text-foreground" title={conflict.expectedRevisionId}>
                {shortRevision(conflict.expectedRevisionId)}
              </dd>
              <dt className="text-muted-foreground">{labels.conflictActual}</dt>
              <dd className="font-mono text-foreground" title={conflict.actualRevisionId}>
                {shortRevision(conflict.actualRevisionId)}
              </dd>
            </dl>
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={onCopyUnsaved === undefined}
              leftIcon={<Clipboard aria-hidden className="size-4" />}
              onClick={() => onCopyUnsaved?.(draft)}
              variant="outline"
            >
              {labels.copyUnsaved}
            </Button>
            <Button
              disabled={onReloadCurrent === undefined}
              leftIcon={<RotateCcw aria-hidden className="size-4" />}
              onClick={onReloadCurrent}
            >
              {labels.reloadCurrent}
            </Button>
          </DialogFooter>
        </DialogPanel>
      </DialogViewport>
    </DialogPortal>
  </DialogRoot>
);

export const PagesArea = React.forwardRef<HTMLDivElement, PagesAreaProps>(function PagesArea(
  {
    activeSection,
    className,
    comments = { entries: [] },
    creation,
    defaultActiveSection = "document",
    defaultEditing = false,
    defaultExpandedDirectoryPaths,
    defaultIncludeArchived = false,
    defaultSelectedPageId,
    defaultViewedDirectoryPath = "",
    draft: controlledDraft,
    editing,
    error,
    expandedDirectoryPaths,
    history = { items: [] },
    includeArchived,
    labels: labelOverrides,
    loading = false,
    onActiveSectionChange,
    onAgentReferenceClick,
    onArchive,
    onCommitReferenceClick,
    onCopyLink,
    onCopyUnsaved,
    onCreate,
    onCycleReferenceClick,
    onDirectorySelect,
    onDiscard,
    onDraftChange,
    onEditingChange,
    onExpandedDirectoryPathsChange,
    onExternalLinkClick,
    onIncludeArchivedChange,
    onIssueReferenceClick,
    onPageReferenceClick,
    onPageSelect,
    onReloadCurrent,
    onRepositoryReferenceClick,
    onRestore,
    onRevisionConflictDismiss,
    onSave,
    onUnsavedNavigationAttempt,
    onUserReferenceClick,
    pages,
    pendingAction,
    revisionConflict,
    saveError,
    selectedPageId,
    tagSuggestions,
    ...props
  },
  ref,
) {
  const labels = { ...defaultLabels, ...labelOverrides };
  const [currentIncludeArchived, setIncludeArchived] = useControllableState({
    defaultValue: defaultIncludeArchived,
    onValueChange: onIncludeArchivedChange,
    value: includeArchived,
  });
  const tree = React.useMemo(
    () => buildPagesTree(pages, currentIncludeArchived),
    [currentIncludeArchived, pages],
  );
  const [navigationQuery, setNavigationQuery] = React.useState("");
  const navigationPages = React.useMemo(() => {
    const query = navigationQuery.trim().toLocaleLowerCase();
    if (query.length === 0) return pages;
    return pages.filter(
      (page) =>
        page.title.toLocaleLowerCase().includes(query) ||
        page.path.toLocaleLowerCase().includes(query),
    );
  }, [navigationQuery, pages]);
  const navigationTree = React.useMemo(
    () => buildPagesTree(navigationPages, currentIncludeArchived),
    [currentIncludeArchived, navigationPages],
  );
  const hasArchivedPages = pages.some((page) => page.archived);
  const [currentSelectedPageId, setSelectedPageId] = useControllableState<string | undefined>({
    defaultValue: defaultSelectedPageId,
    onValueChange: (pageId) => {
      const page = pages.find((entry) => entry.id === pageId);
      if (page) onPageSelect?.(page);
    },
    value: selectedPageId,
  });
  const selectedPage = pages.find((page) => page.id === currentSelectedPageId);
  const [currentSection, setSection] = useControllableState<PagesAreaSection>({
    defaultValue: defaultActiveSection,
    onValueChange: onActiveSectionChange,
    value: activeSection,
  });
  const [currentEditing, setEditing] = useControllableState({
    defaultValue: defaultEditing,
    onValueChange: onEditingChange,
    value: editing,
  });
  const [uncontrolledDraft, setUncontrolledDraft] = React.useState<PagesAreaDraft>(() =>
    selectedPage ? pageDraftFrom(selectedPage) : emptyDraft,
  );
  const draft = controlledDraft ?? uncontrolledDraft;
  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  const previousPageRef = React.useRef(selectedPage);
  const dirty = isPageDraftDirty(draft, selectedPage);
  const creationHasChanges =
    creation !== undefined &&
    (creation.draft.title.trim().length > 0 || creation.draft.body.trim().length > 0);
  const [viewedDirectoryPath, setViewedDirectoryPath] = React.useState<string | null>(() =>
    selectedPage ? null : defaultViewedDirectoryPath,
  );
  const [uncontrolledExpandedPaths, setUncontrolledExpandedPaths] =
    React.useState<Set<string> | null>(() =>
      defaultExpandedDirectoryPaths === undefined ? null : new Set(defaultExpandedDirectoryPaths),
    );
  const [locationDialogOpen, setLocationDialogOpen] = React.useState(false);
  const [archiveCandidate, setArchiveCandidate] = React.useState<PagesAreaPage>();

  React.useEffect(() => {
    const previousPage = previousPageRef.current;
    previousPageRef.current = selectedPage;
    if (controlledDraft !== undefined) return;

    if (selectedPage === undefined) {
      setUncontrolledDraft(emptyDraft);
      return;
    }
    if (previousPage?.id !== selectedPage.id) {
      setUncontrolledDraft(pageDraftFrom(selectedPage));
      return;
    }
    if (
      previousPage.revisionId !== selectedPage.revisionId &&
      !isPageDraftDirty(draftRef.current, previousPage)
    ) {
      setUncontrolledDraft(pageDraftFrom(selectedPage));
    }
  }, [controlledDraft, selectedPage]);

  const setDraft = React.useCallback(
    (nextDraft: PagesAreaDraft) => {
      if (controlledDraft === undefined) setUncontrolledDraft(nextDraft);
      onDraftChange?.(nextDraft);
    },
    [controlledDraft, onDraftChange],
  );
  const isExpanded = React.useCallback(
    (path: string) =>
      expandedDirectoryPaths === undefined
        ? uncontrolledExpandedPaths === null || uncontrolledExpandedPaths.has(path)
        : expandedDirectoryPaths.includes(path),
    [expandedDirectoryPaths, uncontrolledExpandedPaths],
  );
  const toggleDirectory = React.useCallback(
    (path: string) => {
      const current =
        expandedDirectoryPaths === undefined
          ? uncontrolledExpandedPaths === null
            ? new Set(directoryPaths(tree))
            : new Set(uncontrolledExpandedPaths)
          : new Set(expandedDirectoryPaths);
      if (current.has(path)) current.delete(path);
      else current.add(path);
      const next = [...current].sort();
      if (expandedDirectoryPaths === undefined) setUncontrolledExpandedPaths(current);
      onExpandedDirectoryPathsChange?.(next);
    },
    [expandedDirectoryPaths, onExpandedDirectoryPathsChange, tree, uncontrolledExpandedPaths],
  );

  const selectPage = React.useCallback(
    (page: PagesAreaPage) => {
      if ((dirty || creationHasChanges) && page.id !== selectedPage?.id) {
        onUnsavedNavigationAttempt?.({ kind: "page", page });
        return;
      }
      if (creation !== undefined) creation.onCancel();
      setViewedDirectoryPath(null);
      setSelectedPageId(page.id);
      setSection("document");
    },
    [
      creation,
      creationHasChanges,
      dirty,
      onUnsavedNavigationAttempt,
      selectedPage?.id,
      setSection,
      setSelectedPageId,
    ],
  );
  const selectDirectoryPath = React.useCallback(
    (path: string) => {
      if (dirty || creationHasChanges) {
        onUnsavedNavigationAttempt?.({ kind: "directory", path });
        return;
      }
      if (creation !== undefined) creation.onCancel();
      setViewedDirectoryPath(path);
      onDirectorySelect?.(path);
    },
    [creation, creationHasChanges, dirty, onDirectorySelect, onUnsavedNavigationAttempt],
  );
  const selectDirectory = React.useCallback(
    (directory: PagesTreeDirectory) => {
      const activeCover = directory.cover?.archived ? undefined : directory.cover;
      if (activeCover) {
        selectPage(activeCover);
        return;
      }
      selectDirectoryPath(directory.path);
    },
    [selectDirectoryPath, selectPage],
  );
  const viewedDirectory =
    viewedDirectoryPath === null ? undefined : findPagesTreeDirectory(tree, viewedDirectoryPath);
  const canSave =
    selectedPage !== undefined &&
    !selectedPage.archived &&
    dirty &&
    draft.title.trim().length > 0 &&
    draft.path.trim().length > 0 &&
    pendingAction !== "save" &&
    onSave !== undefined;
  const referenceHandlers = {
    onAgentReferenceClick,
    onCommitReferenceClick,
    onCycleReferenceClick,
    onExternalLinkClick,
    onIssueReferenceClick,
    onPageReferenceClick,
    onRepositoryReferenceClick,
    onUserReferenceClick,
  } satisfies MarkdownReferenceHandlers;
  const availableDirectoryPaths = React.useMemo(
    () => [...new Set(["", ...directoryPaths(tree)])],
    [tree],
  );

  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "grid h-full min-h-0 overflow-hidden border border-border bg-background md:grid-cols-[292px_minmax(0,1fr)]",
        className,
      )}
    >
      <aside className="grid min-h-48 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] border-b border-border bg-sidebar md:min-h-0 md:border-b-0 md:border-r">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <BookOpen aria-hidden className="size-4 text-muted-foreground" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {labels.pages}
          </h2>
          {onCreate ? (
            <Button
              disabled={creation !== undefined}
              leftIcon={<Plus aria-hidden className="size-4" />}
              onClick={() =>
                onCreate(
                  viewedDirectoryPath ?? selectedPage?.path.split("/").slice(0, -1).join("/") ?? "",
                )
              }
              size="sm"
              variant="outline"
            >
              {labels.createTitle}
            </Button>
          ) : null}
        </div>
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={labels.findPages}
              className="h-8 bg-background pl-8 text-xs shadow-none"
              onChange={(event) => setNavigationQuery(event.currentTarget.value)}
              placeholder={labels.findPages}
              value={navigationQuery}
            />
          </div>
        </div>
        {hasArchivedPages ? (
          <label className="flex h-10 items-center justify-between gap-3 border-b border-border px-3 text-xs text-muted-foreground">
            <span>{labels.archivedFilter}</span>
            <Switch checked={currentIncludeArchived} onCheckedChange={setIncludeArchived} />
          </label>
        ) : null}
        <div className="min-h-0 overflow-y-auto p-2" role="tree" aria-label={labels.pages}>
          {loading ? (
            <PanelState className="min-h-32 p-2" kind="loading" message={labels.loading} />
          ) : error ? (
            <PanelState
              className="min-h-32 p-2"
              description={error}
              kind="error"
              message={labels.pages}
            />
          ) : navigationTree.directories.length === 0 &&
            navigationTree.pages.length === 0 &&
            navigationTree.cover === undefined ? (
            <p className="px-2 py-6 text-center text-xs leading-5 text-muted-foreground">
              {navigationQuery.trim().length > 0 ? labels.noMatchingPages : labels.emptyPages}
            </p>
          ) : (
            <>
              {navigationTree.cover ? (
                <PageTreeRow
                  active={navigationTree.cover.id === selectedPage?.id}
                  depth={0}
                  entry={{ fileName: "index.md", page: navigationTree.cover }}
                  labels={labels}
                  onSelect={() => selectPage(navigationTree.cover!)}
                />
              ) : null}
              {navigationTree.directories.map((directory) => (
                <PageTreeDirectoryRows
                  depth={0}
                  directory={directory}
                  isExpanded={isExpanded}
                  key={directory.path}
                  labels={labels}
                  onDirectorySelect={selectDirectory}
                  onPageSelect={selectPage}
                  onToggle={toggleDirectory}
                  selectedPageId={selectedPage?.id}
                />
              ))}
              {navigationTree.pages.map((entry) => (
                <PageTreeRow
                  active={entry.page.id === selectedPage?.id}
                  depth={0}
                  entry={entry}
                  key={entry.page.id}
                  labels={labels}
                  onSelect={() => selectPage(entry.page)}
                />
              ))}
            </>
          )}
        </div>
      </aside>

      {loading ? (
        <PanelState kind="loading" message={labels.loading} />
      ) : error ? (
        <PanelState description={error} kind="error" message={labels.pages} />
      ) : creation ? (
        <PageCreationView
          creation={creation}
          labels={labels}
          referenceHandlers={referenceHandlers}
          tagSuggestions={tagSuggestions}
        />
      ) : viewedDirectory ? (
        <DirectoryView
          directory={viewedDirectory}
          labels={labels}
          onCreate={onCreate}
          onDirectoryPathSelect={selectDirectoryPath}
          onDirectorySelect={selectDirectory}
          onPageSelect={selectPage}
        />
      ) : selectedPage ? (
        <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]">
          <header className="flex min-h-14 items-center gap-4 border-b border-border px-6 py-2">
            <Breadcrumbs
              labels={labels}
              onDirectorySelect={selectDirectoryPath}
              page={selectedPage}
              path=""
            />
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              {dirty ? <Badge tone="warning">{labels.unsaved}</Badge> : null}
              {selectedPage.archived ? <Badge tone="neutral">{labels.archived}</Badge> : null}
              {onCopyLink ? (
                <IconButton
                  icon={<Link aria-hidden className="size-4" />}
                  label={labels.copyLink}
                  onClick={() => onCopyLink(selectedPage)}
                  size="sm"
                  variant="outline"
                />
              ) : null}
              {selectedPage.archived ? (
                onRestore ? (
                  <Button
                    leftIcon={<RotateCcw aria-hidden className="size-4" />}
                    loading={pendingAction === "restore"}
                    onClick={() => onRestore(selectedPage)}
                    size="sm"
                    variant="outline"
                  >
                    {labels.restore}
                  </Button>
                ) : null
              ) : (
                <>
                  {currentEditing ? (
                    <>
                      <Button
                        disabled={pendingAction !== undefined}
                        leftIcon={<X aria-hidden className="size-4" />}
                        onClick={() => {
                          setDraft(pageDraftFrom(selectedPage));
                          setEditing(false);
                          onDiscard?.(selectedPage);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {labels.discard}
                      </Button>
                      <Button
                        disabled={!canSave}
                        leftIcon={<Save aria-hidden className="size-4" />}
                        loading={pendingAction === "save"}
                        onClick={() => onSave?.(draft, selectedPage)}
                        size="sm"
                      >
                        {labels.save}
                      </Button>
                    </>
                  ) : onSave ? (
                    <Button
                      leftIcon={<Edit3 aria-hidden className="size-4" />}
                      onClick={() => {
                        setSection("document");
                        setEditing(true);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {labels.edit}
                    </Button>
                  ) : null}
                  {onArchive ? (
                    <IconButton
                      disabled={dirty || pendingAction !== undefined}
                      icon={<Archive aria-hidden className="size-4" />}
                      label={labels.archive}
                      loading={pendingAction === "archive"}
                      onClick={() => setArchiveCandidate(selectedPage)}
                      size="sm"
                      tone="neutral"
                      variant="outline"
                    />
                  ) : null}
                </>
              )}
            </div>
          </header>
          <div className="flex items-center gap-2 border-b border-border px-6 py-2" role="tablist">
            <ViewTab
              icon={<FileText aria-hidden className="size-4" />}
              label={labels.document}
              onClick={() => setSection("document")}
              selected={currentSection === "document"}
              value="document"
            />
            <ViewTab
              count={comments.entries.length}
              icon={<MessageSquare aria-hidden className="size-4" />}
              label={labels.comments}
              onClick={() => setSection("comments")}
              selected={currentSection === "comments"}
              value="comments"
            />
            <ViewTab
              count={history.items.length}
              icon={<History aria-hidden className="size-4" />}
              label={labels.history}
              onClick={() => setSection("history")}
              selected={currentSection === "history"}
              value="history"
            />
          </div>
          <div className="min-h-0 overflow-y-auto">
            {currentSection === "document" ? (
              <div className="mx-auto grid w-full max-w-4xl gap-6 px-8 py-10">
                {selectedPage.archived ? (
                  <Alert tone="warning">
                    <AlertTitle>{labels.archived}</AlertTitle>
                    <AlertDescription>{labels.archivedDescription}</AlertDescription>
                  </Alert>
                ) : null}
                {saveError ? (
                  <Alert tone="danger">
                    <AlertTitle>{labels.save}</AlertTitle>
                    <AlertDescription>{saveError}</AlertDescription>
                  </Alert>
                ) : null}
                {currentEditing && !selectedPage.archived ? (
                  <div
                    className="grid gap-6"
                    onKeyDown={(event) => {
                      if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key.toLocaleLowerCase() === "s"
                      ) {
                        event.preventDefault();
                        if (canSave) onSave?.(draft, selectedPage);
                      }
                    }}
                  >
                    <div className="grid gap-2">
                      <input
                        aria-label="Page title"
                        aria-invalid={draft.title.trim().length === 0 || undefined}
                        className={cn(
                          "-mx-2 w-[calc(100%+1rem)] rounded-md bg-transparent px-2 py-1 text-3xl font-semibold leading-tight tracking-tight text-foreground",
                          focusRing,
                        )}
                        onChange={(event) =>
                          setDraft({ ...draft, title: event.currentTarget.value })
                        }
                        value={draft.title}
                      />
                      <button
                        className={cn(
                          "-mx-2 flex w-fit max-w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-subtle",
                          focusRing,
                        )}
                        onClick={() => setLocationDialogOpen(true)}
                        type="button"
                      >
                        <PageLocation
                          labels={labels}
                          path={draft.path.split("/").slice(0, -1).join("/")}
                        />
                        <span className="text-xs font-medium text-primary">{labels.move}</span>
                      </button>
                    </div>
                    <MarkdownEditor
                      {...referenceHandlers}
                      aria-label="Page content"
                      contentClassName="px-0 py-2"
                      editorClassName="rounded-none"
                      minHeightClassName="min-h-[440px]"
                      mode="page"
                      onValueChange={(body) => setDraft({ ...draft, body })}
                      placeholder={labels.writePlaceholder}
                      tagSuggestions={tagSuggestions}
                      value={draft.body}
                    />
                  </div>
                ) : (
                  <article className="grid gap-6">
                    <div className="grid gap-2">
                      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
                        {selectedPage.title}
                      </h1>
                      {selectedPage.updatedAt || selectedPage.updatedBy ? (
                        <p className="text-xs text-muted-foreground">
                          {labels.updated}{" "}
                          {selectedPage.updatedAt ? (
                            <DateTime format="relative" value={selectedPage.updatedAt} />
                          ) : null}
                          {selectedPage.updatedBy ? ` by ${selectedPage.updatedBy}` : null}
                        </p>
                      ) : null}
                    </div>
                    {selectedPage.body.length === 0 ? (
                      <p className="py-8 text-sm text-muted-foreground">{labels.emptyBody}</p>
                    ) : (
                      <MarkdownRenderer {...referenceHandlers} markdown={selectedPage.body} />
                    )}
                  </article>
                )}
              </div>
            ) : currentSection === "comments" ? (
              <div className="mx-auto grid w-full max-w-4xl gap-5 p-6">
                {selectedPage.archived ? (
                  <Alert tone="warning">
                    <AlertTitle>{labels.archived}</AlertTitle>
                    <AlertDescription>{labels.archivedDescription}</AlertDescription>
                  </Alert>
                ) : null}
                {comments.loading ? (
                  <PanelState className="min-h-48" kind="loading" message={labels.comments} />
                ) : comments.error ? (
                  <PanelState
                    className="min-h-48"
                    description={comments.error}
                    kind="error"
                    message={labels.comments}
                  />
                ) : comments.entries.length === 0 ? (
                  <PanelState className="min-h-40" message={labels.emptyComments} />
                ) : (
                  <div className="grid gap-5">
                    {comments.entries.map((comment) => (
                      <CommentCard
                        {...referenceHandlers}
                        author={comment.author}
                        body={comment.body}
                        key={comment.id}
                        timestamp={
                          comment.timestamp ??
                          (comment.occurredAt === undefined ? undefined : (
                            <DateTime
                              format="relative"
                              value={
                                typeof comment.occurredAt === "number"
                                  ? new Date(comment.occurredAt)
                                  : comment.occurredAt
                              }
                            />
                          ))
                        }
                      />
                    ))}
                  </div>
                )}
                {comments.onSubmit ? (
                  <CommentComposer
                    author={comments.viewer}
                    defaultValue={comments.defaultValue}
                    onSubmit={comments.onSubmit}
                    onValueChange={comments.onValueChange}
                    submitLabel={labels.addComment}
                    submitting={comments.submitting}
                    value={comments.value}
                  />
                ) : null}
              </div>
            ) : history.loading ? (
              <PanelState kind="loading" message={labels.history} />
            ) : (
              <CommitHistory
                emptyState={labels.emptyHistory}
                error={history.error}
                items={history.items}
                onCommitSelect={history.onSelect}
                showHeader={false}
              />
            )}
          </div>
          {revisionConflict ? (
            <RevisionConflictDialog
              conflict={revisionConflict}
              draft={draft}
              labels={labels}
              onCopyUnsaved={
                onCopyUnsaved
                  ? (unsavedDraft) => onCopyUnsaved(unsavedDraft, selectedPage)
                  : undefined
              }
              onDismiss={onRevisionConflictDismiss}
              onReloadCurrent={
                onReloadCurrent ? () => onReloadCurrent(selectedPage, revisionConflict) : undefined
              }
            />
          ) : null}
        </section>
      ) : (
        <PageEmptyState
          description={labels.emptyPagesDescription}
          label={labels.createFirst}
          onCreate={onCreate ? () => onCreate("") : undefined}
          title={labels.emptyPages}
        />
      )}
      {locationDialogOpen && selectedPage ? (
        <PageLocationDialog
          directoryOptions={availableDirectoryPaths}
          draft={draft}
          labels={labels}
          onCancel={() => setLocationDialogOpen(false)}
          onChange={(path) => {
            setDraft({ ...draft, path });
            setLocationDialogOpen(false);
          }}
        />
      ) : null}
      {archiveCandidate ? (
        <DialogRoot onOpenChange={(open) => !open && setArchiveCandidate(undefined)} open>
          <DialogPortal>
            <DialogBackdrop />
            <DialogViewport>
              <DialogPanel width="sm">
                <DialogHeader>
                  <div>
                    <DialogTitle>{labels.archiveConfirmTitle}</DialogTitle>
                    <DialogDescription>{labels.archiveConfirmDescription}</DialogDescription>
                  </div>
                </DialogHeader>
                <DialogFooter>
                  <Button onClick={() => setArchiveCandidate(undefined)} variant="outline">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      onArchive?.(archiveCandidate);
                      setArchiveCandidate(undefined);
                    }}
                    tone="danger"
                  >
                    {labels.archive}
                  </Button>
                </DialogFooter>
              </DialogPanel>
            </DialogViewport>
          </DialogPortal>
        </DialogRoot>
      ) : null}
    </div>
  );
});
