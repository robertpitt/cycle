import { Schema } from "effect";
import {
  invalidRpcResponse,
  TicketRpcSuccessSchemas,
  type TicketRpcMethod,
  type TicketRpcPayloads,
  type TicketRpcResponse,
  type TicketRpcSuccesses,
} from "../protocol/index.ts";

export type TicketRpcTransport = {
  readonly invoke: (request: {
    readonly id: string;
    readonly method: TicketRpcMethod;
    readonly payload: unknown;
  }) => Promise<TicketRpcResponse>;
};

export type TicketRpcClient = {
  readonly call: <Method extends TicketRpcMethod>(
    method: Method,
    payload: TicketRpcPayloads[Method],
  ) => Promise<TicketRpcSuccesses[Method]>;
};

const nextRequestId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const makeTicketRpcClient = (transport: TicketRpcTransport): TicketRpcClient => ({
  call: async <Method extends TicketRpcMethod>(
    method: Method,
    payload: TicketRpcPayloads[Method],
  ) => {
    const response = await transport.invoke({
      id: nextRequestId(),
      method,
      payload,
    });

    if (!response.ok) {
      throw response.error;
    }

    try {
      return Schema.decodeUnknownSync(TicketRpcSuccessSchemas[method])(
        response.value,
      ) as TicketRpcSuccesses[Method];
    } catch (error) {
      throw invalidRpcResponse(`Invalid RPC response for ${method}.`, {
        parseError: String(error),
      });
    }
  },
});
