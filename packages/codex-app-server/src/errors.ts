export type CodexAppServerProtocolErrorShape = {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
};

export abstract class CodexAppServerError extends Error {
  abstract readonly tag: string;
  readonly cause?: unknown;

  protected constructor(message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.cause = cause;
  }
}

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

export class CodexAppServerProtocolParseError extends CodexAppServerError {
  readonly tag = "CodexAppServerProtocolParseError";
  readonly detail: string;

  constructor(input: { readonly detail: string; readonly cause?: unknown }) {
    super(`Failed to parse Codex App Server protocol message: ${input.detail}`, input.cause);
    this.detail = input.detail;
  }
}

export class CodexAppServerTransportError extends CodexAppServerError {
  readonly tag = "CodexAppServerTransportError";
  readonly detail: string;

  constructor(input: { readonly detail: string; readonly cause?: unknown }) {
    super(input.detail, input.cause);
    this.detail = input.detail;
  }
}

export class CodexAppServerRequestError extends CodexAppServerError {
  readonly tag = "CodexAppServerRequestError";
  readonly code: number;
  readonly data?: unknown;

  constructor(input: { readonly code: number; readonly message: string; readonly data?: unknown }) {
    super(input.message);
    this.code = input.code;
    this.data = input.data;
  }

  static fromProtocolError(error: CodexAppServerProtocolErrorShape): CodexAppServerRequestError {
    return new CodexAppServerRequestError({
      code: error.code,
      message: error.message,
      ...(error.data === undefined ? {} : { data: error.data }),
    });
  }

  static parseError(message = "Parse error", data?: unknown): CodexAppServerRequestError {
    return new CodexAppServerRequestError({ code: -32700, message, data });
  }

  static invalidRequest(message = "Invalid request", data?: unknown): CodexAppServerRequestError {
    return new CodexAppServerRequestError({ code: -32600, message, data });
  }

  static methodNotFound(method: string): CodexAppServerRequestError {
    return new CodexAppServerRequestError({
      code: -32601,
      message: `Method not found: ${method}`,
    });
  }

  static invalidParams(message = "Invalid params", data?: unknown): CodexAppServerRequestError {
    return new CodexAppServerRequestError({ code: -32602, message, data });
  }

  static internalError(message = "Internal error", data?: unknown): CodexAppServerRequestError {
    return new CodexAppServerRequestError({ code: -32603, message, data });
  }

  toProtocolError(): CodexAppServerProtocolErrorShape {
    return {
      code: this.code,
      message: this.message,
      ...(this.data === undefined ? {} : { data: this.data }),
    };
  }
}

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

export class CodexAppServerMissingHandlerError extends CodexAppServerError {
  readonly tag = "CodexAppServerMissingHandlerError";
  readonly method: string;

  constructor(method: string) {
    super(`Missing Codex App Server handler for method: ${method}`);
    this.method = method;
  }
}

export const normalizeToRequestError = (error: unknown): CodexAppServerRequestError =>
  error instanceof CodexAppServerRequestError
    ? error
    : CodexAppServerRequestError.internalError(
        error instanceof Error ? error.message : "Codex App Server request failed.",
      );
