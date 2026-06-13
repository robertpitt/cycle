import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CHECK_LIST,
  CODE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
  type Transformer,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { createEditor, type EditorState, type LexicalEditor } from "lexical";

export const markdownEditorNodes: InitialConfigType["nodes"] = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
];

export const markdownEditorTransformers: Array<Transformer> = [
  HEADING,
  QUOTE,
  CODE,
  UNORDERED_LIST,
  CHECK_LIST,
  ORDERED_LIST,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  INLINE_CODE,
  LINK,
];

export const safeMarkdownProtocols = new Set(["http:", "https:", "mailto:"]);

export const isSafeMarkdownUrl = (href: string): boolean => {
  try {
    const url = new URL(href, "https://cycle.local");
    return safeMarkdownProtocols.has(url.protocol) || href.startsWith("#") || href.startsWith("/");
  } catch {
    return false;
  }
};

export const normalizeMarkdownEditorValue = (markdown: string): string =>
  markdown.replace(/\r\n?/gu, "\n");

export const importMarkdownIntoEditor = (markdown: string): void => {
  $convertFromMarkdownString(
    normalizeMarkdownEditorValue(markdown),
    markdownEditorTransformers,
    undefined,
    false,
    false,
  );
};

export const exportMarkdownFromEditorState = (editorState: EditorState): string => {
  let markdown = "";

  editorState.read(() => {
    markdown = $convertToMarkdownString(markdownEditorTransformers, undefined, false);
  });

  return normalizeMarkdownEditorValue(markdown);
};

export const markdownToLexicalState =
  (markdown: string) =>
  (_editor: LexicalEditor): void => {
    importMarkdownIntoEditor(markdown);
  };

export const createMarkdownRoundTripEditor = (): LexicalEditor =>
  createEditor({
    namespace: "CycleMarkdownRoundTrip",
    nodes: markdownEditorNodes,
    onError: (error) => {
      throw error;
    },
  });

export const roundTripMarkdown = (markdown: string): string => {
  const editor = createMarkdownRoundTripEditor();

  editor.update(
    () => {
      importMarkdownIntoEditor(markdown);
    },
    { discrete: true },
  );

  return exportMarkdownFromEditorState(editor.getEditorState());
};
