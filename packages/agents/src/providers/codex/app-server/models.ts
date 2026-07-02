import {
  spawnCodexAppServerClient,
  type CodexAppServerClient,
  type Model,
} from "@cycle/codex-app-server";
import type {
  AgentListModelsRequest,
  AgentModelCatalog,
  AgentModelDescriptor,
  AgentReasoningEffort,
  JsonObject,
  JsonValue,
} from "../../../types.ts";
import { codexProviderId } from "../constants.ts";
import type { CodexAgentServiceOptions, CodexAppServerClientFactoryOptions } from "../types.ts";

const defaultModelListTimeoutMs = 10_000;
const defaultModelListPageSize = 100;

type ModelListClient = {
  readonly client: CodexAppServerClient;
  readonly shouldClose: boolean;
};

const compactEnv = (env: NodeJS.ProcessEnv | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries({
      ...process.env,
      ...env,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

const createModelListClient = async (
  options: CodexAgentServiceOptions,
): Promise<ModelListClient> => {
  if (typeof options.appServerClient === "object" && options.appServerClient !== null) {
    return {
      client: options.appServerClient,
      shouldClose: false,
    };
  }

  const clientOptions: CodexAppServerClientFactoryOptions = {
    ...(options.codexHome === undefined ? {} : { codexHome: options.codexHome }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: compactEnv(options.env),
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

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const modelIdentifier = (model: Model): string | undefined =>
  nonEmptyString(model.model) ?? nonEmptyString(model.id);

const titleCase = (value: string): string =>
  value
    .split(/[-_\s]+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const normalizeReasoningEfforts = (model: Model): readonly AgentReasoningEffort[] | undefined => {
  const rawEfforts = Array.isArray(model.supportedReasoningEfforts)
    ? model.supportedReasoningEfforts
    : [];
  const efforts = rawEfforts
    .map((option): AgentReasoningEffort | undefined => {
      const id = nonEmptyString(option.reasoningEffort);
      if (id === undefined) return undefined;
      const description = nonEmptyString(option.description);
      return {
        id,
        label: titleCase(id),
        ...(description === undefined ? {} : { description }),
      };
    })
    .filter((effort): effort is AgentReasoningEffort => effort !== undefined);

  return efforts.length === 0 ? undefined : efforts;
};

const jsonValue = (value: unknown): JsonValue | undefined => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value.map(jsonValue);
    return values.every((entry) => entry !== undefined) ? (values as JsonValue[]) : undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const entries = Object.entries(value)
    .map(([key, entry]) => [key, jsonValue(entry)] as const)
    .filter((entry): entry is readonly [string, JsonValue] => entry[1] !== undefined);
  return entries.length === Object.keys(value).length ? Object.fromEntries(entries) : undefined;
};

const modelMetadata = (model: Model): JsonObject | undefined => {
  const metadata: Array<readonly [string, JsonValue]> = [];
  const supportedReasoningEfforts = jsonValue(model.supportedReasoningEfforts);
  const defaultReasoningEffort = jsonValue(model.defaultReasoningEffort);
  const inputModalities = jsonValue(model.inputModalities);
  const serviceTiers = jsonValue(model.serviceTiers);

  if (supportedReasoningEfforts !== undefined) {
    metadata.push(["supportedReasoningEfforts", supportedReasoningEfforts]);
  }
  if (defaultReasoningEffort !== undefined) {
    metadata.push(["defaultReasoningEffort", defaultReasoningEffort]);
  }
  if (inputModalities !== undefined) metadata.push(["inputModalities", inputModalities]);
  if (serviceTiers !== undefined) metadata.push(["serviceTiers", serviceTiers]);
  if (typeof model.supportsPersonality === "boolean") {
    metadata.push(["supportsPersonality", model.supportsPersonality]);
  }

  return metadata.length === 0 ? undefined : Object.fromEntries(metadata);
};

const normalizeCodexModel = (model: Model): AgentModelDescriptor | undefined => {
  const id = modelIdentifier(model);
  if (id === undefined) return undefined;
  const hidden = model.hidden === true;
  const label = nonEmptyString(model.displayName) ?? id;
  const description = nonEmptyString(model.description);
  const supportedReasoningEfforts = normalizeReasoningEfforts(model);
  const defaultReasoningEffortId = nonEmptyString(model.defaultReasoningEffort);
  const metadata = modelMetadata(model);

  return {
    id,
    provider: codexProviderId,
    label,
    ...(description === undefined ? {} : { description }),
    status: hidden ? "hidden" : "available",
    ...(model.isDefault === true ? { isDefault: true } : {}),
    ...(supportedReasoningEfforts === undefined ? {} : { supportedReasoningEfforts }),
    ...(defaultReasoningEffortId === undefined ? {} : { defaultReasoningEffortId }),
    ...(metadata === undefined ? {} : { metadata }),
  };
};

const catalogReasoningEfforts = (
  models: readonly AgentModelDescriptor[],
  defaultModelId: string | null,
): {
  readonly defaultReasoningEffortId: string | null;
  readonly reasoningEfforts: readonly AgentReasoningEffort[] | undefined;
} => {
  const preferredModel =
    models.find((model) => model.id === defaultModelId) ??
    models.find((model) => model.status === "available" && model.disabled !== true) ??
    models[0];
  const preferredEfforts = preferredModel?.supportedReasoningEfforts;
  const efforts = preferredEfforts ?? [];
  if (efforts.length === 0) {
    return {
      defaultReasoningEffortId: null,
      reasoningEfforts: undefined,
    };
  }

  return {
    defaultReasoningEffortId:
      preferredModel?.defaultReasoningEffortId ??
      efforts.find((effort) => effort.id === "medium")?.id ??
      efforts[0]?.id ??
      null,
    reasoningEfforts: efforts,
  };
};

const abortPromise = (signal: AbortSignal | undefined): Promise<never> | undefined => {
  if (signal === undefined) return undefined;
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error("Codex model listing cancelled."));
  }
  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(signal.reason ?? new Error("Codex model listing cancelled.")),
      { once: true },
    );
  });
};

const readCodexModelCatalog = async (
  options: CodexAgentServiceOptions,
  request: AgentListModelsRequest,
): Promise<AgentModelCatalog> => {
  const { client, shouldClose } = await createModelListClient(options);

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

    const models: AgentModelDescriptor[] = [];
    const seen = new Set<string>();
    let defaultModelId: string | null = null;
    let cursor: string | null | undefined;

    do {
      const page = await client.request("model/list", {
        ...(cursor === undefined || cursor === null ? {} : { cursor }),
        includeHidden: request.includeHidden ?? false,
        limit: defaultModelListPageSize,
      });

      for (const entry of page.data) {
        const descriptor = normalizeCodexModel(entry);
        if (descriptor === undefined) continue;
        if (descriptor.status === "hidden" && request.includeHidden !== true) continue;
        if (seen.has(descriptor.id)) continue;
        seen.add(descriptor.id);
        models.push(descriptor);
        if (descriptor.isDefault === true) defaultModelId = descriptor.id;
      }

      cursor = page.nextCursor;
    } while (cursor !== null && cursor !== undefined && cursor.length > 0);

    const resolvedDefaultModelId =
      defaultModelId ??
      models.find((model) => model.status === "available" && model.disabled !== true)?.id ??
      null;
    const reasoning = catalogReasoningEfforts(models, resolvedDefaultModelId);

    return {
      defaultModelId: resolvedDefaultModelId,
      ...(reasoning.defaultReasoningEffortId === null
        ? {}
        : { defaultReasoningEffortId: reasoning.defaultReasoningEffortId }),
      fetchedAt: new Date().toISOString(),
      models,
      provider: codexProviderId,
      ...(reasoning.reasoningEfforts === undefined
        ? {}
        : { reasoningEfforts: reasoning.reasoningEfforts }),
      source: "dynamic",
    };
  } finally {
    if (shouldClose) await client.close().catch(() => undefined);
  }
};

export const listCodexModels = async (
  options: CodexAgentServiceOptions,
  request: AgentListModelsRequest = {},
): Promise<AgentModelCatalog> => {
  let trackedClient: CodexAppServerClient | undefined;
  const appServerClient = options.appServerClient;
  const trackedOptions: CodexAgentServiceOptions =
    typeof appServerClient === "function"
      ? {
          ...options,
          appServerClient: async (clientOptions) => {
            const client = await appServerClient(clientOptions);
            trackedClient = client;
            return client;
          },
        }
      : options;
  if (typeof appServerClient === "object" && appServerClient !== null) {
    trackedClient = appServerClient;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutMs = request.timeoutMs ?? defaultModelListTimeoutMs;
  const competitors: Array<Promise<AgentModelCatalog>> = [
    readCodexModelCatalog(trackedOptions, request),
    new Promise<AgentModelCatalog>((_, reject) => {
      timeout = setTimeout(() => {
        if (!(typeof options.appServerClient === "object" && options.appServerClient !== null)) {
          void trackedClient?.close();
        }
        reject(new Error("Codex model listing timed out."));
      }, timeoutMs);
    }),
  ];
  const aborted = abortPromise(request.signal);
  if (aborted !== undefined) competitors.push(aborted);

  try {
    return await Promise.race(competitors);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};
