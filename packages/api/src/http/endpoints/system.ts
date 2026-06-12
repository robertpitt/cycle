import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { ResourceEnvelope } from "../schemas.ts";

export class SystemApiGroup extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/health", {
    success: ResourceEnvelope,
  }).annotateMerge(
    OpenApi.annotations({
      summary: "Read local service health.",
    }),
  ),
) {}
