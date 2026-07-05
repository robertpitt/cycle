import { Context, Crypto, Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { requestIdFromHeadersWithCrypto } from "../handlers/crypto.ts";
import type { ApiRequestContext } from "../runtime/CycleApiRuntime.ts";

export class CycleRequestContext extends Context.Service<
  CycleRequestContext,
  ApiRequestContext
>()("@cycle/api/CycleRequestContext") {}

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

        return yield* httpEffect.pipe(Effect.provideService(CycleRequestContext, { requestId }));
      }),
    );
  }),
);
