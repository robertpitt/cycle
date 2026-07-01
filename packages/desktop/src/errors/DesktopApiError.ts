import { Data } from "effect";

export class DesktopApiError extends Data.TaggedError("DesktopApiError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}
