import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/styles.css";
import { ThemeProvider, type ThemeMode } from "../src/theme/index.ts";
const withTheme: Decorator = (Story, context) => {
  const mode = context.globals["theme"] as ThemeMode;
  if (context.title.startsWith("Examples/")) {
    return <Story />;
  }
  return (
    <ThemeProvider className="min-h-screen p-6" mode={mode}>
      <main className="mx-auto max-w-5xl">
        <Story />
      </main>
    </ThemeProvider>
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
          {
            title: "System",
            value: "system",
          },
          {
            title: "Light",
            value: "light",
          },
          {
            title: "Dark",
            value: "dark",
          },
        ],
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
