import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";

export class CycleAuthorization extends HttpApiMiddleware.Service<CycleAuthorization>()(
  "@cycle/api/CycleAuthorization",
  {
    requiredForClient: true,
    security: {
      bearer: HttpApiSecurity.bearer,
    },
  },
) {}
