import type { Decorator, Preview } from "@storybook/react-vite";
import * as React from "react";

import "../src/styles.css";
import { ThemeProvider, type ThemeMode } from "../src/theme/index.ts";

const withTheme: Decorator = (Story, context) => {
  const mode = context.globals["theme"] as ThemeMode;

  if (context.title.startsWith("Pages/")) {
    return React.createElement(Story);
  }

  return React.createElement(
    ThemeProvider,
    {
      className: "min-h-screen p-6",
      mode,
    },
    React.createElement("main", { className: "mx-auto max-w-5xl" }, React.createElement(Story)),
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      defaultValue: "system",
      description: "Cycle UI color mode",
      name: "Theme",
      toolbar: {
        icon: "mirror",
        items: [
          { title: "System", value: "system" },
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" },
        ],
        showName: true,
      },
    },
  },
  parameters: {
    backgrounds: {
      disable: true,
    },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/iu,
        date: /date$/iu,
      },
    },
    layout: "fullscreen",
  },
};

export default preview;
