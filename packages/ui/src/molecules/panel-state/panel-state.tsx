import { AlertTriangle } from "lucide-react";
import * as React from "react";
import { Spinner } from "../../atoms/spinner/index.ts";
import { Text } from "../../atoms/text/index.ts";
import { cn } from "../../lib/cn.ts";
import type { ComponentTone } from "../../lib/contracts.ts";

export type PanelStateKind = "empty" | "error" | "loading";

export type PanelStateProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly description?: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly kind?: PanelStateKind;
  readonly message: React.ReactNode;
  readonly tone?: ComponentTone;
};

const toneForKind = (kind: PanelStateKind): ComponentTone => {
  if (kind === "error") return "danger";
  return "neutral";
};

const defaultIcon = (kind: PanelStateKind) => {
  if (kind === "loading") {
    return <Spinner decorative className="size-4" />;
  }

  if (kind === "error") {
    return <AlertTriangle aria-hidden className="size-4" />;
  }

  return <span aria-hidden className="size-2 rounded-full bg-current" />;
};

const iconToneClassName = {
  accent: "text-accent",
  danger: "text-destructive",
  info: "text-primary",
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
} satisfies Record<ComponentTone, string>;

export const PanelState = React.forwardRef<HTMLDivElement, PanelStateProps>(function PanelState(
  { className, description, icon, kind = "empty", message, role, tone, ...props },
  ref,
) {
  const resolvedTone = tone ?? toneForKind(kind);

  return (
    <div
      {...props}
      ref={ref}
      aria-busy={kind === "loading" || undefined}
      className={cn("grid min-h-full place-items-center p-8", className)}
      role={role ?? (kind === "error" ? "alert" : kind === "loading" ? "status" : undefined)}
    >
      <div className="flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left shadow-card">
        <span
          className={cn("grid size-4 shrink-0 place-items-center", iconToneClassName[resolvedTone])}
        >
          {icon ?? defaultIcon(kind)}
        </span>
        <span className="grid gap-1">
          <Text tone="muted" variant="bodyCompact">
            {message}
          </Text>
          {description ? (
            <Text tone="muted" variant="meta">
              {description}
            </Text>
          ) : null}
        </span>
      </div>
    </div>
  );
});
