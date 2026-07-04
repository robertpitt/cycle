import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";

export const AgentWorkJobLogEntry = Schema.Struct({
  actor: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional actor label, or null when not attributable." }),
  ),
  entryId: Schema.String.pipe(Schema.annotateKey({ description: "Stable log entry id." })),
  kind: Schema.Literals(["activity", "checkpoint", "event", "status"]).pipe(
    Schema.annotateKey({ description: "Log entry category." }),
  ),
  message: Schema.String.pipe(Schema.annotateKey({ description: "Human-readable log message." })),
  occurredAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the entry occurred." }),
  ),
  payload: JsonObject.pipe(
    Schema.annotateKey({ description: "Source payload preserved as JSON extension data." }),
  ),
  source: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional source label, or null when unknown." }),
  ),
  status: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional job status associated with this entry." }),
  ),
  title: Schema.String.pipe(
    Schema.annotateKey({ description: "Short display title for the log entry." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Display-oriented log entry for an Agent Work job.",
    identifier: "@cycle/contracts/AgentWorkJobLogEntry",
    title: "AgentWorkJobLogEntry",
  }),
);
export type AgentWorkJobLogEntry = typeof AgentWorkJobLogEntry.Type;
