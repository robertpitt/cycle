import { Crypto, Effect, Layer, Redacted } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
import { timingSafeTokenEqualWithCrypto } from "../handlers/crypto.ts";
import { unauthorizedResponse } from "../handlers/responses.ts";
import { CycleApiRuntime } from "../runtime/CycleApiRuntime.ts";
import { ApiErrorEnvelopes } from "../schemas/ApiErrorEnvelope.ts";
import { CycleRequestContext } from "./CycleRequestContextMiddleware.ts";

export class CycleAuthorization extends HttpApiMiddleware.Service<
  CycleAuthorization,
  { requires: CycleRequestContext }
>()("@cycle/api/CycleAuthorization", {
  error: ApiErrorEnvelopes,
  requiredForClient: true,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}

export const CycleAuthorizationLive = Layer.effect(
  CycleAuthorization,
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const crypto = yield* Crypto.Crypto;

    return CycleAuthorization.of({
      bearer: Effect.fn(function* (httpEffect, { credential }) {
        const supplied = Redacted.value(credential);
        const authorized = yield* timingSafeTokenEqualWithCrypto(
          crypto,
          supplied,
          runtime.staticToken,
        );

        if (!authorized) {
          const { requestId } = yield* CycleRequestContext;
          return unauthorizedResponse(requestId);
        }

        return yield* httpEffect;
      }),
    });
  }),
);
