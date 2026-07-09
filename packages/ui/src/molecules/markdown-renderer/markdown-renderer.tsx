import * as React from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type UrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn.ts";
import {
  isSameCycleReference,
  linkCycleReferenceShorthand,
  parseCycleReferenceMarkdownLink,
  parseCycleReferenceHref,
  type CycleReference,
  unwrapNestedCycleReferenceMarkdownLinks,
} from "../../lib/markdown-references.ts";
import { typography } from "../../lib/styles.ts";

export type MarkdownRendererProps = {
  readonly className?: string;
  readonly markdown: string;
  readonly onAgentReferenceClick?: (agentId: string) => void;
  readonly onCommitReferenceClick?: (commitId: string) => void;
  readonly onCycleReferenceClick?: (reference: CycleReference) => void;
  readonly onExternalLinkClick?: (url: string) => void;
  readonly onIssueReferenceClick?: (issueId: string) => void;
  readonly onRepositoryReferenceClick?: (repositoryId: string) => void;
  readonly onUserReferenceClick?: (userId: string) => void;
};

export type MarkdownReferenceHandlers = Pick<
  MarkdownRendererProps,
  | "onAgentReferenceClick"
  | "onCommitReferenceClick"
  | "onCycleReferenceClick"
  | "onExternalLinkClick"
  | "onIssueReferenceClick"
  | "onRepositoryReferenceClick"
  | "onUserReferenceClick"
>;

const safeProtocols = new Set(["http:", "https:", "mailto:"]);

const normalizeMarkdown = (markdown: string): string =>
  linkCycleReferenceShorthand(unwrapNestedCycleReferenceMarkdownLinks(markdown));

const isSafeUrl = (href: string): boolean => {
  if (href.trim().length === 0) return false;
  if (!URL.canParse(href, "https://cycle.local")) return false;

  const url = new URL(href, "https://cycle.local");
  return safeProtocols.has(url.protocol) || href.startsWith("#") || href.startsWith("/");
};

const markdownUrlTransform: UrlTransform = (url, key) =>
  key === "href" && parseCycleReferenceHref(url) ? url : defaultUrlTransform(url);

const handleCycleReferenceClick = (
  reference: CycleReference,
  handlers: MarkdownReferenceHandlers,
): void => {
  handlers.onCycleReferenceClick?.(reference);

  switch (reference.kind) {
    case "agent":
      handlers.onAgentReferenceClick?.(reference.id);
      return;
    case "commit":
      handlers.onCommitReferenceClick?.(reference.id);
      return;
    case "issue":
      handlers.onIssueReferenceClick?.(reference.id);
      return;
    case "repository":
      handlers.onRepositoryReferenceClick?.(reference.id);
      return;
    case "user":
      handlers.onUserReferenceClick?.(reference.id);
      return;
  }
};

const cycleReferenceChildren = (
  children: React.ReactNode,
  reference: CycleReference,
): React.ReactNode => {
  const childArray = React.Children.toArray(children);
  const text = childArray.length === 1 && typeof childArray[0] === "string" ? childArray[0] : null;
  if (!text) return children;

  const parsedLink = parseCycleReferenceMarkdownLink(text);
  return parsedLink && isSameCycleReference(parsedLink.reference, reference)
    ? parsedLink.label
    : children;
};

const components = (
  handlers: MarkdownReferenceHandlers & Pick<MarkdownRendererProps, "onExternalLinkClick">,
): Components => ({
  a: ({ children, href, ...props }) => {
    const cycleReference = href ? parseCycleReferenceHref(href) : null;

    if (cycleReference) {
      return (
        <button
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => handleCycleReferenceClick(cycleReference, handlers)}
          type="button"
        >
          {cycleReferenceChildren(children, cycleReference)}
        </button>
      );
    }

    if (href === undefined || !isSafeUrl(href)) {
      return <span>{children}</span>;
    }

    const external = /^https?:/iu.test(href) || href.startsWith("//");

    return (
      <a
        {...props}
        href={href}
        onClick={(event) => {
          if (external && handlers.onExternalLinkClick !== undefined) {
            event.preventDefault();
            handlers.onExternalLinkClick(href);
          }
        }}
        rel={external ? "noreferrer noopener" : undefined}
        target={external ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      className={cn(
        "rounded bg-subtle px-1.5 py-0.5 font-mono text-[0.92em] text-foreground",
        className,
      )}
    >
      {children}
    </code>
  ),
  h1: ({ children }) => <h1 className={typography.pageTitle}>{children}</h1>,
  h2: ({ children }) => <h2 className={typography.sectionTitle}>{children}</h2>,
  h3: ({ children }) => <h3 className={typography.panelTitle}>{children}</h3>,
  hr: () => <hr className="border-border" />,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  ol: ({ children }) => <ol className="grid list-decimal gap-1 pl-5">{children}</ol>,
  p: ({ children }) => <p>{children}</p>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md border border-border bg-subtle p-3 text-sm leading-6">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  td: ({ children }) => <td className="border-border px-3 py-2 align-top">{children}</td>,
  th: ({ children }) => (
    <th className="bg-subtle px-3 py-2 font-semibold text-foreground">{children}</th>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  ul: ({ children, className }) => (
    <ul className={cn("grid list-disc gap-1 pl-5", className)}>{children}</ul>
  ),
});

export const MarkdownRenderer = ({
  className,
  markdown,
  onAgentReferenceClick,
  onCommitReferenceClick,
  onCycleReferenceClick,
  onExternalLinkClick,
  onIssueReferenceClick,
  onRepositoryReferenceClick,
  onUserReferenceClick,
}: MarkdownRendererProps) => (
  <div
    className={cn(
      "grid gap-3 text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_input[type=checkbox]]:mr-2",
      typography.bodyCompact,
      className,
    )}
  >
    <ReactMarkdown
      components={components({
        onAgentReferenceClick,
        onCommitReferenceClick,
        onCycleReferenceClick,
        onExternalLinkClick,
        onIssueReferenceClick,
        onRepositoryReferenceClick,
        onUserReferenceClick,
      })}
      remarkPlugins={[remarkGfm]}
      urlTransform={markdownUrlTransform}
    >
      {normalizeMarkdown(markdown)}
    </ReactMarkdown>
  </div>
);
