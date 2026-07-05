import { Schema } from "effect";
import { ResourceEnvelopeOf } from "./shared.ts";

export const HealthOutput = Schema.Struct({
  apiVersion: Schema.String,
  startedAt: Schema.String,
  status: Schema.Literal("ok"),
});
export const HealthResourceEnvelope = ResourceEnvelopeOf(HealthOutput);
