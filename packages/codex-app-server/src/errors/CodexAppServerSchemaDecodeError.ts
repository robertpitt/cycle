import { CodexAppServerError } from "./CodexAppServerError.ts";

export class CodexAppServerSchemaDecodeError extends CodexAppServerError {
  readonly tag = "CodexAppServerSchemaDecodeError";
  readonly method: string;

  constructor(input: {
    readonly method: string;
    readonly message: string;
    readonly cause?: unknown;
  }) {
    super(
      `Failed to decode Codex App Server payload for ${input.method}: ${input.message}`,
      input.cause,
    );
    this.method = input.method;
  }
}
