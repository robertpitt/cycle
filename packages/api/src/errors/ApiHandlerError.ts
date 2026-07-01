import { Data } from "effect";

export class ApiHandlerError extends Data.TaggedError("ApiHandlerError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}
