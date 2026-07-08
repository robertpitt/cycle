import { Schema } from "effect";

export type CodexAppServerProtocolErrorShape = {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
};

export class CodexAppServerMissingHandlerError extends Schema.TaggedErrorClass<CodexAppServerMissingHandlerError>(
  "@cycle/agents/CodexAppServerMissingHandlerError",
)("CodexAppServerMissingHandlerError", {
  message: Schema.String,
  method: Schema.String,
}) {
  constructor(method: string) {
    super({
      message: `Missing Codex App Server handler for method: ${method}`,
      method,
    });
  }
}

export class CodexAppServerProcessExitedError extends Schema.TaggedErrorClass<CodexAppServerProcessExitedError>(
  "@cycle/agents/CodexAppServerProcessExitedError",
)("CodexAppServerProcessExitedError", {
  cause: Schema.optional(Schema.Unknown),
  code: Schema.optional(Schema.NullOr(Schema.Number)),
  message: Schema.String,
  signal: Schema.optional(Schema.NullOr(Schema.String)),
}) {
  constructor(
    input: {
      readonly code?: number | null;
      readonly signal?: NodeJS.Signals | null;
      readonly cause?: unknown;
    } = {},
  ) {
    super({
      ...(input.cause === undefined ? {} : { cause: input.cause }),
      ...(input.code === undefined ? {} : { code: input.code }),
      message:
        input.code === undefined || input.code === null
          ? "Codex App Server process exited."
          : `Codex App Server process exited with code ${input.code}.`,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  }
}

export class CodexAppServerProtocolParseError extends Schema.TaggedErrorClass<CodexAppServerProtocolParseError>(
  "@cycle/agents/CodexAppServerProtocolParseError",
)("CodexAppServerProtocolParseError", {
  cause: Schema.optional(Schema.Unknown),
  detail: Schema.String,
  message: Schema.String,
}) {
  constructor(input: { readonly detail: string; readonly cause?: unknown }) {
    super({
      ...(input.cause === undefined ? {} : { cause: input.cause }),
      detail: input.detail,
      message: `Failed to parse Codex App Server protocol message: ${input.detail}`,
    });
  }
}

export class CodexAppServerRequestError extends Schema.TaggedErrorClass<CodexAppServerRequestError>(
  "@cycle/agents/CodexAppServerRequestError",
)("CodexAppServerRequestError", {
  code: Schema.Number,
  data: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {
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

export class CodexAppServerSchemaDecodeError extends Schema.TaggedErrorClass<CodexAppServerSchemaDecodeError>(
  "@cycle/agents/CodexAppServerSchemaDecodeError",
)("CodexAppServerSchemaDecodeError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  method: Schema.String,
}) {
  constructor(input: {
    readonly method: string;
    readonly message: string;
    readonly cause?: unknown;
  }) {
    super({
      ...(input.cause === undefined ? {} : { cause: input.cause }),
      message: `Failed to decode Codex App Server payload for ${input.method}: ${input.message}`,
      method: input.method,
    });
  }
}

export class CodexAppServerSchemaEncodeError extends Schema.TaggedErrorClass<CodexAppServerSchemaEncodeError>(
  "@cycle/agents/CodexAppServerSchemaEncodeError",
)("CodexAppServerSchemaEncodeError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  method: Schema.String,
}) {
  constructor(input: {
    readonly method: string;
    readonly message: string;
    readonly cause?: unknown;
  }) {
    super({
      ...(input.cause === undefined ? {} : { cause: input.cause }),
      message: `Failed to encode Codex App Server payload for ${input.method}: ${input.message}`,
      method: input.method,
    });
  }
}

export class CodexAppServerSpawnError extends Schema.TaggedErrorClass<CodexAppServerSpawnError>(
  "@cycle/agents/CodexAppServerSpawnError",
)("CodexAppServerSpawnError", {
  cause: Schema.optional(Schema.Unknown),
  command: Schema.optional(Schema.String),
  message: Schema.String,
}) {
  constructor(input: { readonly command?: string; readonly cause?: unknown }) {
    super({
      ...(input.cause === undefined ? {} : { cause: input.cause }),
      ...(input.command === undefined ? {} : { command: input.command }),
      message:
        input.command === undefined
          ? "Failed to spawn Codex App Server process."
          : `Failed to spawn Codex App Server process for command: ${input.command}`,
    });
  }
}

export class CodexAppServerTransportError extends Schema.TaggedErrorClass<CodexAppServerTransportError>(
  "@cycle/agents/CodexAppServerTransportError",
)("CodexAppServerTransportError", {
  cause: Schema.optional(Schema.Unknown),
  detail: Schema.String,
  message: Schema.String,
}) {
  constructor(input: { readonly detail: string; readonly cause?: unknown }) {
    super({
      ...(input.cause === undefined ? {} : { cause: input.cause }),
      detail: input.detail,
      message: input.detail,
    });
  }
}

export type CodexAppServerError =
  | CodexAppServerMissingHandlerError
  | CodexAppServerProcessExitedError
  | CodexAppServerProtocolParseError
  | CodexAppServerRequestError
  | CodexAppServerSchemaDecodeError
  | CodexAppServerSchemaEncodeError
  | CodexAppServerSpawnError
  | CodexAppServerTransportError;

export const isCodexAppServerError = (error: unknown): error is CodexAppServerError =>
  error instanceof CodexAppServerMissingHandlerError ||
  error instanceof CodexAppServerProcessExitedError ||
  error instanceof CodexAppServerProtocolParseError ||
  error instanceof CodexAppServerRequestError ||
  error instanceof CodexAppServerSchemaDecodeError ||
  error instanceof CodexAppServerSchemaEncodeError ||
  error instanceof CodexAppServerSpawnError ||
  error instanceof CodexAppServerTransportError;

export const normalizeToCodexAppServerError = (error: unknown): CodexAppServerError =>
  isCodexAppServerError(error)
    ? error
    : new CodexAppServerTransportError({
        cause: error,
        detail: error instanceof Error ? error.message : "Codex App Server operation failed.",
      });

export const normalizeToRequestError = (error: unknown): CodexAppServerRequestError =>
  error instanceof CodexAppServerRequestError
    ? error
    : CodexAppServerRequestError.internalError(
        error instanceof Error ? error.message : "Codex App Server request failed.",
      );
