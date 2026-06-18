import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

export class CycleApiTracing extends HttpApiMiddleware.Service<CycleApiTracing>()(
  "@cycle/api/CycleApiTracing",
) {}

export const CycleApiTracingLive = Layer.succeed(
  CycleApiTracing,
  CycleApiTracing.of((httpEffect, { endpoint }) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const route = endpoint.path;

      return yield* httpEffect.pipe(
        Effect.withSpan(`api.http.${request.method} ${route}`, {
          attributes: {
            "http.request.method": request.method,
            "http.route": route,
            "url.path": requestPathname(request.url),
            service: "@cycle/api",
          },
          kind: "server",
          root: true,
        }),
      );
    }),
  ),
);

const requestPathname = (url: string): string => {
  const withoutQuery = url.split(/[?#]/u)[0] || "/";
  if (withoutQuery.startsWith("/")) return withoutQuery;

  try {
    return new URL(withoutQuery).pathname;
  } catch {
    return "/";
  }
};
