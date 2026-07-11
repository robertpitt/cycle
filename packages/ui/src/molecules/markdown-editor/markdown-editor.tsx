import {
  AtSign,
  Bot,
  Bold,
  CheckSquare,
  ChevronDown,
  Code2,
  FileText,
  GitBranch,
  GitCommit,
  Heading,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
  Ticket,
  UserRound,
} from "lucide-react";
import * as React from "react";
import { getMarkdownEditorShortcut } from "../../internal/markdown-editor-shortcuts.ts";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import type { LinkMatcher } from "@lexical/link";
import { $createLinkNode, $isLinkNode, $toggleLink } from "@lexical/link";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { AutoLinkPlugin } from "@lexical/react/LexicalAutoLinkPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $setBlocksType } from "@lexical/selection";
import { $createCodeNode } from "@lexical/code";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_MODIFIER_COMMAND,
  type LexicalEditor,
} from "lexical";
import { $findMatchingParent } from "@lexical/utils";
import { MarkdownRenderer, type MarkdownReferenceHandlers } from "../markdown-renderer/index.ts";
import { cn } from "../../lib/cn.ts";
import {
  getCycleReferenceHref,
  parseCycleReferenceMarkdownLink,
  parseCycleReferenceHref,
  type CycleReferenceKind,
} from "../../lib/markdown-references.ts";
import { focusRing, typography } from "../../lib/styles.ts";
import {
  exportMarkdownFromEditorState,
  importMarkdownIntoEditor,
  isSafeMarkdownUrl,
  markdownEditorNodes,
  markdownEditorTransformers,
  markdownToLexicalState,
  normalizeMarkdownEditorValue,
} from "./markdown-editor-utils.ts";

export type MarkdownEditorCommand = {
  readonly description?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly id: string;
  readonly label: React.ReactNode;
  readonly shortcut?: React.ReactNode;
};

export type MarkdownEditorCommandSection = {
  readonly commands: readonly MarkdownEditorCommand[];
  readonly id: string;
  readonly label?: React.ReactNode;
};

export type MarkdownEditorFormatAction =
  | "bold"
  | "code"
  | "heading"
  | "italic"
  | "link"
  | "ordered-list"
  | "quote"
  | "strike"
  | "task-list"
  | "unordered-list";

export type MarkdownEditorMode = "comment" | "ticket";

export type MarkdownEditorTagSuggestion = {
  readonly description?: React.ReactNode;
  readonly href?: string;
  readonly id: string;
  readonly insertLabel?: string;
  readonly kind: CycleReferenceKind;
  readonly label: React.ReactNode;
  readonly searchText?: string;
};

export type MarkdownEditorProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange" | "onSubmit"
> &
  MarkdownReferenceHandlers & {
    readonly "aria-label"?: string;
    readonly commandSections?: readonly MarkdownEditorCommandSection[];
    readonly commitOnBlur?: boolean;
    readonly contentClassName?: string;
    readonly defaultPreviewOpen?: boolean;
    readonly defaultSlashMenuOpen?: boolean;
    readonly defaultToolbarOpen?: boolean;
    readonly defaultValue?: string;
    readonly disabled?: boolean;
    readonly editorClassName?: string;
    readonly minHeightClassName?: string;
    readonly mode?: MarkdownEditorMode;
    readonly onCommandSelect?: (command: MarkdownEditorCommand) => void;
    readonly onCommit?: (value: string) => void;
    readonly onEditorError?: (error: Error) => void;
    readonly onFormatSelect?: (action: MarkdownEditorFormatAction) => void;
    readonly onSubmit?: (value: string) => void;
    readonly onTagQueryChange?: (query: string) => void;
    readonly onTagSelect?: (suggestion: MarkdownEditorTagSuggestion) => void;
    readonly onValueChange?: (value: string) => void;
    readonly placeholder?: string;
    readonly previewOpen?: boolean;
    readonly readOnly?: boolean;
    readonly slashMenuOpen?: boolean;
    readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
    readonly toolbarOpen?: boolean;
    readonly value?: string;
  };

const defaultCommandSections: readonly MarkdownEditorCommandSection[] = [
  {
    commands: [
      {
        description: "Add a heading block",
        icon: <Heading aria-hidden className="size-4" />,
        id: "heading",
        label: "Heading",
        shortcut: "#",
      },
      {
        description: "Start a bulleted list",
        icon: <List aria-hidden className="size-4" />,
        id: "bulleted-list",
        label: "Bulleted list",
        shortcut: "-",
      },
      {
        description: "Track completion inline",
        icon: <CheckSquare aria-hidden className="size-4" />,
        id: "todo-list",
        label: "Todo list",
        shortcut: "[]",
      },
    ],
    id: "blocks",
    label: "Blocks",
  },
  {
    commands: [
      {
        description: "Mention a person or team",
        icon: <AtSign aria-hidden className="size-4" />,
        id: "mention",
        label: "Mention",
        shortcut: "@",
      },
      {
        description: "Attach an image",
        icon: <ImagePlus aria-hidden className="size-4" />,
        id: "image",
        label: "Image",
      },
      {
        description: "Insert code block",
        icon: <Code2 aria-hidden className="size-4" />,
        id: "code",
        label: "Code block",
        shortcut: "```",
      },
    ],
    id: "insert",
    label: "Insert",
  },
];

const formatActions: readonly {
  readonly action: MarkdownEditorFormatAction;
  readonly icon: React.ReactNode;
  readonly label: string;
}[] = [
  {
    action: "heading",
    icon: (
      <>
        <span className={typography.panelTitle}>Aa</span>
        <ChevronDown aria-hidden className="size-3" />
      </>
    ),
    label: "Text style",
  },
  {
    action: "bold",
    icon: <Bold aria-hidden className="size-4" />,
    label: "Bold",
  },
  {
    action: "italic",
    icon: <Italic aria-hidden className="size-4" />,
    label: "Italic",
  },
  {
    action: "strike",
    icon: <Strikethrough aria-hidden className="size-4" />,
    label: "Strikethrough",
  },
  {
    action: "link",
    icon: <Link aria-hidden className="size-4" />,
    label: "Link",
  },
  {
    action: "quote",
    icon: <Quote aria-hidden className="size-4" />,
    label: "Quote",
  },
  {
    action: "code",
    icon: <Code2 aria-hidden className="size-4" />,
    label: "Code",
  },
  {
    action: "unordered-list",
    icon: <List aria-hidden className="size-4" />,
    label: "Bulleted list",
  },
  {
    action: "ordered-list",
    icon: <ListOrdered aria-hidden className="size-4" />,
    label: "Numbered list",
  },
  {
    action: "task-list",
    icon: <CheckSquare aria-hidden className="size-4" />,
    label: "Task list",
  },
];

const urlPattern =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,12}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/u;

const urlMatcher: LinkMatcher = (text) => {
  const match = urlPattern.exec(text);
  if (match === null) return null;

  const fullMatch = match[0];
  return {
    index: match.index,
    length: fullMatch.length,
    text: fullMatch,
    url: fullMatch.startsWith("http") ? fullMatch : `https://${fullMatch}`,
  };
};

const useControllableOpen = ({
  defaultOpen = false,
  open,
}: {
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  return [open ?? uncontrolledOpen, setUncontrolledOpen] as const;
};

const useLatest = <TValue,>(value: TValue) => {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

type FloatingMenuSide = "bottom" | "top";

type FloatingMenuRect = {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
};

type FloatingMenuViewportRect = {
  readonly height: number;
  readonly left?: number;
  readonly top?: number;
  readonly width: number;
};

export type FloatingMenuPlacement = {
  readonly side: FloatingMenuSide;
  readonly style: React.CSSProperties;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const getViewportFloatingMenuPlacement = ({
  align = "start",
  anchorRect,
  floatingRect,
  gap = 8,
  padding = 8,
  viewportRect,
}: {
  readonly align?: "end" | "start";
  readonly anchorRect: Pick<FloatingMenuRect, "bottom" | "left" | "right" | "top">;
  readonly floatingRect: Pick<FloatingMenuRect, "height" | "width">;
  readonly gap?: number;
  readonly padding?: number;
  readonly viewportRect: FloatingMenuViewportRect;
}): FloatingMenuPlacement => {
  const viewportLeft = viewportRect.left ?? 0;
  const viewportTop = viewportRect.top ?? 0;
  const viewportRight = viewportLeft + viewportRect.width;
  const viewportBottom = viewportTop + viewportRect.height;
  const usableHeight = Math.max(0, viewportRect.height - padding * 2);
  const usableWidth = Math.max(0, viewportRect.width - padding * 2);
  const belowSpace = viewportBottom - anchorRect.bottom - padding - gap;
  const aboveSpace = anchorRect.top - viewportTop - padding - gap;
  const fitsBelow = belowSpace >= floatingRect.height;
  const fitsAbove = aboveSpace >= floatingRect.height;
  const side: FloatingMenuSide =
    fitsBelow || (!fitsAbove && belowSpace >= aboveSpace) ? "bottom" : "top";
  const sideSpace = side === "bottom" ? belowSpace : aboveSpace;
  const maxHeight = Math.max(0, Math.min(floatingRect.height, sideSpace, usableHeight));
  const visibleHeight = Math.min(floatingRect.height, maxHeight);
  const floatingWidth = Math.min(floatingRect.width, usableWidth);
  const unclampedTop =
    side === "bottom" ? anchorRect.bottom + gap : anchorRect.top - gap - visibleHeight;
  const unclampedLeft = align === "end" ? anchorRect.right - floatingWidth : anchorRect.left;

  return {
    side,
    style: {
      left: Math.round(
        clamp(unclampedLeft, viewportLeft + padding, viewportRight - padding - floatingWidth),
      ),
      maxHeight: Math.floor(maxHeight),
      maxWidth: Math.floor(usableWidth),
      overflowY: floatingRect.height > maxHeight ? "auto" : undefined,
      position: "fixed",
      top: Math.round(
        clamp(unclampedTop, viewportTop + padding, viewportBottom - padding - visibleHeight),
      ),
    },
  };
};

const hasUsableRect = (rect: Pick<FloatingMenuRect, "height" | "width">): boolean =>
  rect.height > 0 || rect.width > 0;

const getRangeAnchorRect = (range: Range): DOMRect | undefined => {
  const rect = Array.from(range.getClientRects()).find(hasUsableRect);
  if (rect) return rect;

  const boundingRect = range.getBoundingClientRect();
  return hasUsableRect(boundingRect) ? boundingRect : undefined;
};

const getEditorSelectionAnchorRect = (editor: LexicalEditor | null): DOMRect | undefined => {
  if (typeof window === "undefined") return undefined;

  const rootElement = editor?.getRootElement();
  if (!rootElement) return undefined;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return rootElement.getBoundingClientRect();

  const range = selection.getRangeAt(0);
  if (!rootElement.contains(range.startContainer)) return rootElement.getBoundingClientRect();

  return getRangeAnchorRect(range) ?? rootElement.getBoundingClientRect();
};

const hiddenFloatingMenuStyle: React.CSSProperties = {
  left: 0,
  maxWidth: "calc(100vw - 1rem)",
  position: "fixed",
  top: 0,
  visibility: "hidden",
};

const isSameFloatingMenuPlacement = (
  current: FloatingMenuPlacement | undefined,
  next: FloatingMenuPlacement,
): boolean =>
  current?.side === next.side &&
  current.style.left === next.style.left &&
  current.style.maxHeight === next.style.maxHeight &&
  current.style.maxWidth === next.style.maxWidth &&
  current.style.overflowY === next.style.overflowY &&
  current.style.top === next.style.top;

const useViewportFloatingMenu = ({
  align = "start",
  getAnchorRect,
  open,
  updateKey,
}: {
  readonly align?: "end" | "start";
  readonly getAnchorRect: () => DOMRect | undefined;
  readonly open: boolean;
  readonly updateKey?: React.DependencyList[number];
}) => {
  const floatingRef = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState<FloatingMenuPlacement | undefined>();

  const updatePlacement = React.useCallback(() => {
    if (!open || typeof window === "undefined") return;

    const floatingElement = floatingRef.current;
    const anchorRect = getAnchorRect();
    if (!floatingElement || !anchorRect) return;

    const floatingElementRect = floatingElement.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const nextPlacement = getViewportFloatingMenuPlacement({
      align,
      anchorRect,
      floatingRect: {
        height: floatingElement.scrollHeight || floatingElementRect.height,
        width: floatingElementRect.width,
      },
      viewportRect: {
        height: visualViewport?.height ?? window.innerHeight,
        left: visualViewport?.offsetLeft ?? 0,
        top: visualViewport?.offsetTop ?? 0,
        width: visualViewport?.width ?? window.innerWidth,
      },
    });

    setPlacement((current) =>
      isSameFloatingMenuPlacement(current, nextPlacement) ? current : nextPlacement,
    );
  }, [align, getAnchorRect, open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPlacement(undefined);
      return;
    }

    updatePlacement();
  }, [open, updatePlacement, updateKey]);

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;

    let frame: number | undefined;
    const scheduleUpdate = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        updatePlacement();
      });
    };
    const visualViewport = window.visualViewport;

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, [open, updatePlacement]);

  return {
    floatingRef,
    floatingStyle: placement?.style ?? hiddenFloatingMenuStyle,
  } as const;
};

export const MarkdownEditorToolbar = ({
  className,
  onFormatSelect,
}: {
  readonly className?: string;
  readonly onFormatSelect?: (action: MarkdownEditorFormatAction) => void;
}) => (
  <div
    className={cn(
      "inline-flex items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-elevated",
      className,
    )}
    role="toolbar"
  >
    {formatActions.map((item, index) => (
      <React.Fragment key={item.action}>
        {index === 7 ? <span aria-hidden className="mx-1 h-6 w-px bg-border" /> : null}
        <button
          aria-label={item.label}
          className={cn(
            "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground transition hover:bg-subtle hover:text-foreground",
            focusRing,
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormatSelect?.(item.action)}
          type="button"
        >
          {item.icon}
        </button>
      </React.Fragment>
    ))}
  </div>
);

export const MarkdownEditorSlashMenu = React.forwardRef<
  HTMLDivElement,
  {
    readonly className?: string;
    readonly onCommandSelect?: (command: MarkdownEditorCommand) => void;
    readonly sections?: readonly MarkdownEditorCommandSection[];
    readonly style?: React.CSSProperties;
  }
>(function MarkdownEditorSlashMenu(
  { className, onCommandSelect, sections = defaultCommandSections, style },
  ref,
) {
  return (
    <div
      className={cn(
        "w-[320px] overflow-hidden rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-elevated",
        className,
      )}
      ref={ref}
      role="menu"
      style={style}
    >
      <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
        <Pilcrow aria-hidden className="size-4 text-muted-foreground" />
        <span className={cn(typography.control, "text-muted-foreground")}>Insert block</span>
      </div>
      <div className="grid gap-2 pt-2">
        {sections.map((section) => (
          <div className="grid gap-1" key={section.id}>
            {section.label ? (
              <p className={cn("px-2 py-1 uppercase text-muted-foreground", typography.meta)}>
                {section.label}
              </p>
            ) : null}
            {section.commands.map((command) => (
              <button
                className={cn(
                  "grid min-h-12 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left transition hover:bg-subtle",
                  focusRing,
                )}
                key={command.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onCommandSelect?.(command)}
                role="menuitem"
                type="button"
              >
                <span className="grid size-7 place-items-center rounded-md bg-subtle text-muted-foreground">
                  {command.icon}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-foreground", typography.control)}>
                    {command.label}
                  </span>
                  {command.description ? (
                    <span className={cn("block truncate text-muted-foreground", typography.meta)}>
                      {command.description}
                    </span>
                  ) : null}
                </span>
                {command.shortcut ? (
                  <span className={cn("text-muted-foreground", typography.meta)}>
                    {command.shortcut}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

const tagKindLabels = {
  agent: "Agent",
  commit: "Commit",
  issue: "Issue",
  page: "Page",
  repository: "Repository",
  user: "User",
} as const satisfies Record<CycleReferenceKind, string>;

const tagKindIcons = {
  agent: <Bot aria-hidden className="size-4" />,
  commit: <GitCommit aria-hidden className="size-4" />,
  issue: <Ticket aria-hidden className="size-4" />,
  page: <FileText aria-hidden className="size-4" />,
  repository: <GitBranch aria-hidden className="size-4" />,
  user: <UserRound aria-hidden className="size-4" />,
} as const satisfies Record<CycleReferenceKind, React.ReactNode>;

const suggestionText = (value: React.ReactNode): string => (typeof value === "string" ? value : "");

export const getMarkdownEditorTagSuggestionInsertLabel = (
  suggestion: MarkdownEditorTagSuggestion,
): string => {
  if (suggestion.insertLabel) {
    const parsedInsertLabel = parseCycleReferenceMarkdownLink(suggestion.insertLabel);
    if (
      parsedInsertLabel &&
      parsedInsertLabel.reference.id === suggestion.id &&
      parsedInsertLabel.reference.kind === suggestion.kind
    ) {
      return parsedInsertLabel.label;
    }

    return suggestion.insertLabel;
  }

  const label = suggestionText(suggestion.label);
  switch (suggestion.kind) {
    case "agent":
    case "user":
      return label.startsWith("@") ? label : `@${label || suggestion.id}`;
    case "commit":
      return label || `commit:${suggestion.id.slice(0, 7)}`;
    case "issue":
      return label.startsWith("#") ? label : `#${suggestion.id}`;
    case "page":
      return label || suggestion.id;
    case "repository":
      return label.startsWith("repo:") ? label : `repo:${label || suggestion.id}`;
  }
};

const getSuggestionSearchValue = (suggestion: MarkdownEditorTagSuggestion): string =>
  [
    suggestion.id,
    suggestionText(suggestion.label),
    suggestionText(suggestion.description),
    suggestion.kind,
    suggestion.searchText ?? "",
  ]
    .join(" ")
    .toLowerCase();

export const filterMarkdownEditorTagSuggestions = (
  suggestions: readonly MarkdownEditorTagSuggestion[],
  query: string,
): readonly MarkdownEditorTagSuggestion[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered =
    normalizedQuery.length === 0
      ? suggestions
      : suggestions.filter((suggestion) =>
          getSuggestionSearchValue(suggestion).includes(normalizedQuery),
        );

  return filtered.slice(0, 8);
};

export const MarkdownEditorTagMenu = React.forwardRef<
  HTMLDivElement,
  {
    readonly className?: string;
    readonly highlightedIndex: number;
    readonly onHighlight: (index: number) => void;
    readonly onSuggestionSelect: (suggestion: MarkdownEditorTagSuggestion) => void;
    readonly query: string;
    readonly suggestions: readonly MarkdownEditorTagSuggestion[];
    readonly style?: React.CSSProperties;
  }
>(function MarkdownEditorTagMenu(
  { className, highlightedIndex, onHighlight, onSuggestionSelect, query, suggestions, style },
  ref,
) {
  return (
    <div
      className={cn(
        "w-[360px] overflow-hidden rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-elevated",
        className,
      )}
      ref={ref}
      role="listbox"
      style={style}
    >
      <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
        <AtSign aria-hidden className="size-4 text-muted-foreground" />
        <span className={cn(typography.control, "text-muted-foreground")}>
          {query ? `Tag "${query}"` : "Tag reference"}
        </span>
      </div>
      <div className="grid gap-1 pt-2">
        {suggestions.length === 0 ? (
          <div className={cn("px-2 py-3 text-muted-foreground", typography.bodyCompact)}>
            No matches
          </div>
        ) : (
          suggestions.map((suggestion, index) => {
            const selected = index === highlightedIndex;

            return (
              <button
                aria-selected={selected}
                className={cn(
                  "grid min-h-12 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left transition",
                  selected ? "bg-subtle text-foreground" : "hover:bg-subtle/75",
                  focusRing,
                )}
                key={`${suggestion.kind}:${suggestion.id}`}
                onClick={() => onSuggestionSelect(suggestion)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHighlight(index)}
                role="option"
                type="button"
              >
                <span className="grid size-7 place-items-center rounded-md bg-subtle text-muted-foreground">
                  {tagKindIcons[suggestion.kind]}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-foreground", typography.control)}>
                    {suggestion.label}
                  </span>
                  {suggestion.description ? (
                    <span className={cn("block truncate text-muted-foreground", typography.meta)}>
                      {suggestion.description}
                    </span>
                  ) : null}
                </span>
                <span className={cn("text-muted-foreground", typography.meta)}>
                  {tagKindLabels[suggestion.kind]}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

const removeTrailingSlash = (): void => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

  const anchor = selection.anchor;
  const node = anchor.getNode();
  if (!$isTextNode(node) || anchor.offset === 0) return;

  const text = node.getTextContent();
  if (text.charAt(anchor.offset - 1) === "/") {
    node.spliceText(anchor.offset - 1, 1, "");
  }
};

const insertText = (editor: LexicalEditor, text: string, removeSlash = false): void => {
  editor.update(() => {
    if (removeSlash) {
      removeTrailingSlash();
    }

    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.insertText(text);
    }
  });
};

type ActiveTagQuery = {
  readonly endOffset: number;
  readonly nodeKey: string;
  readonly query: string;
  readonly startOffset: number;
};

const getActiveTagQuery = (): ActiveTagQuery | undefined => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;

  const anchor = selection.anchor;
  const node = anchor.getNode();
  if (!$isTextNode(node) || $findMatchingParent(node, $isLinkNode)) return undefined;

  const textBeforeCursor = node.getTextContent().slice(0, anchor.offset);
  const match = /(^|[\s(])@([A-Za-z0-9_-]{0,64})$/u.exec(textBeforeCursor);
  if (!match) return undefined;

  const prefix = match[1] ?? "";
  const query = match[2] ?? "";
  const startOffset = textBeforeCursor.length - match[0].length + prefix.length;

  return {
    endOffset: anchor.offset,
    nodeKey: node.getKey(),
    query,
    startOffset,
  };
};

const insertTagSuggestion = (
  editor: LexicalEditor,
  suggestion: MarkdownEditorTagSuggestion,
): void => {
  editor.update(() => {
    const activeQuery = getActiveTagQuery();
    const selection = $getSelection();
    if (!activeQuery || !$isRangeSelection(selection)) return;

    const label = getMarkdownEditorTagSuggestionInsertLabel(suggestion);
    selection.anchor.set(activeQuery.nodeKey, activeQuery.startOffset, "text");
    selection.focus.set(activeQuery.nodeKey, activeQuery.endOffset, "text");
    const fallbackHref = (() => {
      switch (suggestion.kind) {
        case "issue":
        case "page":
          return undefined;
        case "agent":
          return getCycleReferenceHref({ id: suggestion.id, kind: "agent" });
        case "commit":
          return getCycleReferenceHref({ id: suggestion.id, kind: "commit" });
        case "repository":
          return getCycleReferenceHref({ id: suggestion.id, kind: "repository" });
        case "user":
          return getCycleReferenceHref({ id: suggestion.id, kind: "user" });
      }
    })();
    const href = suggestion.href ?? fallbackHref;
    const reference = href === undefined ? null : parseCycleReferenceHref(href);

    if (
      reference === null ||
      reference.id !== suggestion.id ||
      reference.kind !== suggestion.kind
    ) {
      selection.insertNodes([$createTextNode(label), $createTextNode(" ")]);
      return;
    }

    const linkNode = $createLinkNode(href);
    linkNode.append($createTextNode(label));
    selection.insertNodes([linkNode, $createTextNode(" ")]);
  });
};

const applyFormatAction = (editor: LexicalEditor, action: MarkdownEditorFormatAction): void => {
  switch (action) {
    case "bold":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
      return;
    case "code":
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createCodeNode());
        }
      });
      return;
    case "heading":
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode("h2"));
        }
      });
      return;
    case "italic":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
      return;
    case "link":
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          if (selection.isCollapsed()) {
            selection.insertText("link");
          }
          $toggleLink("https://example.com");
        }
      });
      return;
    case "ordered-list":
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      return;
    case "quote":
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });
      return;
    case "strike":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
      return;
    case "task-list":
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      return;
    case "unordered-list":
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      return;
  }
};

const applyCommand = (editor: LexicalEditor, command: MarkdownEditorCommand): void => {
  editor.update(removeTrailingSlash);

  switch (command.id) {
    case "heading":
      applyFormatAction(editor, "heading");
      return;
    case "bulleted-list":
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      return;
    case "todo-list":
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      return;
    case "code":
      applyFormatAction(editor, "code");
      return;
    case "mention":
      insertText(editor, "@");
      return;
    case "image":
      insertText(editor, "![alt text](image-url)");
      return;
    default:
      return;
  }
};

const MarkdownEditorValuePlugin = ({
  editorRef,
  onValueChange,
  value,
}: {
  readonly editorRef: React.MutableRefObject<LexicalEditor | null>;
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}) => {
  const [editor] = useLexicalComposerContext();
  const lastMarkdownRef = React.useRef(normalizeMarkdownEditorValue(value ?? ""));
  const onValueChangeRef = useLatest(onValueChange);

  React.useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef]);

  React.useEffect(() => {
    if (value === undefined) return;

    const nextValue = normalizeMarkdownEditorValue(value);
    if (nextValue === lastMarkdownRef.current) return;

    editor.update(
      () => {
        importMarkdownIntoEditor(nextValue);
      },
      { discrete: true },
    );
    lastMarkdownRef.current = nextValue;
  }, [editor, value]);

  return (
    <OnChangePlugin
      ignoreSelectionChange
      onChange={(editorState) => {
        const nextMarkdown = exportMarkdownFromEditorState(editorState);
        if (nextMarkdown === lastMarkdownRef.current) return;

        lastMarkdownRef.current = nextMarkdown;
        onValueChangeRef.current?.(nextMarkdown);
      }}
    />
  );
};

const MarkdownEditorEditablePlugin = ({ editable }: { readonly editable: boolean }) => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    editor.setEditable(editable);
  }, [editable, editor]);

  return null;
};

const MarkdownEditorKeyboardPlugin = ({ onSubmit }: { readonly onSubmit?: () => void }) => {
  const [editor] = useLexicalComposerContext();
  const onSubmitRef = useLatest(onSubmit);

  React.useEffect(
    () =>
      editor.registerCommand(
        KEY_MODIFIER_COMMAND,
        (event) => {
          const shortcut = getMarkdownEditorShortcut(event);

          if (shortcut === "submit" && onSubmitRef.current) {
            event.preventDefault();
            onSubmitRef.current();
            return true;
          }

          if (shortcut === "link") {
            event.preventDefault();
            applyFormatAction(editor, "link");
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, onSubmitRef],
  );

  return null;
};

const MarkdownEditorTagAutocompletePlugin = ({
  onTagQueryChange,
  onTagSelect,
  tagSuggestions,
}: {
  readonly onTagQueryChange?: (query: string) => void;
  readonly onTagSelect?: (suggestion: MarkdownEditorTagSuggestion) => void;
  readonly tagSuggestions?: readonly MarkdownEditorTagSuggestion[];
}) => {
  const [editor] = useLexicalComposerContext();
  const [activeQuery, setActiveQuery] = React.useState<string | undefined>();
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const hasSuggestionProvider = tagSuggestions !== undefined;
  const suggestions = React.useMemo(
    () => filterMarkdownEditorTagSuggestions(tagSuggestions ?? [], activeQuery ?? ""),
    [activeQuery, tagSuggestions],
  );
  const open = hasSuggestionProvider && activeQuery !== undefined;
  const openRef = useLatest(open);
  const suggestionsRef = useLatest(suggestions);
  const highlightedIndexRef = useLatest(highlightedIndex);
  const onTagSelectRef = useLatest(onTagSelect);
  const getTagMenuAnchorRect = React.useCallback(
    () => getEditorSelectionAnchorRect(editor),
    [editor],
  );
  const { floatingRef: tagMenuRef, floatingStyle: tagMenuStyle } = useViewportFloatingMenu({
    getAnchorRect: getTagMenuAnchorRect,
    open,
    updateKey: suggestions,
  });

  React.useEffect(() => {
    if (activeQuery !== undefined) {
      onTagQueryChange?.(activeQuery);
    }
    setHighlightedIndex(0);
  }, [activeQuery, onTagQueryChange, tagSuggestions]);

  const selectSuggestion = React.useCallback(
    (suggestion: MarkdownEditorTagSuggestion) => {
      insertTagSuggestion(editor, suggestion);
      setActiveQuery(undefined);
      onTagSelectRef.current?.(suggestion);
      editor.focus();
    },
    [editor, onTagSelectRef],
  );

  React.useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        let nextQuery: string | undefined;

        editorState.read(() => {
          nextQuery = getActiveTagQuery()?.query;
        });

        setActiveQuery((current) => (current === nextQuery ? current : nextQuery));
      }),
    [editor],
  );

  React.useEffect(() => {
    const unregisterArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (!openRef.current) return false;
        const count = suggestionsRef.current.length;
        if (count === 0) return false;

        event.preventDefault();
        setHighlightedIndex((index) => (index + 1) % count);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterArrowUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (!openRef.current) return false;
        const count = suggestionsRef.current.length;
        if (count === 0) return false;

        event.preventDefault();
        setHighlightedIndex((index) => (index - 1 + count) % count);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!openRef.current) return false;
        const suggestion = suggestionsRef.current[highlightedIndexRef.current];
        if (!suggestion) return false;

        event?.preventDefault();
        selectSuggestion(suggestion);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (!openRef.current) return false;

        event.preventDefault();
        setActiveQuery(undefined);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterArrowDown();
      unregisterArrowUp();
      unregisterEnter();
      unregisterEscape();
    };
  }, [editor, highlightedIndexRef, openRef, selectSuggestion, suggestionsRef]);

  if (!open) return null;

  return (
    <MarkdownEditorTagMenu
      className="z-50 max-w-[calc(100vw-1rem)]"
      highlightedIndex={highlightedIndex}
      onHighlight={setHighlightedIndex}
      onSuggestionSelect={selectSuggestion}
      query={activeQuery}
      ref={tagMenuRef}
      style={tagMenuStyle}
      suggestions={suggestions}
    />
  );
};

export const MarkdownEditor = React.forwardRef<HTMLDivElement, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      "aria-label": ariaLabel,
      className,
      commandSections,
      commitOnBlur = false,
      contentClassName,
      defaultPreviewOpen = false,
      defaultSlashMenuOpen = false,
      defaultToolbarOpen = false,
      defaultValue = "",
      disabled = false,
      editorClassName,
      minHeightClassName,
      mode = "ticket",
      onAgentReferenceClick,
      onCommandSelect,
      onCommitReferenceClick,
      onCycleReferenceClick,
      onCommit,
      onEditorError,
      onExternalLinkClick,
      onFormatSelect,
      onIssueReferenceClick,
      onPageReferenceClick,
      onRepositoryReferenceClick,
      onSubmit,
      onTagQueryChange,
      onTagSelect,
      onUserReferenceClick,
      onValueChange,
      placeholder = "Write with Markdown...",
      previewOpen,
      readOnly = false,
      slashMenuOpen,
      tagSuggestions,
      toolbarOpen,
      value,
      ...props
    },
    ref,
  ) {
    const initialMarkdownRef = React.useRef(normalizeMarkdownEditorValue(value ?? defaultValue));
    const [currentMarkdown, setCurrentMarkdown] = React.useState(initialMarkdownRef.current);
    const currentMarkdownRef = React.useRef(currentMarkdown);
    const editorRef = React.useRef<LexicalEditor | null>(null);
    const editorShellRef = React.useRef<HTMLDivElement | null>(null);
    const [focused, setFocused] = React.useState(false);
    const [selectionToolbarOpen, setSelectionToolbarOpen] = useControllableOpen({
      defaultOpen: defaultToolbarOpen,
      open: toolbarOpen,
    });
    const [commandMenuOpen, setCommandMenuOpen] = useControllableOpen({
      defaultOpen: defaultSlashMenuOpen,
      open: slashMenuOpen,
    });
    const defaultPreviewOpenRef = React.useRef(defaultPreviewOpen);
    const currentPreviewOpen = previewOpen ?? defaultPreviewOpenRef.current;
    const isEditable = !disabled && !readOnly && !currentPreviewOpen;
    const resolvedMinHeight =
      minHeightClassName ?? (mode === "comment" ? "min-h-20" : "min-h-[140px]");

    React.useEffect(() => {
      currentMarkdownRef.current = currentMarkdown;
    }, [currentMarkdown]);

    React.useEffect(() => {
      if (value === undefined) return;
      const nextValue = normalizeMarkdownEditorValue(value);
      currentMarkdownRef.current = nextValue;
      setCurrentMarkdown(nextValue);
    }, [value]);

    const handleValueChange = React.useCallback(
      (nextValue: string) => {
        currentMarkdownRef.current = nextValue;
        setCurrentMarkdown(nextValue);
        onValueChange?.(nextValue);
      },
      [onValueChange],
    );

    const commitCurrentValue = React.useCallback(() => {
      onCommit?.(currentMarkdownRef.current);
    }, [onCommit]);

    const submitCurrentValue = React.useCallback(() => {
      const trimmed = currentMarkdownRef.current.trim();
      if (trimmed.length === 0) {
        editorRef.current?.focus();
        return;
      }
      onSubmit?.(trimmed);
    }, [onSubmit]);

    const handleFormatSelect = React.useCallback(
      (action: MarkdownEditorFormatAction) => {
        if (!isEditable) return;
        const editor = editorRef.current;
        if (!editor) return;

        applyFormatAction(editor, action);
        editor.focus();
        onFormatSelect?.(action);
      },
      [isEditable, onFormatSelect],
    );

    const handleCommandSelect = React.useCallback(
      (command: MarkdownEditorCommand) => {
        if (!isEditable) return;
        const editor = editorRef.current;
        if (!editor) return;

        applyCommand(editor, command);
        editor.focus();
        onCommandSelect?.(command);
        if (slashMenuOpen === undefined) {
          setCommandMenuOpen(false);
        }
      },
      [isEditable, onCommandSelect, setCommandMenuOpen, slashMenuOpen],
    );

    const initialConfig = React.useMemo(
      () => ({
        namespace: `CycleMarkdownEditor:${mode}`,
        nodes: markdownEditorNodes,
        onError: (error: Error) => {
          onEditorError?.(error);
        },
        editable: isEditable,
        editorState: markdownToLexicalState(initialMarkdownRef.current),
      }),
      [isEditable, mode, onEditorError],
    );

    const showToolbar =
      isEditable &&
      !currentPreviewOpen &&
      (toolbarOpen === undefined ? focused || selectionToolbarOpen : toolbarOpen);
    const isCommandMenuVisible = isEditable && !currentPreviewOpen && commandMenuOpen;
    const getCommandMenuAnchorRect = React.useCallback(
      () =>
        getEditorSelectionAnchorRect(editorRef.current) ??
        editorShellRef.current?.getBoundingClientRect(),
      [],
    );
    const { floatingRef: commandMenuRef, floatingStyle: commandMenuStyle } =
      useViewportFloatingMenu({
        getAnchorRect: getCommandMenuAnchorRect,
        open: isCommandMenuVisible,
        updateKey: `${currentMarkdown.length}:${String(commandMenuOpen)}`,
      });

    return (
      <div
        {...props}
        ref={ref}
        className={cn("relative grid gap-3", className)}
        onBlur={(event) => {
          props.onBlur?.(event);
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;

          setFocused(false);
          if (commitOnBlur) {
            commitCurrentValue();
          }
        }}
      >
        {showToolbar ? (
          <MarkdownEditorToolbar
            className="absolute -top-14 left-0 z-20"
            onFormatSelect={handleFormatSelect}
          />
        ) : null}

        {currentPreviewOpen ? (
          <MarkdownRenderer
            className={cn(
              "rounded-md border border-transparent px-1 py-2",
              resolvedMinHeight,
              contentClassName,
            )}
            markdown={currentMarkdown}
            onAgentReferenceClick={onAgentReferenceClick}
            onCommitReferenceClick={onCommitReferenceClick}
            onCycleReferenceClick={onCycleReferenceClick}
            onExternalLinkClick={onExternalLinkClick}
            onIssueReferenceClick={onIssueReferenceClick}
            onPageReferenceClick={onPageReferenceClick}
            onRepositoryReferenceClick={onRepositoryReferenceClick}
            onUserReferenceClick={onUserReferenceClick}
          />
        ) : (
          <div
            className={cn(
              "relative rounded-md border border-transparent bg-transparent transition hover:bg-subtle/35 focus-within:border-border focus-within:bg-subtle/45",
              disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
              editorClassName,
            )}
            ref={editorShellRef}
          >
            <LexicalComposer initialConfig={initialConfig}>
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    aria-label={ariaLabel ?? placeholder}
                    className={cn(
                      "resize-none px-1 py-2 text-foreground caret-foreground outline-none selection:bg-primary/25 selection:text-foreground",
                      "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
                      "[&_code]:rounded [&_code]:bg-subtle [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
                      "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-8",
                      "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-6",
                      "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-5",
                      "[&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-1 [&_ol]:pl-5",
                      "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-subtle [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-6",
                      "[&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1 [&_ul]:pl-5",
                      "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
                      mode === "comment" ? typography.bodyCompact : typography.body,
                      resolvedMinHeight,
                      contentClassName,
                    )}
                    onFocus={() => setFocused(true)}
                    onKeyDown={(event) => {
                      if (!isEditable) return;
                      if (event.key === "/" && slashMenuOpen === undefined) {
                        setCommandMenuOpen(true);
                      }
                      if (event.key === "Escape" && slashMenuOpen === undefined) {
                        setCommandMenuOpen(false);
                      }
                    }}
                    onSelect={(event) => {
                      if (toolbarOpen !== undefined) return;
                      const selection = window.getSelection();
                      const hasSelection =
                        selection !== null &&
                        !selection.isCollapsed &&
                        event.currentTarget.contains(selection.anchorNode);
                      setSelectionToolbarOpen(hasSelection);
                    }}
                    spellCheck
                  />
                }
                placeholder={
                  <div
                    className={cn(
                      "px-1 py-2",
                      mode === "comment" ? typography.bodyCompact : typography.body,
                      resolvedMinHeight,
                      contentClassName,
                      "pointer-events-none absolute inset-0 overflow-hidden text-muted-foreground/70",
                    )}
                  >
                    {placeholder}
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <ListPlugin />
              <CheckListPlugin />
              <LinkPlugin validateUrl={isSafeMarkdownUrl} />
              <AutoLinkPlugin matchers={[urlMatcher]} />
              <MarkdownShortcutPlugin transformers={markdownEditorTransformers} />
              <MarkdownEditorValuePlugin
                editorRef={editorRef}
                onValueChange={handleValueChange}
                value={value}
              />
              <MarkdownEditorEditablePlugin editable={isEditable} />
              <MarkdownEditorKeyboardPlugin onSubmit={onSubmit ? submitCurrentValue : undefined} />
              <MarkdownEditorTagAutocompletePlugin
                onTagQueryChange={onTagQueryChange}
                onTagSelect={onTagSelect}
                tagSuggestions={tagSuggestions}
              />
            </LexicalComposer>
          </div>
        )}

        {isCommandMenuVisible ? (
          <MarkdownEditorSlashMenu
            className="z-20 max-w-[calc(100vw-1rem)]"
            ref={commandMenuRef}
            onCommandSelect={handleCommandSelect}
            sections={commandSections}
            style={commandMenuStyle}
          />
        ) : null}
      </div>
    );
  },
);
