import { CodexAppServerError } from "./CodexAppServerError.ts";

export class CodexAppServerMissingHandlerError extends CodexAppServerError {
  readonly tag = "CodexAppServerMissingHandlerError";
  readonly method: string;

  constructor(method: string) {
    super(`Missing Codex App Server handler for method: ${method}`);
    this.method = method;
  }
}
