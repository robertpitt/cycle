import "@cycle/ui/styles.css";

import { ThemeProvider, type ThemeMode } from "@cycle/ui/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { RouterProvider } from "react-router";
import { rendererRouter } from "./Router.tsx";
import { getDesktopBridge } from "./lib/desktopBridge.ts";

export const rendererQueryClient = new QueryClient();

const useDesktopThemePreference = (): ThemeMode => {
  const [mode, setMode] = React.useState<ThemeMode>("system");

  React.useEffect(() => {
    let active = true;

    getDesktopBridge()
      ?.getAppConfig()
      .then((config) => {
        if (active) setMode(config.theme.preference);
      })
      .catch((error: unknown) => {
        console.error("Unable to load desktop theme preference.", error);
      });

    return () => {
      active = false;
    };
  }, []);

  return mode;
};

export const DesktopRendererApp = () => {
  const themePreference = useDesktopThemePreference();

  return (
    <QueryClientProvider client={rendererQueryClient}>
      <ThemeProvider className="h-dvh overflow-hidden" mode={themePreference}>
        <RouterProvider router={rendererRouter} />
      </ThemeProvider>
    </QueryClientProvider>
  );
};
