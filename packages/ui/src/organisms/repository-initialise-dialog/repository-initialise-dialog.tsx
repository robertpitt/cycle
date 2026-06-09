import {
  ArrowRight,
  CircleDot,
  FolderOpen,
  GitPullRequest,
  LoaderCircle,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import * as React from "react";
import { Badge } from "../../atoms/badge/index.ts";
import { Button } from "../../atoms/button/index.ts";
import { cn } from "../../lib/cn.ts";

export type RepositoryInitialiseDialogProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly error?: React.ReactNode;
  readonly onCancel: () => void;
  readonly onChooseFolder?: () => void;
  readonly onInitialise: () => void;
  readonly path: string;
  readonly saving?: boolean;
};

const compactPath = (path: string): string => {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const folder = parts.at(-1) ?? normalized;
  const parent = parts.at(-2);

  if (!parent) return normalized;
  return `.../${parent}/${folder}`;
};

export const RepositoryInitialiseDialog = React.forwardRef<
  HTMLDivElement,
  RepositoryInitialiseDialogProps
>(function RepositoryInitialiseDialog(
  { className, error, onCancel, onChooseFolder, onInitialise, path, saving = false, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 grid place-items-center bg-overlay/65 p-4 sm:p-6",
        className,
      )}
    >
      <section
        aria-describedby="repository-initialise-description"
        aria-labelledby="repository-initialise-title"
        aria-modal="true"
        className="w-full max-w-[560px] rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-elevated"
        role="dialog"
      >
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
            <GitPullRequest aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Badge className="mb-3" tone="warning">
              Repository required
            </Badge>
            <h2 className="text-xl font-semibold tracking-normal" id="repository-initialise-title">
              No Git repository found
            </h2>
            <p
              className="mt-2 text-sm leading-6 text-muted-foreground"
              id="repository-initialise-description"
            >
              Cycle needs a Git repository before this folder can be imported. Initialise it now to
              continue.
            </p>
          </div>
        </div>

        <div className="my-6 grid gap-3 rounded-lg border border-border bg-subtle/45 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
              <Terminal aria-hidden className="size-4" />
              Command
            </span>
            <code className="rounded bg-background px-2 py-1 text-xs text-foreground">
              git init
            </code>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
              <ShieldCheck aria-hidden className="size-4" />
              Action
            </span>
            <span className="truncate font-medium">Initialise local repository</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
              <CircleDot aria-hidden className="size-4" />
              Location
            </span>
            <span className="min-w-0 truncate font-medium" title={path}>
              {compactPath(path)}
            </span>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm leading-5 text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button disabled={saving} onClick={onCancel} variant="ghost">
            Cancel import
          </Button>
          <div className="flex flex-wrap gap-2">
            {onChooseFolder ? (
              <Button
                disabled={saving}
                leftIcon={<FolderOpen aria-hidden className="size-4" />}
                onClick={onChooseFolder}
                variant="outline"
              >
                Choose folder
              </Button>
            ) : null}
            <Button
              disabled={saving}
              leftIcon={
                saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null
              }
              onClick={onInitialise}
              rightIcon={!saving ? <ArrowRight aria-hidden className="size-4" /> : null}
            >
              {saving ? "Initialising" : "Initialise repository"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
});
