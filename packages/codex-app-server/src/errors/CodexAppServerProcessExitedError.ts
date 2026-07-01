import { CodexAppServerError } from "./CodexAppServerError.ts";

export class CodexAppServerProcessExitedError extends CodexAppServerError {
  readonly tag = "CodexAppServerProcessExitedError";
  readonly code?: number | null;
  readonly signal?: NodeJS.Signals | null;

  constructor(
    input: {
      readonly code?: number | null;
      readonly signal?: NodeJS.Signals | null;
      readonly cause?: unknown;
    } = {},
  ) {
    super(
      input.code === undefined || input.code === null
        ? "Codex App Server process exited."
        : `Codex App Server process exited with code ${input.code}.`,
      input.cause,
    );
    this.code = input.code;
    this.signal = input.signal;
  }
}
