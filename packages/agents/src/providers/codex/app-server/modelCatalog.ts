import {
  spawnCodexAppServerClient,
  type CodexAppServerClient,
  type Model,
} from "@cycle/codex-app-server";
import type { CodexAgentServiceOptions, CodexAppServerClientFactoryOptions } from "../types.ts";

const defaultModelCatalogTimeoutMs = 10_000;
const defaultModelCatalogPageSize = 100;

export type CodexModelCatalog = {
  readonly defaultModel: string | null;
  readonly models: readonly string[];
};

export type CodexModelCatalogOptions = {
  readonly appServerClient?: CodexAgentServiceOptions["appServerClient"];
  readonly codexHome?: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly executablePath?: string;
  readonly includeHidden?: boolean;
  readonly limit?: number;
  readonly timeoutMs?: number;
};

const compactEnv = (env: NodeJS.ProcessEnv | undefined): Record<string, string> => {
  const entries = Object.entries({
    ...process.env,
    ...env,
  }).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.fromEntries(entries);
};

const createCatalogClient = async (
  options: CodexModelCatalogOptions,
): Promise<{
  readonly client: CodexAppServerClient;
  readonly shouldClose: boolean;
}> => {
  if (
    typeof options.appServerClient === "object" &&
    options.appServerClient !== null
  ) {
    return {
      client: options.appServerClient,
      shouldClose: false,
    };
  }

  const env = compactEnv(options.env);
  const clientOptions: CodexAppServerClientFactoryOptions = {
    ...(options.codexHome === undefined ? {} : { codexHome: options.codexHome }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
    executablePath: options.executablePath ?? "codex",
  };

  if (typeof options.appServerClient === "function") {
    return {
      client: await options.appServerClient(clientOptions),
      shouldClose: true,
    };
  }

  return {
    client: await spawnCodexAppServerClient(clientOptions),
    shouldClose: true,
  };
};

const modelIdentifier = (model: Model): string => model.model || model.id;

const readCodexModelCatalog = async (
  options: CodexModelCatalogOptions,
): Promise<CodexModelCatalog> => {
  const { client, shouldClose } = await createCatalogClient(options);

  try {
    await client.request("initialize", {
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
      clientInfo: {
        name: "cycle",
        title: "Cycle",
        version: "0.0.0",
      },
    });
    await client.notify("initialized", undefined);

    const models: string[] = [];
    const seen = new Set<string>();
    let defaultModel: string | null = null;
    let cursor: string | null | undefined;

    do {
      const page = await client.request("model/list", {
        ...(cursor === undefined || cursor === null ? {} : { cursor }),
        includeHidden: options.includeHidden ?? false,
        limit: options.limit ?? defaultModelCatalogPageSize,
      });

      for (const entry of page.data) {
        const id = modelIdentifier(entry).trim();
        if (id.length === 0 || seen.has(id)) continue;
        seen.add(id);
        models.push(id);
        if (entry.isDefault === true) defaultModel = id;
      }

      cursor = page.nextCursor;
    } while (cursor !== null && cursor !== undefined);

    return {
      defaultModel: defaultModel ?? models[0] ?? null,
      models,
    };
  } finally {
    if (shouldClose) {
      await client.close().catch(() => undefined);
    }
  }
};

export const listCodexModelCatalog = async (
  options: CodexModelCatalogOptions = {},
): Promise<CodexModelCatalog> => {
  let client: CodexAppServerClient | undefined;
  const appServerClient = options.appServerClient;
  const wrappedOptions: CodexModelCatalogOptions =
    typeof appServerClient === "function"
      ? {
          ...options,
          appServerClient: async (clientOptions) => {
            const createdClient = await appServerClient(clientOptions);
            client = createdClient;
            return createdClient;
          },
        }
      : options;
  if (
    typeof appServerClient === "object" &&
    appServerClient !== null
  ) {
    client = appServerClient;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readCodexModelCatalog(wrappedOptions),
      new Promise<CodexModelCatalog>((_, reject) => {
        timeout = setTimeout(() => {
          if (
            !(
              typeof options.appServerClient === "object" &&
              options.appServerClient !== null
            )
          ) {
            void client?.close();
          }
          reject(new Error("Codex model catalog request timed out."));
        }, options.timeoutMs ?? defaultModelCatalogTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};
