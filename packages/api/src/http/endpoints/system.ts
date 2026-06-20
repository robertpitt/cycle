import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { ApiErrorEnvelopes, HealthResourceEnvelope } from "../schemas.ts";

export class SystemApiGroup extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/health", {
    error: ApiErrorEnvelopes,
    success: HealthResourceEnvelope,
  }).annotateMerge(
    OpenApi.annotations({
      summary: "Read local service health.",
    }),
  ),
) {}
