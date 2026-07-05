import { Schema } from "effect";
import { NonNegativeInteger, ResourceEnvelopeOf } from "./shared.ts";

export const ApiStatusOutput = Schema.Struct({
  apiVersion: Schema.String,
  repositoriesMounted: NonNegativeInteger,
  runtime: Schema.Literal("local"),
  startedAt: Schema.String,
  status: Schema.Literal("ok"),
});

export const ApiStatusResourceEnvelope = ResourceEnvelopeOf(ApiStatusOutput);
