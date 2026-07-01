import { Schema } from "effect";
import {
  CodexAppServerProtocolParseError,
  CodexAppServerRequestError,
  CodexAppServerTransportError,
  type CodexAppServerError,
} from "./errors/index.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const JsonRpcIdSchema = Schema.Union([Schema.String, Schema.Finite]);
export type JsonRpcId = typeof JsonRpcIdSchema.Type;

const JsonRpcVersion = Schema.optional(Schema.Literal("2.0"));
const JsonRpcParams = Schema.optional(Schema.Unknown);
const ProtocolErrorShape = Schema.Struct({
  code: Schema.Finite,
  data: Schema.optional(Schema.Unknown),
  message: Schema.String,
});
const IncomingRequestMessage = Schema.Struct({
  id: JsonRpcIdSchema,
  jsonrpc: JsonRpcVersion,
  method: Schema.String,
  params: JsonRpcParams,
});
const IncomingNotificationMessage = Schema.Struct({
  jsonrpc: JsonRpcVersion,
  method: Schema.String,
  params: JsonRpcParams,
});
const IncomingSuccessResponseMessage = Schema.Struct({
  id: JsonRpcIdSchema,
  jsonrpc: JsonRpcVersion,
  result: Schema.optional(Schema.Unknown),
});
const IncomingErrorResponseMessage = Schema.Struct({
  error: ProtocolErrorShape,
  id: JsonRpcIdSchema,
  jsonrpc: JsonRpcVersion,
});
const JsonRpcMessage = Schema.Union([
  IncomingRequestMessage,
  IncomingErrorResponseMessage,
  IncomingSuccessResponseMessage,
  IncomingNotificationMessage,
]).annotate({ parseOptions: StrictDecodeOptions });
type JsonRpcMessage = typeof JsonRpcMessage.Type;

const OutgoingMessage = Schema.Union([
  IncomingRequestMessage,
  IncomingErrorResponseMessage,
  IncomingSuccessResponseMessage,
  IncomingNotificationMessage,
]).annotate({ parseOptions: StrictDecodeOptions });

export type CodexAppServerIncomingRequest = {
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
};

export type CodexAppServerIncomingNotification = {
  readonly method: string;
  readonly params?: unknown;
};

export type CodexAppServerProtocolLogEvent = {
  readonly direction: "incoming" | "outgoing";
  readonly payload: unknown;
  readonly stage: "raw" | "decoded" | "decode_failed";
};

export type CodexAppServerProtocolTransport = {
  readonly input: AsyncIterable<string | Uint8Array>;
  readonly send: (line: string) => void | Promise<void>;
  readonly close?: () => void | Promise<void>;
};

export type CodexAppServerProtocolOptions = {
  readonly logIncoming?: boolean;
  readonly logOutgoing?: boolean;
  readonly logger?: (event: CodexAppServerProtocolLogEvent) => void;
  readonly onError?: (error: CodexAppServerError) => void;
  readonly onNotification?: (
    notification: CodexAppServerIncomingNotification,
  ) => void | Promise<void>;
  readonly onRequest?: (request: CodexAppServerIncomingRequest) => Promise<unknown> | unknown;
  readonly transport: CodexAppServerProtocolTransport;
};

export type CodexAppServerProtocol = {
  readonly close: (error?: CodexAppServerError) => Promise<void>;
  readonly notify: (method: string, params?: unknown) => Promise<void>;
  readonly request: (method: string, params?: unknown) => Promise<unknown>;
  readonly respond: (requestId: JsonRpcId, result: unknown) => Promise<void>;
  readonly respondError: (requestId: JsonRpcId, error: CodexAppServerRequestError) => Promise<void>;
};

type PendingRequest = {
  readonly reject: (error: CodexAppServerError) => void;
  readonly resolve: (value: unknown) => void;
};

const readChunk = (chunk: string | Uint8Array, decoder: TextDecoder): string =>
  typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });

export const makeCodexAppServerProtocol = (
  options: CodexAppServerProtocolOptions,
): CodexAppServerProtocol => {
  const pending = new Map<string, PendingRequest>();
  const decoder = new TextDecoder();
  let nextRequestId = 1;
  let closed = false;
  let remainder = "";

  const log = (event: CodexAppServerProtocolLogEvent) => {
    if (event.direction === "incoming" && options.logIncoming !== true) return;
    if (event.direction === "outgoing" && options.logOutgoing !== true) return;
    options.logger?.(event);
  };

  const failAllPending = (error: CodexAppServerError) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  const close = async (
    error: CodexAppServerError = new CodexAppServerTransportError({
      detail: "Codex App Server transport closed.",
    }),
  ) => {
    if (closed) return;
    closed = true;
    failAllPending(error);
    await options.transport.close?.();
  };

  const write = async (message: Readonly<Record<string, unknown>>) => {
    if (closed) {
      throw new CodexAppServerTransportError({
        detail: "Codex App Server transport is closed.",
      });
    }

    const decoded = Schema.decodeUnknownSync(OutgoingMessage, StrictDecodeOptions)(message);
    log({ direction: "outgoing", payload: decoded, stage: "decoded" });
    const line = `${JSON.stringify(decoded)}\n`;
    log({ direction: "outgoing", payload: line, stage: "raw" });
    await options.transport.send(line);
  };

  const respond = (requestId: JsonRpcId, result: unknown) => write({ id: requestId, result });

  const respondError = (requestId: JsonRpcId, error: CodexAppServerRequestError) =>
    write({ error: error.toProtocolError(), id: requestId });

  const route = async (message: JsonRpcMessage): Promise<void> => {
    if ("id" in message && "method" in message) {
      const request = {
        id: message.id,
        method: message.method,
        ...(message.params === undefined ? {} : { params: message.params }),
      };
      if (options.onRequest === undefined) return;

      try {
        await respond(request.id, await options.onRequest(request));
      } catch (error) {
        await respondError(
          request.id,
          error instanceof CodexAppServerRequestError
            ? error
            : CodexAppServerRequestError.internalError(
                error instanceof Error ? error.message : String(error),
              ),
        );
      }
      return;
    }

    if ("id" in message) {
      const pendingRequest = pending.get(String(message.id));
      if (pendingRequest === undefined) return;
      pending.delete(String(message.id));
      if ("error" in message) {
        pendingRequest.reject(CodexAppServerRequestError.fromProtocolError(message.error));
        return;
      }
      pendingRequest.resolve("result" in message ? message.result : undefined);
      return;
    }

    if ("method" in message) {
      await options.onNotification?.({
        method: message.method,
        ...(message.params === undefined ? {} : { params: message.params }),
      });
      return;
    }

    throw new CodexAppServerProtocolParseError({
      detail: "Received protocol message in an unknown shape.",
    });
  };

  const handleLine = async (line: string): Promise<void> => {
    if (line.trim().length === 0) return;
    log({ direction: "incoming", payload: line, stage: "raw" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (cause) {
      const error = new CodexAppServerProtocolParseError({
        detail: "Invalid JSON line.",
        cause,
      });
      log({ direction: "incoming", payload: { detail: error.detail }, stage: "decode_failed" });
      options.onError?.(error);
      return;
    }
    let message: JsonRpcMessage;
    try {
      message = Schema.decodeUnknownSync(JsonRpcMessage, StrictDecodeOptions)(parsed);
    } catch (cause) {
      const error = new CodexAppServerProtocolParseError({
        detail: "Invalid JSON-RPC message.",
        cause,
      });
      log({ direction: "incoming", payload: { detail: error.detail }, stage: "decode_failed" });
      options.onError?.(error);
      return;
    }
    log({ direction: "incoming", payload: message, stage: "decoded" });
    await route(message);
  };

  void (async () => {
    try {
      for await (const chunk of options.transport.input) {
        const combined = remainder + readChunk(chunk, decoder);
        const lines = combined.split("\n");
        remainder = lines.pop() ?? "";
        for (const line of lines) await handleLine(line.replace(/\r$/u, ""));
      }
      const finalText = remainder + decoder.decode();
      remainder = "";
      if (finalText.trim().length > 0) await handleLine(finalText.replace(/\r$/u, ""));
      await close(
        new CodexAppServerTransportError({
          detail: "Codex App Server input stream ended.",
        }),
      );
    } catch (cause) {
      const error =
        cause instanceof CodexAppServerProtocolParseError
          ? cause
          : new CodexAppServerTransportError({
              detail: "Codex App Server input stream failed.",
              cause,
            });
      options.onError?.(error);
      await close(error);
    }
  })();

  return {
    close,
    notify: (method, params) =>
      write({
        method,
        ...(params === undefined ? {} : { params }),
      }),
    request: (method, params) => {
      const id = nextRequestId;
      nextRequestId += 1;

      return new Promise((resolve, reject) => {
        pending.set(String(id), { reject, resolve });
        write({
          id,
          method,
          ...(params === undefined ? {} : { params }),
        }).catch((error: unknown) => {
          pending.delete(String(id));
          reject(error);
        });
      });
    },
    respond,
    respondError,
  };
};
