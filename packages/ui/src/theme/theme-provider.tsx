import * as React from "react";
import { cn } from "../lib/cn.ts";
export const themeModes = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof themeModes)[number];
export type ThemeProviderProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly mode?: ThemeMode;
};
export const ThemeProvider = React.forwardRef<HTMLDivElement, ThemeProviderProps>(
  function ThemeProvider({ className, mode = "system", ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        data-theme={mode}
        className={cn(
          "cycle-theme min-h-full bg-background text-foreground antialiased",
          mode === "dark" && "dark",
          className,
        )}
      />
    );
  },
);
