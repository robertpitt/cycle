import { Schema } from "effect";
import { AgentWorkDelegate } from "./AgentWorkDelegate.ts";
import { AgentWorkJob } from "./AgentWorkJob.ts";

export const AgentWorkDelegateJob = Schema.Struct({
  delegate: AgentWorkDelegate.pipe(
    Schema.annotateKey({ description: "Delegate assignment state after the operation." }),
  ),
  job: AgentWorkJob.pipe(
    Schema.annotateKey({ description: "Job created or updated for the delegate." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Combined delegate and job result returned after delegate job creation.",
    identifier: "@cycle/contracts/AgentWorkDelegateJob",
    title: "AgentWorkDelegateJob",
  }),
);
export type AgentWorkDelegateJob = typeof AgentWorkDelegateJob.Type;
