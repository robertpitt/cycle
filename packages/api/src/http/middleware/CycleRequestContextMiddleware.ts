import { Context, Crypto, Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { requestIdFromHeadersWithCrypto } from "../handlers/crypto.ts";
import type { ApiRequestContext } from "../runtime/CycleApiRuntime.ts";

export class CycleRequestContext extends Context.Service<CycleRequestContext, ApiRequestContext>()(
  "@cycle/api/CycleRequestContext",
) {}

export class CycleRequestContextMiddleware extends HttpApiMiddleware.Service<
  CycleRequestContextMiddleware,
  { provides: CycleRequestContext }
>()("@cycle/api/CycleRequestContextMiddleware") {}

export const CycleRequestContextLive = Layer.effect(
  CycleRequestContextMiddleware,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;

    return CycleRequestContextMiddleware.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const requestId = yield* requestIdFromHeadersWithCrypto(crypto, request.headers);
        const header = (name: string): string | undefined => {
          const value = request.headers[name]?.trim();
          return value === undefined || value.length === 0 ? undefined : value;
        };
        const actorType = header("x-cycle-actor-type");
        const actorName = header("x-cycle-actor-name");
        const actor =
          actorName !== undefined &&
          (actorType === "agent" || actorType === "human" || actorType === "import")
            ? {
                ...(header("x-cycle-actor-email") === undefined
                  ? {}
                  : { email: header("x-cycle-actor-email") }),
                name: actorName,
                ...(header("x-cycle-actor-provider") === undefined
                  ? {}
                  : { provider: header("x-cycle-actor-provider") }),
                type: actorType,
              }
            : undefined;

        return yield* httpEffect.pipe(
          Effect.provideService(CycleRequestContext, {
            ...(actor === undefined ? {} : { actor }),
            requestId,
            ...(header("x-cycle-source") === undefined ? {} : { source: header("x-cycle-source") }),
          }),
        );
      }),
    );
  }),
);
