import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";
import { PositiveInteger } from "../components/PositiveInteger.ts";

export const AgentWorkActivity = Schema.Struct({
  actor: Schema.optional(Schema.Unknown).pipe(
    Schema.annotateKey({
      description: "Optional actor payload. Shape is source-owned and intentionally opaque.",
    }),
  ),
  dedupeKey: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional deduplication key, or null when none applies." }),
  ),
  eventId: Schema.String.pipe(Schema.annotateKey({ description: "Stable event id." })),
  eventType: Schema.String.pipe(
    Schema.annotateKey({ description: "Source-defined event type string." }),
  ),
  eventVersion: PositiveInteger.pipe(
    Schema.annotateKey({ description: "Version of this event shape." }),
  ),
  jobId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Related job id, or null when the event is not job-specific.",
    }),
  ),
  occurredAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the event occurred." }),
  ),
  payload: JsonObject.pipe(
    Schema.annotateKey({ description: "Event payload preserved as JSON extension data." }),
  ),
  repositoryId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Related repository id, or null for global events." }),
  ),
  sequence: PositiveInteger.pipe(Schema.annotateKey({ description: "Monotonic event sequence." })),
  source: Schema.String.pipe(Schema.annotateKey({ description: "Event source identifier." })),
  ticketId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Related ticket id, or null when the event is not ticket-specific.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Append-only Agent Work activity event.",
    identifier: "@cycle/contracts/AgentWorkActivity",
    title: "AgentWorkActivity",
  }),
);
export type AgentWorkActivity = typeof AgentWorkActivity.Type;
