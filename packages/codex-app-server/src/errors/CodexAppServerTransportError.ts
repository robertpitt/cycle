import { CodexAppServerError } from "./CodexAppServerError.ts";

export class CodexAppServerTransportError extends CodexAppServerError {
  readonly tag = "CodexAppServerTransportError";
  readonly detail: string;

  constructor(input: { readonly detail: string; readonly cause?: unknown }) {
    super(input.detail, input.cause);
    this.detail = input.detail;
  }
}
