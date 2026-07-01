import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { $createLinkNode, $isLinkNode, AutoLinkNode, LinkNode } from "@lexical/link";
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
  type TextMatchTransformer,
  type Transformer,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { $createTextNode, createEditor, type EditorState, type LexicalEditor } from "lexical";
import { $findMatchingParent } from "@lexical/utils";
import {
  cycleReferenceProtocols,
  getCycleReferenceHref,
  type CycleReferenceKind,
  unwrapNestedCycleReferenceMarkdownLinks,
} from "../../lib/markdown-references.ts";

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

const createCycleReferenceTransformer = ({
  importRegExp,
  kind,
  label,
  normalizeId = (id: string) => id,
  regExp,
}: {
  readonly importRegExp: RegExp;
  readonly kind: CycleReferenceKind;
  readonly label: (id: string) => string;
  readonly normalizeId?: (id: string) => string;
  readonly regExp: RegExp;
}): TextMatchTransformer => ({
  dependencies: [LinkNode],
  importRegExp,
  regExp,
  replace: (textNode, match) => {
    if ($findMatchingParent(textNode, $isLinkNode)) return;

    const rawId = match[1];
    if (!rawId) return;

    const id = normalizeId(rawId);
    const linkNode = $createLinkNode(getCycleReferenceHref({ id, kind }));
    const linkTextNode = $createTextNode(label(id));
    linkTextNode.setFormat(textNode.getFormat());
    linkNode.append(linkTextNode);
    textNode.replace(linkNode);

    return linkTextNode;
  },
  type: "text-match",
});

const ISSUE_REFERENCE = createCycleReferenceTransformer({
  importRegExp: /(?<![\w/-])#([A-Za-z0-9]{2,5}-[A-Za-z0-9]{5,})(?![\w-])/u,
  kind: "issue",
  label: (id) => `#${id}`,
  normalizeId: (id) => id.toUpperCase(),
  regExp: /(?<![\w/-])#([A-Za-z0-9]{2,5}-[A-Za-z0-9]{5,})(?![\w-])$/u,
});

const USER_REFERENCE = createCycleReferenceTransformer({
  importRegExp: /(?<![\w.-])@([A-Za-z][A-Za-z0-9_-]{1,63})(?![\w-])/u,
  kind: "user",
  label: (id) => `@${id}`,
  regExp: /(?<![\w.-])@([A-Za-z][A-Za-z0-9_-]{1,63})(?![\w-])$/u,
});

const REPOSITORY_REFERENCE = createCycleReferenceTransformer({
  importRegExp:
    /(?<![\w/-])repo:([A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?)(?![\w./-])/u,
  kind: "repository",
  label: (id) => `repo:${id}`,
  regExp:
    /(?<![\w/-])repo:([A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?)(?![\w./-])$/u,
});

const COMMIT_REFERENCE = createCycleReferenceTransformer({
  importRegExp: /(?<![\w:-])commit:([a-f0-9]{7,64})(?![a-f0-9])/iu,
  kind: "commit",
  label: (id) => `commit:${id}`,
  normalizeId: (id) => id.toLowerCase(),
  regExp: /(?<![\w:-])commit:([a-f0-9]{7,64})(?![a-f0-9])$/iu,
});

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
  ISSUE_REFERENCE,
  USER_REFERENCE,
  REPOSITORY_REFERENCE,
  COMMIT_REFERENCE,
];

export const safeMarkdownProtocols = new Set([
  "http:",
  "https:",
  "mailto:",
  ...Array.from(cycleReferenceProtocols, (protocol) => `${protocol}:`),
]);

export const isSafeMarkdownUrl = (href: string): boolean => {
  if (href.trim().length === 0) return false;
  if (!URL.canParse(href, "https://cycle.local")) return false;

  const url = new URL(href, "https://cycle.local");
  return safeMarkdownProtocols.has(url.protocol) || href.startsWith("#") || href.startsWith("/");
};

export const normalizeMarkdownEditorValue = (markdown: string): string =>
  unwrapNestedCycleReferenceMarkdownLinks(markdown.replace(/\r\n?/gu, "\n"));

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
