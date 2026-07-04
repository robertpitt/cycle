import { Schema } from "effect";
import { AgentWorkJob } from "./AgentWorkJob.ts";
import { AgentWorkJobLogEntry } from "./AgentWorkJobLogEntry.ts";

export const AgentWorkJobLog = Schema.Struct({
  entries: Schema.Array(AgentWorkJobLogEntry).pipe(
    Schema.annotateKey({ description: "Log entries ordered for client display." }),
  ),
  job: AgentWorkJob.pipe(
    Schema.annotateKey({ description: "Job record the log entries describe." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Agent Work job plus its display log entries.",
    identifier: "@cycle/contracts/AgentWorkJobLog",
    title: "AgentWorkJobLog",
  }),
);
export type AgentWorkJobLog = typeof AgentWorkJobLog.Type;
