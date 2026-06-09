import { Schema } from "effect";

export const ExecutionStatus = Schema.Literals([
  "blocked",
  "failed",
  "in-progress",
  "needs-review",
  "succeeded",
]);
export type ExecutionStatus = typeof ExecutionStatus.Type;
