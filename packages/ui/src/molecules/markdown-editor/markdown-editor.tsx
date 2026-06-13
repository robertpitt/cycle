import {
  AtSign,
  Bold,
  CheckSquare,
  ChevronDown,
  Code2,
  Heading,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
} from "lucide-react";
import * as React from "react";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import type { LinkMatcher } from "@lexical/link";
import { $toggleLink } from "@lexical/link";
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
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_MODIFIER_COMMAND,
  type LexicalEditor,
} from "lexical";
import { MarkdownRenderer } from "../../components/markdown-renderer/index.ts";
import { cn } from "../../lib/cn.ts";
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

export type MarkdownEditorProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange" | "onSubmit"
> & {
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
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly previewOpen?: boolean;
  readonly readOnly?: boolean;
  readonly slashMenuOpen?: boolean;
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

export const MarkdownEditorSlashMenu = ({
  className,
  onCommandSelect,
  sections = defaultCommandSections,
}: {
  readonly className?: string;
  readonly onCommandSelect?: (command: MarkdownEditorCommand) => void;
  readonly sections?: readonly MarkdownEditorCommandSection[];
}) => (
  <div
    className={cn(
      "w-[320px] overflow-hidden rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-elevated",
      className,
    )}
    role="menu"
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

const MarkdownEditorEditablePlugin = ({
  editable,
}: {
  readonly editable: boolean;
}) => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    editor.setEditable(editable);
  }, [editable, editor]);

  return null;
};

const MarkdownEditorKeyboardPlugin = ({
  onSubmit,
}: {
  readonly onSubmit?: () => void;
}) => {
  const [editor] = useLexicalComposerContext();
  const onSubmitRef = useLatest(onSubmit);

  React.useEffect(
    () =>
      editor.registerCommand(
        KEY_MODIFIER_COMMAND,
        (event) => {
          const key = event.key.toLowerCase();

          if (key === "enter" && onSubmitRef.current) {
            event.preventDefault();
            onSubmitRef.current();
            return true;
          }

          if (key === "b") {
            event.preventDefault();
            applyFormatAction(editor, "bold");
            return true;
          }

          if (key === "i") {
            event.preventDefault();
            applyFormatAction(editor, "italic");
            return true;
          }

          if (key === "k") {
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
      onCommandSelect,
      onCommit,
      onEditorError,
      onFormatSelect,
      onSubmit,
      onValueChange,
      placeholder = "Write with Markdown...",
      previewOpen,
      readOnly = false,
      slashMenuOpen,
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
      isEditable && !currentPreviewOpen && (focused || selectionToolbarOpen || toolbarOpen === true);

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
          />
        ) : (
          <div
            className={cn(
              "relative rounded-md border border-transparent bg-transparent transition hover:bg-subtle/35 focus-within:border-border focus-within:bg-subtle/45",
              disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
              editorClassName,
            )}
          >
            <LexicalComposer initialConfig={initialConfig}>
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    aria-label={ariaLabel ?? placeholder}
                    className={cn(
                      "resize-none px-1 py-2 text-foreground outline-none placeholder:text-muted-foreground/70",
                      "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
                      "[&_code]:rounded [&_code]:bg-subtle [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
                      "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-8",
                      "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-6",
                      "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-5",
                      "[&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-1 [&_ol]:pl-5",
                      "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-subtle [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-6",
                      "[&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1 [&_ul]:pl-5",
                      "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
                      focusRing,
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
                      "pointer-events-none absolute left-1 top-2 text-muted-foreground/70",
                      mode === "comment" ? typography.bodyCompact : typography.body,
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
            </LexicalComposer>
          </div>
        )}

        {isEditable && !currentPreviewOpen && commandMenuOpen ? (
          <MarkdownEditorSlashMenu
            className="absolute left-2 top-[calc(100%-2.5rem)] z-20"
            onCommandSelect={handleCommandSelect}
            sections={commandSections}
          />
        ) : null}
      </div>
    );
  },
);
