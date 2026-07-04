import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";

export const AgentWorkJobActivityInput = Schema.Struct({
  jobId: Schema.String.pipe(Schema.annotateKey({ description: "Job id receiving the activity." })),
  kind: Schema.String.pipe(Schema.annotateKey({ description: "Caller-defined activity kind." })),
  message: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable activity message." }),
  ),
  payload: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({ description: "Optional JSON payload for activity-specific details." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for appending a job activity log entry.",
    identifier: "@cycle/contracts/AgentWorkJobActivityInput",
    title: "AgentWorkJobActivityInput",
  }),
);
export type AgentWorkJobActivityInput = typeof AgentWorkJobActivityInput.Type;
