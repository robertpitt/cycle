import { Data } from "effect";

export class AgentWorkEventError extends Data.TaggedError("AgentWorkEventError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}
