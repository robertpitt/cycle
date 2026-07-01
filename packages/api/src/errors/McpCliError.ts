import { Data } from "effect";

export class McpCliError extends Data.TaggedError("McpCliError")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}
