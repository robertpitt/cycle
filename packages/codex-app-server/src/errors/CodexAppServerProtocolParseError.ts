import { CodexAppServerError } from "./CodexAppServerError.ts";

export class CodexAppServerProtocolParseError extends CodexAppServerError {
  readonly tag = "CodexAppServerProtocolParseError";
  readonly detail: string;

  constructor(input: { readonly detail: string; readonly cause?: unknown }) {
    super(`Failed to parse Codex App Server protocol message: ${input.detail}`, input.cause);
    this.detail = input.detail;
  }
}
