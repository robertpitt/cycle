import { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer } from "effect";
import {
  discoverCycleApiEffect,
  type CycleMcpApiDiscoveryInput,
  type CycleMcpApiDiscoveryResult,
  type CycleMcpDiscoveryError,
} from "./discovery.ts";

export type CycleMcpApiClientOptions = CycleMcpApiDiscoveryInput & {
  readonly fetch?: typeof fetch;
  readonly requireApiOnStart?: boolean;
  readonly userAgent?: string;
};

export type CycleApiEnvelope<T = unknown> = {
  readonly data: T;
  readonly links?: unknown;
  readonly meta?: {
    readonly requestId?: string;
    readonly totalCount?: number | null;
  };
  readonly page?: unknown;
};

export type CycleApiErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly details?: unknown;
    readonly message?: string;
    readonly requestId?: string;
    readonly retryable?: boolean;
  };
};

export type CycleMcpApiClientShape = {
  readonly discover: () => Effect.Effect<CycleMcpApiDiscoveryResult, CycleMcpDiscoveryError>;
  readonly request: <T = unknown>(options: {
    readonly body?: unknown;
    readonly method: string;
    readonly path: string;
    readonly requestId?: string;
  }) => Effect.Effect<CycleApiEnvelope<T>, CycleMcpApiError>;
};

export class CycleMcpApiClient extends Context.Service<CycleMcpApiClient, CycleMcpApiClientShape>()(
  "@cycle/mcp/CycleMcpApiClient",
) {}

export const makeCycleMcpApiClient = async (
  options: CycleMcpApiClientOptions,
): Promise<CycleMcpApiClientShape> =>
  Effect.runPromise(makeCycleMcpApiClientEffect(options).pipe(Effect.provide(NodeServices.layer)));

export const makeCycleMcpApiClientEffect = (
  options: CycleMcpApiClientOptions,
): Effect.Effect<CycleMcpApiClientShape, CycleMcpDiscoveryError, NodeServices.NodeServices> =>
  Effect.gen(function* () {
    const fetchImpl = options.fetch ?? fetch;
    const userAgent = options.userAgent ?? "cycle-mcp/0.0.0";
    const startupDiscovery = options.requireApiOnStart
      ? yield* discoverCycleApiEffect(options)
      : undefined;
    const discover = () =>
      startupDiscovery === undefined
        ? discoverCycleApiEffect(options).pipe(Effect.provide(NodeServices.layer))
        : Effect.succeed(startupDiscovery);

    return {
      discover,
      request: <T = unknown>(request: {
        readonly body?: unknown;
        readonly method: string;
        readonly path: string;
        readonly requestId?: string;
      }) =>
        Effect.gen(function* () {
          const discovery = yield* discover().pipe(
            Effect.mapError((error) =>
              cycleMcpApiError({
                code: error.code,
                message: error.message,
                retryable: true,
                status: 0,
              }),
            ),
          );
          return yield* Effect.tryPromise({
            try: async () => {
              const headers = new Headers({
                accept: "application/json",
                authorization: `Bearer ${discovery.token}`,
                "user-agent": userAgent,
              });

              if (request.requestId !== undefined) headers.set("x-request-id", request.requestId);
              if (request.body !== undefined) headers.set("content-type", "application/json");

              let response: Response;
              try {
                response = await fetchImpl(`${discovery.baseUrl}${request.path}`, {
                  body: request.body === undefined ? undefined : JSON.stringify(request.body),
                  headers,
                  method: request.method,
                });
              } catch {
                throw cycleMcpApiError({
                  code: "API_UNAVAILABLE",
                  message: "Cycle API is not reachable.",
                  retryable: true,
                  status: 0,
                });
              }

              const payload = await readJsonResponse(response);

              if (!response.ok) {
                const apiError = payload as CycleApiErrorEnvelope;
                throw cycleMcpApiError({
                  code: apiError.error?.code ?? `HTTP_${response.status}`,
                  details: apiError.error?.details,
                  message: apiError.error?.message ?? "Cycle API request failed.",
                  requestId: apiError.error?.requestId,
                  retryable: apiError.error?.retryable ?? retryableStatus(response.status),
                  status: response.status,
                });
              }

              return payload as CycleApiEnvelope<T>;
            },
            catch: (error) =>
              isCycleMcpApiError(error)
                ? error
                : cycleMcpApiError({
                    code: "INVALID_API_RESPONSE",
                    message: "Cycle API request failed before a valid response envelope was read.",
                    retryable: false,
                    status: 0,
                  }),
          });
        }).pipe(
          Effect.withSpan(apiRequestSpanName(request), {
            attributes: {
              "http.method": request.method.toUpperCase(),
              "http.route": request.path.split("?")[0] ?? request.path,
              "mcp.api.requestId": request.requestId ?? null,
              service: "@cycle/mcp",
            },
          }),
        ),
    };
  });

export const CycleMcpApiClientLive = (
  options: CycleMcpApiClientOptions,
): Layer.Layer<CycleMcpApiClient, CycleMcpDiscoveryError, NodeServices.NodeServices> =>
  Layer.effect(CycleMcpApiClient, makeCycleMcpApiClientEffect(options));

export type CycleMcpApiError = {
  readonly _tag: "CycleMcpApiError";
  readonly code: string;
  readonly details?: unknown;
  readonly message: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly status: number;
};

export const isCycleMcpApiError = (value: unknown): value is CycleMcpApiError =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value._tag === "CycleMcpApiError";

export const cycleMcpApiError = (input: {
  readonly code: string;
  readonly details?: unknown;
  readonly message: string;
  readonly requestId?: string;
  readonly retryable?: boolean;
  readonly status: number;
}): CycleMcpApiError => ({
  _tag: "CycleMcpApiError",
  code: input.code,
  ...(input.details === undefined ? {} : { details: redactSecrets(input.details) }),
  message: input.message,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
  retryable: input.retryable ?? retryableStatus(input.status),
  status: input.status,
});

const readJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (text.length === 0) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw cycleMcpApiError({
      code: "INVALID_API_RESPONSE",
      message: "Cycle API returned invalid JSON.",
      retryable: false,
      status: response.status,
    });
  }
};

const retryableStatus = (status: number): boolean =>
  status === 0 ||
  status === 408 ||
  status === 429 ||
  status === 500 ||
  status === 502 ||
  status === 503 ||
  status === 504;

const apiRequestSpanName = (request: { readonly method: string; readonly path: string }): string =>
  `mcp.api.${request.method.toUpperCase()} ${request.path.split("?")[0] ?? request.path}`;

const secretPattern =
  /api[-_]?key|authorization|bearer|credential|password|private[-_]?key|secret|token/iu;

const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      secretPattern.test(key) ? "[redacted]" : redactSecrets(entry),
    ]),
  );
};
