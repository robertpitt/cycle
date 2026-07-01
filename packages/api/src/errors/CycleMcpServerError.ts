import { Data } from "effect";

export class CycleMcpServerError extends Data.TaggedError("CycleMcpServerError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}
