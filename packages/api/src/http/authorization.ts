import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";
import { ApiErrorEnvelopes } from "./schemas.ts";

export class CycleAuthorization extends HttpApiMiddleware.Service<CycleAuthorization>()(
  "@cycle/api/CycleAuthorization",
  {
    error: ApiErrorEnvelopes,
    requiredForClient: true,
    security: {
      bearer: HttpApiSecurity.bearer,
    },
  },
) {}
