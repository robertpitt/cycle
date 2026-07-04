import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";
import { PositiveInteger } from "../components/PositiveInteger.ts";

export const AgentWorkEventInput = Schema.Struct({
  actor: Schema.optional(Schema.Unknown).pipe(
    Schema.annotateKey({
      description: "Optional actor payload. Shape is source-owned and intentionally opaque.",
    }),
  ),
  dedupeKey: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional deduplication key, or null when none applies." }),
  ),
  eventId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional caller-provided stable event id." }),
  ),
  eventType: Schema.String.pipe(
    Schema.annotateKey({ description: "Source-defined event type string." }),
  ),
  eventVersion: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Optional version of this event shape." }),
  ),
  jobId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Related job id, or null when the event is not job-specific.",
    }),
  ),
  occurredAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional ISO timestamp when the event occurred." }),
  ),
  payload: JsonObject.pipe(
    Schema.annotateKey({ description: "Event payload preserved as JSON extension data." }),
  ),
  repositoryId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Related repository id, or null for global events." }),
  ),
  source: Schema.String.pipe(Schema.annotateKey({ description: "Event source identifier." })),
  ticketId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Related ticket id, or null when the event is not ticket-specific.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Input for appending an Agent Work activity event.",
    identifier: "@cycle/contracts/AgentWorkEventInput",
    title: "AgentWorkEventInput",
  }),
);
export type AgentWorkEventInput = typeof AgentWorkEventInput.Type;
