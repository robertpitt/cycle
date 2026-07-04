import { Schema } from "effect";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";

export const InitiativeProgress = Schema.Struct({
  completedEstimate: Schema.Finite.pipe(
    Schema.annotateKey({ description: "Total estimate completed across child issues." }),
  ),
  completedIssues: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Number of completed child issues." }),
  ),
  estimateTotal: Schema.Finite.pipe(
    Schema.annotateKey({ description: "Total estimate across child issues." }),
  ),
  issueTotal: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Total number of child issues." }),
  ),
  statusCounts: Schema.Record(Schema.String, NonNegativeInteger).pipe(
    Schema.annotateKey({ description: "Child issue counts grouped by status." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Aggregate progress metrics for an initiative.",
    identifier: "@cycle/contracts/InitiativeProgress",
    title: "InitiativeProgress",
  }),
);
export type InitiativeProgress = typeof InitiativeProgress.Type;
