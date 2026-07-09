import { ExternalLink, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { IconButton } from "../../atoms/icon-button/index.ts";
import { cn } from "../../lib/cn.ts";
import { typography } from "../../lib/styles.ts";

export type IssueResourceLinkProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly description?: React.ReactNode;
  readonly favicon?: React.ReactNode;
  readonly href?: string;
  readonly meta?: React.ReactNode;
  readonly onMore?: React.MouseEventHandler<HTMLButtonElement>;
  readonly title: React.ReactNode;
};

export const IssueResourceLink = React.forwardRef<HTMLDivElement, IssueResourceLinkProps>(
  function IssueResourceLink(
    { className, description, favicon, href, meta, onMore, title, ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          "grid min-h-12 min-w-0 items-center gap-3 rounded-lg border border-border bg-elevated px-3 text-elevated-foreground shadow-sm",
          onMore
            ? "grid-cols-[1.5rem_minmax(0,auto)_minmax(8rem,1fr)_auto_auto]"
            : "grid-cols-[1.5rem_minmax(0,auto)_minmax(8rem,1fr)_auto]",
          className,
        )}
      >
        <span className="grid size-6 place-items-center text-muted-foreground">
          {favicon ?? <ExternalLink aria-hidden className="size-4" />}
        </span>
        {href ? (
          <a
            className={cn("truncate text-foreground hover:underline", typography.panelTitle)}
            href={href}
          >
            {title}
          </a>
        ) : (
          <span className={cn("truncate text-foreground", typography.panelTitle)}>{title}</span>
        )}
        <span className={cn("min-w-0 truncate text-muted-foreground", typography.bodyCompact)}>
          {description}
        </span>
        {meta ? (
          <span className={cn("shrink-0 text-muted-foreground", typography.control)}>{meta}</span>
        ) : null}
        {onMore ? (
          <IconButton
            icon={<MoreHorizontal aria-hidden className="size-4" />}
            label="Resource actions"
            onClick={onMore}
            size="sm"
            title="Resource actions"
          />
        ) : null}
      </div>
    );
  },
);
