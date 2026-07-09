import * as React from "react";
import { cn } from "../../lib/cn.ts";
export type SettingRowProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly control: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly disabled?: boolean;
  readonly title: React.ReactNode;
};
export const SettingRow = React.forwardRef<HTMLDivElement, SettingRowProps>(function SettingRow(
  { className, control, description, disabled = false, inert, title, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      aria-disabled={disabled ? true : undefined}
      className={cn(
        "grid min-h-16 grid-cols-[1fr_auto] items-center gap-6 border-b border-border py-4 last:border-b-0",
        disabled && "opacity-55",
        className,
      )}
      data-disabled={disabled ? "" : undefined}
      inert={inert ?? disabled}
    >
      <div>
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {control}
    </div>
  );
});
