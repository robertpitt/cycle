import { CodexAppServerError } from "./CodexAppServerError.ts";

export class CodexAppServerSchemaEncodeError extends CodexAppServerError {
  readonly tag = "CodexAppServerSchemaEncodeError";
  readonly method: string;

  constructor(input: {
    readonly method: string;
    readonly message: string;
    readonly cause?: unknown;
  }) {
    super(
      `Failed to encode Codex App Server payload for ${input.method}: ${input.message}`,
      input.cause,
    );
    this.method = input.method;
  }
}
