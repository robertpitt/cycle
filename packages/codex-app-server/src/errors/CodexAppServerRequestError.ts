import { CodexAppServerError } from "./CodexAppServerError.ts";
import type { CodexAppServerProtocolErrorShape } from "./CodexAppServerProtocolErrorShape.ts";

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
