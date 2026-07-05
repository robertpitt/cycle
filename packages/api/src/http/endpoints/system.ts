import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { ApiErrorEnvelopes } from "../schemas/ApiErrorEnvelope.ts";
import { HealthResourceEnvelope } from "../schemas/HealthResourceEnvelope.ts";

export class SystemApiGroup extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("openApiViewer", "/", {
    success: Schema.String,
  }).annotateMerge(
    OpenApi.annotations({
      summary: "View OpenAPI documentation.",
      description: "Serves a Redoc CE viewer for the local OpenAPI document.",
    }),
  ),
  HttpApiEndpoint.get("openApiJson", "/openapi.json", {
    success: Schema.Record(Schema.String, Schema.Unknown),
  }).annotateMerge(
    OpenApi.annotations({
      summary: "Read OpenAPI JSON.",
      description: "Returns the generated OpenAPI document for the local Cycle API.",
    }),
  ),
  HttpApiEndpoint.get("specJson", "/spec.json", {
    success: Schema.Record(Schema.String, Schema.Unknown),
  }).annotateMerge(
    OpenApi.annotations({
      summary: "Read OpenAPI JSON compatibility endpoint.",
      description: "Returns the generated OpenAPI document for clients using the legacy path.",
    }),
  ),
  HttpApiEndpoint.get("health", "/health", {
    error: ApiErrorEnvelopes,
    success: HealthResourceEnvelope,
  }).annotateMerge(
    OpenApi.annotations({
      summary: "Read local service health.",
    }),
  ),
) {}
