import { Data } from "effect";

export class EventFoldError extends Data.TaggedError("EventFoldError")<{
  readonly cause: unknown;
}> {}
