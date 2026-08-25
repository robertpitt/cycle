import { Option } from "effect";
import { Command } from "effect/unstable/cli";
import { cliApiError, type CycleApiClient } from "../client.ts";
import { commandEffect, optionToUndefined } from "../services/command.ts";
import { exitCodes, type CliRuntimeShape } from "../services/CliRuntime.ts";
import { cliFailure } from "../services/errors.ts";
import { stripUndefined } from "../shared/payloads.ts";
import { parseBoolean, parseJsonObject, prettyJson } from "../shared/values.ts";
import { optionalString } from "./root.ts";

export const chat = Command.make("chat").pipe(
  Command.withSubcommands([
    chatCommand("providers", "provider.list", "provider.list.snapshot", () => ({})),
    chatCommand("list", "thread.list", "thread.list.snapshot", (input) =>
      stripUndefined({
        includeArchived: parseBoolean(
          optionToUndefined(input.includeArchived),
          "--include-archived",
        ),
      }),
    ),
    chatCommand("create", "thread.create", "command.ack", (input) => ({
      ...parseJsonObject(optionToUndefined(input.data)),
      ...stripUndefined({
        model: optionToUndefined(input.model),
        providerId: optionToUndefined(input.providerId),
        runtimeMode: optionToUndefined(input.runtimeMode),
        thinkingLevel: optionToUndefined(input.thinkingLevel),
        title: optionToUndefined(input.title),
      }),
    })),
    chatCommand("get", "thread.subscribe", "thread.snapshot", (input) => ({
      threadId: required(input.threadId, "--thread-id"),
    })),
    chatCommand("update", "thread.update_settings", "command.ack", (input) =>
      stripUndefined({
        model: optionToUndefined(input.model),
        providerId: optionToUndefined(input.providerId),
        runtimeMode: optionToUndefined(input.runtimeMode),
        thinkingLevel: optionToUndefined(input.thinkingLevel),
        threadId: required(input.threadId, "--thread-id"),
      }),
    ),
    chatCommand("archive", "thread.delete", "command.ack", (input) => ({
      threadId: required(input.threadId, "--thread-id"),
    })),
    chatCommand("send", "turn.send", "command.ack", (input) => ({
      message: required(input.message, "--message"),
      ...stripUndefined({
        model: optionToUndefined(input.model),
        providerId: optionToUndefined(input.providerId) ?? "codex",
        runtimeMode: optionToUndefined(input.runtimeMode),
        thinkingLevel: optionToUndefined(input.thinkingLevel),
      }),
      threadId: required(input.threadId, "--thread-id"),
    })),
    chatCommand("cancel", "turn.cancel", "command.ack", (input) => ({
      threadId: required(input.threadId, "--thread-id"),
    })),
    chatCommand("question", "question.respond", "command.ack", (input) => ({
      answers: parseJsonObject(optionToUndefined(input.data), "--data"),
      questionId: required(input.questionId, "--question-id"),
      threadId: required(input.threadId, "--thread-id"),
    })),
    chatCommand("approve", "approval.respond", "command.ack", (input) => ({
      decision: required(input.decision, "--decision"),
      requestId: required(input.requestId, "--approval-request-id"),
      threadId: required(input.threadId, "--thread-id"),
    })),
    chatCommand("command", undefined, undefined, (input) =>
      parseJsonObject(optionToUndefined(input.data), "--data"),
    ),
  ]),
);

type ChatInput = {
  readonly data: Option.Option<string>;
  readonly decision: Option.Option<string>;
  readonly includeArchived: Option.Option<string>;
  readonly message: Option.Option<string>;
  readonly model: Option.Option<string>;
  readonly providerId: Option.Option<string>;
  readonly questionId: Option.Option<string>;
  readonly requestId: Option.Option<string>;
  readonly responseType: Option.Option<string>;
  readonly runtimeMode: Option.Option<string>;
  readonly thinkingLevel: Option.Option<string>;
  readonly threadId: Option.Option<string>;
  readonly title: Option.Option<string>;
  readonly type: Option.Option<string>;
};

function makeChatFlags() {
  return {
    data: optionalString("data"),
    decision: optionalString("decision"),
    includeArchived: optionalString("include-archived"),
    message: optionalString("message"),
    model: optionalString("model"),
    providerId: optionalString("provider-id"),
    questionId: optionalString("question-id"),
    requestId: optionalString("approval-request-id"),
    responseType: optionalString("response-type"),
    runtimeMode: optionalString("runtime-mode"),
    thinkingLevel: optionalString("thinking-level"),
    threadId: optionalString("thread-id"),
    title: optionalString("title"),
    type: optionalString("type"),
  };
}

function chatCommand(
  name: string,
  fixedType: string | undefined,
  fixedResponseType: string | undefined,
  payload: (input: ChatInput) => Record<string, unknown>,
) {
  return Command.make(name, makeChatFlags(), (input) =>
    commandEffect(async (api, runtime) => {
      const type = fixedType ?? required(input.type, "--type");
      const responseType =
        fixedResponseType ?? optionToUndefined(input.responseType) ?? "command.ack";
      const response = await requestChatCommand(api, runtime, type, payload(input), responseType);
      return { human: prettyJson(response.data), json: response };
    }),
  );
}

const required = <A>(option: { readonly _tag: string; readonly value?: A }, flag: string): A => {
  const value = optionToUndefined(option);
  if (value !== undefined) return value;
  throw cliFailure(exitCodes.invalidUsage, "INVALID_USAGE", `${flag} is required.`);
};

type ChatServerMessage = {
  readonly commandId?: string;
  readonly payload?: unknown;
  readonly type?: string;
};

const requestChatCommand = (
  api: CycleApiClient,
  runtime: CliRuntimeShape,
  type: string,
  payload: Readonly<Record<string, unknown>>,
  responseType: string,
): Promise<{ readonly data: unknown }> =>
  new Promise((resolve, reject) => {
    const commandId = `cli_${crypto.randomUUID()}`;
    const url = new URL("/v1/chat/ws", api.discovery.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = runtime.webSocketFactory(url.toString());
    let commandSent = false;
    let settled = false;
    const timeout = setTimeout(() => {
      fail(cliApiError(0, "API_UNAVAILABLE", "Timed out waiting for the chat service."));
    }, 15_000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.close();
    };
    const finish = (data: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ data });
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          payload: { token: api.discovery.token },
          type: "connection.authenticate",
          version: 1,
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      let message: ChatServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ChatServerMessage;
      } catch {
        fail(cliApiError(0, "INVALID_API_RESPONSE", "Chat returned invalid JSON."));
        return;
      }

      if (message.type === "connection.ready" && !commandSent) {
        commandSent = true;
        socket.send(JSON.stringify({ commandId, payload, type, version: 1 }));
        return;
      }
      if (message.type === "command.error" && message.commandId === commandId) {
        const error = asRecord(message.payload);
        fail(
          cliApiError(
            0,
            typeof error.code === "string" ? error.code : "CHAT_COMMAND_FAILED",
            typeof error.message === "string" ? error.message : "Chat command failed.",
          ),
        );
        return;
      }
      if (message.type === responseType && message.commandId === commandId) {
        const envelope = asRecord(message.payload);
        finish(responseType === "command.ack" ? envelope.result : message.payload);
      }
    });
    socket.addEventListener("error", () => {
      fail(cliApiError(0, "API_UNAVAILABLE", "Cycle chat is not reachable."));
    });
    socket.addEventListener("close", () => {
      if (!settled) fail(cliApiError(0, "API_UNAVAILABLE", "Cycle chat closed unexpectedly."));
    });
  });

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
