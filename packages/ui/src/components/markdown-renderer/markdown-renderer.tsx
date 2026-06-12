import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn.ts";
import { typography } from "../../lib/styles.ts";

export type MarkdownRendererProps = {
  readonly className?: string;
  readonly markdown: string;
  readonly onExternalLinkClick?: (url: string) => void;
  readonly onIssueReferenceClick?: (issueId: string) => void;
};

const safeProtocols = new Set(["http:", "https:", "mailto:"]);
const issueHrefPrefix = "cycle-issue:";
const issueReferencePattern = /(^|[\s(])#([A-Za-z0-9]{2,5}-[A-Za-z0-9]{5,})/gu;

const normalizeMarkdown = (markdown: string): string =>
  markdown.replace(issueReferencePattern, (_match, prefix: string, issueId: string) => {
    const normalizedIssueId = issueId.toUpperCase();

    return `${prefix}[#${normalizedIssueId}](${issueHrefPrefix}${normalizedIssueId})`;
  });

const isSafeUrl = (href: string): boolean => {
  try {
    const url = new URL(href, "https://cycle.local");
    return safeProtocols.has(url.protocol) || href.startsWith("#") || href.startsWith("/");
  } catch {
    return false;
  }
};

const components = (
  onIssueReferenceClick: MarkdownRendererProps["onIssueReferenceClick"],
  onExternalLinkClick: MarkdownRendererProps["onExternalLinkClick"],
): Components => ({
  a: ({ children, href, ...props }) => {
    if (href?.startsWith(issueHrefPrefix) === true) {
      const issueId = href.slice(issueHrefPrefix.length);

      return (
        <button
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => onIssueReferenceClick?.(issueId)}
          type="button"
        >
          {children}
        </button>
      );
    }

    if (href === undefined || !isSafeUrl(href)) {
      return <span>{children}</span>;
    }

    const external = /^https?:/iu.test(href);

    return (
      <a
        {...props}
        href={href}
        onClick={(event) => {
          if (external && onExternalLinkClick !== undefined) {
            event.preventDefault();
            onExternalLinkClick(href);
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
  onExternalLinkClick,
  onIssueReferenceClick,
}: MarkdownRendererProps) => (
  <div
    className={cn(
      "grid gap-3 text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_input[type=checkbox]]:mr-2",
      typography.bodyCompact,
      className,
    )}
  >
    <ReactMarkdown
      components={components(onIssueReferenceClick, onExternalLinkClick)}
      remarkPlugins={[remarkGfm]}
    >
      {normalizeMarkdown(markdown)}
    </ReactMarkdown>
  </div>
);
