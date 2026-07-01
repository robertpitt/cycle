import { CodexAppServerError } from "./CodexAppServerError.ts";

export class CodexAppServerSpawnError extends CodexAppServerError {
  readonly tag = "CodexAppServerSpawnError";
  readonly command?: string;

  constructor(input: { readonly command?: string; readonly cause?: unknown }) {
    super(
      input.command === undefined
        ? "Failed to spawn Codex App Server process."
        : `Failed to spawn Codex App Server process for command: ${input.command}`,
      input.cause,
    );
    this.command = input.command;
  }
}
