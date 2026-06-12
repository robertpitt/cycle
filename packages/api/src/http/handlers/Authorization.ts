import { Crypto, Effect, Layer, Redacted } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { CycleAuthorization } from "../authorization.ts";
import { CycleApiRuntime } from "../runtime/CycleApiRuntime.ts";
import {
  requestIdFromHeadersWithCrypto,
  timingSafeTokenEqualWithCrypto,
  unauthorizedResponse,
} from "./shared.ts";

export const CycleAuthorizationLive = Layer.effect(
  CycleAuthorization,
  Effect.gen(function* () {
    const runtime = yield* CycleApiRuntime;
    const crypto = yield* Crypto.Crypto;

    return CycleAuthorization.of({
      bearer: Effect.fn(function* (httpEffect, { credential }) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const supplied = Redacted.value(credential);
        const authorized = yield* timingSafeTokenEqualWithCrypto(
          crypto,
          supplied,
          runtime.staticToken,
        );

        if (!authorized) {
          const requestId = yield* requestIdFromHeadersWithCrypto(crypto, request.headers);
          return unauthorizedResponse(requestId);
        }

        return yield* httpEffect;
      }),
    });
  }),
);
