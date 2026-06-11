import * as React from "react";
import { cn } from "../lib/cn.ts";
export const themeModes = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof themeModes)[number];
export type ThemeProviderProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly mode?: ThemeMode;
};

export const ThemeProvider = React.forwardRef<HTMLDivElement, ThemeProviderProps>(
  function ThemeProvider({ className, mode = "system", ...props }, ref) {
    React.useEffect(() => {
      if (typeof document === "undefined") return undefined;

      const root = document.documentElement;
      const previousTheme = root.getAttribute("data-theme");
      const hadDarkClass = root.classList.contains("dark");

      root.setAttribute("data-theme", mode);
      root.classList.toggle("dark", mode === "dark");

      return () => {
        if (previousTheme === null) {
          root.removeAttribute("data-theme");
        } else {
          root.setAttribute("data-theme", previousTheme);
        }

        root.classList.toggle("dark", hadDarkClass);
      };
    }, [mode]);

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
