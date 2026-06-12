import { NodeServices } from "@effect/platform-node";
import { Effect, Path } from "effect";
import { discoverApiEffect, type CliDiscoveryError, type CliDiscoveryResult } from "./discovery.ts";

export type CycleApiClientOptions = {
  readonly apiUrlFlag?: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
  readonly requestId?: string;
  readonly tokenFlag?: string;
};

export type ApiEnvelope<T = unknown> = {
  readonly data: T;
  readonly links?: unknown;
  readonly meta?: {
    readonly requestId?: string;
    readonly totalCount?: number | null;
  };
  readonly page?: unknown;
};

export type ApiErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly details?: unknown;
    readonly message?: string;
    readonly requestId?: string;
    readonly retryable?: boolean;
  };
};

export type CycleApiClient = {
  readonly discovery: CliDiscoveryResult;
  readonly request: <T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ) => Promise<ApiEnvelope<T>>;
  readonly resolveRepository: (value: string) => Promise<string>;
};

export type CliApiError = {
  readonly _tag: "CliApiError";
  readonly code: string;
  readonly details?: unknown;
  readonly message: string;
  readonly requestId?: string;
  readonly status: number;
};

export const makeCycleApiClient = async (options: CycleApiClientOptions): Promise<CycleApiClient> =>
  Effect.runPromise(makeCycleApiClientEffect(options).pipe(Effect.provide(NodeServices.layer)));

export const makeCycleApiClientEffect = (
  options: CycleApiClientOptions,
): Effect.Effect<CycleApiClient, CliDiscoveryError, NodeServices.NodeServices> =>
  Effect.gen(function* () {
    const discovery = yield* discoverApiEffect({
      apiUrlFlag: options.apiUrlFlag,
      env: options.env,
      tokenFlag: options.tokenFlag,
    });
    const path = yield* Path.Path;
    const fetchImpl = options.fetch ?? fetch;

    const request = async <T = unknown>(
      method: string,
      requestPath: string,
      body?: unknown,
    ): Promise<ApiEnvelope<T>> => {
      const headers = new Headers({
        accept: "application/json",
        authorization: `Bearer ${discovery.token}`,
      });

      if (options.requestId !== undefined) headers.set("x-request-id", options.requestId);
      if (body !== undefined) headers.set("content-type", "application/json");

      let response: Response;
      try {
        response = await fetchImpl(`${discovery.baseUrl}${requestPath}`, {
          body: body === undefined ? undefined : JSON.stringify(body),
          headers,
          method,
        });
      } catch {
        throw cliApiError(0, "API_UNAVAILABLE", "Cycle API is not reachable.");
      }

      const payload = await readJsonResponse(response);

      if (!response.ok) {
        const apiError = payload as ApiErrorEnvelope;
        throw cliApiError(
          response.status,
          apiError.error?.code ?? `HTTP_${response.status}`,
          apiError.error?.message ?? "Cycle API request failed.",
          apiError.error?.requestId,
          apiError.error?.details,
        );
      }

      return payload as ApiEnvelope<T>;
    };

    const resolveRepository = async (value: string): Promise<string> => {
      const byId = await request<Record<string, unknown>>(
        "GET",
        `/v1/repositories/${encodeURIComponent(value)}`,
      ).catch((error: unknown) => {
        if (isCliApiError(error) && error.status === 404) return undefined;
        throw error;
      });

      if (byId !== undefined) return repositoryIdFrom(byId.data);

      const absolutePath = path.resolve(options.cwd, value);
      const byPath = await request<ReadonlyArray<Record<string, unknown>>>(
        "GET",
        `/v1/repositories?filter[path]=${encodeURIComponent(absolutePath)}`,
      );
      const existing = byPath.data[0];

      if (existing !== undefined) return repositoryIdFrom(existing);

      const opened = await request<Record<string, unknown>>("POST", "/v1/repositories", {
        path: absolutePath,
      });

      return repositoryIdFrom(opened.data);
    };

    return {
      discovery,
      request,
      resolveRepository,
    };
  });

export const isCliApiError = (value: unknown): value is CliApiError =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === "CliApiError";

export const cliApiError = (
  status: number,
  code: string,
  message: string,
  requestId?: string,
  details?: unknown,
): CliApiError => ({
  _tag: "CliApiError",
  code,
  ...(details === undefined ? {} : { details }),
  message,
  ...(requestId === undefined ? {} : { requestId }),
  status,
});

const readJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (text.length === 0) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw cliApiError(response.status, "INVALID_API_RESPONSE", "Cycle API returned invalid JSON.");
  }
};

const repositoryIdFrom = (value: unknown): string => {
  if (typeof value === "object" && value !== null && "repositoryId" in value) {
    const repositoryId = value.repositoryId;
    if (typeof repositoryId === "string") return repositoryId;
  }

  throw cliApiError(
    500,
    "INVALID_API_RESPONSE",
    "Repository response did not include repositoryId.",
  );
};
