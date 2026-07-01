import { Data } from "effect";

export class AppConfigError extends Data.TaggedError("AppConfigError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}
