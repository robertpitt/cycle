import { ArrowRight, GitCommitHorizontal } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../atoms/avatar/index.ts";
import { Badge } from "../../atoms/badge/index.ts";
import { Skeleton } from "../../atoms/skeleton/index.ts";
import { StatusIndicator } from "../../atoms/status-indicator/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentDensity, ComponentTone } from "../../lib/contracts.ts";
import { focusRing, typography } from "../../lib/styles.ts";

export type CommitHistoryAuthor = {
  readonly avatarAlt?: string;
  readonly avatarSrc?: string;
  readonly initials?: string;
  readonly name: React.ReactNode;
};

export type CommitHistoryState = {
  readonly icon?: React.ReactNode;
  readonly id?: string;
  readonly label: React.ReactNode;
  readonly tone?: ComponentTone;
};

export type CommitHistoryTransition = {
  readonly from?: CommitHistoryState;
  readonly label?: React.ReactNode;
  readonly to?: CommitHistoryState;
};

export type CommitHistoryItem = {
  readonly author: CommitHistoryAuthor;
  readonly branch?: React.ReactNode;
  readonly commitAriaLabel?: string;
  readonly commitHref?: string;
  readonly commitRef: React.ReactNode;
  readonly commitTitle?: React.ReactNode;
  readonly disabled?: boolean;
  readonly id: string;
  readonly meta?: readonly React.ReactNode[];
  readonly occurredAt?: Date | number | string;
  readonly onSelect?: (item: CommitHistoryItem) => void;
  readonly selected?: boolean;
  readonly timestamp?: React.ReactNode;
  readonly transition?: CommitHistoryTransition;
};

export type CommitHistoryProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly count?: React.ReactNode;
  readonly density?: ComponentDensity;
  readonly emptyState?: React.ReactNode;
  readonly error?: React.ReactNode;
  readonly headerAction?: React.ReactNode;
  readonly items: readonly CommitHistoryItem[];
  readonly loading?: boolean;
  readonly loadingItemCount?: number;
  readonly onCommitSelect?: (item: CommitHistoryItem) => void;
  readonly selectedCommitId?: string;
  readonly showHeader?: boolean;
  readonly title?: React.ReactNode;
};

const densityClassNames = {
  compact: {
    avatar: "size-7",
    body: "px-3 py-2",
    fallback: "text-[10px]",
    markerTop: "mt-3",
    rowGap: "gap-2.5",
    time: "pt-3",
  },
  comfortable: {
    avatar: "size-8",
    body: "px-3.5 py-3",
    fallback: "text-xs",
    markerTop: "mt-4",
    rowGap: "gap-3",
    time: "pt-3.5",
  },
} satisfies Record<ComponentDensity, Record<string, string>>;

const formatTimestamp = (value?: Date | number | string) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return typeof value === "string" ? value : undefined;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
};

const toDateTimeAttribute = (value?: Date | number | string) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return typeof value === "string" ? value : undefined;
  }

  return date.toISOString();
};

const initialsFromName = (name: React.ReactNode) => {
  if (typeof name !== "string") {
    return "?";
  }

  const initials = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "?";
};

const isPlainText = (value: React.ReactNode): value is number | string =>
  typeof value === "string" || typeof value === "number";

const StateChip = ({
  emphasis = "normal",
  state,
}: {
  readonly emphasis?: "muted" | "normal";
  readonly state: CommitHistoryState;
}) => {
  const tone = state.tone ?? "neutral";

  return (
    <Badge
      appearance={emphasis === "muted" ? "outline" : "soft"}
      className={cn(
        "max-w-full gap-1.5 rounded-md px-2 py-1 font-medium",
        emphasis === "muted" && "text-muted-foreground",
      )}
      tone={tone}
    >
      {state.icon ? (
        <span className="grid size-3.5 shrink-0 place-items-center">{state.icon}</span>
      ) : (
        <StatusIndicator shape="dot" tone={tone} />
      )}
      <span className="min-w-0 truncate">{state.label}</span>
    </Badge>
  );
};

const StateTransition = ({ transition }: { readonly transition: CommitHistoryTransition }) => {
  const hasFrom = transition.from !== undefined;
  const hasTo = transition.to !== undefined;

  if (!hasFrom && !hasTo && !transition.label) {
    return null;
  }

  return (
    <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-md border border-border/80 bg-background/70 px-1.5 py-1">
      {transition.label ? (
        <span className={cn("mr-1 shrink-0 text-muted-foreground", typography.meta)}>
          {transition.label}
        </span>
      ) : null}
      {transition.from ? <StateChip emphasis="muted" state={transition.from} /> : null}
      {hasFrom && hasTo ? (
        <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
      {transition.to ? <StateChip state={transition.to} /> : null}
    </div>
  );
};

const CommitRef = ({
  href,
  interactiveRow,
  label,
}: {
  readonly href?: string;
  readonly interactiveRow: boolean;
  readonly label: React.ReactNode;
}) => {
  const className = cn(
    "inline-flex max-w-full items-center rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] leading-4 text-subtle-foreground",
    !interactiveRow && href && "transition-colors hover:border-primary/40 hover:text-foreground",
  );
  const content = <span className="min-w-0 truncate">{label}</span>;

  if (href && !interactiveRow) {
    return (
      <a className={cn(className, focusRing)} href={href}>
        {content}
      </a>
    );
  }

  return <code className={className}>{content}</code>;
};

const TimelineMarker = ({
  density,
  isFirst,
  isLast,
  selected,
}: {
  readonly density: ComponentDensity;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly selected: boolean;
}) => (
  <div aria-hidden className="relative flex justify-center">
    <span
      className={cn(
        "absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-border",
        isFirst && "hidden",
      )}
    />
    <span
      className={cn(
        "absolute bottom-0 left-1/2 top-4 w-px -translate-x-1/2 bg-border",
        isLast && "hidden",
      )}
    />
    <span
      className={cn(
        "relative z-10 grid size-4 place-items-center rounded-full bg-background ring-1 ring-border",
        densityClassNames[density].markerTop,
        selected && "ring-2 ring-primary/60",
      )}
    >
      <span className={cn("size-2 rounded-full bg-muted-foreground", selected && "bg-primary")} />
    </span>
  </div>
);

const TimelineTimestamp = ({
  className,
  dateTime,
  timestamp,
}: {
  readonly className?: string;
  readonly dateTime?: string;
  readonly timestamp?: React.ReactNode;
}) => {
  if (!timestamp) {
    return null;
  }

  return (
    <time className={cn("text-muted-foreground", typography.meta, className)} dateTime={dateTime}>
      {timestamp}
    </time>
  );
};

const CommitHistoryRow = ({
  density,
  item,
  isFirst,
  isLast,
  onCommitSelect,
  selected,
}: {
  readonly density: ComponentDensity;
  readonly item: CommitHistoryItem;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onCommitSelect?: (item: CommitHistoryItem) => void;
  readonly selected: boolean;
}) => {
  const timestamp = item.timestamp ?? formatTimestamp(item.occurredAt);
  const dateTime = toDateTimeAttribute(item.occurredAt);
  const rowSelectionHandler = item.onSelect ?? onCommitSelect;
  const interactiveRow = Boolean(rowSelectionHandler) && !item.disabled;
  const content = (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/75 bg-surface shadow-sm transition-colors",
        densityClassNames[density].body,
        selected && "border-primary/50 bg-primary/5",
        item.disabled && "opacity-55",
        interactiveRow && "hover:border-primary/40 hover:bg-subtle/60",
      )}
    >
      <TimelineTimestamp
        className="mb-2 block sm:hidden"
        dateTime={dateTime}
        timestamp={timestamp}
      />
      <div className={cn("flex min-w-0 items-start", densityClassNames[density].rowGap)}>
        <Avatar className={densityClassNames[density].avatar}>
          {item.author.avatarSrc ? (
            <AvatarImage alt={item.author.avatarAlt ?? ""} src={item.author.avatarSrc} />
          ) : null}
          <AvatarFallback className={densityClassNames[density].fallback}>
            {item.author.initials ?? initialsFromName(item.author.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("min-w-0 truncate text-foreground", typography.control)}>
              {item.author.name}
            </span>
            <span className={cn("shrink-0 text-muted-foreground", typography.meta)}>committed</span>
            <CommitRef
              href={item.commitHref}
              interactiveRow={interactiveRow}
              label={item.commitRef}
            />
            {item.branch ? (
              <span className={cn("min-w-0 truncate text-muted-foreground", typography.meta)}>
                on {item.branch}
              </span>
            ) : null}
          </div>
          {item.commitTitle ? (
            <p
              className={cn(
                "mt-1 min-w-0 truncate text-surface-foreground",
                typography.bodyCompact,
              )}
            >
              {item.commitTitle}
            </p>
          ) : null}
          {item.transition || (item.meta && item.meta.length > 0) ? (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {item.transition ? <StateTransition transition={item.transition} /> : null}
              {item.meta?.map((meta, index) => (
                <span className="min-w-0 truncate" key={index}>
                  {meta}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <li className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-2 py-1 sm:grid-cols-[minmax(7rem,9rem)_1.25rem_minmax(0,1fr)] sm:gap-3">
      <TimelineTimestamp
        className={cn("hidden text-right sm:block", densityClassNames[density].time)}
        dateTime={dateTime}
        timestamp={timestamp}
      />
      <TimelineMarker density={density} isFirst={isFirst} isLast={isLast} selected={selected} />
      {interactiveRow ? (
        <button
          aria-label={
            item.commitAriaLabel ??
            (isPlainText(item.commitRef) ? `View commit ${item.commitRef}` : undefined)
          }
          className={cn("min-w-0 rounded-lg text-left", focusRing)}
          disabled={item.disabled}
          onClick={() => rowSelectionHandler?.(item)}
          type="button"
        >
          {content}
        </button>
      ) : (
        <article aria-current={selected ? "true" : undefined} className="min-w-0">
          {content}
        </article>
      )}
    </li>
  );
};

const loadingRows = (count: number, density: ComponentDensity) =>
  Array.from({ length: count }, (_, index) => (
    <li
      className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-2 py-1 sm:grid-cols-[minmax(7rem,9rem)_1.25rem_minmax(0,1fr)] sm:gap-3"
      key={index}
    >
      <div className={cn("hidden sm:block", densityClassNames[density].time)}>
        <Skeleton className="ml-auto h-4 w-20" />
      </div>
      <TimelineMarker
        density={density}
        isFirst={index === 0}
        isLast={index === count - 1}
        selected={false}
      />
      <div
        className={cn(
          "rounded-lg border border-border/75 bg-surface",
          densityClassNames[density].body,
        )}
      >
        <div className={cn("flex items-start", densityClassNames[density].rowGap)}>
          <Skeleton className={cn("rounded-full", densityClassNames[density].avatar)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="mt-2 h-4 w-2/3" />
            <Skeleton className="mt-1.5 h-6 w-full max-w-md" />
          </div>
        </div>
      </div>
    </li>
  ));

export const CommitHistory = React.forwardRef<HTMLDivElement, CommitHistoryProps>(
  function CommitHistory(
    {
      className,
      count,
      density = "comfortable",
      emptyState,
      error,
      headerAction,
      items,
      loading = false,
      loadingItemCount = 4,
      onCommitSelect,
      selectedCommitId,
      showHeader = true,
      title = "Commit history",
      ...props
    },
    ref,
  ) {
    const hasItems = items.length > 0;

    return (
      <section
        {...props}
        ref={ref}
        className={cn("min-w-0 bg-surface", className)}
        data-density={density}
        data-state={loading ? "loading" : error ? "error" : hasItems ? "ready" : "empty"}
      >
        {showHeader ? (
          <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <GitCommitHorizontal aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <h2 className={cn("min-w-0 truncate text-foreground", typography.panelTitle)}>
                {title}
              </h2>
              {count !== undefined && count !== null ? (
                <span className={cn("shrink-0 text-muted-foreground", typography.meta)}>
                  {count}
                </span>
              ) : null}
            </div>
            {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
          </header>
        ) : null}
        <div className={cn("px-4", showHeader ? "py-3" : "py-1")}>
          {loading ? (
            <ol aria-label="Loading commit history" className="grid gap-0" role="status">
              {loadingRows(loadingItemCount, density)}
            </ol>
          ) : error ? (
            <div
              className="grid min-h-32 place-items-center px-4 py-10 text-center text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : hasItems ? (
            <ol aria-label="Repository commit history" className="grid gap-0">
              {items.map((item, index) => (
                <CommitHistoryRow
                  density={density}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  item={item}
                  key={item.id}
                  onCommitSelect={onCommitSelect}
                  selected={item.selected ?? item.id === selectedCommitId}
                />
              ))}
            </ol>
          ) : (
            <div
              className="grid min-h-32 place-items-center px-4 py-10 text-center text-sm text-muted-foreground"
              role="status"
            >
              {emptyState ?? "No commits to display."}
            </div>
          )}
        </div>
      </section>
    );
  },
);
