import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  addons: ["@storybook/addon-docs"],
  docs: {
    autodocs: "tag",
  },
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../src/**/*.stories.ts"],
  typescript: {
    reactDocgen: "react-docgen",
  },
  viteFinal: (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    viteConfig.resolve = {
      ...viteConfig.resolve,
      dedupe: ["react", "react-dom"],
    };

    return viteConfig;
  },
};

export default config;
