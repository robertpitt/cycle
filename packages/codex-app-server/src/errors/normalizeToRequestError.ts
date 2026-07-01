import { CodexAppServerRequestError } from "./CodexAppServerRequestError.ts";

export const normalizeToRequestError = (error: unknown): CodexAppServerRequestError =>
  error instanceof CodexAppServerRequestError
    ? error
    : CodexAppServerRequestError.internalError(
        error instanceof Error ? error.message : "Codex App Server request failed.",
      );
