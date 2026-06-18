import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  ClientNotificationMethod,
  ClientNotificationParamsByMethod,
  ClientRequestMethod,
  ClientRequestParamsByMethod,
  ClientRequestResponsesByMethod,
  ServerNotificationMethod,
  ServerNotificationParamsByMethod,
  ServerRequestMethod,
  ServerRequestParamsByMethod,
  ServerRequestResponsesByMethod,
} from "./rpc.ts";
import {
  CodexAppServerMissingHandlerError,
  CodexAppServerProcessExitedError,
  CodexAppServerRequestError,
  CodexAppServerSpawnError,
  normalizeToRequestError,
  type CodexAppServerError,
} from "./errors.ts";
import {
  makeCodexAppServerProtocol,
  type CodexAppServerIncomingNotification,
  type CodexAppServerIncomingRequest,
  type CodexAppServerProtocol,
  type CodexAppServerProtocolLogEvent,
  type CodexAppServerProtocolTransport,
} from "./protocol.ts";
import {
  decodeClientRequestResponse,
  decodeServerNotificationParams,
  decodeServerRequestParams,
  encodeClientNotificationParams,
  encodeClientRequestParams,
  encodeServerRequestResponse,
} from "./schema.ts";

export type CodexAppServerClientOptions = {
  readonly logIncoming?: boolean;
  readonly logOutgoing?: boolean;
  readonly logger?: (event: CodexAppServerProtocolLogEvent) => void;
  readonly onError?: (error: CodexAppServerError) => void;
  readonly transport: CodexAppServerProtocolTransport;
};

export type CodexAppServerChildProcessOptions = Omit<CodexAppServerClientOptions, "transport"> & {
  readonly codexHome?: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly executablePath: string;
  readonly onExit?: (event: {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }) => void;
  readonly onStderr?: (line: string) => void;
};

type ServerRequestHandler<M extends ServerRequestMethod = ServerRequestMethod> = (
  params: ServerRequestParamsByMethod[M],
) => Promise<ServerRequestResponsesByMethod[M]> | ServerRequestResponsesByMethod[M];

type ServerNotificationHandler<M extends ServerNotificationMethod = ServerNotificationMethod> = (
  params: ServerNotificationParamsByMethod[M],
) => Promise<void> | void;

export type CodexAppServerClient = {
  readonly child?: ChildProcessWithoutNullStreams;
  readonly close: () => Promise<void>;
  readonly handleServerNotification: <M extends ServerNotificationMethod>(
    method: M,
    handler: ServerNotificationHandler<M>,
  ) => void;
  readonly handleServerRequest: <M extends ServerRequestMethod>(
    method: M,
    handler: ServerRequestHandler<M>,
  ) => void;
  readonly handleUnknownServerNotification: (
    handler: (method: string, params: unknown) => Promise<void> | void,
  ) => void;
  readonly handleUnknownServerRequest: (
    handler: (method: string, params: unknown) => Promise<unknown> | unknown,
  ) => void;
  readonly notify: <M extends ClientNotificationMethod>(
    method: M,
    params: ClientNotificationParamsByMethod[M],
  ) => Promise<void>;
  readonly raw: {
    readonly notify: (method: string, params?: unknown) => Promise<void>;
    readonly protocol: CodexAppServerProtocol;
    readonly request: (method: string, params?: unknown) => Promise<unknown>;
    readonly respond: (requestId: string | number, result: unknown) => Promise<void>;
    readonly respondError: (
      requestId: string | number,
      error: CodexAppServerRequestError,
    ) => Promise<void>;
  };
  readonly request: <M extends ClientRequestMethod>(
    method: M,
    params: ClientRequestParamsByMethod[M],
  ) => Promise<ClientRequestResponsesByMethod[M]>;
};

export const makeCodexAppServerClient = (
  options: CodexAppServerClientOptions & { readonly child?: ChildProcessWithoutNullStreams },
): CodexAppServerClient => {
  const requestHandlers = new Map<string, ServerRequestHandler>();
  const notificationHandlers = new Map<string, ServerNotificationHandler[]>();
  let unknownRequestHandler:
    | ((method: string, params: unknown) => Promise<unknown> | unknown)
    | undefined;
  let unknownNotificationHandler:
    | ((method: string, params: unknown) => Promise<void> | void)
    | undefined;

  const dispatchRequest = async (request: CodexAppServerIncomingRequest): Promise<unknown> => {
    if (requestHandlers.has(request.method)) {
      const method = request.method as ServerRequestMethod;
      const params = decodeServerRequestParams(method, request.params);
      const result = await requestHandlers.get(method)?.(params as never);
      return encodeServerRequestResponse(method, result as never);
    }

    if (unknownRequestHandler !== undefined) {
      return unknownRequestHandler(request.method, request.params);
    }

    throw normalizeToRequestError(new CodexAppServerMissingHandlerError(request.method));
  };

  const dispatchNotification = async (
    notification: CodexAppServerIncomingNotification,
  ): Promise<void> => {
    if (notificationHandlers.has(notification.method)) {
      const method = notification.method as ServerNotificationMethod;
      const params = decodeServerNotificationParams(method, notification.params);
      for (const handler of notificationHandlers.get(method) ?? []) {
        await handler(params as never);
      }
      return;
    }

    await unknownNotificationHandler?.(notification.method, notification.params);
  };

  const protocol = makeCodexAppServerProtocol({
    ...options,
    onNotification: dispatchNotification,
    onRequest: dispatchRequest,
  });

  return {
    ...(options.child === undefined ? {} : { child: options.child }),
    close: () => protocol.close(),
    handleServerNotification: (method, handler) => {
      const handlers = notificationHandlers.get(method) ?? [];
      handlers.push(handler as ServerNotificationHandler);
      notificationHandlers.set(method, handlers);
    },
    handleServerRequest: (method, handler) => {
      requestHandlers.set(method, handler as unknown as ServerRequestHandler);
    },
    handleUnknownServerNotification: (handler) => {
      unknownNotificationHandler = handler;
    },
    handleUnknownServerRequest: (handler) => {
      unknownRequestHandler = handler;
    },
    notify: async (method, params) => {
      await protocol.notify(method, encodeClientNotificationParams(method, params));
    },
    raw: {
      notify: protocol.notify,
      protocol,
      request: protocol.request,
      respond: protocol.respond,
      respondError: protocol.respondError,
    },
    request: async (method, params) => {
      const encoded = encodeClientRequestParams(method, params);
      return decodeClientRequestResponse(method, await protocol.request(method, encoded));
    },
  };
};

const lineReader = async function* (stream: NodeJS.ReadableStream): AsyncIterable<Uint8Array> {
  for await (const chunk of stream) {
    if (typeof chunk === "string") yield Buffer.from(chunk);
    else yield chunk as Uint8Array;
  }
};

const stderrLines = async (
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): Promise<void> => {
  const decoder = new TextDecoder();
  let remainder = "";
  for await (const chunk of stream) {
    const text =
      typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = (remainder + text).split("\n");
    remainder = lines.pop() ?? "";
    for (const line of lines) onLine(line.replace(/\r$/u, ""));
  }
  const finalLine = remainder + decoder.decode();
  if (finalLine.trim().length > 0) onLine(finalLine.replace(/\r$/u, ""));
};

export const spawnCodexAppServerClient = async (
  options: CodexAppServerChildProcessOptions,
): Promise<CodexAppServerClient> => {
  const env = {
    ...process.env,
    ...options.env,
    ...(options.codexHome === undefined ? {} : { CODEX_HOME: options.codexHome }),
  } as NodeJS.ProcessEnv;
  const command = `${options.executablePath} app-server`;

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(options.executablePath, ["app-server"], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env,
      shell: process.platform === "win32",
    });
  } catch (cause) {
    throw new CodexAppServerSpawnError({ cause, command });
  }

  const client = makeCodexAppServerClient({
    ...options,
    child,
    transport: {
      close: () => {
        if (!child.killed) child.kill();
      },
      input: lineReader(child.stdout),
      send: (line) =>
        new Promise<void>((resolve, reject) => {
          child.stdin.write(line, (error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    },
  });

  if (options.onStderr !== undefined) {
    void stderrLines(child.stderr, options.onStderr).catch(() => undefined);
  }

  child.on("error", (cause) => {
    options.onError?.(new CodexAppServerSpawnError({ cause, command }));
  });
  child.on("exit", (code, signal) => {
    options.onExit?.({ code, signal });
    void client.raw.protocol.close(new CodexAppServerProcessExitedError({ code, signal }));
  });

  return client;
};
