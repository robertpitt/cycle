import { Schema } from "effect";
import { JsonObject } from "../components/JsonObject.ts";

export const AgentWorkJobWaitingInput = Schema.Struct({
  actor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional actor or subsystem that requested input." }),
  ),
  message: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable waiting message." }),
  ),
  payload: Schema.optional(JsonObject).pipe(
    Schema.annotateKey({ description: "Optional JSON payload describing what input is required." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for marking a job as waiting for input.",
    identifier: "@cycle/contracts/AgentWorkJobWaitingInput",
    title: "AgentWorkJobWaitingInput",
  }),
);
export type AgentWorkJobWaitingInput = typeof AgentWorkJobWaitingInput.Type;
