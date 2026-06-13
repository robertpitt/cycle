import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const cycleApiProxyPrefix = "/cycle-api";

type RuntimeDiscoveryFile = {
  readonly baseUrl?: unknown;
};

type CycleCliConfigFile = {
  readonly api?: {
    readonly staticToken?: unknown;
  };
};

const runtimeDiscoveryPath = (): string =>
  process.env.CYCLE_API_RUNTIME_FILE ??
  resolve(tmpdir(), `cycle-api-${process.getuid?.() ?? "user"}.json`);

const cliConfigPath = (): string =>
  process.env.CYCLE_CONFIG_PATH ?? resolve(homedir(), ".cycle", "config.json");

const readJsonFile = async <A>(path: string): Promise<A> =>
  JSON.parse(await readFile(path, "utf8")) as A;

const readCycleApiProxyTarget = async (): Promise<{
  readonly baseUrl: string;
  readonly token: string;
}> => {
  const runtime = await readJsonFile<RuntimeDiscoveryFile>(runtimeDiscoveryPath());
  const config = await readJsonFile<CycleCliConfigFile>(cliConfigPath());
  const token = config.api?.staticToken;

  if (typeof runtime.baseUrl !== "string" || runtime.baseUrl.length === 0) {
    throw new Error("Cycle API runtime discovery file does not include baseUrl.");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Cycle CLI config does not include api.staticToken.");
  }

  return {
    baseUrl: runtime.baseUrl.replace(/\/+$/u, ""),
    token,
  };
};

const readRequestBody = async (request: IncomingMessage): Promise<Buffer | undefined> => {
  if (request.method === "GET" || request.method === "HEAD") return undefined;

  const chunks: Array<Buffer> = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
};

const proxyHeadersFrom = (request: IncomingMessage, token: string): Headers => {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }

  headers.delete("connection");
  headers.delete("host");
  headers.set("authorization", `Bearer ${token}`);
  return headers;
};

const sendJson = (
  response: ServerResponse,
  status: number,
  body: Readonly<Record<string, unknown>>,
): void => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(`${JSON.stringify(body)}\n`);
};

const handleCycleApiProxyRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  try {
    const target = await readCycleApiProxyTarget();
    const requestUrl = request.url ?? cycleApiProxyPrefix;
    const targetPath = requestUrl.slice(cycleApiProxyPrefix.length) || "/";
    const targetUrl = `${target.baseUrl}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}`;
    const body = await readRequestBody(request);
    const apiResponse = await fetch(targetUrl, {
      body: body === undefined ? undefined : Uint8Array.from(body),
      headers: proxyHeadersFrom(request, target.token),
      method: request.method,
    });
    const responseBody = Buffer.from(await apiResponse.arrayBuffer());

    response.statusCode = apiResponse.status;
    apiResponse.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });
    response.end(responseBody);
  } catch (error) {
    sendJson(response, 503, {
      error: {
        code: "CYCLE_API_PROXY_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Cycle API proxy is unavailable.",
      },
    });
  }
};

const cycleApiDevProxy = (): Plugin => ({
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith(cycleApiProxyPrefix)) {
        next();
        return;
      }

      void handleCycleApiProxyRequest(request, response);
    });
  },
  name: "cycle-api-dev-proxy",
});

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
    plugins: [react(), tailwindcss(), cycleApiDevProxy()],
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
