import { Layers2, ListFilter, Pin, Plus, Search, Table2, UserRound } from "lucide-react";
import * as React from "react";
import { Button } from "../../atoms/button/index.ts";
import { DateTime, type DateTimeValue } from "../../atoms/date-time/index.ts";
import { Input } from "../../atoms/input/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { cn } from "../../lib/cn.ts";

export type ViewsPanelRow = {
  readonly description?: React.ReactNode;
  readonly filterSummary: React.ReactNode;
  readonly id: string;
  readonly layoutLabel: React.ReactNode;
  readonly name: React.ReactNode;
  readonly ownerName: React.ReactNode;
  readonly pinned?: boolean;
  readonly scopeLabel: React.ReactNode;
  readonly searchText?: string;
  readonly updatedAt?: DateTimeValue;
};

export type ViewsPanelProps = {
  readonly className?: string;
  readonly createDisabled?: boolean;
  readonly createLabel?: string;
  readonly creating?: boolean;
  readonly description?: React.ReactNode;
  readonly emptyMessage?: React.ReactNode;
  readonly error?: React.ReactNode;
  readonly loading?: boolean;
  readonly loadingMessage?: React.ReactNode;
  readonly onCreateView?: () => void;
  readonly onViewSelect?: (row: ViewsPanelRow) => void;
  readonly repositoryRequiredMessage?: React.ReactNode;
  readonly repositorySelected?: boolean;
  readonly rows: readonly ViewsPanelRow[];
  readonly searchPlaceholder?: string;
  readonly title?: React.ReactNode;
};

const defaultDescription = "Shared repository views backed by GitDB.";
const defaultEmptyMessage = "No views match this search.";
const defaultLoadingMessage = "Loading views.";
const defaultRepositoryRequiredMessage = "Choose a repository before managing views.";

const searchableText = (row: ViewsPanelRow): string => {
  if (row.searchText) return row.searchText;

  return [
    row.name,
    row.description,
    row.layoutLabel,
    row.filterSummary,
    row.scopeLabel,
    row.ownerName,
  ]
    .filter(
      (value): value is string | number => typeof value === "string" || typeof value === "number",
    )
    .join(" ");
};

const EmptyRow = ({
  children,
  tone = "muted",
}: {
  readonly children: React.ReactNode;
  readonly tone?: "danger" | "muted";
}) => (
  <tr>
    <td className="px-4 py-10 text-center" colSpan={6}>
      <Text tone={tone} variant="bodyCompact">
        {children}
      </Text>
    </td>
  </tr>
);

export const ViewsPanel = ({
  className,
  createDisabled = false,
  createLabel = "New view",
  creating = false,
  description = defaultDescription,
  emptyMessage = defaultEmptyMessage,
  error,
  loading = false,
  loadingMessage = defaultLoadingMessage,
  onCreateView,
  onViewSelect,
  repositoryRequiredMessage = defaultRepositoryRequiredMessage,
  repositorySelected = true,
  rows,
  searchPlaceholder = "Search views",
  title = "Views",
}: ViewsPanelProps) => {
  const [searchText, setSearchText] = React.useState("");
  const visibleRows = React.useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) => searchableText(row).toLowerCase().includes(needle));
  }, [rows, searchText]);

  const renderBody = () => {
    if (!repositorySelected) {
      return <EmptyRow>{repositoryRequiredMessage}</EmptyRow>;
    }

    if (loading) {
      return <EmptyRow>{loadingMessage}</EmptyRow>;
    }

    if (error) {
      return <EmptyRow tone="danger">{error}</EmptyRow>;
    }

    if (visibleRows.length === 0) {
      return <EmptyRow>{emptyMessage}</EmptyRow>;
    }

    return visibleRows.map((row) => (
      <tr
        className="group border-b border-border/70 transition-colors last:border-b-0 hover:bg-subtle/70"
        key={row.id}
      >
        <td className="w-[34%] px-4 py-3">
          <button
            className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3 text-left"
            onClick={() => onViewSelect?.(row)}
            type="button"
          >
            <span className="grid size-7 place-items-center rounded-md border border-border bg-background text-muted-foreground group-hover:text-foreground">
              <Layers2 aria-hidden className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <Text as="span" className="truncate font-semibold" variant="bodyCompact">
                  {row.name}
                </Text>
                {row.pinned ? <Pin aria-hidden className="size-3.5 text-muted-foreground" /> : null}
              </span>
              {row.description ? (
                <Text as="span" className="block truncate" tone="muted" variant="meta">
                  {row.description}
                </Text>
              ) : null}
            </span>
          </button>
        </td>
        <td className="px-4 py-3">
          <Text tone="muted" variant="bodyCompact">
            {row.layoutLabel}
          </Text>
        </td>
        <td className="max-w-[24rem] px-4 py-3">
          <Text as="span" className="line-clamp-2" tone="muted" variant="bodyCompact">
            {row.filterSummary}
          </Text>
        </td>
        <td className="px-4 py-3">
          <Text tone="muted" variant="bodyCompact">
            {row.scopeLabel}
          </Text>
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex max-w-44 items-center gap-2 truncate text-sm text-foreground">
            <UserRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.ownerName}</span>
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <DateTime
            className="text-sm text-muted-foreground"
            dateStyle="medium"
            fallback="Unknown"
            format="date"
            value={row.updatedAt}
          />
        </td>
      </tr>
    ));
  };

  return (
    <section className={cn("grid min-w-0 gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md border border-border bg-subtle text-muted-foreground">
            <Table2 aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <Text as="h2" className="truncate" variant="sectionTitle">
              {title}
            </Text>
            {description ? (
              <Text className="truncate" tone="muted" variant="bodyCompact">
                {description}
              </Text>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="relative min-w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={searchPlaceholder}
              className="pl-9"
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder={searchPlaceholder}
              value={searchText}
            />
          </label>
          {onCreateView ? (
            <Button
              disabled={createDisabled}
              leftIcon={<Plus aria-hidden className="size-4" />}
              loading={creating}
              loadingLabel="Creating view"
              onClick={onCreateView}
              size="sm"
              variant="outline"
            >
              {createLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead className="border-b border-border bg-subtle/70 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Layout</th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <ListFilter aria-hidden className="size-3.5" />
                  Filters
                </span>
              </th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3 text-right">Updated</th>
            </tr>
          </thead>
          <tbody
            className={cn("divide-y divide-border/0", visibleRows.length === 0 && "divide-y-0")}
          >
            {renderBody()}
          </tbody>
        </table>
      </div>
    </section>
  );
};
