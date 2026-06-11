import "@cycle/ui/styles.css";

import { ThemeProvider, type ThemeMode } from "@cycle/ui/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { RouterProvider } from "react-router";
import { rendererRouter } from "./Router.tsx";
import { getDesktopBridge } from "./lib/desktopBridge.ts";
import { NotificationProvider } from "./notifications/NotificationProvider.tsx";
import { ShortcutProvider } from "./shortcuts/ShortcutProvider.tsx";

export const rendererQueryClient = new QueryClient();

const useDesktopThemeMode = (): ThemeMode => {
  const [mode, setMode] = React.useState<ThemeMode>("system");

  React.useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return undefined;

    let active = true;
    const applyThemeState = (state: Awaited<ReturnType<typeof bridge.getThemeState>>): void => {
      if (active) setMode(state.source);
    };

    bridge
      .getThemeState()
      .then(applyThemeState)
      .catch((error: unknown) => {
        console.error("Unable to load desktop theme state.", error);
      });

    const unsubscribe = bridge.onThemeStateChanged(applyThemeState);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return mode;
};

export const DesktopRendererApp = () => {
  const themeMode = useDesktopThemeMode();

  return (
    <QueryClientProvider client={rendererQueryClient}>
      <ThemeProvider className="h-dvh overflow-hidden" mode={themeMode}>
        <NotificationProvider>
          <ShortcutProvider>
            <RouterProvider router={rendererRouter} />
          </ShortcutProvider>
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
