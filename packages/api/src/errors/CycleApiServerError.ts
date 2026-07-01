import { Data } from "effect";

export class CycleApiServerError extends Data.TaggedError("CycleApiServerError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}
