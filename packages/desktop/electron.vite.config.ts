import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { connect } from "node:net";
import type { Socket as NetSocket } from "node:net";
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

const writeChunk = async (response: ServerResponse, chunk: Uint8Array): Promise<void> => {
  if (response.write(Buffer.from(chunk))) return;
  await new Promise<void>((resolve) => {
    response.once("drain", resolve);
  });
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

    response.statusCode = apiResponse.status;
    apiResponse.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });
    response.flushHeaders();

    if (apiResponse.body === null) {
      response.end();
      return;
    }

    const reader = apiResponse.body.getReader();
    const cancelReader = (): void => {
      void reader.cancel().catch(() => {
        // The reader can already be released when Node emits request close.
      });
    };
    request.on("close", cancelReader);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value !== undefined) await writeChunk(response, value);
      }
    } finally {
      request.off("close", cancelReader);
      reader.releaseLock();
    }

    response.end();
  } catch (error) {
    sendJson(response, 503, {
      error: {
        code: "CYCLE_API_PROXY_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Cycle API proxy is unavailable.",
      },
    });
  }
};

const proxyUpgradeHeaderLines = (
  request: IncomingMessage,
  targetUrl: URL,
  token: string,
): readonly string[] => {
  const headers = new Map<string, string>();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === "authorization" ||
      normalizedKey === "connection" ||
      normalizedKey === "host"
    ) {
      continue;
    }
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  headers.set("authorization", `Bearer ${token}`);
  headers.set("connection", "Upgrade");
  headers.set("host", targetUrl.host);
  headers.set("upgrade", String(request.headers.upgrade ?? "websocket"));

  return [...headers.entries()].map(([key, value]) => `${key}: ${value}`);
};

const handleCycleApiProxyUpgrade = (
  request: IncomingMessage,
  socket: NetSocket,
  head: Buffer,
): void => {
  void readCycleApiProxyTarget()
    .then((target) => {
      const requestUrl = request.url ?? cycleApiProxyPrefix;
      const targetPath = requestUrl.slice(cycleApiProxyPrefix.length) || "/";
      const targetUrl = new URL(target.baseUrl);
      if (targetUrl.protocol !== "http:") {
        throw new Error("Cycle API WebSocket dev proxy only supports http targets.");
      }

      const upstream = connect({
        host: targetUrl.hostname,
        port: targetUrl.port.length > 0 ? Number(targetUrl.port) : 80,
      });
      const upstreamPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;

      upstream.on("connect", () => {
        upstream.write(
          [
            `GET ${upstreamPath} HTTP/${request.httpVersion}`,
            ...proxyUpgradeHeaderLines(request, targetUrl, target.token),
            "",
            "",
          ].join("\r\n"),
        );
        if (head.length > 0) upstream.write(head);
        socket.pipe(upstream).pipe(socket);
      });
      upstream.on("error", () => {
        socket.destroy();
      });
      socket.on("error", () => {
        upstream.destroy();
      });
    })
    .catch((error) => {
      socket.end(
        [
          "HTTP/1.1 503 Service Unavailable",
          "content-type: application/json",
          "connection: close",
          "",
          `${JSON.stringify({
            error: {
              code: "CYCLE_API_PROXY_UNAVAILABLE",
              message: error instanceof Error ? error.message : "Cycle API proxy is unavailable.",
            },
          })}\n`,
        ].join("\r\n"),
      );
    });
};

const cycleApiDevProxy = (): Plugin => ({
  configureServer(server) {
    server.httpServer?.on("upgrade", (request, socket, head) => {
      if (!request.url?.startsWith(cycleApiProxyPrefix)) return;
      handleCycleApiProxyUpgrade(request, socket, head);
    });

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
