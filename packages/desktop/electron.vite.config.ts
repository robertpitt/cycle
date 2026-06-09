import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(packageDirectory, "src/main/Main.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          format: "es",
        },
      },
      sourcemap: true,
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(packageDirectory, "src/preload/index.ts"),
        },
        output: {
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
      sourcemap: true,
    },
  },
  renderer: {
    build: {
      sourcemap: true,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
  },
});
